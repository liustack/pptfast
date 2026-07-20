import type { Component } from "@/ir"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleInk } from "../ink"
import { mixHex } from "./color-mix"
import type { ComponentCtx, SvgComponent } from "./types"

type WaterfallComponent = Extract<Component, { type: "waterfall" }>
type WaterfallItem = WaterfallComponent["items"][number]

/**
 * Waterfall bridge chart (structure-components wave task 2, decision 5): a
 * full-body component (`FULL_BODY_TYPES`, `component-traits.ts`) — the sole
 * component `SvgContent.tsx` ever hands this to fills the whole content rect,
 * no sibling components on the same slide (`checkFullBodyExclusivity`,
 * `api.ts`).
 *
 * Deliberately its own component, not folded into `chart`'s `ChartSeries`
 * union (recon finding: `chart.tsx`'s `measure()` hardcodes `CHART_H=240`
 * for every chart subtype — a fixed height a full-body component, which must
 * fill whatever `box.h` it's handed, would just inherit as dead weight). The
 * vertical floating-bar geometry below is adapted from `chart-svg.tsx`'s
 * `renderBarHorizontal` (the only existing proportional-*value* positioning
 * primitive in this codebase) rotated to a vertical axis and given a running-
 * total baseline instead of a fixed zero baseline per bar.
 *
 * **Running-total derivation** (`computeBars`, pure function of `items`,
 * deterministic): each item's `value` is a signed delta added to the
 * previous bar's running total — the bar floats from the old total to the
 * new one. An item explicitly marked `kind: "total"` is instead a grounded
 * checkpoint: its bar always spans `[0, value]` (baseline to the declared
 * absolute total) and *resets* the running total to `value`, rather than
 * adding to it — the classic "subtotal so far" bar a real waterfall chart
 * uses mid-sequence. When the *last* item isn't itself `kind: "total"`, one
 * more bar is appended automatically (`AUTO_TOTAL_LABEL`, "Total"), grounded
 * the same way, at whatever the running total ended up being — every
 * waterfall this component renders visually resolves to a final total bar,
 * with zero authored input required for the common case.
 *
 * **Color policy** (decision 7: theme tokens only, no hardcoded semantic red/
 * green): rise = `colors.accent` (the conventional "up" read), fall =
 * `colors.primary` (this repo's theme tokens skew primary toward the darker
 * brand color and accent toward the brighter highlight — see `swot.tsx`'s
 * own ctx fixture, `primary:"#051C2C"` navy vs `accent:"#FFC72C"` gold — so a
 * flat `primary` fill reads as the visually "heavier"/darker bar next to a
 * bright rise, without inventing a non-token color), total =
 * `mixHex(colors.primary, colors.accent, 0.5)` (a third, visually distinct
 * blend of the same two tokens — the "涨/跌/合计三色" mandate reads as
 * "accent, primary, and a mix of the two", not a fourth free token; there is
 * no 4th semantic slot to spend, same reasoning `swot.tsx`'s `badgeFill`
 * documents for its own primary/muted Threats blend).
 *
 * **Text never sits on a painted bar** (deliberate, sidesteps a whole class
 * of contrast bookkeeping): value labels sit just above a bar whose far tip
 * reads positive, or just below one whose far tip reads negative; category
 * labels sit in the reserved band below the whole plot. Every text element
 * therefore renders on the *page* background, the same "page-bg" surface
 * `chart.tsx`/`chart-svg.tsx`'s own category/value labels already use raw
 * `colors.text` on ("no-muted-fill"/`chart`'s "page-bg" precedent,
 * `MUTED_SURFACE_CLASS`) — but this file threads every one of them through
 * `accessibleInk` regardless (against the real resolved page background,
 * `ctx.defaultBg ?? ctx.colors.bg`) since a full-body component renders
 * without any surrounding archetype chrome to fall back on. The zero-baseline
 * reference line and inter-bar dashed connectors are strokes, never a text
 * fill, using `colors.muted` — the same "stroke-only, not a muted *fill*"
 * carve-out `bullets.tsx`/`rings.tsx`/`comparison.tsx` already rely on
 * (`MUTED_SURFACE_CLASS`'s "no-muted-fill" class), so this component still
 * classifies "no-muted-fill" there despite touching the token.
 */

