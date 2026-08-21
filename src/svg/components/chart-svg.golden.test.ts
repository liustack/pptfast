// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { ChartSeries } from "@/ir"
import { renderSvgMarkup } from "../serialize"
import {
  renderBar,
  renderBarHorizontal,
  renderLine,
  renderPie,
  renderDonut,
  renderFunnel,
  renderDumbbell,
} from "./chart-svg"
import { chart } from "./chart"
import type { ComponentCtx } from "./types"

/**
 * Byte-compat pins (R1 evidence wave, Task T2 — plan step 1, "byte-compat
 * pins FIRST"). Captured from the real pre-wiring renderers at HEAD a4c68c5
 * (T0+T1 merged, chart-model.ts not yet consumed by any renderer) via
 * `renderSvgMarkup`, the exact function svg2pptx/preview both actually
 * serialize through (see ../serialize.ts's own doc comment) — not
 * hand-derived, and not a `toMatchSnapshot` auto-generated blob
 * (CLAUDE.md/AGENTS.md both forbid blindly `-u`-ing a snapshot; an inline,
 * hand-committed literal cannot be silently regenerated the same way).
 *
 * Two protection layers, per the plan's Global Constraint 1:
 *  - `renderBar`/`renderBarHorizontal`/`renderLine`/`renderPie`/`renderDonut`/
 *    `renderFunnel`/`renderDumbbell` (chart-svg.tsx layer, direct calls —
 *    mirrors chart-svg.test.tsx's own x0=y0=0 convention) — single-series
 *    positive bar/barHorizontal/line MUST reproduce these bytes exactly
 *    after chart-model.ts is wired in; pie/donut/funnel/dumbbell MUST stay
 *    byte-identical for the whole task (their dispatch path is never
 *    touched — roadmap §6.1.4).
 *  - `chart.tsx`'s `render()`/`measure()` (integration layer) for bar/line —
 *    proves the wiring inside `chart.tsx` itself (palette rotation, axes
 *    passthrough, and Task T2's own new measure()/legend logic) doesn't
 *    leak into the n==1 no-axes path either: measure() must stay 240, and
 *    no legend markup may appear.
 *
 * What this catches: any wiring mistake that changes a single attribute,
 * coordinate, or element for the byte-compat-protected single-series-
 * positive shapes. What it does NOT catch: multi-series/negative-value
 * behavior (deliberately unpinned — Global Constraint 1 allows those to
 * change) or anything beyond these specific fixtures.
 *
 * Label-tuning A (2026-08) restyled cartesian ticks/values (13px, value
 * labels weight 600 / text fill, bar-top gap 9px). Rect/polyline/circle
 * geometry in the pins below is unchanged; only those label attributes
 * (and the matching y on vertical-bar values) moved. Pie/donut/funnel/
 * dumbbell pins are untouched.
 */

const ACCENT = "#00A878"
const MUTED = "#5D6B65"
const TEXT = "#1A2421"
const PALETTE = ["#006A4E", "#00A878", "#FF6B35", "#FFD166"]
const W = 1120
const H = 240

function svg(node: React.ReactElement) {
  return renderSvgMarkup(node)
}

// Realistic, unambiguous (no duplicate-x) single-series content — the exact
// shape Global Constraint 1 protects. Deliberately NOT imported from
// audit/stress-fixtures.ts: that module's own chart page is what plan step 2
// edits right after this commit, and a golden pin must own its input data so
// a later, unrelated fixture edit can never silently invalidate it.
const barSeries: ChartSeries[] = [
  { name: "Revenue", data: [{ x: "Q1", y: 120 }, { x: "Q2", y: 180 }, { x: "Q3", y: 150 }, { x: "Q4", y: 210 }] },
]
const barHSeries: ChartSeries[] = [
  { name: "Market Share", data: [{ x: "Acme Corp", y: 34 }, { x: "Globex", y: 22 }, { x: "Initech", y: 15 }] },
]
const lineSeries: ChartSeries[] = [
  { name: "Active Users", data: [{ x: "Jan", y: 1200 }, { x: "Feb", y: 1450 }, { x: "Mar", y: 1100 }, { x: "Apr", y: 1800 }] },
]
const pieSeries: ChartSeries[] = [
  { name: "Segment", data: [{ x: "Enterprise", y: 45 }, { x: "SMB", y: 30 }, { x: "Consumer", y: 25 }] },
]
const funnelSeries: ChartSeries[] = [
  { name: "Funnel", data: [{ x: "Visit", y: 1000 }, { x: "Signup", y: 400 }, { x: "Purchase", y: 120 }] },
]
const dumbbellSeries: ChartSeries[] = [
  { name: "From", data: [{ x: "Q1", y: 50 }, { x: "Q2", y: 80 }] },
  { name: "To", data: [{ x: "Q1", y: 90 }, { x: "Q2", y: 60 }] },
]

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFFFFF",
    surface: "#F4F4F4",
    primary: "#006A4E",
    accent: ACCENT,
    text: TEXT,
    muted: MUTED,
    chartPalette: PALETTE,
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24,
}
const box = { x: 80, y: 100, w: 1120 }

