import type { Component } from "@/ir"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { accessibleInk } from "../ink"
import type { SvgComponent } from "./types"

type RingsComponent = Extract<Component, { type: "rings" }>

/**
 * 分层同心圆环（洋葱模型，2026-07-11 用户借鉴 CMT 体系页）：items 从内核
 * 到外层。圆环组靠左（内核实心 primary、外环递淡 fill + 细描边），每层
 * 从环缘拉引线到右侧标注列（label 粗体 + desc muted）。全部 circle/path/
 * text 原语，导出安全。
 */
const H_PER_RING: Record<number, number> = { 2: 300, 3: 340, 4: 380 }
const PAD = 10
const LABEL_GAP = 40
const DESC_SIZE = 13.5
const LABEL_SIZE = 17

function geometry(component: RingsComponent, w: number) {
  const n = component.items.length
  const h = H_PER_RING[n] ?? 340
  const maxR = h / 2 - PAD
  const cx = maxR + PAD
  const cy = h / 2
  const coreR = maxR * 0.36
  const ringStep = n > 1 ? (maxR - coreR) / (n - 1) : 0
  const radii = component.items.map((_, i) => coreR + i * ringStep)
  const textX = cx + maxR + LABEL_GAP
  const textW = Math.max(1, w - textX)
  return { n, h, maxR, cx, cy, radii, textX, textW }
}

export const rings: SvgComponent<RingsComponent> = {
  measure(component, _w) {
    return geometry(component, _w).h
  },
  render(component, box, ctx) {
    const { n, cx, cy, radii, textX, textW, h } = geometry(component, box.w)
    // 标注行从上往下 = 外层环到内核（外环在页面上方更外侧，读序自然）
    const rowStep = n > 1 ? (h - 2 * PAD - 56) / (n - 1) : 0
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {/* 外层环先画（从外到内叠放，内核最后盖顶） */}
        {[...component.items.keys()].reverse().map((idx) => {
          const r = radii[idx]
          if (idx === 0) {
            return <circle key={idx} cx={cx} cy={cy} r={r} fill={ctx.colors.primary} />
          }
          return (
            <circle
              key={idx}
              cx={cx}
              cy={cy}
              r={r}
              fill={ctx.colors.primary}
              fillOpacity={idx === 1 ? 0.14 : idx === 2 ? 0.08 : 0.05}
              stroke={ctx.colors.border ?? ctx.colors.muted}
              strokeWidth={1}
            />
          )
        })}
        {/* 内核 label 圆心居中。
            Bench-driven fix round, defect A reclassification (Task 3
            handoff): this component paints no card shell of its own, so a
            bare `fill={ctx.colors.surface}` on the self-painted primary
            circle used to fall through to the ambient page background for
            contrast purposes (never the circle it's actually rendered on)
            — full-matrix scanning (post defect-A fix) found
            campaign/insight/classroom measure ~1.0-1.2:1 there.
            `accessibleInk` keeps `colors.surface` when it already clears
            the ratio against the circle's own `colors.primary` fill
            (every other theme, byte-identical), falls back to
            `readableOn`'s neutral ink otherwise. */}
        {(() => {
          const core = component.items[0]
          const fitted = fitSvgLine(core.label, {
            maxWidth: radii[0] * 1.7,
            fontSize: 18,
            minFontSize: 12,
          })
          return (
            <text
              x={cx}
              y={cy + fitted.fontSize * 0.35}
              textAnchor="middle"
              fontSize={fitted.fontSize}
              fontWeight="bold"
              fill={accessibleInk(ctx.colors.surface, ctx.colors.primary, fitted.fontSize)}
              fontFamily={ctx.fonts.heading}
              dominantBaseline="alphabetic"
            >
              {fitted.text}
            </text>
          )
        })()}
        {/* 引线 + 右侧标注列：行序 = 外层在上、内核在下 */}
        {component.items.map((item, idx) => {
          const rowIdx = n - 1 - idx
          const rowY = PAD + 28 + rowIdx * rowStep
          const r = radii[idx]
          // 引线起点：环缘上朝各自标注行方向的点（行在圆上方 → 起点取
          // 环右上缘，行在下方 → 右下缘），线最短且互不交叉
          const angle = Math.atan2(rowY - 5 - cy, textX - 18 - cx)
          const sx = cx + r * Math.cos(angle)
          const sy = cy + r * Math.sin(angle)
          const label = fitSvgLine(item.label, {
            maxWidth: textW,
            fontSize: LABEL_SIZE,
            minFontSize: 13,
          })
          const desc = item.desc
            ? layoutSvgText(item.desc, {
                maxWidth: textW,
                fontSize: DESC_SIZE,
                maxLines: 2,
                lineHeightRatio: 1.35,
              })
            : null
          return (
            <g key={idx}>
              <path
                d={`M ${sx.toFixed(1)} ${sy.toFixed(1)} L ${textX - 18} ${rowY - 5} H ${textX - 8}`}
                fill="none"
                stroke={ctx.colors.muted}
                strokeWidth={1}
                opacity={0.6}
              />
              <circle cx={sx} cy={sy} r={3} fill={idx === 0 ? ctx.colors.primary : ctx.colors.accent} />
              <text
                x={textX}
                y={rowY}
                fontSize={label.fontSize}
                fontWeight="bold"
                fill={ctx.colors.text}
                fontFamily={ctx.fonts.heading}
                dominantBaseline="alphabetic"
              >
                {label.text}
              </text>
              {desc
                ? desc.lines.map((line, li) => (
                    <text
                      key={li}
                      x={textX}
                      y={rowY + 8 + (li + 1) * desc.lineHeight}
                      fontSize={desc.fontSize}
                      fill={ctx.colors.muted}
                      fontFamily={ctx.fonts.body}
                      dominantBaseline="alphabetic"
                    >
                      {line}
                    </text>
                  ))
                : null}
            </g>
          )
        })}
      </g>
    )
  },
}