const LABEL_TOP_PAD = 32
const LABEL_BOTTOM_PAD = 50
const BAR_INSET_RATIO = 0.18
const BAR_INSET_MAX = 22
const MIN_BAR_H = 3
const VALUE_GAP = 6
const VALUE_FONT = 13
const VALUE_MIN_FONT = 10
const CATEGORY_FONT = 12.5
const CATEGORY_MIN_FONT = 9.5
const CATEGORY_BOTTOM_MARGIN = 10
const CONNECTOR_DASH = "4 3"
/** Natural (unstretched) height — full-body geometry is always driven by the
 * given `box.h` at render time (`checkFullBodyExclusivity` guarantees this is
 * always the slide's sole component), so this only matters as a fallback for
 * a caller that invokes `measure`/`render` without going through the
 * full-body path (e.g. a direct component-level test). */
const NATURAL_H = 420

const AUTO_TOTAL_LABEL = "Total"

type BarKind = "rise" | "fall" | "total"

interface Bar {
  label: string
  start: number
  end: number
  kind: BarKind
  /** Signed delta for a delta bar, absolute total for a total bar — exactly
   * what the value label displays. */
  displayValue: number
}

/** Deterministic running-total derivation — see file header. Pure function of
 * `items`, no `Date`/`random` anywhere in this file. */
function computeBars(items: readonly WaterfallItem[]): Bar[] {
  let running = 0
  const bars: Bar[] = items.map((item) => {
    if (item.kind === "total") {
      running = item.value
      return { label: item.label, start: 0, end: item.value, kind: "total", displayValue: item.value }
    }
    const start = running
    running = running + item.value
    return { label: item.label, start, end: running, kind: item.value < 0 ? "fall" : "rise", displayValue: item.value }
  })
  const last = items[items.length - 1]
  if (!last || last.kind !== "total") {
    bars.push({ label: AUTO_TOTAL_LABEL, start: 0, end: running, kind: "total", displayValue: running })
  }
  return bars
}

/** Y-domain spanning every bar's real extent, always including 0 (the
 * baseline) even when every bar sits entirely above or below it (an
 * all-rises or all-falls deck). */
function yDomain(bars: readonly Bar[]): { min: number; max: number } {
  const values = bars.flatMap((b) => [b.start, b.end])
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  return min === max ? { min: min - 1, max: max + 1 } : { min, max }
}

function fillFor(kind: BarKind, ctx: ComponentCtx): string {
  switch (kind) {
    case "rise":
      return ctx.colors.accent
    case "fall":
      return ctx.colors.primary
    case "total":
      return mixHex(ctx.colors.primary, ctx.colors.accent, 0.5)
  }
}

function formatValue(v: number, unit: string | undefined, signed: boolean): string {
  const sign = signed && v > 0 ? "+" : ""
  const num = Number.isInteger(v) ? String(v) : v.toFixed(1)
  return `${sign}${num}${unit ?? ""}`
}

interface Geom {
  bars: Bar[]
  colW: number
  barInset: number
  plotTop: number
  plotH: number
  valueToY: (v: number) => number
}

function geom(component: WaterfallComponent, w: number, h: number): Geom {
  const bars = computeBars(component.items)
  const { min, max } = yDomain(bars)
  const plotTop = LABEL_TOP_PAD
  const plotH = Math.max(1, h - LABEL_TOP_PAD - LABEL_BOTTOM_PAD)
  const colW = w / bars.length
  const barInset = Math.min(BAR_INSET_MAX, colW * BAR_INSET_RATIO)
  const valueToY = (v: number) => plotTop + plotH - ((v - min) / (max - min)) * plotH
  return { bars, colW, barInset, plotTop, plotH, valueToY }
}

