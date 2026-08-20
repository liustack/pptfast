import type { Component } from "@/ir"
import {
  fitSvgLine,
  measureTextUnits,
  truncateToUnits,
  type TextWeightHint,
} from "../../lib/svg-text-layout"
import { accessibleInk, accessibleOpacity, resolveSemanticColor, type SemanticColorTokens } from "../ink"
import { Icon } from "../icons"
import type { RenderDef, SvgComponent } from "./types"

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
//
// The up/down colors are theme tokens now (`colors.success`/`colors.danger`),
// resolved through `resolveSemanticColor` — hence the `colors` argument,
// which both call sites fill with `ctx.colors`. A theme that declares neither
// token resolves to the same `#16A34A`/`#DC2626` this function used to return
// outright, so nothing moves until a theme opts in.
export function deltaProps(delta: "up" | "down" | "flat", colors: SemanticColorTokens) {
  if (delta === "up") return { arrow: "↑", color: resolveSemanticColor("success", colors) }
  if (delta === "down") return { arrow: "↓", color: resolveSemanticColor("danger", colors) }
  return { arrow: "→", color: "" } // color filled by caller with ctx.colors.muted
}

/**
 * The type scale the value line is rendered at, handed to
 * `splitKpiValueWidths` so it can reason about the size the value will
 * actually come out at. This file's own card uses `CARD_VALUE_SCALE`;
 * `content-bento-panel.tsx` passes its own, larger one.
 */
export interface KpiValueScale {
  /** Design size of the value text (`fitSvgLine`'s `fontSize`). */
  readonly fontSize: number
  /** Floor `fitSvgLine` shrinks to before it starts cutting characters. */
  readonly minFontSize: number
  /** The unit tspan's size as a fraction of the fitted value size. */
  readonly unitRatio: number
  /** Font stack the value and unit render in — both are bold. */
  readonly fontFamily?: string
}

const CARD_VALUE_SCALE: KpiValueScale = { fontSize: 40, minFontSize: 22, unitRatio: 0.45 }

// Exported for content-bento-panel.tsx's `renderKpiCardBody` — same
// value/unit width split technique (see the comment at its call site below),
// reused verbatim so the two KPI renderers can't drift on this
// overflow-safety math.
//
// Value first (review round 3, D-cluster 5a). The split used to be flatly
// proportional to each side's character count, which reads well until the
// unit is the longer string: `value="5"` / `unit="weeks"` on the gallery's
// 123px two-column card gave the number 13px and the suffix 70px, and the
// card came out as "…weeks" — the number itself gone, which is not a
// truncation but a rewrite of the datum. `102k units` came out as `1…units`
// on the same page. The number is the payload and the unit is a suffix, so
// the unit is what gives way: first abbreviated, then dropped outright, and
// only once the number cannot fit even at its own floor size does it start
// shrinking itself (leading digits first, the significant ones).
//
// The proportional share is kept as-is wherever it already renders the
// number, because it is not arbitrary — it is what keeps the *overflow
// auditor* quiet. That auditor measures a `<text>`'s whole textContent
// (value + unit tspan concatenated) at the outer element's font-size,
// blind to the unit tspan rendering smaller, so the proportional share is
// exactly the largest value budget whose auditor estimate still fits the
// card. Widening the value's share therefore has to buy that width from the
// unit's *text*, not just from its budget — which is what the fallback
// below does, at the `unitRatio` exchange rate the auditor's own blindness
// implies.
export function splitKpiValueWidths(
  value: string,
  unit: string | undefined,
  availableWidth: number,
  scale: KpiValueScale = CARD_VALUE_SCALE,
): { valueMaxWidth: number; unitMaxWidth: number } {
  const unitUnits = unit ? measureTextUnits(unit) : 0
  const valueUnits = measureTextUnits(value)
  // Nothing to split: one side or the other has no ink of its own.
  if (unitUnits <= 0 || valueUnits <= 0) return { valueMaxWidth: availableWidth, unitMaxWidth: 0 }

  const sharedValueW = Math.floor((availableWidth * valueUnits) / (valueUnits + unitUnits))
  // Whether that share renders the number is decided with the *same*
  // measurement `fitSvgLine` will use on it below — bold, in the heading
  // face. Measuring the split itself that way instead would move the
  // proportional share on every card that carries a unit, including the
  // ones that render fine today, so the two ruler settings stay as they
  // are: unweighted to divide the line, weighted to judge the result.
  const ink: TextWeightHint = { bold: true, fontFamily: scale.fontFamily }
  const valueInkUnits = measureTextUnits(value, ink)
  if (Math.floor(sharedValueW / valueInkUnits) >= scale.minFontSize) {
    return { valueMaxWidth: sharedValueW, unitMaxWidth: availableWidth - sharedValueW }
  }

  // The number would lose characters. Take the room back from the unit: it
  // may keep whatever is left over once the value has the width it renders
  // at, converted at the `unitRatio` the auditor charges unit glyphs at.
  // Zero is a legitimate answer — a unit that has no room left is dropped
  // rather than drawn as a stub (`fitKpiUnit` below).
  const unitInkUnits = measureTextUnits(unit!, ink)
  const valueInkW = Math.min(valueInkUnits * scale.fontSize, availableWidth)
  const unitWanted = Math.ceil(unitInkUnits * Math.round(scale.fontSize * scale.unitRatio))
  const unitMaxWidth = Math.max(
    0,
    Math.min(unitWanted, scale.unitRatio * (availableWidth - valueInkW)),
  )
  return { valueMaxWidth: availableWidth - unitMaxWidth, unitMaxWidth }
}

