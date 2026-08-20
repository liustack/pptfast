import type { Component } from "@/ir"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { stacksVertically } from "../../lib/text-script"
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

/** Legend swatch (px, square) — small enough to read as a color chip
 * alongside an 11px name, not so large it unbalances a single-line band. */
const LEGEND_SWATCH_SIZE = 10
/** Legend name font size (px) — matches chart-svg.tsx's own LABEL_FONT_SIZE
 * (bar/line category & value labels), so legend text reads at the same
 * visual weight as the chart content it describes. */
const LEGEND_FONT_SIZE = 11
const LEGEND_MIN_FONT_SIZE = 9
/** Per-entry name budget (px) before `fitSvgLine` shrinks/truncates it. */
const LEGEND_NAME_MAX_W = 96
/** Gap (px) between a swatch and its own name. */
const LEGEND_SWATCH_GAP = 6
/** Gap (px) after one entry's name before the next entry's swatch starts —
 * keeps adjacent entries visually separated at any name length (fitSvgLine
 * caps the name at LEGEND_NAME_MAX_W, so this trailing gap is never eaten
 * by overflow text). */
const LEGEND_ENTRY_TRAILING_GAP = 18
/** One legend entry's fixed pixel slot: swatch + gap + name budget +
 * trailing gap. A coarse, deterministic budget — same "approximate, not a
 * real per-character canvas measurement" style `maxYAxisChars`/
 * `fitHeadingLines` already use throughout this codebase — not an exact fit:
 * how many entries fit a given width is `floor(availW / LEGEND_SLOT_W)`,
 * and any individual name too long for its own slot shrinks/truncates via
 * `fitSvgLine` rather than growing the slot. Entries beyond that count drop
 * into one trailing "+N …" slot instead of shrinking every slot further
 * — the same "fixed reserved footprint, content adapts to it" contract
 * `measure()`'s own x_title/y_title bands already use.
 */
const LEGEND_SLOT_W = LEGEND_SWATCH_SIZE + LEGEND_SWATCH_GAP + LEGEND_NAME_MAX_W + LEGEND_ENTRY_TRAILING_GAP
/** Band height (px) reserved below the plot (and below x_title's own band,
 * if also present) for the legend row — mirrors AXES_X_TITLE_H's "reserve a
 * fixed band, add it to measure() only when the content that needs it is
 * actually present" pattern. */
const LEGEND_BAND_H = 26

type LegendSlot = {
  seriesIndex: number
  colorIndex: number
  slotX: number
  fitted: ReturnType<typeof fitSvgLine>
}

/**
 * Lays out a chart's legend entries (chart-model.ts's `ChartModel.legend`,
 * already in input series order) against `availW` px: how many whole slots
 * fit, each visible entry's own fitted (shrunk/truncated) name, and how many
 * trailing entries got dropped into a "+N …" marker instead. Pure
 * function of `legend`/`availW` — no rendering, mirrors this file's own
 * `fitYAxisTitle`'s "compute the fit, let the caller draw it" shape.
 */
function layoutChartLegend(
  legend: ReturnType<typeof buildChartModel>["legend"],
  availW: number,
): { slots: LegendSlot[]; droppedCount: number } {
  const maxVisible = Math.max(1, Math.floor(availW / LEGEND_SLOT_W))
  const showCount = legend.length <= maxVisible ? legend.length : Math.max(0, maxVisible - 1)
  const slots: LegendSlot[] = legend.slice(0, showCount).map((entry, idx) => ({
    seriesIndex: entry.seriesIndex,
    colorIndex: entry.colorIndex,
    slotX: idx * LEGEND_SLOT_W,
    fitted: fitSvgLine(entry.name, {
      maxWidth: LEGEND_NAME_MAX_W,
      fontSize: LEGEND_FONT_SIZE,
      minFontSize: LEGEND_MIN_FONT_SIZE,
    }),
  }))
  return { slots, droppedCount: legend.length - showCount }
}