// Controlled edit (round-4 review, `journal p05` — the bar family drops its
// horizontal gridlines by default; see `renderBar`'s own `showGrid` doc
// comment in chart-svg.tsx for the reasoning). `EXPECTED_BAR` and
// `EXPECTED_CHART_BAR_FULL` below each lost exactly three elements and
// nothing else — this fixture's 25%/50%/75% reference lines (plotTop=14,
// plotH=208):
//   <line x1="0" y1="66"  x2="1120" y2="66"  stroke="#5D6B65" stroke-opacity="0.1" stroke-width="1"></line>
//   <line x1="0" y1="118" x2="1120" y2="118" ... ></line>
//   <line x1="0" y1="170" x2="1120" y2="170" ... ></line>
// Every bar rect, value label, category label, gradient id and gradient stop
// stays byte-identical to the pre-change pin, so the diff on this file is two
// lines and both are a deletion of that same three-element run. The gridline
// geometry itself is still pinned, just through the explicit opt-in now:
// chart-svg.test.tsx's "divides the plot height into quarters" passes
// `showGrid: true`, and `EXPECTED_LINE` below still carries those same three
// elements because line charts keep the default on.
const EXPECTED_BAR =
  "<defs><linearGradient id=\"chart-bar-grad-869184203\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0%\" stop-color=\"#00A878\"></stop><stop offset=\"100%\" stop-color=\"#007654\"></stop></linearGradient></defs><g><rect x=\"4\" y=\"103.14285714285715\" width=\"272\" height=\"118.85714285714285\" fill=\"url(#chart-bar-grad-869184203)\" opacity=\"0.75\"></rect><text x=\"140\" y=\"94.14285714285715\" text-anchor=\"middle\" font-size=\"13\" font-weight=\"600\" fill=\"#1A2421\" dominant-baseline=\"alphabetic\">120</text><text x=\"140\" y=\"236\" text-anchor=\"middle\" font-size=\"13\" fill=\"#5D6B65\" dominant-baseline=\"alphabetic\">Q1</text></g><g><rect x=\"284\" y=\"43.71428571428572\" width=\"272\" height=\"178.28571428571428\" fill=\"url(#chart-bar-grad-869184203)\" opacity=\"0.75\"></rect><text x=\"420\" y=\"34.71428571428572\" text-anchor=\"middle\" font-size=\"13\" font-weight=\"600\" fill=\"#1A2421\" dominant-baseline=\"alphabetic\">180</text><text x=\"420\" y=\"236\" text-anchor=\"middle\" font-size=\"13\" fill=\"#5D6B65\" dominant-baseline=\"alphabetic\">Q2</text></g><g><rect x=\"564\" y=\"73.42857142857142\" width=\"272\" height=\"148.57142857142858\" fill=\"url(#chart-bar-grad-869184203)\" opacity=\"0.75\"></rect><text x=\"700\" y=\"64.42857142857142\" text-anchor=\"middle\" font-size=\"13\" font-weight=\"600\" fill=\"#1A2421\" dominant-baseline=\"alphabetic\">150</text><text x=\"700\" y=\"236\" text-anchor=\"middle\" font-size=\"13\" fill=\"#5D6B65\" dominant-baseline=\"alphabetic\">Q3</text></g><g><rect x=\"844\" y=\"14\" width=\"272\" height=\"208\" fill=\"#00A878\" opacity=\"1\"></rect><text x=\"980\" y=\"5\" text-anchor=\"middle\" font-size=\"13\" font-weight=\"600\" fill=\"#1A2421\" dominant-baseline=\"alphabetic\">210</text><text x=\"980\" y=\"236\" text-anchor=\"middle\" font-size=\"13\" fill=\"#5D6B65\" dominant-baseline=\"alphabetic\">Q4</text></g>"

