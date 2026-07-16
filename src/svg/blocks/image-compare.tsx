import type { Block } from "@/ir"
import { fitSvgLine } from "../../lib/svg-text-layout"
import type { BlockCtx, SvgBlock } from "./types"

type ImageCompareBlock = Extract<Block, { type: "image_compare" }>

/** 图区高度上限（px），标签条另计。 */
const MAX_IMAGE_H = 320
const GAP = 10
const LABEL_H = 40

function imageAreaH(w: number): number {
  const half = (w - GAP) / 2
  return Math.min(Math.round(half * 0.66), MAX_IMAGE_H)
}

function renderSide({
  asset_id,
  label,
  x,
  w,
  h,
  ctx,
}: {
  asset_id: string
  label: string
  x: number
  w: number
  h: number
  ctx: BlockCtx
}) {
  const src = ctx.images?.[asset_id]?.src
  const fitted = fitSvgLine(label, { maxWidth: w - 16, fontSize: 15, minFontSize: 12 })
  return (
    <g transform={`translate(${x},0)`}>
      {src ? (
        <image
          href={src}
          x={0}
          y={0}
          width={w}
          height={h}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <>
          <rect x={0} y={0} width={w} height={h} fill={ctx.colors.surface} />
          <text
            textAnchor="middle"
            x={w / 2}
            y={h / 2}
            fontSize={14}
            fill={ctx.colors.muted}
            fontFamily={ctx.fonts.body}
            dominantBaseline="alphabetic"
          >
            图片缺失
          </text>
        </>
      )}
      <rect
        x={0.5}
        y={0.5}
        width={w - 1}
        height={h - 1}
        fill="none"
        stroke={ctx.colors.border}
        strokeWidth={1}
      />
      <text
        x={w / 2}
        y={h + 22}
        textAnchor="middle"
        fontSize={fitted.fontSize}
        fontFamily={ctx.fonts.body}
        fill={ctx.colors.text}
        fontWeight={600}
        letterSpacing={1}
        dominantBaseline="alphabetic"
      >
        {fitted.text}
      </text>
      <rect x={w / 2 - 14} y={h + 30} width={28} height={3} fill={ctx.colors.accent} />
    </g>
  )
}

export const imageCompare: SvgBlock<ImageCompareBlock> = {
  measure(_block, w) {
    return imageAreaH(w) + LABEL_H
  },
  render(block, box, ctx) {
    const h = imageAreaH(box.w)
    const half = Math.floor((box.w - GAP) / 2)
    const isVs = (block.style ?? "vs") === "vs"
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {renderSide({ asset_id: block.left.asset_id, label: block.left.label, x: 0, w: half, h, ctx })}
        {renderSide({
          asset_id: block.right.asset_id,
          label: block.right.label,
          x: half + GAP,
          w: half,
          h,
          ctx,
        })}
        {isVs ? (
          // 中缝圆徽章「VS」（压在两图接缝上）
          <g>
            <circle
              cx={box.w / 2}
              cy={h / 2}
              r={26}
              fill={ctx.colors.primary}
              stroke="#FFFFFF"
              strokeWidth={2.5}
            />
            <text
              x={box.w / 2}
              y={h / 2 + 6}
              textAnchor="middle"
              fontSize={18}
              fontWeight={700}
              fontFamily={ctx.fonts.heading}
              fill={ctx.colors.surface}
              dominantBaseline="alphabetic"
            >
              VS
            </text>
          </g>
        ) : (
          // before/after 左上角标（各一枚小色块标签）
          <>
            {[0, half + GAP].map((x, i) => (
              <g key={i} transform={`translate(${x + 10},10)`}>
                <rect
                  x={0}
                  y={0}
                  width={i === 0 ? 66 : 52}
                  height={24}
                  fill={i === 0 ? ctx.colors.muted : ctx.colors.accent}
                />
                <text
                  x={i === 0 ? 33 : 26}
                  y={17}
                  textAnchor="middle"
                  fontSize={13}
                  fontWeight={600}
                  fontFamily={ctx.fonts.body}
                  fill={ctx.colors.surface}
                  dominantBaseline="alphabetic"
                >
                  {i === 0 ? "BEFORE" : "AFTER"}
                </text>
              </g>
            ))}
          </>
        )}
      </g>
    )
  },
}
