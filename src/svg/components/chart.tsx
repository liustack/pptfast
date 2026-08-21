import type { Component } from "@/ir"
import { fitSvgLine, measureTextUnits } from "../../lib/svg-text-layout"
import { rotateChartPalette } from "../chart-palette"
import { accessibleInk } from "../ink"
import { buildChartModel } from "./chart-model"
import type { RenderDef, SvgComponent } from "./types"
import {
  renderArea,
  renderBar,
  renderBarHorizontal,
  renderDonut,
  renderDumbbell,
  renderGauge,
  renderLine,
  renderPie,
  renderFunnel,
  renderScatter,
  type ChartRenderFn,
} from "./chart-svg"

type ChartComponent = Extract<Component, { type: "chart" }>

const CHART_H = 240

const renderers: Record<ChartComponent["chart_type"], ChartRenderFn> = {
  bar: renderBar,
  line: renderLine,
  pie: renderPie,
  funnel: renderFunnel,
  dumbbell: renderDumbbell,
  scatter: renderScatter,
  area: renderArea,
  // `donut` (dedicated subtype) shares renderDonut with the legacy
  // `pie`+`style:"donut"` dispatch below — renderDonut reads `component` to
  // decide whether to print the center total, so one function serves both.
  donut: renderDonut,
  gauge: renderGauge,
}

/** 变体分发：bar+direction=horizontal 走横条，pie+style=donut 走环形（沿用旧
 * 形态，中心总值恒显）；其余按 chart_type 直查 renderers（含新 donut/gauge/
 * scatter/area）。 */
function resolveRenderer(component: ChartComponent): ChartRenderFn {
  if (component.chart_type === "bar" && component.direction === "horizontal") {
    return renderBarHorizontal
  }
  if (component.chart_type === "pie" && component.style === "donut") {
    return renderDonut
  }
  return renderers[component.chart_type]
}

/**
 * `component.axes` (chart-axes feature) applicability matrix: which
 * chart_type an x_title/y_title/show_grid actually renders for. Both bar
 * directions (vertical + `direction: "horizontal"`) share `chart_type:
 * "bar"`, so this one check covers both.
 *
 *  - bar: APPLICABLE. A clear two-axis cartesian plot box (category axis +
 *    value axis) — the exact shape axis titles and gridlines describe.
 *  - line: APPLICABLE. Same cartesian plot box as bar.
 *  - scatter: APPLICABLE. A numeric x-y plot box — the most literally
 *    cartesian of them all.
 *  - area: APPLICABLE. Line's own plot box with the region under it filled.
 *  - pie / donut / gauge: NOT applicable. Purely radial — no axes, no plot
 *    box to title (donut is the same "no axes" case whether reached via the
 *    dedicated chart_type or the legacy `pie`+`style: "donut"` form).
 *  - funnel: NOT applicable. A single value dimension (bar width) with no
 *    second (category) axis paired against it, and no gridline reference
 *    surface (chart-svg.tsx never draws one for funnel) — a title would
 *    float disconnected from any geometric anchor.
 *  - dumbbell: NOT applicable. A two-endpoint value comparison whose value
 *    axis has no fixed zero-anchored plot box the way bar/line do (its own
 *    `vx()` domain floats to the data's real min/max, per that function's
 *    own domain-safety comment in chart-svg.tsx) — same "no anchor" reason
 *    as funnel.
 *
 * ir-quality.ts's own `AXES_APPLICABLE_CHART_TYPES` mirrors this list (a
 * local duplicate, not a cross-import — that file is a pure quality-check
 * module and this one is a React SVG renderer, same "small local list +
 * comment" precedent gantt.tsx's `vx` primitive already set rather than
 * reaching across files for two entries).
 *
 * **x_title is accepted and not drawn (label-tuning A, 2026-08).** Category
 * ticks already name the axis ("第一季度" does not need a second "季度"
 * caption underneath). The IR field stays so existing decks keep
 * validating. This renderer simply does not paint it and does not reserve
 * a band for it. y_title still renders (as a header-row unit caption) and
 * show_grid still toggles the reference lines. ir-quality.ts's
 * `chart_axes_ignored` warning still keys off this same applicability set:
 * a pie with `axes.x_title` still warns, a bar with `axes.x_title` does
 * not, even though the bar does not paint that string.
 */
