// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderBar, renderBarHorizontal, renderLine, renderFunnel, renderDonut, renderDumbbell } from "./chart-svg"
import { assertSubset } from "../subset-validate"
import type { ChartSeries } from "@/ir"

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

  it("does not alter existing category/value labels", () => {
    const { container } = svg(
      renderBar(seriesOf(100, 200), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT),
    )
    const texts = Array.from(container.querySelectorAll("text"))
    expect(texts).toHaveLength(4)
    const categories = texts.filter((t) => t.getAttribute("fill") === MUTED)
    const values = texts.filter((t) => t.getAttribute("fill") === TEXT)
    expect(categories.map((t) => t.textContent)).toEqual(["C0", "C1"])
    expect(values.map((t) => t.textContent)).toEqual(["100", "200"])
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

  it("gives two series within one line chart distinct area-gradient ids", () => {
    const twoSeries: ChartSeries[] = [
      { name: "A", data: [{ x: "a", y: 1 }, { x: "b", y: 5 }] },
      { name: "B", data: [{ x: "a", y: 3 }, { x: "b", y: 2 }] },
    ]
    const { container } = svg(renderLine(twoSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const ids = Array.from(container.querySelectorAll("linearGradient")).map((g) => g.getAttribute("id"))
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
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
  it("renders exactly 3 horizontal reference lines for a bar chart, none on the baseline", () => {
    const { container } = svg(renderBar(seriesOf(10, 20, 15), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
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
    const { container } = svg(renderBar(seriesOf(10, 20), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    const ys = Array.from(container.querySelectorAll("line"))
      .map((l) => Number(l.getAttribute("y1")))
      .sort((a, b) => a - b)
    expect(ys).toEqual([
      PLOT_TOP + PLOT_H * 0.25,
      PLOT_TOP + PLOT_H * 0.5,
      PLOT_TOP + PLOT_H * 0.75,
    ])
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

  it("renderBar: a realistic-magnitude negative value (ratio well under the ceiling) renders byte-identically to the pre-fix formula", () => {
    // Hand-computed from the pre-fix formula (`barH = (d.y / max) * plotH`)
    // -- the clamp must be a complete no-op whenever the raw ratio's
    // magnitude is nowhere near MAX_CHART_GEOMETRY_PX, which every realistic
    // (even quite extreme, e.g. -12 against a max of 5) mixed-sign chart is.
    const { container } = svg(
      renderBar(seriesOf(-12, 5), PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT),
    )
    const rects = Array.from(container.querySelectorAll("rect"))
    const max = Math.max(-12, 5, 1)
    const rawBarH = (-12 / max) * PLOT_H
    expect(Number(rects[0].getAttribute("height"))).toBeCloseTo(rawBarH)
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

  it("multi-series line chart (multiple gradient defs on one page) passes assertSubset", () => {
    const twoSeries: ChartSeries[] = [
      { name: "A", data: [{ x: "a", y: 1 }, { x: "b", y: 5 }] },
      { name: "B", data: [{ x: "a", y: 3 }, { x: "b", y: 2 }] },
    ]
    const { container } = svg(renderLine(twoSeries, PALETTE, 0, 0, W, H, MUTED, TEXT, ACCENT))
    expect(() => assertSubset(container.querySelector("svg")!)).not.toThrow()
  })
})