const EXPECTED_BAR_HORIZONTAL =
  "<defs><linearGradient id=\"chart-barh-grad-205789710\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\"><stop offset=\"0%\" stop-color=\"#007654\"></stop><stop offset=\"100%\" stop-color=\"#00A878\"></stop></linearGradient></defs><g><text x=\"110\" y=\"44\" text-anchor=\"end\" font-size=\"13\" font-weight=\"600\" fill=\"#1A2421\" dominant-baseline=\"alphabetic\">Acme Corp</text><rect x=\"122\" y=\"5\" width=\"934\" height=\"70\" fill=\"#00A878\" opacity=\"1\"></rect><text x=\"1064\" y=\"44\" font-size=\"13\" font-weight=\"600\" fill=\"#1A2421\" dominant-baseline=\"alphabetic\">34</text></g><g><text x=\"110\" y=\"124\" text-anchor=\"end\" font-size=\"13\" font-weight=\"600\" fill=\"#1A2421\" dominant-baseline=\"alphabetic\">Globex</text><rect x=\"122\" y=\"85\" width=\"604.3529411764706\" height=\"70\" fill=\"url(#chart-barh-grad-205789710)\" opacity=\"0.75\"></rect><text x=\"734.3529411764706\" y=\"124\" font-size=\"13\" font-weight=\"600\" fill=\"#1A2421\" dominant-baseline=\"alphabetic\">22</text></g><g><text x=\"110\" y=\"204\" text-anchor=\"end\" font-size=\"13\" font-weight=\"600\" fill=\"#1A2421\" dominant-baseline=\"alphabetic\">Initech</text><rect x=\"122\" y=\"165\" width=\"412.05882352941177\" height=\"70\" fill=\"url(#chart-barh-grad-205789710)\" opacity=\"0.75\"></rect><text x=\"542.0588235294117\" y=\"204\" font-size=\"13\" font-weight=\"600\" fill=\"#1A2421\" dominant-baseline=\"alphabetic\">15</text></g>"

const EXPECTED_LINE =
  "<line x1=\"0\" y1=\"66\" x2=\"1120\" y2=\"66\" stroke=\"#5D6B65\" stroke-opacity=\"0.1\" stroke-width=\"1\"></line><line x1=\"0\" y1=\"118\" x2=\"1120\" y2=\"118\" stroke=\"#5D6B65\" stroke-opacity=\"0.1\" stroke-width=\"1\"></line><line x1=\"0\" y1=\"170\" x2=\"1120\" y2=\"170\" stroke=\"#5D6B65\" stroke-opacity=\"0.1\" stroke-width=\"1\"></line><g><defs><linearGradient id=\"chart-line-area-0-758407087\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0%\" stop-color=\"#00A878\" stop-opacity=\"0.2\"></stop><stop offset=\"100%\" stop-color=\"#00A878\" stop-opacity=\"0\"></stop></linearGradient></defs><polygon points=\"0,83.33333333333334 373.3333333333333,54.44444444444443 746.6666666666666,94.88888888888889 1120,14 1120,222 0,222\" fill=\"url(#chart-line-area-0-758407087)\" stroke=\"none\"></polygon><polyline points=\"0,83.33333333333334 373.3333333333333,54.44444444444443 746.6666666666666,94.88888888888889 1120,14\" fill=\"none\" stroke=\"#006A4E\" stroke-width=\"2\"></polyline><text x=\"0\" y=\"236\" text-anchor=\"start\" font-size=\"13\" fill=\"#5D6B65\" dominant-baseline=\"alphabetic\">Jan</text><text x=\"373.3333333333333\" y=\"236\" text-anchor=\"middle\" font-size=\"13\" fill=\"#5D6B65\" dominant-baseline=\"alphabetic\">Feb</text><text x=\"746.6666666666666\" y=\"236\" text-anchor=\"middle\" font-size=\"13\" fill=\"#5D6B65\" dominant-baseline=\"alphabetic\">Mar</text><text x=\"1120\" y=\"236\" text-anchor=\"end\" font-size=\"13\" fill=\"#5D6B65\" dominant-baseline=\"alphabetic\">Apr</text><text x=\"0\" y=\"77.33333333333334\" text-anchor=\"start\" font-size=\"13\" font-weight=\"600\" fill=\"#1A2421\" dominant-baseline=\"alphabetic\">1200</text><text x=\"1120\" y=\"8\" text-anchor=\"end\" font-size=\"13\" font-weight=\"600\" fill=\"#1A2421\" dominant-baseline=\"alphabetic\">1800</text><circle cx=\"1120\" cy=\"14\" r=\"8\" fill=\"none\" stroke=\"#00A878\" stroke-opacity=\"0.3\"></circle><circle cx=\"1120\" cy=\"14\" r=\"4\" fill=\"#00A878\"></circle></g>"

