import type { Component } from "@/ir"
import {
  fitSvgLine,
  measureTextUnits,
  truncateToUnits,
} from "../../lib/svg-text-layout"
import { accessibleInk, accessibleOpacity } from "../ink"
import { Icon } from "../icons"
import type { SvgComponent } from "./types"

type KpiComponent = Extract<Component, { type: "kpi_cards" }>

const GAP = 16
const CARD_H = 120

// Exported for content-bento-panel.tsx's own per-item KPI cards
// (`renderKpiCardBody`) — same delta arrow/color mapping, just laid out
// into a compact bento cell instead of this file's wide row card.
//
// Background-agnostic by design: this function has no idea what surface its
// caller will paint the arrow on, so it returns the raw semantic color
// (green/red/"") and leaves ink-vs-background calibration to each call
// site's own `accessibleInk` wrap (bench-driven fix round, defect B — see
// this file's own call site below and content-bento-panel.tsx's identical
// one). Pre-fix, both call sites rendered `dp.color` raw — a real,
// reproducible defect (not theme-specific: the full-matrix sweep found at
// least one of up/down failing on every one of the 13 themes across the two
// call sites combined, not just the journal/enterprise/luxe instances the
// benchmark happened to name).
export function deltaProps(delta: "up" | "down" | "flat") {
  if (delta === "up") return { arrow: "↑", color: "#16A34A" }
  if (delta === "down") return { arrow: "↓", color: "#DC2626" }
  return { arrow: "→", color: "" } // color filled by caller with ctx.colors.muted
}

// Exported for tech.tsx's `renderKpiCardBody` — same value/unit width
// split technique (see the comment at its call site below), reused verbatim
// so the two KPI renderers can't drift on this overflow-safety math.
export function splitKpiValueWidths(
  value: string,
  unit: string | undefined,
  availableWidth: number,
): { valueMaxWidth: number; unitMaxWidth: number } {
  const valueUnits = measureTextUnits(value)
  const unitUnits = unit ? measureTextUnits(unit) : 0
  const valueMaxWidth =
    unitUnits > 0 && valueUnits > 0
      ? Math.floor((availableWidth * valueUnits) / (valueUnits + unitUnits))
      : availableWidth
  return { valueMaxWidth, unitMaxWidth: availableWidth - valueMaxWidth }
}

/**
 * 弱模型冗余单位去重（2026-07-10 无图矩阵真机抓到：tech 4/4、magazine 1/4
 * KPI 卡渲成「35%%」）：模型常把 "35%" 填进 value 后又把 "%" 填进 unit，
 * 拼接即重复。value 已以 unit 结尾时丢弃 unit。导出供 bento KPI 卡
 * （content-bento-panel）同源复用，两条 KPI 渲染路径不漂移。
 */
export function dedupeKpiUnit(
  value: string,
  unit: string | undefined,
): string | undefined {
  if (!unit) return unit
  const u = unit.trim()
  return u && value.trim().endsWith(u) ? undefined : unit
}

/** 任一 item 带 source 来源行时卡加高（label 下再排一行 11px 小字）。 */
function baseCardH(component: KpiComponent): number {
  return component.items.some((it) => it.source) ? CARD_H + 18 : CARD_H
}

