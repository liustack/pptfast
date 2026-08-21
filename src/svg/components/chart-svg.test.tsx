// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import {
  renderArea,
  renderBar,
  renderBarHorizontal,
  renderDonut,
  renderDumbbell,
  renderFunnel,
  renderGauge,
  renderLine,
  renderScatter,
} from "./chart-svg"
import { assertSubset } from "../subset-validate"
import { renderSvgMarkup } from "../serialize"
import { __parseWedgePath } from "../audit/deck-audit"
import type { ChartSeries, Component } from "@/ir"

type ChartComponentFixture = Extract<Component, { type: "chart" }>

// Task 8: gradient bars, endpoint emphasis and gridlines. These tests call
// `renderBar`/`renderLine` directly (rather than going through `chart.tsx`)
// so an explicit `accentColor` argument can be supplied — mirrors how
// `chart.tsx` actually invokes them in production (x0=y0=0, translation
// applied by an outer `<g>`), so gridline/gradient geometry below is
// computed against that same convention.

const ACCENT = "#00A878"
const ACCENT_SHADE = "#007654" // scaleHexBrightness(ACCENT, 0.7), verified in node
const MUTED = "#5D6B65"
const TEXT = "#1A2421"
const PALETTE = ["#006A4E", "#00A878", "#FF6B35", "#FFD166"]

const W = 1120
const H = 240
// Matches chart-svg.tsx's own LABEL_TOP_PAD/LABEL_BOTTOM_PAD (14/18) — kept
// local since those constants aren't exported (component-internal detail).
const PLOT_TOP = 14
const PLOT_H = H - 14 - 18
const BASELINE_Y = PLOT_TOP + PLOT_H

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

function seriesOf(...ys: number[]): ChartSeries[] {
  return [{ name: "S1", data: ys.map((y, i) => ({ x: `C${i}`, y })) }]
}

describe("renderBar — gradient bars", () => {
  it("gives the max-value bar a solid accent fill and other bars a gradient fill at opacity 0.75", () => {
    const { container } = svg(
      renderBar(seriesOf(100, 200, 150), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT),
    )
    const rects = Array.from(container.querySelectorAll("rect"))
    expect(rects).toHaveLength(3)

    const gradient = container.querySelector("linearGradient")!
    const gradId = gradient.getAttribute("id")!
    expect(gradId).toBeTruthy()

    // Q2 bar (y=200) is the max — solid accent, full opacity.
    expect(rects[1].getAttribute("fill")).toBe(ACCENT)
    expect(rects[1].getAttribute("opacity")).toBe("1")

    // Q1/Q3 bars reference the shared gradient at opacity 0.75.
    expect(rects[0].getAttribute("fill")).toBe(`url(#${gradId})`)
    expect(rects[0].getAttribute("opacity")).toBe("0.75")
    expect(rects[2].getAttribute("fill")).toBe(`url(#${gradId})`)
    expect(rects[2].getAttribute("opacity")).toBe("0.75")
  })

  it("declares one shared vertical gradient (x1=0,y1=0,x2=0,y2=1) with accent -> 70%-brightness stops", () => {
    const { container } = svg(
      renderBar(seriesOf(10, 20), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT),
    )
    const gradients = container.querySelectorAll("linearGradient")
    expect(gradients).toHaveLength(1)
    const gradient = gradients[0]
    expect(gradient.getAttribute("x1")).toBe("0")
    expect(gradient.getAttribute("y1")).toBe("0")
    expect(gradient.getAttribute("x2")).toBe("0")
    expect(gradient.getAttribute("y2")).toBe("1")

    const stops = gradient.querySelectorAll("stop")
    expect(stops).toHaveLength(2)
    expect(stops[0].getAttribute("offset")).toBe("0%")
    expect(stops[0].getAttribute("stop-color")).toBe(ACCENT)
    expect(stops[1].getAttribute("offset")).toBe("100%")
    expect(stops[1].getAttribute("stop-color")).toBe(ACCENT_SHADE)
  })

  it("ties for the max value all render solid (no arbitrary single-bar tie-break)", () => {
    const { container } = svg(
      renderBar(seriesOf(50, 50), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT),
    )
    const rects = Array.from(container.querySelectorAll("rect"))
    for (const rect of rects) {
      expect(rect.getAttribute("fill")).toBe(ACCENT)
      expect(rect.getAttribute("opacity")).toBe("1")
    }
  })

  it("paints value labels at 13px / 600 / text, 9px above the bar top, and category ticks at 13px muted", () => {
    const { container } = svg(
      renderBar(seriesOf(100, 200), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT),
    )
    const texts = Array.from(container.querySelectorAll("text"))
    expect(texts).toHaveLength(4)
    const categories = texts.filter((t) => t.getAttribute("fill") === MUTED)
    const values = texts.filter((t) => t.getAttribute("fill") === TEXT)
    expect(categories.map((t) => t.textContent)).toEqual(["C0", "C1"])
    expect(values.map((t) => t.textContent)).toEqual(["100", "200"])
    const rects = Array.from(container.querySelectorAll("rect"))
    values.forEach((t, i) => {
      expect(t.getAttribute("font-size")).toBe("13")
      expect(t.getAttribute("font-weight")).toBe("600")
      expect(Number(rects[i]!.getAttribute("y")) - Number(t.getAttribute("y"))).toBe(9)
    })
    for (const t of categories) {
      expect(t.getAttribute("font-size")).toBe("13")
    }
  })
})