export const waterfall: SvgComponent<WaterfallComponent> = {
  measure() {
    return NATURAL_H
  },
  render(component, box, ctx) {
    const h = box.h ?? NATURAL_H
    const g = geom(component, box.w, h)
    const bg = ctx.defaultBg ?? ctx.colors.bg
    const baselineY = box.y + g.valueToY(0)

    return (
      <g>
        <line
          x1={box.x}
          y1={baselineY}
          x2={box.x + box.w}
          y2={baselineY}
          stroke={ctx.colors.muted}
          strokeOpacity={0.3}
          strokeWidth={1}
        />
        {g.bars.map((bar, i) => {
          if (i === 0) return null
          const prev = g.bars[i - 1]
          const y = box.y + g.valueToY(prev.end)
          const x1 = box.x + i * g.colW - g.barInset
          const x2 = box.x + i * g.colW + g.barInset
          return (
            <line
              key={`connector-${i}`}
              x1={x1}
              y1={y}
              x2={x2}
              y2={y}
              stroke={ctx.colors.muted}
              strokeOpacity={0.55}
              strokeDasharray={CONNECTOR_DASH}
              strokeWidth={1.25}
            />
          )
        })}
        {g.bars.map((bar, i) => {
          const barX = box.x + i * g.colW + g.barInset
          const barW = Math.max(1, g.colW - g.barInset * 2)
          const topVal = Math.max(bar.start, bar.end)
          const botVal = Math.min(bar.start, bar.end)
          let yTop = box.y + g.valueToY(topVal)
          let yBot = box.y + g.valueToY(botVal)
          if (yBot - yTop < MIN_BAR_H) {
            const mid = (yTop + yBot) / 2
            yTop = mid - MIN_BAR_H / 2
            yBot = mid + MIN_BAR_H / 2
          }
          const barH = yBot - yTop
          const above = bar.displayValue >= 0
          const valueText = fitSvgLine(formatValue(bar.displayValue, component.unit, bar.kind !== "total"), {
            maxWidth: g.colW - 4,
            fontSize: VALUE_FONT,
            minFontSize: VALUE_MIN_FONT,
          })
          const valueY = above
            ? yTop - VALUE_GAP
            : yBot + VALUE_GAP + valueText.fontSize * 0.85
          const categoryText = fitSvgLine(bar.label, {
            maxWidth: g.colW - 4,
            fontSize: CATEGORY_FONT,
            minFontSize: CATEGORY_MIN_FONT,
          })
          const valueInk = accessibleInk(ctx.colors.text, bg, valueText.fontSize)
          const categoryInk = accessibleInk(ctx.colors.text, bg, categoryText.fontSize)
          return (
            <g key={i}>
              <rect x={barX} y={yTop} width={barW} height={barH} fill={fillFor(bar.kind, ctx)} />
              <text
                data-truncated={valueText.truncated ? "1" : undefined}
                x={barX + barW / 2}
                y={valueY}
                textAnchor="middle"
                fontSize={valueText.fontSize}
                fontWeight="700"
                fill={valueInk}
                fontFamily={ctx.fonts.body}
                dominantBaseline="alphabetic"
              >
                {valueText.text}
              </text>
              <text
                data-truncated={categoryText.truncated ? "1" : undefined}
                x={barX + barW / 2}
                y={box.y + h - CATEGORY_BOTTOM_MARGIN}
                textAnchor="middle"
                fontSize={categoryText.fontSize}
                fill={categoryInk}
                fontFamily={ctx.fonts.body}
                dominantBaseline="alphabetic"
              >
                {categoryText.text}
              </text>
            </g>
          )
        })}
      </g>
    )
  },
}