/** Font size (px) for both x_title and y_title. */
const AXES_TITLE_SIZE = 11
/** Band height (px) reserved below the CHART_H plot for x_title — added to
 * measure()'s reported footprint only when x_title is actually present on an
 * applicable type (gantt.tsx's AXIS_BAND_H/hasAxisLabels precedent: reserve
 * only when present, never unconditionally). */
const AXES_X_TITLE_H = 22
/** Width (px) of the y_title's own stacked-character column — characters are
 * centered within this band (unchanged visual width — only the total gutter
 * fed to the plot's x-origin grows, see AXES_Y_TITLE_W below). */
const AXES_Y_TITLE_BAND_W = 20
/**
 * Pure clearance (px) between the y_title band and the plot's left edge
 * (review round F1 fix). Without this, the plot's x0 sat flush at the
 * band's own width with zero margin — a first-point value label (line
 * chart, text-anchor="start") or a maximally-fitted row label
 * (bar-horizontal, text-anchor="end", capped to BAR_H_LABEL_W) can both
 * render with ink starting exactly at that boundary, only ~5px from the
 * y_title band's own rightmost glyph ink (measured on a real render: a line
 * chart whose first point lands near CHART_H's vertical midband, where the
 * value label's y coordinate falls inside the y_title stack's own vertical
 * span too). A single glyph at AXES_TITLE_SIZE is at most ~1em wide, so
 * this gap keeps the two regions apart by construction — not merely
 * unlikely to touch for whatever content a given deck happens to author.
 */
const AXES_Y_TITLE_GAP = 10
/** Total width (px) reserved out of box.w for y_title — band + gap — fed as
 * the plot's x0/plotW when y_title is present (matrix.tsx's Y_TITLE_W idiom,
 * widened by AXES_Y_TITLE_GAP above). */
const AXES_Y_TITLE_W = AXES_Y_TITLE_BAND_W + AXES_Y_TITLE_GAP
/** Baseline-to-baseline vertical step for y_title's stacked characters —
 * mirrors matrix.tsx's Y_TITLE_CHAR_ADVANCE (AXIS_SIZE + 2). */
const AXES_Y_CHAR_ADVANCE = AXES_TITLE_SIZE + 2
/**
 * Height of the band a *horizontal* y_title takes, above the plot — the
 * placement a Latin (or any other non-square-script) y_title gets instead of
 * the character column, see `lib/text-script.ts` for the rule and the review
 * finding behind it. Left-aligned above the axis it names, which is where
 * charts in Latin-script publications put a y-axis caption; the band's own
 * baseline sits at `AXES_TITLE_SIZE + 4` inside it.
 *
 * The horizontal treatment trades the side band for a top band — a chart
 * whose y_title takes this path gets its full `box.w` back for the plot,
 * pays `AXES_Y_TITLE_TOP_H` of height instead, and `measure()` reports the
 * difference honestly (this is the one case where a y_title grows the
 * component's reported height at all).
 */
const AXES_Y_TITLE_TOP_H = 22

/**
 * Max characters whose stacked column fits within `availH` px — adapted from
 * matrix.tsx's `maxYTitleChars`, simplified: this file's CHART_H is a fixed
 * constant (chart.tsx never reads box.h, unlike matrix's box.h-stretched
 * grid), so there is no box.h-inclusive-vs-exclusive ambiguity to reconcile
 * here the way matrix.tsx's own render() had to (see that file's
 * d79d750 fix comment on `availGridH`) — `availH` is always exactly CHART_H.
 */
function maxYAxisChars(availH: number): number {
  return Math.max(1, Math.floor((availH - AXES_TITLE_SIZE * 0.25) / AXES_Y_CHAR_ADVANCE))
}

/**
 * Caps y_title's character stack to what `availH` can actually hold,
 * truncating with the same `data-truncated="1"` marker convention every
 * other fitted field in this codebase uses (matrix.tsx's own
 * `fitYTitleStack`, x_title below) — the last kept slot becomes "…" so the
 * marker always lands on a real rendered `<text>` node.
 */
