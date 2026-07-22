// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { auditSvgMarkup } from "../audit/svg-audit"
import { chart } from "./chart"
import type { ComponentCtx } from "./types"

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFFFFF",
    surface: "#F4F4F4",
    primary: "#006A4E",
    accent: "#00A878",
    text: "#1A2421",
    muted: "#5D6B65",
    chartPalette: ["#006A4E", "#00A878", "#FF6B35", "#FFD166"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

const box = { x: 80, y: 100, w: 1120 }

describe("chart component", () => {
  it("measure returns 240", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: [{ name: "S1", data: [{ x: "A", y: 10 }] }],
    }
    expect(chart.measure(component, 1120, ctx)).toBe(240)
  })

  it("bar chart renders at least one rect per data point", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: [
        {
          name: "Revenue",
          data: [
            { x: "Q1", y: 100 },
            { x: "Q2", y: 200 },
            { x: "Q3", y: 150 },
          ],
        },
      ],
    }
    const { container } = svg(chart.render(component, box, ctx))
    const rects = container.querySelectorAll("rect")
    expect(rects.length).toBeGreaterThanOrEqual(3)
  })

  it("pie chart renders one path per data sector", () => {
    const component = {
      type: "chart" as const,
      chart_type: "pie" as const,
      series: [
        {
          name: "Market",
          data: [
            { x: "A", y: 40 },
            { x: "B", y: 30 },
            { x: "C", y: 20 },
            { x: "D", y: 10 },
          ],
        },
      ],
    }
    const { container } = svg(chart.render(component, box, ctx))
    const paths = container.querySelectorAll("path")
    expect(paths.length).toBe(4)
  })

  it("line chart renders polyline elements", () => {
    const component = {
      type: "chart" as const,
      chart_type: "line" as const,
      series: [
        {
          name: "Trend",
          data: [
            { x: 1, y: 10 },
            { x: 2, y: 30 },
            { x: 3, y: 20 },
          ],
        },
      ],
    }
    const { container } = svg(chart.render(component, box, ctx))
    const polylines = container.querySelectorAll("polyline")
    expect(polylines.length).toBeGreaterThanOrEqual(1)
  })

  it("does not contain nested svg elements", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: [
        {
          name: "S1",
          data: [
            { x: "A", y: 10 },
            { x: "B", y: 20 },
          ],
        },
      ],
    }
    const { container } = svg(chart.render(component, box, ctx))
    const nested = container.querySelectorAll("svg svg")
    expect(nested.length).toBe(0)
  })

  it("wraps output in a translated g element", () => {
    const component = {
      type: "chart" as const,
      chart_type: "funnel" as const,
      series: [
        {
          name: "Funnel",
          data: [
            { x: "Step1", y: 100 },
            { x: "Step2", y: 60 },
          ],
        },
      ],
    }
    const { container } = svg(chart.render(component, box, ctx))
    const g = container.querySelector("g")
    expect(g?.getAttribute("transform")).toBe("translate(80,100)")
  })

  it("bar chart renders a muted category label and a value label per bar", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: [
        {
          name: "Revenue",
          data: [
            { x: "Q1", y: 100 },
            { x: "Q2", y: 200 },
          ],
        },
      ],
    }
    const { container } = svg(chart.render(component, box, ctx))
    const texts = Array.from(container.querySelectorAll("text"))
    expect(texts).toHaveLength(4) // 2 bars * (category + value)

    const categories = texts.filter((t) => t.getAttribute("fill") === ctx.colors.muted)
    const values = texts.filter((t) => t.getAttribute("fill") === ctx.colors.text)
    expect(categories.map((t) => t.textContent)).toEqual(["Q1", "Q2"])
    expect(values.map((t) => t.textContent)).toEqual(["100", "200"])
    for (const t of texts) {
      expect(t.getAttribute("text-anchor")).toBe("middle")
    }
  })

  it("bar chart shrinks (fitSvgLine) a category label longer than the bar's width", () => {
    const longLabel = "微服务架构下的分布式事务一致性保障机制与补偿策略".repeat(2).slice(0, 24)
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: [{ name: "S1", data: [{ x: longLabel, y: 10 }] }],
    }
    // A single bar spans the whole 1120px box — a 24-char CJK label at the
    // default 11px would be far wider than that, so fitSvgLine must shrink
    // it down to (or truncate it at) the configured minimum font size.
    const { container } = svg(chart.render(component, box, ctx))
    const category = Array.from(container.querySelectorAll("text")).find(
      (t) => t.getAttribute("fill") === ctx.colors.muted,
    )!
    expect(Number(category.getAttribute("font-size"))).toBeLessThanOrEqual(11)
    expect(Number(category.getAttribute("font-size"))).toBeGreaterThanOrEqual(8)
  })

  it("line chart renders a category label per point and value labels only at the endpoints", () => {
    const component = {
      type: "chart" as const,
      chart_type: "line" as const,
      series: [
        {
          name: "Trend",
          data: [
            { x: "Jan", y: 10 },
            { x: "Feb", y: 30 },
            { x: "Mar", y: 20 },
          ],
        },
      ],
    }
    const { container } = svg(chart.render(component, box, ctx))
    const texts = Array.from(container.querySelectorAll("text"))
    const categories = texts.filter((t) => t.getAttribute("fill") === ctx.colors.muted)
    const values = texts.filter((t) => t.getAttribute("fill") === ctx.colors.text)
    expect(categories.map((t) => t.textContent)).toEqual(["Jan", "Feb", "Mar"])
    expect(values.map((t) => t.textContent)).toEqual(["10", "20"]) // first + last only
  })

  // Task 8: chart.tsx must thread ctx.colors.accent through to the renderer
  // for the gradient/emphasis work in chart-svg.tsx to use the real theme
  // accent (not a stand-in) — see chart-svg.test.tsx for the full behavior.
  it("wires ctx.colors.accent through to the bar renderer's max-bar highlight", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: [
        {
          name: "Revenue",
          data: [
            { x: "Q1", y: 100 },
            { x: "Q2", y: 200 },
          ],
        },
      ],
    }
    const { container } = svg(chart.render(component, box, ctx))
    const rects = Array.from(container.querySelectorAll("rect"))
    const maxBar = rects.find((r) => r.getAttribute("fill") === ctx.colors.accent)
    expect(maxBar).toBeTruthy()
  })

  it("wires ctx.colors.accent through to the line renderer's endpoint marker", () => {
    const component = {
      type: "chart" as const,
      chart_type: "line" as const,
      series: [{ name: "Trend", data: [{ x: 1, y: 10 }, { x: 2, y: 30 }] }],
    }
    const { container } = svg(chart.render(component, box, ctx))
    const dot = Array.from(container.querySelectorAll("circle")).find(
      (c) => c.getAttribute("r") === "4",
    )
    expect(dot?.getAttribute("fill")).toBe(ctx.colors.accent)
  })
})

