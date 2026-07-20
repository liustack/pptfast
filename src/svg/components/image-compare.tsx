import type { Component } from "@/ir"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleInk } from "../ink"
import type { ComponentCtx, SvgComponent } from "./types"

type ImageCompareComponent = Extract<Component, { type: "image_compare" }>

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
  ctx: ComponentCtx
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

export const imageCompare: SvgComponent<ImageCompareComponent> = {
  measure(_component, w) {
    return imageAreaH(w) + LABEL_H
  },
  render(component, box, ctx) {
    const h = imageAreaH(box.w)
    const half = Math.floor((box.w - GAP) / 2)
    const isVs = (component.style ?? "vs") === "vs"
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {renderSide({ asset_id: component.left.asset_id, label: component.left.label, x: 0, w: half, h, ctx })}
        {renderSide({
          asset_id: component.right.asset_id,
          label: component.right.label,
          x: half + GAP,
          w: half,
          h,
          ctx,
        })}
        {isVs ? (
          // 中缝圆徽章「VS」（压在两图接缝上）。
          // Bench-driven fix round, defect A reclassification (Task 3
          // handoff): identical colors.surface-on-colors.primary pairing as
          // rings.tsx's core label (this component paints its own circle,
          // so contrast must be checked against that circle's own fill, not
          // the ambient page background) — same campaign/insight/classroom
          // failure, same accessibleInk fix.
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
              fill={accessibleInk(ctx.colors.surface, ctx.colors.primary, 18)}
              dominantBaseline="alphabetic"
            >
              VS
            </text>
          </g>
        ) : (
          // before/after 左上角标（各一枚小色块标签）。
          // Bench-driven fix round, defect A reclassification (Task 3
          // handoff): a small rect (52x24=1,248px^2, well below the area
          // floor `deck-audit.ts` used to gate text-background attribution
          // by) — the AFTER chip (i===1, colors.accent fill) measures
          // ~1:1 on consulting/academic/bloom/classroom/luxe/heritage once
          // correctly attributed to its own chip instead of falling through
          // to a background that always happened to pass. The BEFORE chip
          // (i===0, colors.muted fill) already clears the ratio on every
          // theme — accessibleInk is a no-op there, verified byte-identical.
          <>
            {[0, half + GAP].map((x, i) => {
              const chipFill = i === 0 ? ctx.colors.muted : ctx.colors.accent
              return (
                <g key={i} transform={`translate(${x + 10},10)`}>
                  <rect x={0} y={0} width={i === 0 ? 66 : 52} height={24} fill={chipFill} />
                  <text
                    x={i === 0 ? 33 : 26}
                    y={17}
                    textAnchor="middle"
                    fontSize={13}
                    fontWeight={600}
                    fontFamily={ctx.fonts.body}
                    fill={accessibleInk(ctx.colors.surface, chipFill, 13)}
                    dominantBaseline="alphabetic"
                  >
                    {i === 0 ? "BEFORE" : "AFTER"}
                  </text>
                </g>
              )
            })}
          </>
        )}
      </g>
    )
  },
}