/**
 * The unit tspan's text, or `null` when it has no room worth drawing.
 *
 * Shared with `content-bento-panel.tsx` for the same reason
 * `splitKpiValueWidths` is. The `null` cases are what the value-first split
 * above made reachable: a unit can now be squeezed down to nothing, and both
 * degenerate results read badly glued to a number — an empty tspan is a
 * stray empty run in the exported OOXML, and a lone "…" after a figure reads
 * as a truncated *number* ("5…"), which is the very misreading this whole
 * fix exists to prevent.
 */
export function fitKpiUnit(
  unit: string | undefined,
  unitMaxWidth: number,
  unitFontSize: number,
  fontFamily?: string,
): string | null {
  if (!unit) return null
  const fitted = truncateToUnits(unit, unitMaxWidth / unitFontSize, { bold: true, fontFamily })
  return fitted === "" || fitted === "…" ? null : fitted
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

/**
 * Horizontal graceful landing (P0 hardening, robustness deep-review D1's
 * horizontal-axis sibling, review round 2): `items` has no schema ceiling
 * (unlike `icon_cards`/`row_cards`, which cap at 6), and pre-fix `cardW =
 * (box.w - GAP*(n-1)) / n` had no floor of its own — past a realistic item
 * count (reviewer's repro: 50 items with a `delta` set, a single-column
 * full-width slide, no arrangement tricks needed), `cardW` goes negative.
 * The card's own background `<rect>` survives that (`rect.ts`'s
 * `floorAxis` already floors any `<rect>`'s negative extent to 0.75px), but
 * the delta arrow `<text textAnchor="end" x={cardX+cardW-20}>` does not:
 * `svg2pptx/text.ts`'s `align==="right"` branch computes `w =
 * pxToIn(xPx)`, and `xPx = cardX+cardW-20` can itself go negative for an
 * early card once `cardW` is negative enough, producing a genuinely
 * negative-width **text shape** (`<p:sp>`, not `<p:rect>` — `floorAxis`
 * never sees it) that `package-audit`'s `invalid-shape-transform` rule
 * rejects outright: `a:ext cx=-132588 ... needs cx and cy > 0` (reviewer's
 * exact repro, 50 items with delta).
 *
 * Same idiom as the vertical-axis family sweep (bullets/comparison/
 * citation/architecture/timeline — same task): cap the number of rendered
 * cards to what fits `box.w` at a sane minimum card width, reflow the
 * visible cards to fill the freed-up space, and mark the drop with the
 * same "+N more"/`data-dropped` convention (row-cards.tsx's precedent,
 * adapted to a horizontal trailing slot instead of a line below).
 *
 * The floor itself is a *readability* floor, not the 80px anti-crash one it
 * started as (review round 3, D-cluster 5a's second half). 80px only ever
 * asked "will this produce a negative-width shape?", so a 528px column
 * holding four 123px cards sailed past it and drew four cards nobody could
 * read — every label cut to one word, and two of the four numbers gone. 160
 * asks the question that matters and still answers the old one a fortiori,
 * being twice as wide.
 *
 * Where 160 comes from, measured rather than guessed. A card spends 20px of
 * padding on each side (`cardX + 20` starts every line, `cardW - 40` budgets
 * every width below), so 160 leaves a 120px text column. The label is what
 * runs out of room first: it renders at 16px and `fitSvgLine` may take it
 * down to 12px before it starts cutting characters, so 120px buys
 * 120 / 12 = 10 units of `measureTextUnits` — 10 CJK characters, or about 19
 * Latin ones — with no ellipsis. Against the gallery's own twelve metric
 * labels (zh 5.0-8.0 units, en 6.6-11.4) that renders nine of them whole and
 * leaves the three longest English ones with ~19 characters, where the
 * pre-change 10-across density row (84px cards, a 44px column) left them 7.
 * The value line clears the same bar with room to spare: the widest gallery value
 * ("102k", 2.45 units) wants 54px at its own 22px floor and its unit
 * ("units") another 26px at the matching 10px — 80px of the 120.
 */
const MIN_READABLE_CARD_W = 160
/** Reserved horizontal slot (px) for the "+N more" marker text itself,
 * plus one `GAP` before it — sized generously for a 3-4 digit count
 * ("+9999 more") at the marker's own 13px font, never a source of the
 * marker itself overflowing `box.w`. */
const MARKER_RESERVE_W = 90

/**
 * How many leading items fit `box.w` at `MIN_READABLE_CARD_W` once
 * `MARKER_RESERVE_W` (+ one more `GAP`) is set aside for the "+N more"
 * marker — at least 1, matching every other component in this task's family
 * sweep ("never render zero visible units, even in a near-zero box").
 */
function visibleCardCount(fullCount: number, boxW: number): number {
  const effectiveW = boxW - MARKER_RESERVE_W - GAP
  const visible = Math.floor((effectiveW + GAP) / (MIN_READABLE_CARD_W + GAP))
  return Math.max(1, Math.min(fullCount, visible))
}

export const kpi: SvgComponent<KpiComponent> = {
  measure(component) {
    return baseCardH(component)
  },
  render(rawComponent, box, ctx) {
    const fullCount = rawComponent.items.length
    // Only cap when the *full* set would actually breach
    // MIN_READABLE_CARD_W — a row whose cards already clear it reflows
    // through the exact same formula it always has (byte-identical no-op on
    // the common path).
    const naturalCardW = (box.w - GAP * (fullCount - 1)) / fullCount
    const visible = naturalCardW < MIN_READABLE_CARD_W ? visibleCardCount(fullCount, box.w) : fullCount
    const hidden = fullCount - visible
    const component = hidden > 0 ? { ...rawComponent, items: rawComponent.items.slice(0, visible) } : rawComponent
    const n = component.items.length
    // Visible cards reflow to fill box.w when truncated (leaving
    // MARKER_RESERVE_W + GAP for the marker slot after them), otherwise the
    // original, unreserved full-width formula — unchanged from pre-fix.
    const cardW = hidden > 0 ? (box.w - MARKER_RESERVE_W - GAP - GAP * (n - 1)) / n : (box.w - GAP * (n - 1)) / n
    const measured = baseCardH(component)
    // 密度拉伸（box.h 由布局分配）：卡片撑到分配高度，内容组垂直居中
    const cardH = Math.max(measured, box.h ?? measured)
    const contentShift = (cardH - measured) / 2
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {component.items.map((item, i) => {
          const cardX = i * (cardW + GAP)
          const dp = item.delta ? deltaProps(item.delta, ctx.colors) : null
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
          // card — and the number keeps that budget ahead of the unit when
          // the two cannot both have it (see `splitKpiValueWidths`). The
          // unit itself has no length limit from the schema, so its actual
          // rendered text is separately truncated to fit the width share it
          // was allotted at its own (smaller) font size — together the two
          // bounds keep the card from overflowing at any value/unit length.
          const valueStr = String(item.value)
          const unit = dedupeKpiUnit(valueStr, item.unit)
          const availableWidth = cardW - 40
          const valueScale: KpiValueScale = { ...CARD_VALUE_SCALE, fontFamily: ctx.fonts.heading }
          const { valueMaxWidth, unitMaxWidth } = splitKpiValueWidths(
            valueStr,
            unit,
            availableWidth,
            valueScale,
          )
          // bold-metrics fix (2026-07-24): this text renders `fontWeight=
          // "bold"` in `ctx.fonts.heading` below — audit-baseline.test.ts's
          // ink/journal/runway/bloom "kpi" cases caught this the same way
          // they caught the reported cover defect (that test's own header
          // comment: "if a case fails, the residual overflow is real and
          // belongs to the renderer") once svg-audit.ts's overflow walker
          // became weight/face-aware. `fittedUnit` inherits the parent
          // `<text>`'s bold (SVG tspans inherit `font-weight` unless
          // overridden), so its own truncation budget needs the same
          // correction.
          const fittedValue = fitSvgLine(valueStr, {
            maxWidth: valueMaxWidth,
            fontSize: valueScale.fontSize,
            minFontSize: valueScale.minFontSize,
            bold: true,
            fontFamily: ctx.fonts.heading,
          })
          const unitFontSize = Math.round(fittedValue.fontSize * valueScale.unitRatio)
          const fittedUnit = fitKpiUnit(unit, unitMaxWidth, unitFontSize, ctx.fonts.heading)
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
        {hidden > 0 && (
          <text
            data-dropped={hidden}
            x={n * (cardW + GAP)}
            y={cardH / 2 + 5}
            textAnchor="start"
            fontSize={13}
            fill={ctx.colors.muted}
            fontFamily={ctx.fonts.body}
            dominantBaseline="alphabetic"
          >
            {`+${hidden} more`}
          </text>
        )}
      </g>
    )
  },
}

export const renderDef: RenderDef<KpiComponent> = { type: "kpi_cards", measure: kpi.measure, render: kpi.render }