// `component.axes` (x_title/y_title/show_grid — src/ir/index.ts) was
// schema-accepted but never read by this file: a model emitting `axes` got
// silence, discovered during the matrix.tsx y_title work and recorded as a
// dead field. This block makes it real for the applicable chart types
// (bar, including direction="horizontal", and line) and pins that every other
// chart_type (pie, funnel, dumbbell) renders byte-identically whether or not
// `axes` is present — the applicability matrix lives in chart.tsx's own
// `AXES_APPLICABLE_TYPES` doc comment.
describe("chart component — axes (x_title/y_title/show_grid)", () => {
  const barSeries = [
    { name: "Revenue", data: [{ x: "Q1", y: 100 }, { x: "Q2", y: 200 }] },
  ]

  it("measure() grows by a fixed extra amount when x_title is present on an applicable type (bar)", () => {
    const base = { type: "chart" as const, chart_type: "bar" as const, series: barSeries }
    const withTitle = { ...base, axes: { x_title: "Quarter" } }
    const withLongerTitle = { ...base, axes: { x_title: "A Much Longer Quarter Axis Title" } }
    const baseH = chart.measure(base, 1120, ctx)
    const withTitleH = chart.measure(withTitle, 1120, ctx)
    const withLongerTitleH = chart.measure(withLongerTitle, 1120, ctx)
    expect(withTitleH).toBeGreaterThan(baseH)
    // The reserved band is a fixed height, not proportional to title length —
    // fitSvgLine shrinks/truncates the title to fit inside it instead.
    expect(withLongerTitleH).toBe(withTitleH)
  })

  it("measure() does not grow for y_title alone (it reserves width inside box.w, not height)", () => {
    const base = { type: "chart" as const, chart_type: "bar" as const, series: barSeries }
    const withYTitle = { ...base, axes: { y_title: "Revenue ($K)" } }
    expect(chart.measure(withYTitle, 1120, ctx)).toBe(chart.measure(base, 1120, ctx))
  })

  it("measure() ignores axes on a non-applicable chart_type (pie)", () => {
    const pieSeries = [{ name: "Market", data: [{ x: "A", y: 40 }, { x: "B", y: 60 }] }]
    const base = { type: "chart" as const, chart_type: "pie" as const, series: pieSeries }
    const withAxes = { ...base, axes: { x_title: "Segment", y_title: "Share" } }
    expect(chart.measure(withAxes, 1120, ctx)).toBe(chart.measure(base, 1120, ctx))
  })

  it("renders x_title fitted below the plot and y_title stacked beside it, for a bar chart", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { x_title: "Quarter", y_title: "USD" },
    }
    const { container } = svg(chart.render(component, box, ctx))
    const texts = Array.from(container.querySelectorAll("text"))
    const xTitle = texts.find((t) => t.textContent === "Quarter")
    expect(xTitle).toBeTruthy()
    expect(xTitle?.getAttribute("data-truncated")).toBeNull()

    // y_title is stacked one character per <text> node (matrix.tsx's own
    // vertical-title idiom, adapted) — every character of "USD" must appear.
    const yChars = texts.filter((t) => ["U", "S", "D"].includes(t.textContent ?? ""))
    expect(yChars.length).toBeGreaterThanOrEqual(3)
  })

  it("renders x_title for bar direction=horizontal too (bar-horizontal is AXES_APPLICABLE via chart_type 'bar')", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      direction: "horizontal" as const,
      series: barSeries,
      axes: { x_title: "Amount" },
    }
    const { container } = svg(chart.render(component, box, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).toContain("Amount")
  })

  it("renders x_title/y_title for a line chart", () => {
    const component = {
      type: "chart" as const,
      chart_type: "line" as const,
      series: [{ name: "Trend", data: [{ x: 1, y: 10 }, { x: 2, y: 30 }] }],
      axes: { x_title: "Month", y_title: "Value" },
    }
    const { container } = svg(chart.render(component, box, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).toContain("Month")
    expect(texts.filter((t) => ["V", "a", "l", "u", "e"].includes(t ?? "")).length).toBeGreaterThanOrEqual(5)
  })

  // F1 (review round, moderate defect): a line chart's first-point value
  // label could render with its ink flush against the y_title band — a real
  // render measured only ~10px between the y_title's own character center
  // and the plot's x0 (roughly half a glyph-width of true clearance),
  // reproduced by a first point landing near CHART_H's vertical midband
  // (data y:[50,100] — first=50 is exactly half of max=100). Fixed
  // structurally: the plot's x-origin now shifts right by the y_title band
  // width *plus* a dedicated gap, not just the band width alone, so the two
  // regions cannot become geometrically adjacent regardless of content.
  it("reserves a real horizontal gap between the y_title band and the plot — line chart, reviewer's exact repro (low-but-midband first point)", () => {
    const component = {
      type: "chart" as const,
      chart_type: "line" as const,
      series: [{ name: "Trend", data: [{ x: "Jan", y: 50 }, { x: "Feb", y: 100 }] }],
      axes: { y_title: "Value" },
    }
    const { container } = svg(chart.render(component, box, ctx))
    const texts = Array.from(container.querySelectorAll("text"))
    const yTitleXs = texts
      .filter((t) => ["V", "a", "l", "u", "e"].includes(t.textContent ?? ""))
      .map((t) => Number(t.getAttribute("x")))
    expect(new Set(yTitleXs).size).toBe(1) // all stacked chars share one column x
    const yTitleX = yTitleXs[0]!

    // The first point's own value label ("50", text-anchor="start") sits at
    // the plot's x0 — the tightest point any plotted content ever gets to
    // the y_title band.
    const firstValueLabel = texts.find((t) => t.textContent === "50")!
    const plotX0 = Number(firstValueLabel.getAttribute("x"))

    // A single glyph at AXES_TITLE_SIZE (11px) is at most ~11px wide, so a
    // centered character's own ink never reaches past yTitleX + 5.5px — a
    // >=15px gap from yTitleX to plotX0 leaves real, content-independent
    // clearance rather than a coincidental non-overlap for this one string.
    // (Pre-fix this measured exactly 10px on a real render — this threshold
    // fails against the pre-fix reservation and passes post-fix.)
    expect(plotX0 - yTitleX).toBeGreaterThanOrEqual(15)
  })

  it("x_title-only decks do not gain the y_title gutter — the plot stays flush at box.x (byte-identical to no-axes)", () => {
    const noAxes = { type: "chart" as const, chart_type: "bar" as const, series: barSeries }
    const xTitleOnly = { ...noAxes, axes: { x_title: "Quarter" } }
    const rectsBase = svg(chart.render(noAxes, box, ctx)).container.querySelectorAll("rect")
    const rectsXTitle = svg(chart.render(xTitleOnly, box, ctx)).container.querySelectorAll("rect")
    // Same bar geometry (x/width) in both — the x_title band only adds
    // height below the plot, it must not shift or narrow the plot itself.
    expect(rectsXTitle[0]!.getAttribute("x")).toBe(rectsBase[0]!.getAttribute("x"))
    expect(rectsXTitle[0]!.getAttribute("width")).toBe(rectsBase[0]!.getAttribute("width"))
  })

  it("reserves the same real gap for bar-horizontal's row labels against the y_title band (F1 — verified for bar-horizontal too)", () => {
    const longLabel = "A Very Long Row Label That Forces The Full Fitted Width Budget"
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      direction: "horizontal" as const,
      series: [{ name: "Revenue", data: [{ x: longLabel, y: 100 }, { x: "Short", y: 50 }] }],
      axes: { y_title: "Category" },
    }
    const { container } = svg(chart.render(component, box, ctx))
    const texts = Array.from(container.querySelectorAll("text"))
    const yTitleX = Number(
      texts.find((t) => t.textContent === "C" && t.getAttribute("text-anchor") === "middle")!.getAttribute("x"),
    )
    const rowLabel = texts.find((t) => t.getAttribute("font-weight") === "600")!
    expect(rowLabel.getAttribute("data-truncated")).toBe("1") // confirms it hit the full-width fit budget
    // BAR_H_LABEL_W is 110 (chart-svg.tsx) — the label's text-anchor="end"
    // point sits at x0 + 110, so x0 = anchorX - 110 regardless of the gap's
    // value — this infers the real plot x0 the same way the label's own
    // worst-case (maximally fitted) left edge would land on it.
    const anchorX = Number(rowLabel.getAttribute("x"))
    const inferredX0 = anchorX - 110
    expect(inferredX0 - yTitleX).toBeGreaterThanOrEqual(15)
  })

  it("does not render axes titles on a non-applicable chart_type (pie) even when axes is set — field is honestly ignored, not silently accepted", () => {
    const pieSeries = [{ name: "Market", data: [{ x: "A", y: 40 }, { x: "B", y: 60 }] }]
    const component = {
      type: "chart" as const,
      chart_type: "pie" as const,
      series: pieSeries,
      axes: { x_title: "Segment", y_title: "Share", show_grid: true },
    }
    const { container } = svg(chart.render(component, box, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).not.toContain("Segment")
    expect(texts).not.toContain("Share")
  })

  it("does not render axes titles for funnel or dumbbell (not AXES_APPLICABLE_TYPES)", () => {
    const funnelComponent = {
      type: "chart" as const,
      chart_type: "funnel" as const,
      series: [{ name: "Funnel", data: [{ x: "Step1", y: 100 }, { x: "Step2", y: 50 }] }],
      axes: { x_title: "Stage", y_title: "Count" },
    }
    const dumbbellComponent = {
      type: "chart" as const,
      chart_type: "dumbbell" as const,
      series: [
        { name: "From", data: [{ x: "A", y: 10 }] },
        { name: "To", data: [{ x: "A", y: 20 }] },
      ],
      axes: { x_title: "Stage", y_title: "Count" },
    }
    for (const component of [funnelComponent, dumbbellComponent]) {
      const { container } = svg(chart.render(component, box, ctx))
      const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
      expect(texts).not.toContain("Stage")
      expect(texts).not.toContain("Count")
    }
  })

  it("show_grid=false suppresses the bar chart's existing gridlines", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { show_grid: false },
    }
    const { container } = svg(chart.render(component, box, ctx))
    expect(container.querySelectorAll("line")).toHaveLength(0)
  })

  it("show_grid omitted or true keeps the bar chart's pre-existing gridlines (byte-identical default)", () => {
    const withTrue = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { show_grid: true },
    }
    const withUndefined = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { x_title: "Quarter" },
    }
    expect(svg(chart.render(withTrue, box, ctx)).container.querySelectorAll("line")).toHaveLength(3)
    expect(
      svg(chart.render(withUndefined, box, ctx)).container.querySelectorAll("line"),
    ).toHaveLength(3)
  })

  it("show_grid=true renders new vertical gridlines on bar-horizontal (a real opt-in, not a dead toggle)", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      direction: "horizontal" as const,
      series: barSeries,
      axes: { show_grid: true },
    }
    const { container } = svg(chart.render(component, box, ctx))
    expect(container.querySelectorAll("line")).toHaveLength(3)
  })

  it("axes absent renders byte-identical markup to axes explicitly set to an empty object", () => {
    const withoutAxesKey = { type: "chart" as const, chart_type: "bar" as const, series: barSeries }
    const withEmptyAxes = { ...withoutAxesKey, axes: {} }
    const a = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{chart.render(withoutAxesKey, box, ctx)}</svg>,
    )
    const b = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{chart.render(withEmptyAxes, box, ctx)}</svg>,
    )
    expect(a).toBe(b)
    expect(chart.measure(withoutAxesKey, 1120, ctx)).toBe(chart.measure(withEmptyAxes, 1120, ctx))
  })

  it("fits an egregiously long x_title within its declared box instead of overflowing it, truncating with data-truncated (real-render h-overflow oracle)", () => {
    const egregious = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { x_title: "超长坐标轴标题".repeat(12) },
    }
    // A narrow 300px box (vs. the shared 1120px `box`) — 84 CJK chars at
    // fontSize 11 fits comfortably inside 1120px with room to spare, so it
    // wouldn't actually exercise the truncate branch there.
    const narrowBox = { x: 60, y: 200, w: 300 }
    const h = chart.measure(egregious, narrowBox.w, ctx)
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        <g
          data-audit-box={`${narrowBox.x},${narrowBox.y},${narrowBox.w}`}
          data-audit-rect={`${narrowBox.x},${narrowBox.y},${narrowBox.w},${h}`}
        >
          {chart.render(egregious, narrowBox, ctx)}
        </g>
      </svg>,
    )
    const overflow = auditSvgMarkup(markup).filter((i) => i.kind === "h-overflow" || i.kind === "v-overflow")
    expect(overflow).toEqual([])

    const root = parseSvgRoot(markup)
    const xTitleText = Array.from(root.querySelectorAll("text")).find((t) =>
      t.textContent?.includes("超长坐标轴标题"),
    )
    expect(xTitleText).toBeTruthy()
    expect(xTitleText?.getAttribute("data-truncated")).toBe("1")
  })

  it("caps an egregiously long y_title's stacked-character column within its available height, truncating with data-truncated", () => {
    const egregious = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { y_title: "超长坐标轴标题".repeat(12) },
    }
    const h = chart.measure(egregious, box.w, ctx)
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        <g data-audit-box={`${box.x},${box.y},${box.w}`} data-audit-rect={`${box.x},${box.y},${box.w},${h}`}>
          {chart.render(egregious, box, ctx)}
        </g>
      </svg>,
    )
    const overflow = auditSvgMarkup(markup).filter((i) => i.kind === "h-overflow" || i.kind === "v-overflow")
    expect(overflow).toEqual([])

    const root = parseSvgRoot(markup)
    const truncatedNodes = Array.from(root.querySelectorAll('text[data-truncated="1"]'))
    expect(truncatedNodes.length).toBeGreaterThanOrEqual(1)
    expect(truncatedNodes.some((t) => t.textContent === "…")).toBe(true)
  })

  it("renders only svg2pptx-subset primitives with axes present", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { x_title: "Quarter", y_title: "USD", show_grid: true },
    }
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{chart.render(component, box, ctx)}</svg>,
    )
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
  })
})