const AXES_APPLICABLE_TYPES: ReadonlySet<ChartComponent["chart_type"]> = new Set([
  "bar",
  "line",
  "scatter",
  "area",
])

function axesApplicable(component: ChartComponent): boolean {
  return AXES_APPLICABLE_TYPES.has(component.chart_type)
}

/**
 * Legend applicability (R1 evidence wave, Task T2 — roadmap §6.1.2's legend
 * model, rendering half). Deliberately reuses `axesApplicable`'s own
 * bar/line chart_type set rather than declaring a second identical one —
 * unlike `ir-quality.ts`'s own `AXES_APPLICABLE_CHART_TYPES` (a genuine
 * cross-file duplicate, justified by that file's render/quality layering
 * split), this check lives in the *same file* as `axesApplicable`, so
 * reusing it directly is simplification, not risk: pie/donut (radial, no
 * per-series comparison axis), funnel and dumbbell (no shared category
 * axis a legend's color-to-series mapping would sit against) never gain a
 * legend regardless of `series.length`, matching the byte-compat boundary
 * that keeps their dispatch path untouched (roadmap §6.1.4). The second
 * half of the condition — `series.length >= 2` — is the actual legend
 * trigger: never for a single series (byte-compat — see the golden pins),
 * always from two series up.
 */
function legendApplicable(component: ChartComponent): boolean {
  return axesApplicable(component) && component.series.length >= 2
}

/**
 * Header row (label-tuning A, 2026-08). y_title (unit caption, left) and
 * the legend (right) share one band above the plot. The 52px reservation
 * and the 16px text baseline are taken from LabelTuning.dc.html: the plot
 * group is translated down by 52 relative to a header baseline at 16, which
 * is what keeps the tallest bar's value label ≥ 24px clear of the header
 * ink (a collision the design pass hit once with the legend parked on the
 * header without moving the plot).
 */
const HEADER_ROW_H = 52
const HEADER_BASELINE_Y = 16
/** y_title in the header — 12px muted, always a single horizontal line. */
const HEADER_TITLE_SIZE = 12
const HEADER_TITLE_MIN_SIZE = 9
/** Gap (px) between the y_title's right edge and the legend's left edge. */
const HEADER_LEGEND_GAP = 16

/** Legend swatch (px, square) — LabelTuning.dc.html keeps the 10px chip. */
const LEGEND_SWATCH_SIZE = 10
/** Legend name font size (px) — 11 → 12 to match the header unit caption. */
const LEGEND_FONT_SIZE = 12
const LEGEND_MIN_FONT_SIZE = 9
/** Per-entry name budget (px) before `fitSvgLine` shrinks/truncates it. */
const LEGEND_NAME_MAX_W = 96
/** Gap (px) between a swatch and its own name. */
const LEGEND_SWATCH_GAP = 6
/**
 * Minimum swatch-to-swatch pitch (px). LabelTuning.dc.html starts two
 * 2-character CJK names 72px apart and grows the slot when the fitted name
 * is wider than that.
 */
const LEGEND_ENTRY_PITCH = 72

type LegendSlot = {
  seriesIndex: number
  colorIndex: number
  slotX: number
  fitted: ReturnType<typeof fitSvgLine>
  width: number
}

function droppedMarkerText(n: number): string {
  return `+${n} …`
}

function legendNameWidth(
  fitted: ReturnType<typeof fitSvgLine>,
  fontFamily: string,
): number {
  return measureTextUnits(fitted.text, { fontFamily }) * fitted.fontSize
}

/**
 * Lays out a chart's legend entries (chart-model.ts's `ChartModel.legend`,
 * already in input series order) against `availW` px. Slots pack left to
 * right with a ≥72px swatch-to-swatch pitch (or the fitted name width when
 * that is larger). The caller right-aligns the group by offsetting
 * `slotX` with `availW - groupW`. Entries that do not fit drop into one
 * trailing "+N …" marker.
 */