describe("gradient id uniqueness across chart instances on one page", () => {
  it("gives two different-data chart instances distinct gradient ids", () => {
    const { container: a } = svg(renderBar(seriesOf(1, 2), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const { container: b } = svg(renderBar(seriesOf(9, 3), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const idA = a.querySelector("linearGradient")!.getAttribute("id")
    const idB = b.querySelector("linearGradient")!.getAttribute("id")
    expect(idA).not.toBe(idB)
  })

  it("gives the same chart instance (identical props) the same gradient id both times (reproducible for preview/export)", () => {
    const { container: a } = svg(renderBar(seriesOf(1, 2), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const { container: b } = svg(renderBar(seriesOf(1, 2), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const idA = a.querySelector("linearGradient")!.getAttribute("id")
    const idB = b.querySelector("linearGradient")!.getAttribute("id")
    expect(idA).toBe(idB)
  })

  // R1 evidence wave, Task T2: multi-series line no longer draws an
  // area-fill gradient per series at all ("no stacked area fills, only line
  // strokes when n>=2" — transparent regions would inter-blend once more
  // than one series can be present; single-series keeps its area fill
  // unchanged, see the byte-compat golden pins). This test used to prove
  // "two series -> two distinct area-gradient ids"; that shape can no longer
  // occur, so distinct-id coverage moves to two single-series instances
  // (mirroring the two `renderBar` tests directly above), and a new test
  // locks in the n>=2 "no gradient/polygon at all" behavior.
  it("gives two different single-series line charts distinct area-gradient ids", () => {
    const a: ChartSeries[] = [{ name: "A", data: [{ x: "a", y: 1 }, { x: "b", y: 5 }] }]
    const b: ChartSeries[] = [{ name: "A", data: [{ x: "a", y: 9 }, { x: "b", y: 3 }] }]
    const { container: ca } = svg(renderLine(a, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const { container: cb } = svg(renderLine(b, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const idA = ca.querySelector("linearGradient")!.getAttribute("id")
    const idB = cb.querySelector("linearGradient")!.getAttribute("id")
    expect(idA).toBeTruthy()
    expect(idB).toBeTruthy()
    expect(idA).not.toBe(idB)
  })

  it("a multi-series (n>=2) line chart renders no area-fill gradient or polygon — strokes only", () => {
    const twoSeries: ChartSeries[] = [
      { name: "A", data: [{ x: "a", y: 1 }, { x: "b", y: 5 }] },
      { name: "B", data: [{ x: "a", y: 3 }, { x: "b", y: 2 }] },
    ]
    const { container } = svg(renderLine(twoSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    expect(container.querySelectorAll("linearGradient")).toHaveLength(0)
    expect(container.querySelectorAll("polygon")).toHaveLength(0)
    expect(container.querySelectorAll("polyline")).toHaveLength(2)
  })
})

describe("renderLine — endpoint emphasis and area gradient", () => {
  const series: ChartSeries[] = [
    { name: "Trend", data: [{ x: "Jan", y: 10 }, { x: "Feb", y: 30 }, { x: "Mar", y: 20 }] },
  ]

  it("renders a two-layer endpoint marker (solid dot + soft ring) at the last point", () => {
    const { container } = svg(renderLine(series, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const circles = Array.from(container.querySelectorAll("circle"))
    expect(circles).toHaveLength(2)

    const ring = circles.find((c) => c.getAttribute("r") === "8")!
    expect(ring).toBeTruthy()
    expect(ring.getAttribute("fill")).toBe("none")
    expect(ring.getAttribute("stroke")).toBe(ACCENT)
    expect(ring.getAttribute("stroke-opacity")).toBe("0.3")

    const dot = circles.find((c) => c.getAttribute("r") === "4")!
    expect(dot).toBeTruthy()
    expect(dot.getAttribute("fill")).toBe(ACCENT)

    // Both circles share the same center — the series' last point.
    expect(ring.getAttribute("cx")).toBe(dot.getAttribute("cx"))
    expect(ring.getAttribute("cy")).toBe(dot.getAttribute("cy"))
  })

  it("closes the area-under-line polygon down to the baseline", () => {
    const { container } = svg(renderLine(series, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const polygon = container.querySelector("polygon")!
    expect(polygon).toBeTruthy()
    const pts = polygon.getAttribute("points")!.trim().split(/\s+/)
    // Last two vertices close the shape down to the baseline, at the line's
    // last and first x — in that order (see chart-svg.tsx's areaPoints).
    const last = pts[pts.length - 2].split(",").map(Number)
    const first = pts[pts.length - 1].split(",").map(Number)
    expect(last[1]).toBeCloseTo(BASELINE_Y)
    expect(first[1]).toBeCloseTo(BASELINE_Y)
  })

  it("declares the area gradient with accent alpha fading 0.2 -> 0, top to bottom", () => {
    const { container } = svg(renderLine(series, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const gradient = container.querySelector("linearGradient")!
    expect(gradient.getAttribute("x1")).toBe("0")
    expect(gradient.getAttribute("y1")).toBe("0")
    expect(gradient.getAttribute("x2")).toBe("0")
    expect(gradient.getAttribute("y2")).toBe("1")

    const stops = gradient.querySelectorAll("stop")
    expect(stops).toHaveLength(2)
    expect(stops[0].getAttribute("stop-color")).toBe(ACCENT)
    expect(stops[0].getAttribute("stop-opacity")).toBe("0.2")
    expect(stops[1].getAttribute("stop-color")).toBe(ACCENT)
    expect(stops[1].getAttribute("stop-opacity")).toBe("0")
  })

  it("does not alter the polyline's own stroke (existing per-series color cycling untouched)", () => {
    const twoSeries: ChartSeries[] = [
      { name: "A", data: [{ x: "a", y: 1 }, { x: "b", y: 5 }] },
      { name: "B", data: [{ x: "a", y: 3 }, { x: "b", y: 2 }] },
    ]
    const { container } = svg(renderLine(twoSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const polylines = Array.from(container.querySelectorAll("polyline"))
    expect(polylines.map((p) => p.getAttribute("stroke"))).toEqual([PALETTE[0], PALETTE[1]])
  })

  it("does not alter existing category/value labels", () => {
    const { container } = svg(renderLine(series, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const texts = Array.from(container.querySelectorAll("text"))
    const categories = texts.filter((t) => t.getAttribute("fill") === MUTED)
    const values = texts.filter((t) => t.getAttribute("fill") === TEXT)
    expect(categories.map((t) => t.textContent)).toEqual(["Jan", "Feb", "Mar"])
    expect(values.map((t) => t.textContent)).toEqual(["10", "20"])
  })
})

describe("gridlines", () => {
  it("renders exactly 3 horizontal reference lines for an opted-in bar chart, none on the baseline", () => {
    const { container } = svg(
      renderBar(seriesOf(10, 20, 15), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT, true),
    )
    const lines = Array.from(container.querySelectorAll("line"))
    expect(lines).toHaveLength(3)
    for (const line of lines) {
      expect(line.getAttribute("stroke")).toBe(MUTED)
      expect(line.getAttribute("stroke-opacity")).toBe("0.1")
      expect(Number(line.getAttribute("y1"))).not.toBeCloseTo(BASELINE_Y)
      expect(line.getAttribute("x1")).toBe("0")
      expect(line.getAttribute("x2")).toBe(String(W))
    }
  })

  it("renders exactly 3 horizontal reference lines for a line chart, none on the baseline", () => {
    const series: ChartSeries[] = [{ name: "Trend", data: [{ x: "a", y: 1 }, { x: "b", y: 2 }] }]
    const { container } = svg(renderLine(series, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const lines = Array.from(container.querySelectorAll("line"))
    expect(lines).toHaveLength(3)
    for (const line of lines) {
      expect(Number(line.getAttribute("y1"))).not.toBeCloseTo(BASELINE_Y)
    }
  })

  it("divides the plot height into quarters (25% / 50% / 75%)", () => {
    const { container } = svg(
      renderBar(seriesOf(10, 20), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT, true),
    )
    const ys = Array.from(container.querySelectorAll("line"))
      .map((l) => Number(l.getAttribute("y1")))
      .sort((a, b) => a - b)
    expect(ys).toEqual([
      PLOT_TOP + PLOT_H * 0.25,
      PLOT_TOP + PLOT_H * 0.5,
      PLOT_TOP + PLOT_H * 0.75,
    ])
  })

  // `axes.show_grid` wiring, post-round-4: the bar family defaults **off**
  // (every bar already carries its own value label, so a horizontal ruler is
  // duplicate ink — `renderBar`'s own `showGrid` doc comment has the user
  // verdict behind it), line/area/scatter default **on** (they label only
  // endpoints, or nothing at all, so the lines are the reading aid). Either
  // way the flag is a live two-way toggle, not a dead one.
  it("renderBar: showGrid omitted draws no reference lines (round-4 default)", () => {
    const { container } = svg(
      renderBar(seriesOf(10, 20, 15), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT),
    )
    expect(container.querySelectorAll("line")).toHaveLength(0)
  })

  it("renderBar: an explicit showGrid=false also suppresses them (same as omitted)", () => {
    const { container } = svg(
      renderBar(seriesOf(10, 20, 15), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT, false),
    )
    expect(container.querySelectorAll("line")).toHaveLength(0)
  })

  it("renderBar: an explicit showGrid=true opts the reference lines back in", () => {
    const { container } = svg(
      renderBar(seriesOf(10, 20, 15), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT, true),
    )
    expect(container.querySelectorAll("line")).toHaveLength(3)
  })

  it("renderBar: every bar carries its own value label, which is why the lines can go", () => {
    const { container } = svg(
      renderBar(seriesOf(10, 20, 15), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT),
    )
    const values = Array.from(container.querySelectorAll("text"))
      .filter((t) => t.getAttribute("fill") === TEXT)
      .map((t) => t.textContent)
    expect(values).toEqual(["10", "20", "15"])
  })

  it("renderLine/renderArea/renderScatter keep the lines on by default — they label no interior value", () => {
    const lineSeries: ChartSeries[] = [
      { name: "Trend", data: [{ x: "a", y: 1 }, { x: "b", y: 2 }, { x: "c", y: 3 }] },
    ]
    expect(
      svg(renderLine(lineSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT)).container.querySelectorAll(
        "line",
      ),
    ).toHaveLength(3)
    expect(
      svg(renderArea(lineSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT)).container.querySelectorAll(
        "line",
      ),
    ).toHaveLength(3)
    const scatterSeries: ChartSeries[] = [
      { name: "Points", data: [{ x: 1, y: 4 }, { x: 2, y: 9 }, { x: 3, y: 6 }] },
    ]
    expect(
      svg(
        renderScatter(scatterSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT),
      ).container.querySelectorAll("line"),
    ).toHaveLength(3)
    // The evidence behind that asymmetry: an area chart prints no value text
    // at all, and a line chart prints only its first/last point.
    const areaValues = Array.from(
      svg(renderArea(lineSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT)).container.querySelectorAll(
        "text",
      ),
    ).filter((t) => t.getAttribute("fill") === TEXT)
    expect(areaValues).toHaveLength(0)
    const lineValues = Array.from(
      svg(renderLine(lineSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT)).container.querySelectorAll(
        "text",
      ),
    )
      .filter((t) => t.getAttribute("fill") === TEXT)
      .map((t) => t.textContent)
    expect(lineValues).toEqual(["1", "3"])
  })

  it("renderLine: an explicit showGrid=false suppresses the reference lines", () => {
    const series: ChartSeries[] = [{ name: "Trend", data: [{ x: "a", y: 1 }, { x: "b", y: 2 }] }]
    const { container } = svg(renderLine(series, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT, false))
    expect(container.querySelectorAll("line")).toHaveLength(0)
  })

  // renderBarHorizontal never drew gridlines before this feature — unlike
  // bar/line, `showGrid` here is a new opt-in (default false), not a toggle
  // on pre-existing always-on behavior, so every pre-feature call site
  // (there are none passing a 10th arg yet) stays byte-identical by default.
  it("renderBarHorizontal: showGrid omitted stays gridline-free (pre-feature default)", () => {
    const { container } = svg(
      renderBarHorizontal(seriesOf(10, 20, 15), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT),
    )
    expect(container.querySelectorAll("line")).toHaveLength(0)
  })

  it("renderBarHorizontal: explicit showGrid=true renders 3 vertical reference lines, none on the value-zero baseline", () => {
    const { container } = svg(
      renderBarHorizontal(seriesOf(10, 20, 15), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT, true),
    )
    const lines = Array.from(container.querySelectorAll("line"))
    expect(lines).toHaveLength(3)
    for (const line of lines) {
      expect(line.getAttribute("stroke")).toBe(MUTED)
      expect(line.getAttribute("stroke-opacity")).toBe("0.1")
      expect(line.getAttribute("y1")).toBe("0")
      expect(line.getAttribute("y2")).toBe(String(H))
    }
  })
})

describe("renderDonut — center total label", () => {
  // Regression lock for defect C (bench-driven fixes wave, task 4): the
  // center caption under the summed total used to be hardcoded Chinese
  // ("总计") regardless of deck language — public rendered-output surfaces
  // are English. `chart_type: "pie"` + `style: "donut"` (src/ir/index.ts)
  // is the only caller (`chart.tsx`); no prior test exercised this render
  // path at all (neither `chart.test.tsx` nor this file), so this also
  // closes a pre-existing coverage gap, not just the language regression.
  it("renders the English 'Total' caption below the summed value, never the old Chinese label", () => {
    const { container } = svg(
      renderDonut(seriesOf(30, 45, 25), PALETTE, 0, 0, W, H, MUTED, TEXT),
    )
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).toContain("Total")
    expect(texts).toContain("100") // 30+45+25, the summed center value
    expect(container.textContent).not.toContain("总计")
  })

  it("renders one path wedge per data point and nothing when the series sums to zero", () => {
    const { container } = svg(renderDonut(seriesOf(1, 2, 3), PALETTE, 0, 0, W, H, MUTED, TEXT))
    expect(container.querySelectorAll("path")).toHaveLength(3)

    const { container: empty } = svg(renderDonut(seriesOf(0, 0), PALETTE, 0, 0, W, H, MUTED, TEXT))
    expect(empty.querySelectorAll("path")).toHaveLength(0)
    expect(empty.querySelectorAll("text")).toHaveLength(0)
  })
})

// 2026-07-21 negative-axis export-gate fix: `renderDumbbell`'s vx() had no
// lower domain bound, so a negative value could push a dot/line/label
// arbitrarily far left of the canvas -- degenerating through svg2pptx/
// text.ts's align==="center" branch into a negative-width text op, which
// the package-audit gate then rejected (see generate-chart-export.test.ts's
// dedicated describe block for the real-generatePptx reproduction). These
// tests exercise the renderer directly, one layer below that gate, so a
// regression shows up as a wrong/out-of-bounds coordinate rather than a
// thrown error.
describe("renderDumbbell — mixed-sign value domain (2026-07-21 negative-axis export-gate fix)", () => {
  // Passes the box's real page position straight into x0/y0 (rather than
  // this file's usual x0=y0=0 + no wrapping translate) so every coordinate
  // asserted below reads as a true canvas-absolute position: chart.tsx
  // always calls renderDumbbell with x0=y0=0 and applies the page offset via
  // an outer `<g transform="translate(box.x,box.y)">`, which is just
  // addition -- translate(80,100) applied to a local (lx,ly) yields exactly
  // (lx+80, ly+100), the same numbers renderDumbbell(...,80,100,...)
  // computes directly. box.x=80/y=100/w=1120 mirrors chart.test.tsx's own
  // production-realistic `box` fixture.
  const X0 = 80
  const Y0 = 100
  const W = 1120
  const H = 240

  function dumbbellSeries(rows: Array<{ from: number; to: number }>): ChartSeries[] {
    return [
      { name: "from", data: rows.map((r, i) => ({ x: `R${i}`, y: r.from })) },
      { name: "to", data: rows.map((r, i) => ({ x: `R${i}`, y: r.to })) },
    ]
  }

  function expectOnCanvas(container: HTMLElement) {
    const circles = Array.from(container.querySelectorAll("circle"))
    expect(circles.length).toBeGreaterThan(0)
    for (const c of circles) {
      expect(Number(c.getAttribute("cx"))).toBeGreaterThanOrEqual(0)
      expect(Number(c.getAttribute("cx"))).toBeLessThanOrEqual(1280)
      expect(Number(c.getAttribute("cy"))).toBeGreaterThanOrEqual(0)
      expect(Number(c.getAttribute("cy"))).toBeLessThanOrEqual(720)
    }
    const lines = Array.from(container.querySelectorAll("line"))
    expect(lines.length).toBeGreaterThan(0)
    for (const l of lines) {
      for (const attr of ["x1", "x2"]) {
        const v = Number(l.getAttribute(attr))
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1280)
      }
    }
    // Only the "from" value label is textAnchor="middle" -- the one anchor
    // style whose pptx conversion (svg2pptx/text.ts, align==="center")
    // computes a half-width via `Math.min(xPx, CANVAS_W_PX - xPx)`, which
    // goes negative (a negative-width text box) once xPx itself is
    // off-canvas. The row label (text-anchor=end) and "to" value label
    // (default/start anchor) are never data-value-positioned in x, so they
    // were never at risk of this specific defect.
    const centerTexts = Array.from(container.querySelectorAll('text[text-anchor="middle"]'))
    expect(centerTexts.length).toBeGreaterThan(0)
    for (const t of centerTexts) {
      const x = Number(t.getAttribute("x"))
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(1280)
    }
  }

  it("keeps every dot/line/label on-canvas for the acceptance report's mild case (from:-5, to:10)", () => {
    const { container } = svg(
      renderDumbbell(dumbbellSeries([{ from: -5, to: 10 }]), PALETTE, X0, Y0, W, H, MUTED, TEXT, ACCENT),
    )
    expectOnCanvas(container)
  })

  it("keeps every dot/line/label on-canvas at extreme magnitude (from:-50000, to:3)", () => {
    const { container } = svg(
      renderDumbbell(dumbbellSeries([{ from: -50000, to: 3 }]), PALETTE, X0, Y0, W, H, MUTED, TEXT, ACCENT),
    )
    expectOnCanvas(container)
  })

  it("keeps every dot/line/label on-canvas for a multi-row mix of normal and extreme rows", () => {
    const { container } = svg(
      renderDumbbell(
        dumbbellSeries([{ from: 10, to: 20 }, { from: -9000, to: 50 }, { from: 5, to: 8 }]),
        PALETTE,
        X0,
        Y0,
        W,
        H,
        MUTED,
        TEXT,
        ACCENT,
      ),
    )
    expectOnCanvas(container)
  })

  it("orders rendered dots left-to-right by value across the shared domain (a -5 mark renders left of a 10 mark)", () => {
    const rows = [{ from: -5, to: 3 }, { from: 10, to: -2 }]
    const { container } = svg(renderDumbbell(dumbbellSeries(rows), PALETTE, X0, Y0, W, H, MUTED, TEXT, ACCENT))
    const circles = Array.from(container.querySelectorAll("circle"))
    // Authoring order per row is (from-dot, to-dot): row0.from, row0.to,
    // row1.from, row1.to.
    const values = rows.flatMap((r) => [r.from, r.to])
    expect(circles).toHaveLength(values.length)
    const paired = circles.map((c, i) => ({ value: values[i], cx: Number(c.getAttribute("cx")) }))
    const byValue = [...paired].sort((a, b) => a.value - b.value)
    for (let i = 1; i < byValue.length; i++) {
      expect(byValue[i].cx).toBeGreaterThanOrEqual(byValue[i - 1].cx)
    }
    // Explicit check for the exact case named in the fix brief.
    const negFive = paired.find((p) => p.value === -5)!
    const ten = paired.find((p) => p.value === 10)!
    expect(negFive.cx).toBeLessThan(ten.cx)
  })

  it("renders a positive-only series byte-identically to the pre-fix formula", () => {
    // Hand-computed from the pre-fix formula (`vx(v) = plotX + (v/max)*plotW`
    // with `max = Math.max(...all, 1)`, `plotX = x0 + 108`,
    // `plotW = max(1, w - 164)`) -- the fixed formula must reduce to exactly
    // this whenever every value is already >= 0 (the new `min` term
    // collapses to exactly 0), which is every case this component shipped
    // with before this fix.
    const { container } = svg(
      renderDumbbell(dumbbellSeries([{ from: 20, to: 80 }]), PALETTE, 0, 0, 1120, 240, MUTED, TEXT, ACCENT),
    )
    const circles = Array.from(container.querySelectorAll("circle"))
    const plotX = 0 + 96 + 12
    const plotW = Math.max(1, 1120 - 96 - 12 - 56)
    const max = Math.max(20, 80, 1)
    expect(Number(circles[0].getAttribute("cx"))).toBeCloseTo(plotX + (20 / max) * plotW)
    expect(Number(circles[1].getAttribute("cx"))).toBeCloseTo(plotX + (80 / max) * plotW)
  })

  it("keeps the pre-existing all-zero degenerate case stable (no NaN/Infinity; every dot stacks at plotX)", () => {
    const { container } = svg(
      renderDumbbell(dumbbellSeries([{ from: 0, to: 0 }]), PALETTE, 0, 0, 1120, 240, MUTED, TEXT, ACCENT),
    )
    const circles = Array.from(container.querySelectorAll("circle"))
    const plotX = 0 + 96 + 12
    for (const c of circles) {
      expect(Number(c.getAttribute("cx"))).toBeCloseTo(plotX)
    }
  })
})

// Task R1 fix: dumbbell's from.y/to.y value labels rendered the raw data
// value with no width fitting at all, unlike this same component's row
// category label (the `label` variable a few lines up, `fitSvgLine(String(
// from.x), ...)`) which already shrinks/truncates to fit its declared box.
// A large value (e.g. a 10-digit number, the same magnitude the sub-EMU
// line.ts fix's from=1e9-scale repro uses) had no such protection and could
// overflow its row visually. Fixed by giving from.y/to.y the identical
// fitSvgLine treatment, same mechanism, no new number-abbreviation
// convention invented.
describe("renderDumbbell — value-label width fitting (from.y/to.y)", () => {
  it("keeps normal-magnitude from.y/to.y byte-identical to the pre-fix raw rendering (no shrink, no truncation)", () => {
    const series: ChartSeries[] = [
      { name: "from", data: [{ x: "A", y: 42 }] },
      { name: "to", data: [{ x: "A", y: 128 }] },
    ]
    const { container } = svg(renderDumbbell(series, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const texts = Array.from(container.querySelectorAll("text"))
    const fromLabel = texts.find((t) => t.textContent === "42")
    const toLabel = texts.find((t) => t.textContent === "128")
    expect(fromLabel).toBeTruthy()
    expect(toLabel).toBeTruthy()
    expect(Number(fromLabel!.getAttribute("font-size"))).toBe(11) // dumbbell "from" keeps the pre-tuning 11px
    expect(Number(toLabel!.getAttribute("font-size"))).toBe(12.5) // unchanged
    expect(fromLabel!.getAttribute("data-truncated")).toBeNull()
    expect(toLabel!.getAttribute("data-truncated")).toBeNull()
  })

  it("shrinks (fitSvgLine) a 10-digit value label instead of rendering it raw and unbounded", () => {
    // 10 digits -- the same magnitude as the sub-EMU line.ts fix's own
    // from=1e9-scale repro. `fill`/`text-anchor` (not textContent) locate
    // the two value labels: whether fitSvgLine's shrink-only or
    // shrink-then-truncate branch fires at this exact width budget isn't
    // this test's concern (that's fitSvgLine's own unit tests' job,
    // svg-text-layout.test.ts) -- only that the label is bounded at all,
    // mirroring chart.test.tsx's own bar-chart fitSvgLine test, which
    // likewise only asserts the resulting font-size range, not content.
    const series: ChartSeries[] = [
      { name: "from", data: [{ x: "A", y: 1234567890 }] },
      { name: "to", data: [{ x: "A", y: 1987654321 }] },
    ]
    const { container } = svg(renderDumbbell(series, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const texts = Array.from(container.querySelectorAll("text"))
    const fromLabel = texts.find((t) => t.getAttribute("fill") === MUTED && t.getAttribute("text-anchor") === "middle")
    const toLabel = texts.find((t) => t.getAttribute("fill") === ACCENT)
    expect(fromLabel).toBeTruthy()
    expect(toLabel).toBeTruthy()
    expect(Number(fromLabel!.getAttribute("font-size"))).toBeLessThan(11) // LABEL_FONT_SIZE
    expect(Number(fromLabel!.getAttribute("font-size"))).toBeGreaterThanOrEqual(10) // this call's minFontSize
    expect(Number(toLabel!.getAttribute("font-size"))).toBeLessThan(12.5)
    expect(Number(toLabel!.getAttribute("font-size"))).toBeGreaterThanOrEqual(10)
  })

  it("never leaves a from.y/to.y label unbounded — a pathologically long value (16 digits, Number.MAX_SAFE_INTEGER scale) truncates at the minimum font size instead of overflowing raw", () => {
    // MAX_SAFE_INTEGER (not an even-longer digit string): stays a plain
    // decimal String() representation (16 digits) with no scientific-
    // notation formatting quirk (JS switches to exponential form only past
    // 1e21) -- a realistic "how long can a genuine integer value's decimal
    // string get" ceiling, well past this label's width budget either way.
    const hugeFrom = Number.MAX_SAFE_INTEGER
    const hugeTo = hugeFrom - 1
    const series: ChartSeries[] = [
      { name: "from", data: [{ x: "A", y: hugeFrom }] },
      { name: "to", data: [{ x: "A", y: hugeTo }] },
    ]
    const { container } = svg(renderDumbbell(series, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const texts = Array.from(container.querySelectorAll("text"))
    // fill/text-anchor (not textContent) locate the two value labels here
    // too -- at this length truncation is certain, so the full numeric
    // string is never a reliable lookup key to begin with.
    const fromLabel = texts.find((t) => t.getAttribute("fill") === MUTED && t.getAttribute("text-anchor") === "middle")
    const toLabel = texts.find((t) => t.getAttribute("fill") === ACCENT)
    expect(fromLabel).toBeTruthy()
    expect(toLabel).toBeTruthy()
    expect(Number(fromLabel!.getAttribute("font-size"))).toBe(10) // this call's minFontSize floor
    expect(Number(toLabel!.getAttribute("font-size"))).toBe(10)
    expect(fromLabel!.textContent!.length).toBeLessThan(String(hugeFrom).length)
    expect(toLabel!.textContent!.length).toBeLessThan(String(hugeTo).length)
  })
})

// 2026-07-22 extreme-magnitude export-gate fix (deep-acceptance review Round
// 3, 6th defect): renderBar/renderBarHorizontal/renderLine/renderFunnel all
// compute a bar/point's pixel extent or position as a bare
// `(d.y / max) * boxDimension` ratio with no ceiling. A value tens-to-
// thousands of times its series' own max (legal IR) scaled that ratio
// without bound, eventually crossing pptxgenjs's own undocumented
// "size >= 100in is already EMU" heuristic and writing a raw, unconverted,
// non-integer value into the exported XML — see chart-svg.tsx's own
// MAX_CHART_GEOMETRY_PX doc comment and generate-chart-export.test.ts's
// reproduction through the real generatePptx for the full root-cause trace.
// Kept local (not exported) same as this file's own PLOT_H convention.
const MAX_CHART_GEOMETRY_PX = 4800

describe("renderBar/renderBarHorizontal/renderLine/renderFunnel — extreme-magnitude geometry ceiling (2026-07-22 export-gate fix)", () => {
  function assertNumericAttrsBounded(container: HTMLElement, selector: string, attrs: string[], bound: number) {
    const els = Array.from(container.querySelectorAll(selector))
    expect(els.length).toBeGreaterThan(0)
    for (const el of els) {
      for (const attr of attrs) {
        const raw = el.getAttribute(attr)
        if (raw === null) continue
        const n = Number(raw)
        expect(Number.isFinite(n)).toBe(true)
        expect(Math.abs(n)).toBeLessThanOrEqual(bound)
      }
    }
  }

  it("renderBar: an extreme negative value's rect/text geometry never exceeds the ceiling", () => {
    const { container } = svg(
      renderBar(seriesOf(-1e9, 100), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT),
    )
    // Position values (rect y, text y) get an extra generous margin over the
    // raw ceiling since they're offset from a plot anchor (plotTop+plotH),
    // not the clamp's own zero point -- still nowhere near pptxgenjs's
    // 9600px danger line even with that margin.
    assertNumericAttrsBounded(container, "rect", ["height"], MAX_CHART_GEOMETRY_PX)
    assertNumericAttrsBounded(container, "rect, text", ["y"], MAX_CHART_GEOMETRY_PX + H)
  })

  it("renderBarHorizontal: an extreme negative value's rect/text geometry never exceeds the ceiling", () => {
    const { container } = svg(
      renderBarHorizontal(seriesOf(-1e9, 100), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT),
    )
    assertNumericAttrsBounded(container, "rect", ["width"], MAX_CHART_GEOMETRY_PX)
    assertNumericAttrsBounded(container, "rect, text", ["x"], MAX_CHART_GEOMETRY_PX + W)
  })

  it("renderLine: an extreme negative value's points/labels/dots geometry never exceeds the ceiling", () => {
    const series: ChartSeries[] = [{ name: "S", data: [{ x: "A", y: -1e9 }, { x: "B", y: 100 }] }]
    const { container } = svg(renderLine(series, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    assertNumericAttrsBounded(container, "circle, text", ["cy", "y"], MAX_CHART_GEOMETRY_PX + H)
    const polyline = container.querySelector("polyline")!
    const ys = polyline.getAttribute("points")!.trim().split(/\s+/).map((p) => Number(p.split(",")[1]))
    for (const y of ys) expect(Math.abs(y)).toBeLessThanOrEqual(MAX_CHART_GEOMETRY_PX + H)
  })

  it("renderFunnel: an extreme negative value's rect geometry never exceeds the ceiling", () => {
    const series: ChartSeries[] = [{ name: "S", data: [{ x: "A", y: -1e9 }, { x: "B", y: 100 }] }]
    const { container } = svg(renderFunnel(series, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    assertNumericAttrsBounded(container, "rect", ["width"], MAX_CHART_GEOMETRY_PX)
    assertNumericAttrsBounded(container, "rect", ["x"], MAX_CHART_GEOMETRY_PX + W)
  })

  // R1 evidence wave, Task T2: a single series carrying ANY negative value
  // was never byte-compat-protected (Global Constraint 1 protects only
  // "single-series positive") -- and for good reason. The pre-T2 formula
  // (`barH = (d.y / max) * plotH`, unconditionally) produced a *negative*
  // rect height for a negative value (`(-12 / 5) * PLOT_H = -499.2`), which
  // is invalid SVG (a `<rect height>` must be >= 0) -- this test used to pin
  // that broken value as "correct". chart-model.ts's shared domain now
  // correctly spans down to the real negative minimum (`domain.min =
  // Math.min(0, -12, 5) = -12`), and `verticalBarExtent` measures the bar as
  // a signed span from the true zero baseline (`zeroAxisRatio`) instead of
  // assuming the baseline always sits at the plot's bottom edge -- producing
  // a real, non-negative height instead.
  it("renderBar: a realistic-magnitude negative single-series value gets a correct non-negative mixed-sign bar height, not the old invalid-negative-height formula", () => {
    const { container } = svg(
      renderBar(seriesOf(-12, 5), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT),
    )
    const rects = Array.from(container.querySelectorAll("rect"))
    const domain = { min: Math.min(0, -12, 5), max: Math.max(0, -12, 5, 1) }
    const zero = (0 - domain.min) / (domain.max - domain.min)
    // value=-12 spans the domain fraction [0, zero] (it's the domain's own
    // minimum), so its bar height is exactly `zero` of the plot height.
    const expectedBarH = zero * PLOT_H
    expect(Number(rects[0].getAttribute("height"))).toBeCloseTo(expectedBarH)
    expect(Number(rects[0].getAttribute("height"))).toBeGreaterThanOrEqual(0)
  })
})

// R1 evidence wave, Task T2 review carried item (Important, recorded for
// wave close in .superpowers/sdd/progress.md: "grouped negative/mixed-sign
// bar/line lacks dedicated regression tests (reviewer probes verified code
// correct — coverage gap only)"). The three describe blocks below are that
// missing coverage: they mirror the single-series negative pin directly
// above ("renderBar: a realistic-magnitude negative single-series value
// gets a correct non-negative mixed-sign bar height...") but for n>=2
// (grouped) series, independently re-deriving domain/zero/extent from
// chart-model.ts's own documented rules (never importing chart-svg.tsx's
// barExtentFraction/verticalBarExtent/horizontalBarExtent/lineValueY
// internals directly) so a regression in the implementation can't share a
// bug with its own test. Three properties per shape, matching the carried
// item's own wording: (1) zero-axis offset geometry — every bar/point's
// baseline-touching edge lands on one shared zero row/column, not a
// per-series or per-category anchor, (2) no negative rect dimensions, and
// (3) shared domain correctness — a series with no extreme values of its
// own still scales against the OTHER series' extreme value, proving the
// domain is genuinely shared rather than computed independently per series.
describe("renderBar — grouped (n>=2) negative/mixed-sign regression (T2 review carried item)", () => {
  it("two-series mixed-sign: every bar's y/height matches the shared-domain formula exactly, heights are never negative, and each bar's baseline-touching edge sits at one shared zero row", () => {
    const twoSeries: ChartSeries[] = [
      { name: "A", data: [{ x: "Q1", y: -12 }, { x: "Q2", y: 5 }] },
      { name: "B", data: [{ x: "Q1", y: 8 }, { x: "Q2", y: -20 }] },
    ]
    const { container } = svg(renderBar(twoSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const rects = Array.from(container.querySelectorAll("rect"))
    expect(rects).toHaveLength(4) // 2 categories x 2 series

    // chart-model.ts's shared-domain rule: one [min,max] across BOTH
    // series' kept values, always including zero, max floored at 1
    // (computeChartDomain's own doc comment) -- independently re-derived
    // here, not imported.
    const allValues = [-12, 5, 8, -20]
    const domain = { min: Math.min(0, ...allValues), max: Math.max(0, ...allValues, 1) }
    const zero = (0 - domain.min) / (domain.max - domain.min)
    const baselineY = PLOT_TOP + PLOT_H - zero * PLOT_H

    // Render order is (category, then model.series' fixed 0..n-1 order) --
    // Q1's two bars (series A=-12, B=8), then Q2's (A=5, B=-20) -- matching
    // renderBar's own per-category `for (const s of model.series)` loop.
    const orderedValues = [-12, 8, 5, -20]
    orderedValues.forEach((value, i) => {
      const rect = rects[i]!
      const height = Number(rect.getAttribute("height"))
      const y = Number(rect.getAttribute("y"))
      expect(height).toBeGreaterThanOrEqual(0) // no negative <rect height> regression

      const ratio = (value - domain.min) / (domain.max - domain.min)
      const { start, end } = value >= 0 ? { start: zero, end: ratio } : { start: ratio, end: zero }
      expect(y).toBeCloseTo(PLOT_TOP + PLOT_H - end * PLOT_H)
      expect(height).toBeCloseTo((end - start) * PLOT_H)

      // Zero-axis offset geometry: a positive bar's BOTTOM edge sits on the
      // baseline (it rises up from zero); a negative bar's TOP edge sits on
      // the baseline (it hangs down from zero) -- both land on the exact
      // same shared baselineY, not a per-category recomputation.
      if (value >= 0) {
        expect(y + height).toBeCloseTo(baselineY)
      } else {
        expect(y).toBeCloseTo(baselineY)
      }
    })
  })

  it("two-series all-negative: bars still anchor correctly even though domain.max unconditionally floors to 1 (not 0) with no positive data in sight (the T1-review-flagged floor-at-1 quirk)", () => {
    const twoSeries: ChartSeries[] = [
      { name: "A", data: [{ x: "Q1", y: -12 }, { x: "Q2", y: -3 }] },
      { name: "B", data: [{ x: "Q1", y: -8 }, { x: "Q2", y: -20 }] },
    ]
    const { container } = svg(renderBar(twoSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const rects = Array.from(container.querySelectorAll("rect"))
    expect(rects).toHaveLength(4)

    const allValues = [-12, -3, -8, -20]
    const domain = { min: Math.min(0, ...allValues), max: Math.max(0, ...allValues, 1) } // max floors to 1, not 0
    const zero = (0 - domain.min) / (domain.max - domain.min)
    const baselineY = PLOT_TOP + PLOT_H - zero * PLOT_H

    const orderedValues = [-12, -8, -3, -20]
    orderedValues.forEach((value, i) => {
      const rect = rects[i]!
      const height = Number(rect.getAttribute("height"))
      const y = Number(rect.getAttribute("y"))
      expect(height).toBeGreaterThanOrEqual(0)
      const ratio = (value - domain.min) / (domain.max - domain.min)
      const { start, end } = { start: ratio, end: zero } // every value here is negative
      expect(y).toBeCloseTo(PLOT_TOP + PLOT_H - end * PLOT_H)
      expect(height).toBeCloseTo((end - start) * PLOT_H)
      expect(y).toBeCloseTo(baselineY) // every bar hangs down from the same shared baseline
    })
    // The baseline is NOT at the plot's very top (y===PLOT_TOP) -- proof the
    // max-floors-to-1 quirk is genuinely in effect (domain.max=1, not 0).
    expect(baselineY).toBeGreaterThan(PLOT_TOP)
  })

  it("shared domain is NOT computed per-series: a modest-value series' bar scales against the OTHER series' extreme value", () => {
    const twoSeries: ChartSeries[] = [
      { name: "Extreme", data: [{ x: "Q1", y: -100 }] },
      { name: "Modest", data: [{ x: "Q1", y: 5 }] },
    ]
    const { container } = svg(renderBar(twoSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const rects = Array.from(container.querySelectorAll("rect"))
    expect(rects).toHaveLength(2)

    // If "Modest" were scaled against its OWN local domain (its only value,
    // 5 -- a positive-only single value), it would fill nearly the entire
    // plot height, same as any single-series positive bar does. Scaled
    // against the domain SHARED with "Extreme" (min=-100, max=5, a 105-wide
    // span), its true height is a small fraction of the plot instead --
    // proof the domain really is shared, not computed independently.
    const domain = { min: Math.min(0, -100, 5), max: Math.max(0, -100, 5, 1) }
    const zero = (0 - domain.min) / (domain.max - domain.min)
    const modestRatio = (5 - domain.min) / (domain.max - domain.min)
    const expectedModestHeight = (modestRatio - zero) * PLOT_H

    const modestRect = rects[1]! // seriesIndex 1 == "Modest"
    expect(Number(modestRect.getAttribute("height"))).toBeCloseTo(expectedModestHeight)
    expect(Number(modestRect.getAttribute("height"))).toBeLessThan(PLOT_H * 0.2)
  })
})

// Mirrors chart-svg.tsx's own BAR_H_LABEL_W(110)/12px gap/64px right-margin
// -- component-internal constants, not exported, re-derived locally exactly
// like this file's own PLOT_TOP/PLOT_H convention above (see the golden
// test's EXPECTED_BAR_HORIZONTAL pin: rect x="122" width="934" confirms
// these numbers for W=1120).
const BAR_H_PLOT_X = 0 + 110 + 12
const BAR_H_PLOT_W = Math.max(1, W - 110 - 12 - 64)

describe("renderBarHorizontal — grouped (n>=2) negative/mixed-sign regression (T2 review carried item)", () => {
  it("two-series mixed-sign: every bar's x/width matches the shared-domain formula exactly, widths are never negative, and each bar's baseline-touching edge sits at one shared zero column", () => {
    const twoSeries: ChartSeries[] = [
      { name: "A", data: [{ x: "Q1", y: -12 }, { x: "Q2", y: 5 }] },
      { name: "B", data: [{ x: "Q1", y: 8 }, { x: "Q2", y: -20 }] },
    ]
    const { container } = svg(renderBarHorizontal(twoSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const rects = Array.from(container.querySelectorAll("rect"))
    expect(rects).toHaveLength(4)

    const allValues = [-12, 5, 8, -20]
    const domain = { min: Math.min(0, ...allValues), max: Math.max(0, ...allValues, 1) }
    const zero = (0 - domain.min) / (domain.max - domain.min)
    const baselineX = BAR_H_PLOT_X + zero * BAR_H_PLOT_W

    const orderedValues = [-12, 8, 5, -20]
    orderedValues.forEach((value, i) => {
      const rect = rects[i]!
      const width = Number(rect.getAttribute("width"))
      const x = Number(rect.getAttribute("x"))
      expect(width).toBeGreaterThanOrEqual(0) // no negative <rect width> regression

      const ratio = (value - domain.min) / (domain.max - domain.min)
      const { start, end } = value >= 0 ? { start: zero, end: ratio } : { start: ratio, end: zero }
      expect(x).toBeCloseTo(BAR_H_PLOT_X + start * BAR_H_PLOT_W)
      expect(width).toBeCloseTo((end - start) * BAR_H_PLOT_W)

      // Zero-axis offset geometry, mirrored onto the horizontal axis: a
      // positive bar's LEFT edge sits on the baseline (extends rightward);
      // a negative bar's RIGHT edge sits on the baseline (extends
      // leftward) -- both land on the exact same shared baselineX.
      if (value >= 0) {
        expect(x).toBeCloseTo(baselineX)
      } else {
        expect(x + width).toBeCloseTo(baselineX)
      }
    })
  })

  it("two-series all-negative: every bar's right edge still lands on the shared baseline even though domain.max floors to 1", () => {
    const twoSeries: ChartSeries[] = [
      { name: "A", data: [{ x: "Q1", y: -12 }, { x: "Q2", y: -3 }] },
      { name: "B", data: [{ x: "Q1", y: -8 }, { x: "Q2", y: -20 }] },
    ]
    const { container } = svg(renderBarHorizontal(twoSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const rects = Array.from(container.querySelectorAll("rect"))
    expect(rects).toHaveLength(4)

    const allValues = [-12, -3, -8, -20]
    const domain = { min: Math.min(0, ...allValues), max: Math.max(0, ...allValues, 1) }
    const zero = (0 - domain.min) / (domain.max - domain.min)
    const baselineX = BAR_H_PLOT_X + zero * BAR_H_PLOT_W

    for (const rect of rects) {
      const width = Number(rect.getAttribute("width"))
      const x = Number(rect.getAttribute("x"))
      expect(width).toBeGreaterThanOrEqual(0)
      expect(x + width).toBeCloseTo(baselineX)
    }
    expect(baselineX).toBeLessThan(BAR_H_PLOT_X + BAR_H_PLOT_W) // not at the very right edge
  })

  it("shared domain is NOT computed per-series: a modest-value series' bar scales against the OTHER series' extreme value", () => {
    const twoSeries: ChartSeries[] = [
      { name: "Extreme", data: [{ x: "Q1", y: -100 }] },
      { name: "Modest", data: [{ x: "Q1", y: 5 }] },
    ]
    const { container } = svg(renderBarHorizontal(twoSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const rects = Array.from(container.querySelectorAll("rect"))
    expect(rects).toHaveLength(2)

    const domain = { min: Math.min(0, -100, 5), max: Math.max(0, -100, 5, 1) }
    const zero = (0 - domain.min) / (domain.max - domain.min)
    const modestRatio = (5 - domain.min) / (domain.max - domain.min)
    const expectedModestWidth = (modestRatio - zero) * BAR_H_PLOT_W

    const modestRect = rects[1]!
    expect(Number(modestRect.getAttribute("width"))).toBeCloseTo(expectedModestWidth)
    expect(Number(modestRect.getAttribute("width"))).toBeLessThan(BAR_H_PLOT_W * 0.2)
  })
})

describe("renderLine — grouped (n>=2) negative/mixed-sign regression (T2 review carried item)", () => {
  function expectedLineY(value: number, domain: { min: number; max: number }): number {
    const ratio = (value - domain.min) / (domain.max - domain.min)
    return PLOT_TOP + PLOT_H - ratio * PLOT_H
  }

  it("two-series mixed-sign: every point's y matches the shared-domain formula exactly for both series", () => {
    const twoSeries: ChartSeries[] = [
      { name: "A", data: [{ x: "a", y: -12 }, { x: "b", y: 5 }] },
      { name: "B", data: [{ x: "a", y: 8 }, { x: "b", y: -20 }] },
    ]
    const { container } = svg(renderLine(twoSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const polylines = Array.from(container.querySelectorAll("polyline"))
    expect(polylines).toHaveLength(2)

    const allValues = [-12, 5, 8, -20]
    const domain = { min: Math.min(0, ...allValues), max: Math.max(0, ...allValues, 1) }

    const aPoints = polylines[0]!.getAttribute("points")!.trim().split(/\s+/).map((p) => p.split(",").map(Number))
    const bPoints = polylines[1]!.getAttribute("points")!.trim().split(/\s+/).map((p) => p.split(",").map(Number))
    expect(aPoints[0]![1]).toBeCloseTo(expectedLineY(-12, domain))
    expect(aPoints[1]![1]).toBeCloseTo(expectedLineY(5, domain))
    expect(bPoints[0]![1]).toBeCloseTo(expectedLineY(8, domain))
    expect(bPoints[1]![1]).toBeCloseTo(expectedLineY(-20, domain))
  })

  it("two-series all-negative: every point's y matches the formula even though domain.max floors to 1", () => {
    const twoSeries: ChartSeries[] = [
      { name: "A", data: [{ x: "a", y: -12 }, { x: "b", y: -3 }] },
      { name: "B", data: [{ x: "a", y: -8 }, { x: "b", y: -20 }] },
    ]
    const { container } = svg(renderLine(twoSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const polylines = Array.from(container.querySelectorAll("polyline"))
    const allValues = [-12, -3, -8, -20]
    const domain = { min: Math.min(0, ...allValues), max: Math.max(0, ...allValues, 1) }

    const aPoints = polylines[0]!.getAttribute("points")!.trim().split(/\s+/).map((p) => p.split(",").map(Number))
    const bPoints = polylines[1]!.getAttribute("points")!.trim().split(/\s+/).map((p) => p.split(",").map(Number))
    expect(aPoints[0]![1]).toBeCloseTo(expectedLineY(-12, domain))
    expect(aPoints[1]![1]).toBeCloseTo(expectedLineY(-3, domain))
    expect(bPoints[0]![1]).toBeCloseTo(expectedLineY(-8, domain))
    expect(bPoints[1]![1]).toBeCloseTo(expectedLineY(-20, domain))
    // No point sits at the plot's very top -- proof no value reached the
    // domain's max (which floored to 1, not the real max of -3).
    for (const [, y] of [...aPoints, ...bPoints]) {
      expect(y).toBeGreaterThan(PLOT_TOP)
    }
  })

  it("shared domain is NOT computed per-series: a modest-value series' points sit measurably below the plot's very top because the OTHER series' extreme value stretches the shared domain", () => {
    const twoSeries: ChartSeries[] = [
      { name: "Extreme", data: [{ x: "a", y: -100 }, { x: "b", y: 5 }] },
      { name: "Modest", data: [{ x: "a", y: 3 }, { x: "b", y: 2 }] },
    ]
    const { container } = svg(renderLine(twoSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const polylines = Array.from(container.querySelectorAll("polyline"))
    const domain = { min: Math.min(0, -100, 5, 3, 2), max: Math.max(0, -100, 5, 3, 2, 1) }

    const modestPoints = polylines[1]!.getAttribute("points")!.trim().split(/\s+/).map((p) => p.split(",").map(Number))
    expect(modestPoints[0]![1]).toBeCloseTo(expectedLineY(3, domain))
    expect(modestPoints[1]![1]).toBeCloseTo(expectedLineY(2, domain))
    // If "Modest" were scaled against its own local domain (min=0,
    // max=Math.max(0,3,2,1)=3), its value-3 point would sit exactly at the
    // plot's top edge (y===PLOT_TOP, ratio=1). Under the domain actually
    // shared with "Extreme" (dominated by its -100..5 span), it sits well
    // below that -- proof the domain is genuinely shared.
    expect(modestPoints[0]![1]).toBeGreaterThan(PLOT_TOP + 1)
  })
})

describe("subset validation", () => {
  it("bar chart gradient markup passes assertSubset", () => {
    const { container } = svg(renderBar(seriesOf(10, 20, 15), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    expect(() => assertSubset(container.querySelector("svg")!)).not.toThrow()
  })

  it("line chart gradient markup passes assertSubset", () => {
    const series: ChartSeries[] = [
      { name: "Trend", data: [{ x: "Jan", y: 10 }, { x: "Feb", y: 30 }, { x: "Mar", y: 20 }] },
    ]
    const { container } = svg(renderLine(series, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    expect(() => assertSubset(container.querySelector("svg")!)).not.toThrow()
  })

  // R1 evidence wave, Task T2: multi-series line no longer declares any
  // gradient defs at all (see "gradient id uniqueness" describe block above)
  // — kept as a subset-validation regression guard regardless (the shared-
  // domain polyline/text markup still needs to stay inside the svg2pptx
  // subset even without gradients).
  it("multi-series (shared-domain) line chart passes assertSubset", () => {
    const twoSeries: ChartSeries[] = [
      { name: "A", data: [{ x: "a", y: 1 }, { x: "b", y: 5 }] },
      { name: "B", data: [{ x: "a", y: 3 }, { x: "b", y: 2 }] },
    ]
    const { container } = svg(renderLine(twoSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    expect(() => assertSubset(container.querySelector("svg")!)).not.toThrow()
  })

  it("grouped (multi-series) bar chart passes assertSubset", () => {
    const twoSeries: ChartSeries[] = [
      { name: "A", data: [{ x: "a", y: 10 }, { x: "b", y: 20 }] },
      { name: "B", data: [{ x: "a", y: 15 }, { x: "b", y: 5 }] },
    ]
    const { container } = svg(renderBar(twoSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    expect(() => assertSubset(container.querySelector("svg")!)).not.toThrow()
  })

  it("grouped (multi-series) horizontal bar chart passes assertSubset", () => {
    const twoSeries: ChartSeries[] = [
      { name: "A", data: [{ x: "a", y: 10 }, { x: "b", y: 20 }] },
      { name: "B", data: [{ x: "a", y: 15 }, { x: "b", y: 5 }] },
    ]
    const { container } = svg(renderBarHorizontal(twoSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    expect(() => assertSubset(container.querySelector("svg")!)).not.toThrow()
  })
})

// ── chart-depth wave: scatter / area / gauge / donut-center ──

describe("renderScatter — numeric points and bubbles (chart-depth wave)", () => {
  const scatter = (data: { x: number; y: number; size?: number }[]): ChartSeries[] => [{ name: "S1", data }]

  it("renders one circle per point, positioned by numeric x across the x-domain", () => {
    const { container } = svg(
      renderScatter(scatter([{ x: 0, y: 0 }, { x: 10, y: 100 }]), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT),
    )
    const circles = Array.from(container.querySelectorAll("circle"))
    expect(circles).toHaveLength(2)
    // x=0 is the domain min → left edge; x=10 the max → right edge.
    expect(Number(circles[0].getAttribute("cx"))).toBeCloseTo(0)
    expect(Number(circles[1].getAttribute("cx"))).toBeCloseTo(W)
  })

  it("fits the y-domain to the data band with padding (not a zero baseline), so points fill the plot height", () => {
    // A narrow, all-positive high band [80,100]. A zero-anchored y (the old
    // shared line/bar domain [0,100]) crams both points into the top ~20% of
    // the plot; a data-fit y spreads them across nearly the full height.
    const { container } = svg(
      renderScatter(scatter([{ x: 1, y: 80 }, { x: 2, y: 100 }]), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT),
    )
    const cys = Array.from(container.querySelectorAll("circle")).map((c) => Number(c.getAttribute("cy")))
    const [lowCy, highCy] = cys // data order: y=80 first, y=100 second
    // Higher value sits higher up (smaller cy).
    expect(highCy).toBeLessThan(lowCy)
    // The two points span most of the plot height, not ~20% of it.
    expect(lowCy - highCy).toBeGreaterThan(PLOT_H * 0.7)
    // The smaller value sits low in the plot (bottom quarter), not near the top.
    expect(lowCy).toBeGreaterThan(PLOT_TOP + PLOT_H * 0.75)
  })

  it("uses a uniform small dot radius when no point carries a size", () => {
    const { container } = svg(
      renderScatter(scatter([{ x: 1, y: 2 }, { x: 3, y: 4 }]), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT),
    )
    const rs = Array.from(container.querySelectorAll("circle")).map((c) => Number(c.getAttribute("r")))
    expect(new Set(rs).size).toBe(1)
  })

  it("scales bubble radius by sqrt of size so a larger value reads as a larger bubble", () => {
    const { container } = svg(
      renderScatter(scatter([{ x: 1, y: 1, size: 1 }, { x: 2, y: 2, size: 100 }]), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT),
    )
    const rs = Array.from(container.querySelectorAll("circle")).map((c) => Number(c.getAttribute("r")))
    expect(rs[1]).toBeGreaterThan(rs[0])
  })

  it("centers a single-point scatter (degenerate x and y domains both map to the plot midpoint)", () => {
    const { container } = svg(renderScatter(scatter([{ x: 5, y: 5 }]), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const circles = container.querySelectorAll("circle")
    expect(circles).toHaveLength(1)
    const c = circles[0]!
    // Degenerate x-span → horizontal midpoint (was pinned to the left edge).
    expect(Number(c.getAttribute("cx"))).toBeCloseTo(W / 2)
    // Degenerate y-span → vertical midpoint of the plot area.
    expect(Number(c.getAttribute("cy"))).toBeCloseTo(PLOT_TOP + PLOT_H / 2)
  })

  it("colors each series from the palette in input order", () => {
    const two: ChartSeries[] = [
      { name: "A", data: [{ x: 1, y: 1 }] },
      { name: "B", data: [{ x: 2, y: 2 }] },
    ]
    const { container } = svg(renderScatter(two, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const circles = Array.from(container.querySelectorAll("circle"))
    expect(circles[0].getAttribute("fill")).toBe(PALETTE[0])
    expect(circles[1].getAttribute("fill")).toBe(PALETTE[1])
  })

  it("renders only svg2pptx-subset primitives", () => {
    const { container } = svg(
      renderScatter(scatter([{ x: 1, y: 2, size: 3 }, { x: 4, y: 8 }]), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT),
    )
    expect(() => assertSubset(container.querySelector("svg")!)).not.toThrow()
  })
})

describe("renderArea — filled line variant (chart-depth wave)", () => {
  const areaSeries = (...ys: number[]): ChartSeries[] => [{ name: "S1", data: ys.map((y, i) => ({ x: `C${i}`, y })) }]

  it("renders a semi-transparent filled polygon plus a stroke polyline per series", () => {
    const { container } = svg(renderArea(areaSeries(10, 20, 15), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    expect(container.querySelectorAll("polygon")).toHaveLength(1)
    expect(container.querySelectorAll("polyline")).toHaveLength(1)
    expect(container.querySelector("polygon")!.getAttribute("fill-opacity")).toBe("0.22")
  })

  it("closes the fill polygon down to the value-zero baseline", () => {
    const { container } = svg(renderArea(areaSeries(10, 20), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const pts = container.querySelector("polygon")!.getAttribute("points")!.trim().split(" ")
    const baselineYs = pts.slice(-2).map((p) => Number(p.split(",")[1]))
    for (const y of baselineYs) expect(y).toBeCloseTo(BASELINE_Y)
  })

  it("overlays multiple series (one fill + one stroke each), not stacked", () => {
    const two: ChartSeries[] = [
      { name: "A", data: [{ x: "C0", y: 10 }, { x: "C1", y: 20 }] },
      { name: "B", data: [{ x: "C0", y: 5 }, { x: "C1", y: 8 }] },
    ]
    const { container } = svg(renderArea(two, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    expect(container.querySelectorAll("polygon")).toHaveLength(2)
    expect(container.querySelectorAll("polyline")).toHaveLength(2)
  })

  it("renders category labels once (off series 0), not once per series", () => {
    const two: ChartSeries[] = [
      { name: "A", data: [{ x: "Jan", y: 10 }, { x: "Feb", y: 20 }] },
      { name: "B", data: [{ x: "Jan", y: 5 }, { x: "Feb", y: 8 }] },
    ]
    const { container } = svg(renderArea(two, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    expect(Array.from(container.querySelectorAll("text")).map((t) => t.textContent)).toEqual(["Jan", "Feb"])
  })

  it("renders only svg2pptx-subset primitives (single and multi series)", () => {
    const { container: a } = svg(renderArea(areaSeries(10, 20, 15), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    expect(() => assertSubset(a.querySelector("svg")!)).not.toThrow()
    const { container: b } = svg(
      renderArea(
        [
          { name: "A", data: [{ x: "C0", y: -4 }, { x: "C1", y: 8 }] },
          { name: "B", data: [{ x: "C0", y: 3 }, { x: "C1", y: 6 }] },
        ],
        PALETTE,
        0,
        0,
        W,
        H,
        MUTED,
        TEXT,
        ACCENT,
      ),
    )
    expect(() => assertSubset(b.querySelector("svg")!)).not.toThrow()
  })
})

describe("renderGauge — progress half-ring (chart-depth wave)", () => {
  const gaugeSeries = (y: number): ChartSeries[] => [{ name: "G", data: [{ x: "Done", y }] }]
  const gaugeComponent = (y: number, range?: { min?: number; max?: number }): ChartComponentFixture => ({
    type: "chart",
    chart_type: "gauge",
    ...(range ? { gauge: range } : {}),
    series: gaugeSeries(y),
  })

  it("renders a muted track, an accent progress arc, and the centered value", () => {
    const { container } = svg(renderGauge(gaugeSeries(62), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT, false, gaugeComponent(62)))
    expect(container.querySelectorAll("path")).toHaveLength(2)
    expect(Array.from(container.querySelectorAll("text")).some((t) => t.textContent === "62")).toBe(true)
  })

  it("0% renders the track but no filled value arc", () => {
    const { container } = svg(renderGauge(gaugeSeries(0), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT, false, gaugeComponent(0)))
    expect(container.querySelectorAll("path")).toHaveLength(1)
    expect(Array.from(container.querySelectorAll("text")).some((t) => t.textContent === "0")).toBe(true)
  })

  it("100% renders a full-sweep value arc", () => {
    const { container } = svg(renderGauge(gaugeSeries(100), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT, false, gaugeComponent(100)))
    expect(container.querySelectorAll("path")).toHaveLength(2)
  })

  it("honors a custom min/max range (150 of 0..200), printing the raw value", () => {
    const { container } = svg(
      renderGauge(gaugeSeries(150), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT, false, gaugeComponent(150, { min: 0, max: 200 })),
    )
    expect(Array.from(container.querySelectorAll("text")).some((t) => t.textContent === "150")).toBe(true)
  })

  it("the progress arc is a parseWedgePath-recognized ring band (hole-excluding attribution, never an AABB fallback)", () => {
    const { container } = svg(renderGauge(gaugeSeries(80), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT, false, gaugeComponent(80)))
    const valueArc = Array.from(container.querySelectorAll("path")).find((p) => p.getAttribute("fill") === ACCENT)!
    const sector = __parseWedgePath(valueArc.getAttribute("d")!)
    expect(sector).not.toBeNull()
    expect(sector!.ri).toBeGreaterThan(0)
    expect(sector!.ro).toBeGreaterThan(sector!.ri)
  })

  it("keeps the centered value's anchor inside the ring hole (distance from center < inner radius)", () => {
    // The number must land in the hollow so deck-audit attributes it to the
    // page background, not the arc band — the whole reason the arc uses the
    // annulus idiom. Assert the geometric precondition directly.
    const { container } = svg(renderGauge(gaugeSeries(80), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT, false, gaugeComponent(80)))
    const arc = __parseWedgePath(
      Array.from(container.querySelectorAll("path")).find((p) => p.getAttribute("fill") === ACCENT)!.getAttribute("d")!,
    )!
    const numText = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === "80")!
    const nx = Number(numText.getAttribute("x"))
    const ny = Number(numText.getAttribute("y"))
    const dist = Math.hypot(nx - arc.cx, ny - arc.cy)
    expect(dist).toBeLessThan(arc.ri)
  })

  it("renders only svg2pptx-subset primitives", () => {
    const { container } = svg(renderGauge(gaugeSeries(62), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT, false, gaugeComponent(62)))
    expect(() => assertSubset(container.querySelector("svg")!)).not.toThrow()
  })
})

describe("renderDonut — center-total toggle (chart-depth wave)", () => {
  const donutSeries: ChartSeries[] = [{ name: "S", data: [{ x: "A", y: 40 }, { x: "B", y: 60 }] }]
  const donutComponent = (center_total?: boolean): ChartComponentFixture => ({
    type: "chart",
    chart_type: "donut",
    ...(center_total !== undefined ? { center_total } : {}),
    series: donutSeries,
  })

  it("the dedicated donut subtype keeps the center empty by default", () => {
    const { container } = svg(renderDonut(donutSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT, false, donutComponent()))
    expect(container.querySelectorAll("text")).toHaveLength(0)
    expect(container.querySelectorAll("path")).toHaveLength(2)
  })

  it("center_total: true prints the summed total plus its caption", () => {
    const { container } = svg(renderDonut(donutSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT, false, donutComponent(true)))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).toContain("100")
    expect(texts).toContain("Total")
  })

  it("the legacy pie+style path (component undefined) still shows the center total — byte-compat", () => {
    const { container } = svg(renderDonut(donutSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    expect(Array.from(container.querySelectorAll("text")).map((t) => t.textContent)).toContain("100")
  })
})

describe("chart-depth renderers — deterministic double render (byte-identical)", () => {
  const scatterS: ChartSeries[] = [{ name: "S", data: [{ x: 1, y: 2, size: 5 }, { x: 3, y: 9 }] }]
  const areaS: ChartSeries[] = [
    { name: "A", data: [{ x: "C0", y: 10 }, { x: "C1", y: 20 }] },
    { name: "B", data: [{ x: "C0", y: 5 }, { x: "C1", y: 8 }] },
  ]
  const gaugeS: ChartSeries[] = [{ name: "G", data: [{ x: "Done", y: 62 }] }]
  const gaugeC: ChartComponentFixture = { type: "chart", chart_type: "gauge", series: gaugeS }
  const donutS: ChartSeries[] = [{ name: "S", data: [{ x: "A", y: 40 }, { x: "B", y: 60 }] }]
  const donutC: ChartComponentFixture = { type: "chart", chart_type: "donut", center_total: true, series: donutS }

  it("scatter is byte-identical across two renders", () => {
    expect(renderSvgMarkup(renderScatter(scatterS, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))).toBe(
      renderSvgMarkup(renderScatter(scatterS, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT)),
    )
  })
  it("area is byte-identical across two renders", () => {
    expect(renderSvgMarkup(renderArea(areaS, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))).toBe(
      renderSvgMarkup(renderArea(areaS, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT)),
    )
  })
  it("gauge is byte-identical across two renders", () => {
    expect(renderSvgMarkup(renderGauge(gaugeS, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT, false, gaugeC))).toBe(
      renderSvgMarkup(renderGauge(gaugeS, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT, false, gaugeC)),
    )
  })
  it("donut (new subtype, center on) is byte-identical across two renders", () => {
    expect(renderSvgMarkup(renderDonut(donutS, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT, false, donutC))).toBe(
      renderSvgMarkup(renderDonut(donutS, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT, false, donutC)),
    )
  })
})