const EXPECTED_PIE =
  "<path d=\"M 560 120 L 560 4 A 116 116 0 0 1 595.8459713474939 230.32255589023782 Z\" fill=\"#006A4E\"></path><path d=\"M 560 120 L 595.8459713474939 230.32255589023782 A 116 116 0 0 1 444 120.00000000000001 Z\" fill=\"#00A878\"></path><path d=\"M 560 120 L 444 120.00000000000001 A 116 116 0 0 1 560 4 Z\" fill=\"#FF6B35\"></path>"

const EXPECTED_DONUT =
  "<path d=\"M 560 4 A 116 116 0 0 1 595.8459713474939 230.32255589023782 L 582.2245022354463 188.39998465194745 A 71.92 71.92 0 0 0 560 48.08 Z\" fill=\"#006A4E\"></path><path d=\"M 595.8459713474939 230.32255589023782 A 116 116 0 0 1 444 120.00000000000001 L 488.08 120.00000000000001 A 71.92 71.92 0 0 0 582.2245022354463 188.39998465194745 Z\" fill=\"#00A878\"></path><path d=\"M 444 120.00000000000001 A 116 116 0 0 1 560 4 L 560 48.08 A 71.92 71.92 0 0 0 488.08 120.00000000000001 Z\" fill=\"#FF6B35\"></path><text x=\"560\" y=\"124.5\" text-anchor=\"middle\" font-size=\"30\" font-weight=\"bold\" fill=\"#1A2421\" dominant-baseline=\"alphabetic\">100</text><text x=\"560\" y=\"142.5\" text-anchor=\"middle\" font-size=\"12\" fill=\"#5D6B65\" dominant-baseline=\"alphabetic\">Total</text>"

const EXPECTED_FUNNEL =
  "<rect x=\"0\" y=\"2\" width=\"1120\" height=\"76\" fill=\"#006A4E\"></rect><rect x=\"336\" y=\"82\" width=\"448\" height=\"76\" fill=\"#00A878\"></rect><rect x=\"492.8\" y=\"162\" width=\"134.4\" height=\"76\" fill=\"#FF6B35\"></rect>"

const EXPECTED_DUMBBELL =
  "<g><text x=\"96\" y=\"64\" text-anchor=\"end\" font-size=\"13\" font-weight=\"600\" fill=\"#1A2421\" dominant-baseline=\"alphabetic\">Q1</text><line x1=\"639.1111111111111\" y1=\"60\" x2=\"1064\" y2=\"60\" stroke=\"#5D6B65\" stroke-width=\"2\" stroke-opacity=\"0.55\"></line><circle cx=\"639.1111111111111\" cy=\"60\" r=\"5\" fill=\"#5D6B65\"></circle><circle cx=\"1064\" cy=\"60\" r=\"6.5\" fill=\"#00A878\"></circle><text x=\"639.1111111111111\" y=\"49\" text-anchor=\"middle\" font-size=\"11\" fill=\"#5D6B65\" dominant-baseline=\"alphabetic\">50</text><text x=\"1077\" y=\"64\" font-size=\"12.5\" font-weight=\"bold\" fill=\"#00A878\" dominant-baseline=\"alphabetic\">90</text></g><g><text x=\"96\" y=\"184\" text-anchor=\"end\" font-size=\"13\" font-weight=\"600\" fill=\"#1A2421\" dominant-baseline=\"alphabetic\">Q2</text><line x1=\"957.7777777777777\" y1=\"180\" x2=\"745.3333333333333\" y2=\"180\" stroke=\"#5D6B65\" stroke-width=\"2\" stroke-opacity=\"0.55\"></line><circle cx=\"957.7777777777777\" cy=\"180\" r=\"5\" fill=\"#5D6B65\"></circle><circle cx=\"745.3333333333333\" cy=\"180\" r=\"6.5\" fill=\"#00A878\"></circle><text x=\"957.7777777777777\" y=\"169\" text-anchor=\"middle\" font-size=\"11\" fill=\"#5D6B65\" dominant-baseline=\"alphabetic\">80</text><text x=\"758.3333333333333\" y=\"184\" font-size=\"12.5\" font-weight=\"bold\" fill=\"#00A878\" dominant-baseline=\"alphabetic\">60</text></g>"