function layoutChartLegend(
  legend: ReturnType<typeof buildChartModel>["legend"],
  availW: number,
  fontFamily: string,
): { slots: LegendSlot[]; droppedCount: number; groupW: number; droppedX: number } {
  const prepared = legend.map((entry) => {
    const fitted = fitSvgLine(entry.name, {
      maxWidth: LEGEND_NAME_MAX_W,
      fontSize: LEGEND_FONT_SIZE,
      minFontSize: LEGEND_MIN_FONT_SIZE,
      fontFamily,
    })
    return {
      seriesIndex: entry.seriesIndex,
      colorIndex: entry.colorIndex,
      fitted,
      width: LEGEND_SWATCH_SIZE + LEGEND_SWATCH_GAP + legendNameWidth(fitted, fontFamily),
    }
  })

  const pitchAfter = (width: number) => Math.max(LEGEND_ENTRY_PITCH, width)

  function pack(count: number, droppedCount: number) {
    const slots: LegendSlot[] = []
    for (let i = 0; i < count; i++) {
      const e = prepared[i]!
      const slotX = i === 0 ? 0 : slots[i - 1]!.slotX + pitchAfter(prepared[i - 1]!.width)
      slots.push({
        seriesIndex: e.seriesIndex,
        colorIndex: e.colorIndex,
        slotX,
        fitted: e.fitted,
        width: e.width,
      })
    }
    if (count === 0) {
      const markerW =
        droppedCount > 0
          ? measureTextUnits(droppedMarkerText(droppedCount), { fontFamily }) * LEGEND_FONT_SIZE
          : 0
      return { slots, groupW: markerW, droppedX: 0 }
    }
    const last = slots[count - 1]!
    if (droppedCount > 0) {
      const droppedX = last.slotX + pitchAfter(last.width)
      const markerW =
        measureTextUnits(droppedMarkerText(droppedCount), { fontFamily }) * LEGEND_FONT_SIZE
      return { slots, groupW: droppedX + markerW, droppedX }
    }
    return { slots, groupW: last.slotX + last.width, droppedX: last.slotX + last.width }
  }

  let visible = prepared.length
  while (visible >= 0) {
    const droppedCount = prepared.length - visible
    const packed = pack(visible, droppedCount)
    if (packed.groupW <= availW || visible === 0) {
      return { ...packed, droppedCount }
    }
    visible -= 1
  }
  return { slots: [], droppedCount: prepared.length, groupW: 0, droppedX: 0 }
}

function hasYTitle(component: ChartComponent): boolean {
  return axesApplicable(component) && !!component.axes?.y_title
}

function hasHeaderRow(component: ChartComponent): boolean {
  return hasYTitle(component) || legendApplicable(component)
}