function fitYAxisTitle(text: string, availH: number): { chars: string[]; truncated: boolean } {
  const chars = Array.from(text)
  if (chars.length === 0) return { chars, truncated: false }
  const maxChars = maxYAxisChars(availH)
  if (chars.length <= maxChars) return { chars, truncated: false }
  const kept = chars.slice(0, Math.max(0, maxChars - 1))
  return { chars: [...kept, "…"], truncated: true }
}

/**
 * Which of the two y_title treatments this chart's own axes earn: the
 * character column down a left band (`stacked`, CJK and the other square
 * scripts), or one horizontal line in a band above the plot (`stacked ===
 * false`, Latin and every other alphabetic script). matrix.tsx's
 * `yTitlePlacement`, adapted to this file's own constants. Reads the same
 * `axesApplicable` gate `render()` does, so a y_title on a non-applicable
 * chart_type (pie/funnel/dumbbell) reserves nothing at all, exactly as
 * before.
 */
function yTitlePlacement(component: ChartComponent): {
  stacked: boolean
  bandW: number
  topH: number
} {
  const yTitle = axesApplicable(component) ? component.axes?.y_title : undefined
  if (!yTitle) return { stacked: false, bandW: 0, topH: 0 }
  const stacked = stacksVertically(yTitle)
  return {
    stacked,
    bandW: stacked ? AXES_Y_TITLE_W : 0,
    topH: stacked ? 0 : AXES_Y_TITLE_TOP_H,
  }
}