const EXPECTED_CHART_BAR_FULL =
  "<g transform=\"translate(80,100)\"><defs><linearGradient id=\"chart-bar-grad-869184203\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0%\" stop-color=\"#00A878\"></stop><stop offset=\"100%\" stop-color=\"#007654\"></stop></linearGradient></defs><g><rect x=\"4\" y=\"103.14285714285715\" width=\"272\" height=\"118.85714285714285\" fill=\"url(#chart-bar-grad-869184203)\" opacity=\"0.75\"></rect><text x=\"140\" y=\"94.14285714285715\" text-anchor=\"middle\" font-size=\"13\" font-weight=\"600\" fill=\"#1A2421\" dominant-baseline=\"alphabetic\">120</text><text x=\"140\" y=\"236\" text-anchor=\"middle\" font-size=\"13\" fill=\"#5D6B65\" dominant-baseline=\"alphabetic\">Q1</text></g><g><rect x=\"284\" y=\"43.71428571428572\" width=\"272\" height=\"178.28571428571428\" fill=\"url(#chart-bar-grad-869184203)\" opacity=\"0.75\"></rect><text x=\"420\" y=\"34.71428571428572\" text-anchor=\"middle\" font-size=\"13\" font-weight=\"600\" fill=\"#1A2421\" dominant-baseline=\"alphabetic\">180</text><text x=\"420\" y=\"236\" text-anchor=\"middle\" font-size=\"13\" fill=\"#5D6B65\" dominant-baseline=\"alphabetic\">Q2</text></g><g><rect x=\"564\" y=\"73.42857142857142\" width=\"272\" height=\"148.57142857142858\" fill=\"url(#chart-bar-grad-869184203)\" opacity=\"0.75\"></rect><text x=\"700\" y=\"64.42857142857142\" text-anchor=\"middle\" font-size=\"13\" font-weight=\"600\" fill=\"#1A2421\" dominant-baseline=\"alphabetic\">150</text><text x=\"700\" y=\"236\" text-anchor=\"middle\" font-size=\"13\" fill=\"#5D6B65\" dominant-baseline=\"alphabetic\">Q3</text></g><g><rect x=\"844\" y=\"14\" width=\"272\" height=\"208\" fill=\"#00A878\" opacity=\"1\"></rect><text x=\"980\" y=\"5\" text-anchor=\"middle\" font-size=\"13\" font-weight=\"600\" fill=\"#1A2421\" dominant-baseline=\"alphabetic\">210</text><text x=\"980\" y=\"236\" text-anchor=\"middle\" font-size=\"13\" fill=\"#5D6B65\" dominant-baseline=\"alphabetic\">Q4</text></g></g>"