export const chart: SvgComponent<ChartComponent> = {
  measure(component) {
    // x_title no longer reserves a band (accepted, not drawn). The header
    // row is a single 52px reservation shared by y_title and the legend.
    return (hasHeaderRow(component) ? HEADER_ROW_H : 0) + CHART_H
  },
  render(component, box, ctx) {
    const renderer = resolveRenderer(component)
    // axes only applies on an applicable chart_type — on any other type
    // (pie/funnel/dumbbell) `axes` is read as if it were entirely absent, so
    // the field is honestly ignored rather than partially/silently honored.
    const axes = axesApplicable(component) ? component.axes : undefined
    const plotTop = hasHeaderRow(component) ? HEADER_ROW_H : 0
    const plotW = box.w

    // P1 variety wave, task 2 (review fix round, Major finding): rotation
    // happens *here*, at the one place this palette actually feeds a chart
    // — not in `ctx.colors.chartPalette` itself, which several motifs also
    // read for unrelated decoration (see `ComponentCtx.chartPaletteOffset`'s
    // own doc comment for the leak this seam fixes). `ctx.chartPaletteOffset`
    // undefined/0 rotates to a same-values copy (`rotateChartPalette`'s own
    // doc comment) — a byte-identical multiset either way.
    const palette = rotateChartPalette(ctx.colors.chartPalette, ctx.chartPaletteOffset ?? 0)
    const legendBg = ctx.defaultBg ?? ctx.colors.bg
    const bodyFace = ctx.fonts.body

    const hasLegend = legendApplicable(component)
    const yTitleRaw = axes?.y_title
    const yTitleNaturalW = yTitleRaw
      ? measureTextUnits(yTitleRaw, { fontFamily: bodyFace }) * HEADER_TITLE_SIZE
      : 0

    let legendLayout = hasLegend
      ? layoutChartLegend(buildChartModel(component.series).legend, plotW, bodyFace)
      : null
    let legendLeft = legendLayout ? plotW - legendLayout.groupW : plotW
    if (yTitleRaw && legendLayout && legendLeft < yTitleNaturalW + HEADER_LEGEND_GAP) {
      const avail = Math.max(0, plotW - yTitleNaturalW - HEADER_LEGEND_GAP)
      legendLayout = layoutChartLegend(buildChartModel(component.series).legend, avail, bodyFace)
      legendLeft = plotW - legendLayout.groupW
    }
    const yTitleMaxW = legendLayout
      ? Math.max(0, legendLeft - HEADER_LEGEND_GAP)
      : plotW
    const yTitleFit = yTitleRaw
      ? fitSvgLine(yTitleRaw, {
          maxWidth: yTitleMaxW,
          fontSize: HEADER_TITLE_SIZE,
          minFontSize: HEADER_TITLE_MIN_SIZE,
          fontFamily: bodyFace,
        })
      : null

    const swatchY = HEADER_BASELINE_Y - LEGEND_SWATCH_SIZE

    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {renderer(
          component.series,
          palette,
          0,
          plotTop,
          plotW,
          CHART_H,
          ctx.colors.muted,
          ctx.colors.text,
          ctx.colors.accent,
          axes?.show_grid,
          // Threaded for the subtypes whose geometry needs component-level
          // config (donut's center_total, gauge's min/max). The five original
          // renderers ignore it and stay byte-identical (golden-pinned).
          component,
          // The background the marks land on, for text ink only — see
          // `ChartRenderFn`'s own `bgHex` doc comment.
          legendBg,
        )}
        {yTitleFit ? (
          <text
            data-truncated={yTitleFit.truncated ? "1" : undefined}
            x={0}
            y={HEADER_BASELINE_Y}
            fontSize={yTitleFit.fontSize}
            fill={ctx.colors.muted}
            fontFamily={bodyFace}
            dominantBaseline="alphabetic"
          >
            {yTitleFit.text}
          </text>
        ) : null}
        {legendLayout ? (
          <g>
            {legendLayout.slots.map((slot) => {
              const swatchX = legendLeft + slot.slotX
              const nameFill = accessibleInk(ctx.colors.muted, legendBg, slot.fitted.fontSize)
              return (
                <g key={slot.seriesIndex}>
                  <rect
                    x={swatchX}
                    y={swatchY}
                    width={LEGEND_SWATCH_SIZE}
                    height={LEGEND_SWATCH_SIZE}
                    fill={palette[slot.colorIndex % palette.length]}
                  />
                  <text
                    data-truncated={slot.fitted.truncated ? "1" : undefined}
                    x={swatchX + LEGEND_SWATCH_SIZE + LEGEND_SWATCH_GAP}
                    y={HEADER_BASELINE_Y}
                    fontSize={slot.fitted.fontSize}
                    fill={nameFill}
                    fontFamily={bodyFace}
                    dominantBaseline="alphabetic"
                  >
                    {slot.fitted.text}
                  </text>
                </g>
              )
            })}
            {legendLayout.droppedCount > 0 && (
              <text
                data-dropped={legendLayout.droppedCount}
                x={legendLeft + legendLayout.droppedX}
                y={HEADER_BASELINE_Y}
                fontSize={LEGEND_FONT_SIZE}
                fill={accessibleInk(ctx.colors.muted, legendBg, LEGEND_FONT_SIZE)}
                fontFamily={bodyFace}
                dominantBaseline="alphabetic"
              >
                {droppedMarkerText(legendLayout.droppedCount)}
              </text>
            )}
          </g>
        ) : null}
      </g>
    )
  },
}

export const renderDef: RenderDef<ChartComponent> = { type: "chart", measure: chart.measure, render: chart.render }