export const chart: SvgComponent<ChartComponent> = {
  measure(component) {
    const hasXTitle = axesApplicable(component) && !!component.axes?.x_title
    const hasLegend = legendApplicable(component)
    // A stacked y_title still costs no height — it reserves width inside
    // box.w. A horizontal one costs height instead, and says so here.
    const yTitleTopH = yTitlePlacement(component).topH
    return (
      yTitleTopH + CHART_H + (hasXTitle ? AXES_X_TITLE_H : 0) + (hasLegend ? LEGEND_BAND_H : 0)
    )
  },
  render(component, box, ctx) {
    const renderer = resolveRenderer(component)
    // axes only applies on an applicable chart_type — on any other type
    // (pie/funnel/dumbbell) `axes` is read as if it were entirely absent, so
    // the field is honestly ignored rather than partially/silently honored.
    const axes = axesApplicable(component) ? component.axes : undefined
    const hasXTitle = !!axes?.x_title
    const yTitle = yTitlePlacement(component)
    const yTitleW = yTitle.bandW
    const plotW = box.w - yTitleW
    // The plot's own top edge inside this group. Zero for every chart whose
    // y_title stacks (or has none at all), which is what keeps those renders
    // byte-identical to before; a horizontal y_title pushes the plot down by
    // its band and every band below the plot follows.
    const plotTop = yTitle.topH

    const xTitleFit = hasXTitle
      ? fitSvgLine(axes!.x_title!, { maxWidth: plotW, fontSize: AXES_TITLE_SIZE, minFontSize: 9 })
      : null
    // y_title, horizontal form: one fitted line above the plot, left-aligned
    // on the axis it names. No arrow suffix here, unlike matrix/heatmap —
    // this file's x_title renders *below* the plot and centered, so position
    // alone already says which caption belongs to which axis.
    const yTitleLineFit =
      axes?.y_title && !yTitle.stacked
        ? fitSvgLine(axes.y_title, { maxWidth: box.w, fontSize: AXES_TITLE_SIZE, minFontSize: 9 })
        : null
    const yTitleFit =
      axes?.y_title && yTitle.stacked ? fitYAxisTitle(axes.y_title, CHART_H) : null
    const yStackSpan = yTitleFit ? Math.max(0, yTitleFit.chars.length - 1) * AXES_Y_CHAR_ADVANCE : 0
    const yFirstBaselineY = (CHART_H - yStackSpan) / 2
    // P1 variety wave, task 2 (review fix round, Major finding): rotation
    // happens *here*, at the one place this palette actually feeds a chart
    // — not in `ctx.colors.chartPalette` itself, which several motifs also
    // read for unrelated decoration (see `ComponentCtx.chartPaletteOffset`'s
    // own doc comment for the leak this seam fixes). `ctx.chartPaletteOffset`
    // undefined/0 rotates to a same-values copy (`rotateChartPalette`'s own
    // doc comment) — a byte-identical multiset either way.
    const palette = rotateChartPalette(ctx.colors.chartPalette, ctx.chartPaletteOffset ?? 0)

    // Legend (R1 evidence wave, Task T2): same "compute a model, render
    // below the plot in a reserved band" shape as x_title/y_title just
    // above — `legendApplicable` (never for a single series, never for
    // pie/donut/funnel/dumbbell) gates it off entirely for every
    // byte-compat-pinned or byte-compat-boundary case, so this block is a
    // pure no-op (renders nothing, `legendTop`/layout unused) whenever it
    // doesn't apply.
    const hasLegend = legendApplicable(component)
    const legendTop = plotTop + CHART_H + (hasXTitle ? AXES_X_TITLE_H : 0)
    const legendLayout = hasLegend ? layoutChartLegend(buildChartModel(component.series).legend, plotW) : null
    const legendBg = ctx.defaultBg ?? ctx.colors.bg

    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {renderer(
          component.series,
          palette,
          yTitleW,
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
        {yTitleLineFit ? (
          <text
            data-truncated={yTitleLineFit.truncated ? "1" : undefined}
            x={0}
            y={AXES_TITLE_SIZE + 4}
            fontSize={yTitleLineFit.fontSize}
            fill={ctx.colors.muted}
            fontFamily={ctx.fonts.body}
            dominantBaseline="alphabetic"
          >
            {yTitleLineFit.text}
          </text>
        ) : null}
        {xTitleFit ? (
          <text
            data-truncated={xTitleFit.truncated ? "1" : undefined}
            x={yTitleW + plotW / 2}
            y={plotTop + CHART_H + AXES_X_TITLE_H - 6}
            textAnchor="middle"
            fontSize={xTitleFit.fontSize}
            fill={ctx.colors.muted}
            fontFamily={ctx.fonts.body}
            dominantBaseline="alphabetic"
          >
            {xTitleFit.text}
          </text>
        ) : null}
        {yTitleFit
          ? yTitleFit.chars.map((chr, i) => (
              <text
                key={i}
                data-truncated={
                  yTitleFit!.truncated && i === yTitleFit!.chars.length - 1 ? "1" : undefined
                }
                x={AXES_Y_TITLE_BAND_W / 2}
                y={yFirstBaselineY + i * AXES_Y_CHAR_ADVANCE}
                textAnchor="middle"
                fontSize={AXES_TITLE_SIZE}
                fill={ctx.colors.muted}
                fontFamily={ctx.fonts.body}
                dominantBaseline="alphabetic"
              >
                {chr}
              </text>
            ))
          : null}
        {legendLayout ? (
          <g>
            {legendLayout.slots.map((slot) => {
              const swatchX = yTitleW + slot.slotX
              const swatchY = legendTop + (LEGEND_BAND_H - LEGEND_SWATCH_SIZE) / 2
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
                    y={legendTop + LEGEND_BAND_H - 8}
                    fontSize={slot.fitted.fontSize}
                    fill={nameFill}
                    fontFamily={ctx.fonts.body}
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
                x={yTitleW + legendLayout.slots.length * LEGEND_SLOT_W}
                y={legendTop + LEGEND_BAND_H - 8}
                fontSize={LEGEND_FONT_SIZE}
                fill={accessibleInk(ctx.colors.muted, legendBg, LEGEND_FONT_SIZE)}
                fontFamily={ctx.fonts.body}
                dominantBaseline="alphabetic"
              >
                {`+${legendLayout.droppedCount} …`}
              </text>
            )}
          </g>
        ) : null}
      </g>
    )
  },
}

export const renderDef: RenderDef<ChartComponent> = { type: "chart", measure: chart.measure, render: chart.render }