const EXPECTED_CHART_LINE_FULL =
  "<g transform=\"translate(80,100)\"><line x1=\"0\" y1=\"66\" x2=\"1120\" y2=\"66\" stroke=\"#5D6B65\" stroke-opacity=\"0.1\" stroke-width=\"1\"></line><line x1=\"0\" y1=\"118\" x2=\"1120\" y2=\"118\" stroke=\"#5D6B65\" stroke-opacity=\"0.1\" stroke-width=\"1\"></line><line x1=\"0\" y1=\"170\" x2=\"1120\" y2=\"170\" stroke=\"#5D6B65\" stroke-opacity=\"0.1\" stroke-width=\"1\"></line><g><defs><linearGradient id=\"chart-line-area-0-758407087\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0%\" stop-color=\"#00A878\" stop-opacity=\"0.2\"></stop><stop offset=\"100%\" stop-color=\"#00A878\" stop-opacity=\"0\"></stop></linearGradient></defs><polygon points=\"0,83.33333333333334 373.3333333333333,54.44444444444443 746.6666666666666,94.88888888888889 1120,14 1120,222 0,222\" fill=\"url(#chart-line-area-0-758407087)\" stroke=\"none\"></polygon><polyline points=\"0,83.33333333333334 373.3333333333333,54.44444444444443 746.6666666666666,94.88888888888889 1120,14\" fill=\"none\" stroke=\"#006A4E\" stroke-width=\"2\"></polyline><text x=\"0\" y=\"236\" text-anchor=\"start\" font-size=\"13\" fill=\"#5D6B65\" dominant-baseline=\"alphabetic\">Jan</text><text x=\"373.3333333333333\" y=\"236\" text-anchor=\"middle\" font-size=\"13\" fill=\"#5D6B65\" dominant-baseline=\"alphabetic\">Feb</text><text x=\"746.6666666666666\" y=\"236\" text-anchor=\"middle\" font-size=\"13\" fill=\"#5D6B65\" dominant-baseline=\"alphabetic\">Mar</text><text x=\"1120\" y=\"236\" text-anchor=\"end\" font-size=\"13\" fill=\"#5D6B65\" dominant-baseline=\"alphabetic\">Apr</text><text x=\"0\" y=\"77.33333333333334\" text-anchor=\"start\" font-size=\"13\" font-weight=\"600\" fill=\"#1A2421\" dominant-baseline=\"alphabetic\">1200</text><text x=\"1120\" y=\"8\" text-anchor=\"end\" font-size=\"13\" font-weight=\"600\" fill=\"#1A2421\" dominant-baseline=\"alphabetic\">1800</text><circle cx=\"1120\" cy=\"14\" r=\"8\" fill=\"none\" stroke=\"#00A878\" stroke-opacity=\"0.3\"></circle><circle cx=\"1120\" cy=\"14\" r=\"4\" fill=\"#00A878\"></circle></g></g>"

describe("chart-svg golden markup — byte-compat pins (chart-svg.tsx layer, single-series)", () => {
  it("renderBar: single positive series", () => {
    expect(svg(renderBar(barSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))).toBe(EXPECTED_BAR)
  })

  it("renderBarHorizontal: single positive series", () => {
    expect(svg(renderBarHorizontal(barHSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))).toBe(
      EXPECTED_BAR_HORIZONTAL,
    )
  })

  it("renderLine: single positive series", () => {
    expect(svg(renderLine(lineSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))).toBe(EXPECTED_LINE)
  })
})

describe("chart-svg golden markup — byte-compat pins (pie/donut/funnel/dumbbell, untouched dispatch paths)", () => {
  it("renderPie", () => {
    expect(svg(renderPie(pieSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))).toBe(EXPECTED_PIE)
  })

  it("renderDonut", () => {
    expect(svg(renderDonut(pieSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))).toBe(EXPECTED_DONUT)
  })

  it("renderFunnel", () => {
    expect(svg(renderFunnel(funnelSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))).toBe(EXPECTED_FUNNEL)
  })

  it("renderDumbbell", () => {
    expect(svg(renderDumbbell(dumbbellSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))).toBe(EXPECTED_DUMBBELL)
  })
})

describe("chart component golden markup — byte-compat pins (chart.tsx integration layer, n==1)", () => {
  it("bar: full render() output (translate wrapper included) stays byte-identical", () => {
    const component = { type: "chart" as const, chart_type: "bar" as const, series: barSeries }
    expect(svg(chart.render(component, box, ctx))).toBe(EXPECTED_CHART_BAR_FULL)
  })

  it("line: full render() output (translate wrapper included) stays byte-identical", () => {
    const component = { type: "chart" as const, chart_type: "line" as const, series: lineSeries }
    expect(svg(chart.render(component, box, ctx))).toBe(EXPECTED_CHART_LINE_FULL)
  })

  it("bar: measure() stays 240 (no legend band for a single series)", () => {
    const component = { type: "chart" as const, chart_type: "bar" as const, series: barSeries }
    expect(chart.measure(component, 1120, ctx)).toBe(240)
  })

  it("line: measure() stays 240 (no legend band for a single series)", () => {
    const component = { type: "chart" as const, chart_type: "line" as const, series: lineSeries }
    expect(chart.measure(component, 1120, ctx)).toBe(240)
  })
})
