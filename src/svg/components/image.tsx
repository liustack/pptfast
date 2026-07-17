import type { Component } from "@/ir"
import { fitSvgLine } from "../../lib/svg-text-layout"
import type { SvgComponent } from "./types"

type ImageComponent = Extract<Component, { type: "image" }>

/**
 * Cap on the image's own height (px), independent of caption. The smallest
 * theme content-rect height is ~380px minus the caption's ~32px allowance —
 * uncapped `w * 0.5` at a full-width single-arrangement image (≈560-600px)
 * exceeds every theme's content rect, so `layoutContentFit`'s overflow guard
 * drops the component entirely, rendering a blank slide. The SVG `<image>`'s
 * default `preserveAspectRatio` (xMidYMid meet) letterboxes gracefully when
 * the source doesn't fill the capped box.
 */
const MAX_IMAGE_H = 340

export const image: SvgComponent<ImageComponent> = {
  measure(_component, w) {
    // caption 画在图内底部色带（P3 卡片化），不再额外占图片下方空间
    return Math.min(Math.round(w * 0.5), MAX_IMAGE_H)
  },
  render(component, box, ctx) {
    const imgH = Math.min(Math.round(box.w * 0.5), MAX_IMAGE_H)
    const src = ctx.images?.[component.asset_id]?.src

    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {src ? (
          <image
            href={src}
            x={0}
            y={0}
            width={box.w}
            height={imgH}
            preserveAspectRatio={
              component.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"
            }
          />
        ) : (
          <>
            <rect
              x={0}
              y={0}
              width={box.w}
              height={imgH}
              fill={ctx.colors.surface}
            />
            <text
              textAnchor="middle"
              x={box.w / 2}
              y={imgH / 2}
              fill={ctx.colors.muted}
              dominantBaseline="alphabetic"
            >
              图片缺失
            </text>
          </>
        )}
        {/* 卡片化（图片排版 P3）：1px 主题框线，与 image_grid/compare 一致 */}
        <rect
          x={0.5}
          y={0.5}
          width={box.w - 1}
          height={imgH - 1}
          fill="none"
          stroke={ctx.colors.border}
          strokeWidth={1}
        />
        {component.caption &&
          (() => {
            const fittedCaption = fitSvgLine(component.caption, {
              maxWidth: box.w - 24,
              fontSize: 15,
              minFontSize: 12,
            })
            return (
              // caption 底部色带（家居参考图 #3 的图卡形态）：主题主色半透明
              // 压在图片底边内，白字居中——不再吃图片下方 32px 的外部空间
              <>
                <rect
                  x={0}
                  y={imgH - 32}
                  width={box.w}
                  height={32}
                  fill={ctx.colors.primary}
                  fillOpacity={0.88}
                />
                <text
                  x={box.w / 2}
                  y={imgH - 11}
                  textAnchor="middle"
                  fontSize={fittedCaption.fontSize}
                  fill={ctx.colors.surface}
                  fontFamily={ctx.fonts.body}
                  dominantBaseline="alphabetic"
                >
                  {fittedCaption.text}
                </text>
              </>
            )
          })()}
      </g>
    )
  },
}