export const kpi: SvgComponent<KpiComponent> = {
  measure(component) {
    return baseCardH(component)
  },
  render(component, box, ctx) {
    const n = component.items.length
    const cardW = (box.w - GAP * (n - 1)) / n
    const measured = baseCardH(component)
    // 密度拉伸（box.h 由布局分配）：卡片撑到分配高度，内容组垂直居中
    const cardH = Math.max(measured, box.h ?? measured)
    const contentShift = (cardH - measured) / 2
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {component.items.map((item, i) => {
          const cardX = i * (cardW + GAP)
          const dp = item.delta ? deltaProps(item.delta) : null
          // Bench-driven fix round, defect B: `deltaProps` returns a raw
          // semantic hex (or "" for "flat", falling back to colors.muted)
          // with no idea what background it'll render on — this card's own
          // `colors.surface` shell (painted below). Full-matrix scanning
          // found #16A34A (up) failing against several themes' white/light
          // surfaces and #DC2626 (down) failing against dark/saturated
          // ones — a real, theme-independent defect, not just the
          // journal/enterprise/luxe instances the benchmark happened to
          // name. `accessibleInk` keeps the semantic color when it already
          // clears 20px body text's 4.5:1 (every theme this arrow already
          // passed on, byte-identical), falls back to neutral ink only
          // where it doesn't.
          const deltaColor = dp
            ? accessibleInk(dp.color || ctx.colors.muted, ctx.colors.surface, 20)
            : ctx.colors.muted
          // The overflow auditor measures a `<text>`'s whole textContent
          // (value + unit tspan concatenated) at the outer element's
          // font-size — it can't see that the unit tspan renders smaller. So
          // the value's width budget is shrunk in proportion to how much of
          // the combined text the unit accounts for, instead of a flat
          // pixel reserve, to keep the auditor's (over)estimate inside the
          // card. The unit itself has no length limit from the schema, so
          // its actual rendered text is separately truncated to fit the
          // width share it was allotted at its own (smaller) font size —
          // together the two bounds keep the card from overflowing at any
          // value/unit length.
          const valueStr = String(item.value)
          const unit = dedupeKpiUnit(valueStr, item.unit)
          const availableWidth = cardW - 40
          const { valueMaxWidth, unitMaxWidth } = splitKpiValueWidths(
            valueStr,
            unit,
            availableWidth,
          )
          const fittedValue = fitSvgLine(valueStr, {
            maxWidth: valueMaxWidth,
            fontSize: 40,
            minFontSize: 22,
          })
          const unitFontSize = Math.round(fittedValue.fontSize * 0.45)
          const fittedUnit = unit
            ? truncateToUnits(unit, unitMaxWidth / unitFontSize)
            : null
          const fittedLabel = fitSvgLine(item.label, {
            maxWidth: cardW - 40,
            fontSize: 16,
            minFontSize: 12,
          })
          const fittedSource = item.source
            ? fitSvgLine(item.source, { maxWidth: cardW - 40, fontSize: 11, minFontSize: 9 })
            : null
          return (
            <g key={i}>
              <rect
                x={cardX}
                y={0}
                width={cardW}
                height={cardH}
                rx={ctx.shape?.radius ?? 8}
                fill={ctx.colors.surface}
                {...(ctx.colors.cardStroke
                  ? { stroke: ctx.colors.cardStroke, strokeWidth: 1 }
                  : {})}
              />
              {item.icon && (
                <Icon
                  name={item.icon}
                  x={cardX + 20}
                  y={12 + contentShift}
                  size={18}
                  color={ctx.colors.primary}
                />
              )}
              <text
                data-truncated={fittedValue.truncated ? "1" : undefined}
                x={cardX + 20}
                y={(item.icon ? 64 : 58) + contentShift}
                fontSize={fittedValue.fontSize}
                fontWeight="bold"
                fill={ctx.colors.text}
                fontFamily={ctx.fonts.heading}
                dominantBaseline="alphabetic"
              >
                {fittedValue.text}
                {fittedUnit != null && (
                  <tspan fontSize={unitFontSize} fill={ctx.colors.muted}>
                    {fittedUnit}
                  </tspan>
                )}
              </text>
              {dp && (
                <text
                  x={cardX + cardW - 20}
                  y={36 + contentShift}
                  textAnchor="end"
                  fontSize={20}
                  fill={deltaColor}
                  dominantBaseline="alphabetic"
                >
                  {dp.arrow}
                </text>
              )}
              <text
                data-truncated={fittedLabel.truncated ? "1" : undefined}
                x={cardX + 20}
                y={96 + contentShift}
                fontSize={fittedLabel.fontSize}
                fill={ctx.colors.muted}
                fontFamily={ctx.fonts.body}
                dominantBaseline="alphabetic"
              >
                {fittedLabel.text}
              </text>
              {fittedSource && (
                <text
                  data-truncated={fittedSource.truncated ? "1" : undefined}
                  x={cardX + 20}
                  y={114 + contentShift}
                  fontSize={11}
                  fill={ctx.colors.muted}
                  // Post-v0.3 W8 fix round (backlog item "D", task-2 review
                  // routed — pinned as a known gap in
                  // `full-matrix-contrast.test.ts` by commit c523994 before
                  // this fix landed): this line renders on the card's own
                  // `colors.surface` shell (the `<rect fill={ctx.colors.
                  // surface}>` above), not the page background, so contrast
                  // is checked against that surface — same background
                  // parameter `content-bento-panel.tsx`'s own KPI value text
                  // uses for the same reason (see that file's header
                  // comment). A flat 0.7 fillOpacity blended colors.muted
                  // toward colors.surface close enough to fail 4.5:1 on all
                  // 13 themes (the pinned measurement). accessibleOpacity
                  // falls back to full opacity wherever the blend doesn't
                  // clear the floor, `preferredOpacity` unchanged otherwise
                  // — same pattern as chapter-banner-chapter.tsx/chapter-
                  // rail-chapter.tsx's existing subheading call sites.
                  fillOpacity={accessibleOpacity(ctx.colors.muted, ctx.colors.surface, 11, 0.7)}
                  fontFamily={ctx.fonts.body}
                  dominantBaseline="alphabetic"
                >
                  {fittedSource.text}
                </text>
              )}
            </g>
          )
        })}
      </g>
    )
  },
}
