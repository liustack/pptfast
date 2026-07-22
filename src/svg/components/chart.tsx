import type { Component } from "@/ir"
import { fitSvgLine } from "../../lib/svg-text-layout"
import type { SvgComponent } from "./types"
import {
  renderBar,
  renderBarHorizontal,
  renderDonut,
  renderDumbbell,
  renderLine,
  renderPie,
  renderFunnel,
} from "./chart-svg"

type ChartComponent = Extract<Component, { type: "chart" }>

const CHART_H = 240

const renderers = {
  bar: renderBar,
  line: renderLine,
  pie: renderPie,
  funnel: renderFunnel,
  dumbbell: renderDumbbell,
} as const

/** 变体分发：bar+direction=horizontal 走横条，pie+style=donut 走环形。 */
function resolveRenderer(component: ChartComponent) {
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
 *  - pie (incl. `style: "donut"`, a variant of the same chart_type):
 *    NOT applicable. Purely radial — no axes, no plot box to title.
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
const AXES_APPLICABLE_TYPES: ReadonlySet<ChartComponent["chart_type"]> = new Set(["bar", "line"])

function axesApplicable(component: ChartComponent): boolean {
  return AXES_APPLICABLE_TYPES.has(component.chart_type)
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

export const chart: SvgComponent<ChartComponent> = {
  measure(component) {
    const hasXTitle = axesApplicable(component) && !!component.axes?.x_title
    return CHART_H + (hasXTitle ? AXES_X_TITLE_H : 0)
  },
  render(component, box, ctx) {
    const renderer = resolveRenderer(component)
    // axes only applies on an applicable chart_type — on any other type
    // (pie/funnel/dumbbell) `axes` is read as if it were entirely absent, so
    // the field is honestly ignored rather than partially/silently honored.
    const axes = axesApplicable(component) ? component.axes : undefined
    const hasXTitle = !!axes?.x_title
    const hasYTitle = !!axes?.y_title
    const yTitleW = hasYTitle ? AXES_Y_TITLE_W : 0
    const plotW = box.w - yTitleW

    const xTitleFit = hasXTitle
      ? fitSvgLine(axes!.x_title!, { maxWidth: plotW, fontSize: AXES_TITLE_SIZE, minFontSize: 9 })
      : null
    const yTitleFit = hasYTitle ? fitYAxisTitle(axes!.y_title!, CHART_H) : null
    const yStackSpan = yTitleFit ? Math.max(0, yTitleFit.chars.length - 1) * AXES_Y_CHAR_ADVANCE : 0
    const yFirstBaselineY = (CHART_H - yStackSpan) / 2

    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {renderer(
          component.series,
          ctx.colors.chartPalette,
          yTitleW,
          0,
          plotW,
          CHART_H,
          ctx.colors.muted,
          ctx.colors.text,
          ctx.colors.accent,
          axes?.show_grid,
        )}
        {xTitleFit ? (
          <text
            data-truncated={xTitleFit.truncated ? "1" : undefined}
            x={yTitleW + plotW / 2}
            y={CHART_H + AXES_X_TITLE_H - 6}
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
      </g>
    )
  },
}
