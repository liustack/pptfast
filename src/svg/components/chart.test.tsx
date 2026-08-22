// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import type { PptxIR } from "@/ir"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { auditSvgMarkup } from "../audit/svg-audit"
import { auditDeck } from "../audit/deck-audit"
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
    // default 13px would be far wider than that, so fitSvgLine must shrink
    // it down to (or truncate it at) the configured minimum font size.
    const { container } = svg(chart.render(component, box, ctx))
    const category = Array.from(container.querySelectorAll("text")).find(
      (t) => t.getAttribute("fill") === ctx.colors.muted,
    )!
    expect(Number(category.getAttribute("font-size"))).toBeLessThanOrEqual(13)
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

  it("measure() does not grow for x_title — the field is accepted and not drawn (label-tuning A)", () => {
    const base = { type: "chart" as const, chart_type: "bar" as const, series: barSeries }
    const withTitle = { ...base, axes: { x_title: "Quarter" } }
    const withLongerTitle = { ...base, axes: { x_title: "A Much Longer Quarter Axis Title" } }
    expect(chart.measure(withTitle, 1120, ctx)).toBe(chart.measure(base, 1120, ctx))
    expect(chart.measure(withLongerTitle, 1120, ctx)).toBe(chart.measure(base, 1120, ctx))
  })

  it("measure() does not grow for a CJK y_title — the caption takes a left sidebar, not height", () => {
    const base = { type: "chart" as const, chart_type: "bar" as const, series: barSeries }
    const withCjk = { ...base, axes: { y_title: "营业收入" } }
    expect(chart.measure(withCjk, 1120, ctx)).toBe(chart.measure(base, 1120, ctx))
  })

  it("measure() grows by the header row for a Latin y_title — the caption returns to the header", () => {
    const base = { type: "chart" as const, chart_type: "bar" as const, series: barSeries }
    const withLatin = { ...base, axes: { y_title: "Revenue" } }
    expect(chart.measure(withLatin, 1120, ctx)).toBe(chart.measure(base, 1120, ctx) + 52)
  })

  it("measure() ignores axes on a non-applicable chart_type (pie)", () => {
    const pieSeries = [{ name: "Market", data: [{ x: "A", y: 40 }, { x: "B", y: 60 }] }]
    const base = { type: "chart" as const, chart_type: "pie" as const, series: pieSeries }
    const withAxes = { ...base, axes: { x_title: "Segment", y_title: "Share" } }
    expect(chart.measure(withAxes, 1120, ctx)).toBe(chart.measure(base, 1120, ctx))
  })

  it("does not render x_title, and stacks a CJK y_title on the left (not a header line)", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { x_title: "Quarter", y_title: "美元" },
    }
    const { container } = svg(chart.render(component, box, ctx))
    const texts = Array.from(container.querySelectorAll("text"))
    expect(texts.find((t) => t.textContent === "Quarter")).toBeUndefined()
    expect(texts.find((t) => t.textContent === "美元")).toBeUndefined()
    const stacked = texts.filter((t) => t.textContent === "美" || t.textContent === "元")
    expect(stacked).toHaveLength(2)
    expect(stacked[0]?.getAttribute("font-size")).toBe("14")
    expect(stacked[0]?.getAttribute("fill")).toBe(ctx.colors.muted)
  })

  it("does not render x_title for bar direction=horizontal either (still AXES_APPLICABLE, still not drawn)", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      direction: "horizontal" as const,
      series: barSeries,
      axes: { x_title: "Amount" },
    }
    const { container } = svg(chart.render(component, box, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).not.toContain("Amount")
  })

  it("renders a stacked CJK y_title on a line chart, and does not paint x_title", () => {
    const component = {
      type: "chart" as const,
      chart_type: "line" as const,
      series: [{ name: "Trend", data: [{ x: 1, y: 10 }, { x: 2, y: 30 }] }],
      axes: { x_title: "Month", y_title: "数值" },
    }
    const { container } = svg(chart.render(component, box, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).not.toContain("Month")
    expect(texts).not.toContain("数值")
    expect(texts.filter((t) => t === "数" || t === "值")).toEqual(["数", "值"])
  })

  it("a CJK y_title steals a 36px side band and does not shift the plot down (no header without a legend)", () => {
    const noAxes = { type: "chart" as const, chart_type: "bar" as const, series: barSeries }
    const withYTitle = { ...noAxes, axes: { y_title: "数值" } }
    const base = svg(chart.render(noAxes, box, ctx)).container.querySelector("rect")!
    const titled = svg(chart.render(withYTitle, box, ctx)).container.querySelector("rect")!
    expect(Number(titled.getAttribute("x")) - Number(base.getAttribute("x"))).toBe(36)
    expect(titled.getAttribute("y")).toBe(base.getAttribute("y"))
  })

  it("x_title-only decks do not shift or grow the plot — the field is accepted and not drawn", () => {
    const noAxes = { type: "chart" as const, chart_type: "bar" as const, series: barSeries }
    const xTitleOnly = { ...noAxes, axes: { x_title: "Quarter" } }
    const rectsBase = svg(chart.render(noAxes, box, ctx)).container.querySelectorAll("rect")
    const rectsXTitle = svg(chart.render(xTitleOnly, box, ctx)).container.querySelectorAll("rect")
    expect(rectsXTitle[0]!.getAttribute("x")).toBe(rectsBase[0]!.getAttribute("x"))
    expect(rectsXTitle[0]!.getAttribute("width")).toBe(rectsBase[0]!.getAttribute("width"))
    expect(rectsXTitle[0]!.getAttribute("y")).toBe(rectsBase[0]!.getAttribute("y"))
    expect(chart.measure(xTitleOnly, 1120, ctx)).toBe(chart.measure(noAxes, 1120, ctx))
  })

  describe("y_title: CJK stacks on the left, Latin and digits return to the header", () => {
    const latin = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { x_title: "Quarter", y_title: "Connected equipment" },
    }

    it("renders the whole Latin phrase on one <text> in the header, with no letter split and no rotate", () => {
      const { container } = svg(chart.render(latin, box, ctx))
      const texts = Array.from(container.querySelectorAll("text"))
      const yTitle = texts.find((t) => t.textContent === "Connected equipment")
      expect(yTitle).toBeTruthy()
      expect(texts.map((t) => t.textContent)).not.toContain("Quarter")
      expect(texts.filter((t) => t.textContent === "C" || t.textContent === "o")).toHaveLength(0)
      expect(yTitle!.getAttribute("y")).toBe("16")
      expect(yTitle!.getAttribute("x")).toBe("0")
      expect(yTitle!.getAttribute("font-size")).toBe("12")
      expect(yTitle!.getAttribute("fill")).toBe(ctx.colors.muted)
      expect(yTitle!.getAttribute("transform")).toBeNull()
    })

    it("gives CJK a 36px sidebar and leaves Latin on the full-width plot", () => {
      const noYTitle = { type: "chart" as const, chart_type: "bar" as const, series: barSeries }
      const barX = (component: typeof latin | typeof noYTitle) =>
        Number(svg(chart.render(component, box, ctx)).container.querySelector("rect")!.getAttribute("x"))
      expect(barX(latin)).toBe(barX(noYTitle))
      const cjk = { ...latin, axes: { y_title: "设备联网量" } }
      expect(barX(cjk) - barX(noYTitle)).toBe(36)
    })

    it("measure() stays flat for a CJK y_title and grows a fixed header for a Latin one", () => {
      const noYTitle = { type: "chart" as const, chart_type: "bar" as const, series: barSeries }
      const cjk = { ...latin, axes: { y_title: "设备联网量" } }
      expect(chart.measure(cjk, 1120, ctx)).toBe(chart.measure(noYTitle, 1120, ctx))
      expect(chart.measure(latin, 1120, ctx)).toBe(chart.measure(noYTitle, 1120, ctx) + 52)
      expect(
        chart.measure({ ...latin, axes: { y_title: "A".repeat(80) } }, 1120, ctx),
      ).toBe(chart.measure(latin, 1120, ctx))
    })

    it("pushes the plot down for a Latin y_title alone, and sits the caption on the header baseline", () => {
      const noYTitle = { type: "chart" as const, chart_type: "bar" as const, series: barSeries }
      const bandTop = (component: typeof latin | typeof noYTitle) =>
        Number(
          Array.from(svg(chart.render(component, box, ctx)).container.querySelectorAll("rect"))
            .map((el) => Number(el.getAttribute("y")))
            .reduce((a, b) => Math.min(a, b)),
        )
      expect(bandTop(latin) - bandTop(noYTitle)).toBe(52)
      const yTitle = Array.from(
        svg(chart.render(latin, box, ctx)).container.querySelectorAll("text"),
      ).find((t) => t.textContent === "Connected equipment")!
      expect(Number(yTitle.getAttribute("y"))).toBe(16)
    })

    it("fits an egregiously long Latin y_title, truncation-marked rather than overflowing", () => {
      const egregious = {
        ...latin,
        axes: { y_title: "Connected equipment across every validated industry setting ".repeat(4) },
      }
      const { container } = svg(chart.render(egregious, box, ctx))
      const yTitle = Array.from(container.querySelectorAll("text")).find((t) =>
        t.textContent?.startsWith("Connected equipment"),
      )!
      expect(yTitle.getAttribute("data-truncated")).toBe("1")
      expect(yTitle.textContent?.endsWith("…")).toBe(true)
      expect(yTitle.getAttribute("transform")).toBeNull()
      expect(yTitle.getAttribute("y")).toBe("16")
    })

    it("still reserves nothing at all on a non-applicable chart_type (pie)", () => {
      const pie = {
        type: "chart" as const,
        chart_type: "pie" as const,
        series: [{ name: "Market", data: [{ x: "A", y: 40 }, { x: "B", y: 60 }] }],
      }
      expect(chart.measure({ ...pie, axes: { y_title: "Share" } }, 1120, ctx)).toBe(
        chart.measure(pie, 1120, ctx),
      )
    })
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

  // Round-4 review (`journal p05`): a bar chart draws no gridlines unless the
  // author asks for them. `renderBar`'s own `showGrid` doc comment carries
  // the reasoning — every bar already prints its value, so the reference
  // lines were duplicate ink cutting across the bars.
  it("a bar chart draws no gridlines by default, with or without an axes key", () => {
    const bare = { type: "chart" as const, chart_type: "bar" as const, series: barSeries }
    const withOtherAxes = { ...bare, axes: { x_title: "Quarter" } }
    const withFalse = { ...bare, axes: { show_grid: false } }
    for (const component of [bare, withOtherAxes, withFalse]) {
      expect(svg(chart.render(component, box, ctx)).container.querySelectorAll("line")).toHaveLength(
        0,
      )
    }
  })

  it("show_grid=true opts a bar chart's gridlines back in (a live toggle, not a dead one)", () => {
    const withTrue = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { show_grid: true },
    }
    expect(svg(chart.render(withTrue, box, ctx)).container.querySelectorAll("line")).toHaveLength(3)
  })

  it("a line chart keeps its gridlines by default — only bar lost them", () => {
    const lineComponent = {
      type: "chart" as const,
      chart_type: "line" as const,
      series: barSeries,
    }
    expect(svg(chart.render(lineComponent, box, ctx)).container.querySelectorAll("line")).toHaveLength(
      3,
    )
    const suppressed = { ...lineComponent, axes: { show_grid: false } }
    expect(svg(chart.render(suppressed, box, ctx)).container.querySelectorAll("line")).toHaveLength(0)
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

  it("an egregiously long x_title is not painted at all, and the plot still does not overflow", () => {
    const egregious = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { x_title: "超长坐标轴标题".repeat(12) },
    }
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
    expect(xTitleText).toBeUndefined()
  })

  it("fits an egregiously long CJK y_title in the sidebar, truncation-marked on the stacked column", () => {
    const egregious = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { y_title: "超长坐标轴标题".repeat(12) },
    }
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
    const truncatedNodes = Array.from(root.querySelectorAll('text[data-truncated="1"]'))
    expect(truncatedNodes.length).toBeGreaterThanOrEqual(1)
    expect(truncatedNodes.some((t) => t.textContent === "…")).toBe(true)
    expect(Array.from(root.querySelectorAll("text")).some((t) => t.textContent === "超")).toBe(true)
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

// Legend (R1 evidence wave, Task T2 — roadmap §6.1.2's legend model,
// rendering half). `n==1` byte-compat is already proven bit-for-bit by
// chart-svg.golden.test.ts's own "chart component golden markup" describe
// block (measure() stays 240, full render() output unchanged) — these tests
// cover the new n>=2 behavior only: legend swatches/names, name/count
// overflow markers, and the pie/funnel/dumbbell exclusion.
describe("chart component — legend (n>=2 series)", () => {
  // Only chart.tsx itself sets `font-family` on a `<text>` node (x_title/
  // y_title/legend) — chart-svg.tsx's own bar/line/etc. text elements never
  // do (see chart-svg.tsx's text nodes) — so for an axes-free component,
  // every `text[font-family]` is unambiguously legend content.
  function legendTexts(container: HTMLElement): Element[] {
    return Array.from(container.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-family") === ctx.fonts.body,
    )
  }

  const twoSeriesBar = {
    type: "chart" as const,
    chart_type: "bar" as const,
    series: [
      { name: "North America", data: [{ x: "Q1", y: 120 }, { x: "Q2", y: 180 }] },
      { name: "Europe", data: [{ x: "Q1", y: 90 }, { x: "Q2", y: 140 }] },
    ],
  }

  it("measure() grows by a fixed extra amount for a multi-series bar chart (never proportional to series count)", () => {
    const oneSeries = { type: "chart" as const, chart_type: "bar" as const, series: [twoSeriesBar.series[0]!] }
    const fiveSeries = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: Array.from({ length: 5 }, (_, i) => ({ name: `S${i}`, data: [{ x: "A", y: i + 1 }] })),
    }
    const h1 = chart.measure(oneSeries, 1120, ctx)
    const h2 = chart.measure(twoSeriesBar, 1120, ctx)
    const h5 = chart.measure(fiveSeries, 1120, ctx)
    expect(h2).toBeGreaterThan(h1)
    expect(h5).toBe(h2) // fixed band, not proportional to series count
  })

  it("measure() does not grow for a multi-series pie/funnel/dumbbell chart (legend never applies — dispatch untouched)", () => {
    const pie2 = {
      type: "chart" as const,
      chart_type: "pie" as const,
      series: [{ name: "A", data: [{ x: "x", y: 1 }] }, { name: "B", data: [{ x: "y", y: 2 }] }],
    }
    const pie1 = { ...pie2, series: [pie2.series[0]!] }
    expect(chart.measure(pie2, 1120, ctx)).toBe(chart.measure(pie1, 1120, ctx))

    const funnel2 = {
      type: "chart" as const,
      chart_type: "funnel" as const,
      series: [{ name: "A", data: [{ x: "x", y: 1 }] }, { name: "B", data: [{ x: "y", y: 2 }] }],
    }
    const funnel1 = { ...funnel2, series: [funnel2.series[0]!] }
    expect(chart.measure(funnel2, 1120, ctx)).toBe(chart.measure(funnel1, 1120, ctx))

    // dumbbell is *always* exactly 2 series (from/to) by construction — the
    // most direct possible proof that series.length alone never triggers a
    // legend; chart_type applicability (`legendApplicable`) gates it too.
    const dumbbell = {
      type: "chart" as const,
      chart_type: "dumbbell" as const,
      series: [{ name: "From", data: [{ x: "A", y: 10 }] }, { name: "To", data: [{ x: "A", y: 20 }] }],
    }
    expect(chart.measure(dumbbell, 1120, ctx)).toBe(240)
  })

  it("renders one swatch + name per series for a multi-series bar chart", () => {
    const { container } = svg(chart.render(twoSeriesBar, box, ctx))
    const texts = legendTexts(container)
    expect(texts.map((t) => t.textContent)).toEqual(["North America", "Europe"])
    for (const t of texts) {
      expect(t.getAttribute("data-truncated")).toBeNull()
      expect(t.hasAttribute("data-dropped")).toBe(false)
    }
  })

  it("legend swatch colors follow the rotated palette in series order (colorIndex === seriesIndex)", () => {
    const { container } = svg(chart.render(twoSeriesBar, box, ctx))
    const swatches = Array.from(container.querySelectorAll("rect")).filter(
      (r) => Number(r.getAttribute("width")) === 10 && Number(r.getAttribute("height")) === 10,
    )
    expect(swatches).toHaveLength(2)
    expect(swatches[0]!.getAttribute("fill")).toBe(ctx.colors.chartPalette[0])
    expect(swatches[1]!.getAttribute("fill")).toBe(ctx.colors.chartPalette[1])
  })

  it("renders no legend swatches/text for a single-series bar chart (byte-compat boundary)", () => {
    const oneSeries = { type: "chart" as const, chart_type: "bar" as const, series: [twoSeriesBar.series[0]!] }
    const { container } = svg(chart.render(oneSeries, box, ctx))
    expect(legendTexts(container)).toHaveLength(0)
  })

  it("renders no legend for a multi-series pie/funnel/dumbbell chart even though series.length >= 2", () => {
    const pie = {
      type: "chart" as const,
      chart_type: "pie" as const,
      series: [{ name: "A", data: [{ x: "x", y: 1 }] }, { name: "B", data: [{ x: "y", y: 2 }] }],
    }
    const dumbbell = {
      type: "chart" as const,
      chart_type: "dumbbell" as const,
      series: [{ name: "From", data: [{ x: "A", y: 10 }] }, { name: "To", data: [{ x: "A", y: 20 }] }],
    }
    for (const component of [pie, dumbbell]) {
      const { container } = svg(chart.render(component, box, ctx))
      expect(legendTexts(container)).toHaveLength(0)
    }
  })

  it("name overflow: a series name longer than its slot truncates via fitSvgLine, marked data-truncated", () => {
    const longName = "A Very Long Series Name That Overflows The Legend Slot Width Budget Easily"
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: [
        { name: longName, data: [{ x: "A", y: 1 }] },
        { name: "Short", data: [{ x: "A", y: 2 }] },
      ],
    }
    const { container } = svg(chart.render(component, box, ctx))
    const truncated = legendTexts(container).find((t) => t.getAttribute("data-truncated") === "1")
    expect(truncated).toBeTruthy()
    expect(truncated!.textContent!.length).toBeLessThan(longName.length)
  })

  it("count overflow: more series than fit in one row drop the tail, marked data-dropped with no painted remainder copy", () => {
    // Header-row packing starts at 72px per short name, so a 1120px plot
    // holds ~15 of these. 24 is enough to force the drop.
    const manySeries = Array.from({ length: 24 }, (_, i) => ({
      name: `S${i + 1}`,
      data: [{ x: "A", y: i + 1 }],
    }))
    const component = { type: "chart" as const, chart_type: "bar" as const, series: manySeries }
    const { container } = svg(chart.render(component, box, ctx))
    const texts = legendTexts(container)
    const dropped = container.querySelector("[data-dropped]")
    expect(dropped).toBeTruthy()
    expect((dropped!.textContent ?? "").trim()).toBe("")
    const droppedCount = Number(dropped!.getAttribute("data-dropped"))
    expect(droppedCount).toBeGreaterThan(0)
    const nameEntries = texts.filter((t) => !t.hasAttribute("data-dropped"))
    expect(nameEntries.length).toBeLessThan(manySeries.length)
    expect(nameEntries.length + droppedCount).toBe(manySeries.length)
  })

  it("audit-visibility: deck-audit reads both the truncated name and the dropped-count marker as content-truncated/content-dropped findings", () => {
    const longName = "A Very Long Series Name That Overflows The Legend Slot Width Budget Easily And Then Some"
    const manySeries = Array.from({ length: 24 }, (_, i) => ({
      name: i === 0 ? longName : `S${i + 1}`,
      data: [{ x: "A", y: i + 1 }],
    }))
    const ir: PptxIR = {
      version: "4",
      filename: "legend-audit-fixture",
      theme: { id: "consulting" },
      meta: {},
      assets: { images: {} },
      slides: [
        {
          type: "content",
          heading: "Legend audit fixture",
          components: [{ type: "chart", chart_type: "bar", series: manySeries }],
        },
      ],
    } as PptxIR
    const report = auditDeck(ir)
    const truncated = report.findings.filter((f) => f.code === "content-truncated")
    const dropped = report.findings.filter((f) => f.code === "content-dropped")
    expect(truncated.length).toBeGreaterThan(0)
    expect(dropped.length).toBeGreaterThan(0)
  })

  it("renders only svg2pptx-subset primitives with a multi-series legend (swatches + truncated name + dropped marker)", () => {
    const manySeries = Array.from({ length: 10 }, (_, i) => ({
      name: `A Fairly Long Series Name Number ${i + 1}`,
      data: [{ x: "A", y: i + 1 }],
    }))
    const component = { type: "chart" as const, chart_type: "bar" as const, series: manySeries }
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{chart.render(component, box, ctx)}</svg>,
    )
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
  })
})

describe("chart component — chart-depth subtypes (scatter / area / donut / gauge dispatch)", () => {
  it("dispatches scatter to the point renderer (one circle per numeric point)", () => {
    const component = {
      type: "chart" as const,
      chart_type: "scatter" as const,
      series: [{ name: "S", data: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 1 }] }],
    }
    const { container } = svg(chart.render(component, box, ctx))
    expect(container.querySelectorAll("circle").length).toBe(3)
  })

  it("dispatches area to the filled-line renderer (a polygon fill under the stroke)", () => {
    const component = {
      type: "chart" as const,
      chart_type: "area" as const,
      series: [{ name: "S", data: [{ x: "Q1", y: 10 }, { x: "Q2", y: 20 }] }],
    }
    const { container } = svg(chart.render(component, box, ctx))
    expect(container.querySelectorAll("polygon").length).toBeGreaterThanOrEqual(1)
    expect(container.querySelectorAll("polyline").length).toBeGreaterThanOrEqual(1)
  })

  it("dispatches the dedicated donut subtype to renderDonut, center empty by default", () => {
    const component = {
      type: "chart" as const,
      chart_type: "donut" as const,
      series: [{ name: "S", data: [{ x: "A", y: 40 }, { x: "B", y: 60 }] }],
    }
    const { container } = svg(chart.render(component, box, ctx))
    // wedges present, no center total text
    expect(container.querySelectorAll("path").length).toBe(2)
    expect(container.querySelectorAll("text").length).toBe(0)
  })

  it("donut center_total: true prints the total through the full render", () => {
    const component = {
      type: "chart" as const,
      chart_type: "donut" as const,
      center_total: true,
      series: [{ name: "S", data: [{ x: "A", y: 40 }, { x: "B", y: 60 }] }],
    }
    const { container } = svg(chart.render(component, box, ctx))
    expect(Array.from(container.querySelectorAll("text")).map((t) => t.textContent)).toContain("100")
  })

  it("dispatches gauge to the half-ring renderer (track + arc paths and the centered value)", () => {
    const component = {
      type: "chart" as const,
      chart_type: "gauge" as const,
      series: [{ name: "G", data: [{ x: "Completion", y: 62 }] }],
    }
    const { container } = svg(chart.render(component, box, ctx))
    expect(container.querySelectorAll("path").length).toBe(2)
    expect(Array.from(container.querySelectorAll("text")).some((t) => t.textContent === "62")).toBe(true)
  })

  it("scatter and area are axes-applicable: measure() does not grow for a CJK y_title (x_title no longer reserves height)", () => {
    for (const chart_type of ["scatter", "area"] as const) {
      const series =
        chart_type === "scatter"
          ? [{ name: "S", data: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }]
          : [{ name: "S", data: [{ x: "Q1", y: 2 }, { x: "Q2", y: 4 }] }]
      const base = { type: "chart" as const, chart_type, series }
      const withX = { ...base, axes: { x_title: "Axis" } }
      const withY = { ...base, axes: { y_title: "数值" } }
      expect(chart.measure(withX, 1120, ctx), chart_type).toBe(chart.measure(base, 1120, ctx))
      expect(chart.measure(withY, 1120, ctx), chart_type).toBe(chart.measure(base, 1120, ctx))
    }
  })

  it("gauge and donut are NOT axes-applicable: measure() ignores axes (radial, no plot box)", () => {
    const gauge = { type: "chart" as const, chart_type: "gauge" as const, series: [{ name: "G", data: [{ x: "x", y: 5 }] }] }
    const donut = { type: "chart" as const, chart_type: "donut" as const, series: [{ name: "S", data: [{ x: "A", y: 5 }] }] }
    for (const base of [gauge, donut]) {
      const withAxes = { ...base, axes: { x_title: "X", y_title: "Y" } }
      expect(chart.measure(withAxes, 1120, ctx)).toBe(chart.measure(base, 1120, ctx))
    }
  })

  it("a multi-series scatter/area gains a legend; gauge/donut never do", () => {
    const scatter2 = {
      type: "chart" as const,
      chart_type: "scatter" as const,
      series: [
        { name: "Group A", data: [{ x: 1, y: 2 }] },
        { name: "Group B", data: [{ x: 3, y: 4 }] },
      ],
    }
    const area2 = {
      type: "chart" as const,
      chart_type: "area" as const,
      series: [
        { name: "North", data: [{ x: "Q1", y: 2 }, { x: "Q2", y: 4 }] },
        { name: "South", data: [{ x: "Q1", y: 1 }, { x: "Q2", y: 3 }] },
      ],
    }
    const scatter1 = { ...scatter2, series: [scatter2.series[0]!] }
    const area1 = { ...area2, series: [area2.series[0]!] }
    expect(chart.measure(scatter2, 1120, ctx)).toBeGreaterThan(chart.measure(scatter1, 1120, ctx))
    expect(chart.measure(area2, 1120, ctx)).toBeGreaterThan(chart.measure(area1, 1120, ctx))
  })

  it("renders only svg2pptx-subset primitives for every new subtype", () => {
    const components = [
      { type: "chart" as const, chart_type: "scatter" as const, series: [{ name: "S", data: [{ x: 1, y: 2, size: 4 }, { x: 3, y: 8 }] }] },
      { type: "chart" as const, chart_type: "area" as const, series: [{ name: "S", data: [{ x: "Q1", y: 10 }, { x: "Q2", y: -4 }] }] },
      { type: "chart" as const, chart_type: "donut" as const, center_total: true, series: [{ name: "S", data: [{ x: "A", y: 40 }, { x: "B", y: 60 }] }] },
      { type: "chart" as const, chart_type: "gauge" as const, gauge: { min: 0, max: 200 }, series: [{ name: "G", data: [{ x: "x", y: 150 }] }] },
    ]
    for (const component of components) {
      const markup = renderSvgMarkup(<svg xmlns="http://www.w3.org/2000/svg">{chart.render(component, box, ctx)}</svg>)
      expect(() => assertSubset(parseSvgRoot(markup)), component.chart_type).not.toThrow()
    }
  })
})

describe("chart component — label-tuning A (header row for legend, no x_title)", () => {
  const groupedBar = {
    type: "chart" as const,
    chart_type: "bar" as const,
    axes: { x_title: "季度", y_title: "接入设备总量" },
    series: [
      {
        name: "冶金",
        data: [
          { x: "第一季度", y: 42 },
          { x: "第二季度", y: 53 },
          { x: "第三季度", y: 64 },
          { x: "第四季度", y: 75 },
        ],
      },
      {
        name: "化工",
        data: [
          { x: "第一季度", y: 30 },
          { x: "第二季度", y: 36 },
          { x: "第三季度", y: 42 },
          { x: "第四季度", y: 48 },
        ],
      },
    ],
  }

  function headerTexts(container: HTMLElement) {
    return Array.from(container.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-family") === ctx.fonts.body,
    )
  }

  it("reserves a 52px header row when a legend is present, not for a y_title alone", () => {
    const oneSeries = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: [groupedBar.series[0]!],
    }
    expect(chart.measure(oneSeries, 1120, ctx)).toBe(240)
    expect(chart.measure({ ...oneSeries, axes: { y_title: "接入设备总量" } }, 1120, ctx)).toBe(240)
    expect(chart.measure(groupedBar, 1120, ctx)).toBe(292)
    const twoSeriesNoAxes = { type: "chart" as const, chart_type: "bar" as const, series: groupedBar.series }
    expect(chart.measure(twoSeriesNoAxes, 1120, ctx)).toBe(292)
  })

  it("does not paint x_title even when the field is set", () => {
    const { container } = svg(chart.render(groupedBar, box, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).not.toContain("季度")
  })

  it("paints a CJK y_title as a 14px muted character stack on the left, not in the header", () => {
    const { container } = svg(chart.render(groupedBar, box, ctx))
    expect(headerTexts(container).find((t) => t.textContent === "接入设备总量")).toBeUndefined()
    const stacked = Array.from(container.querySelectorAll("text")).filter((t) =>
      ["接", "入", "设", "备", "总", "量"].includes(t.textContent ?? ""),
    )
    expect(stacked.map((t) => t.textContent).join("")).toBe("接入设备总量")
    for (const t of stacked) {
      expect(t.getAttribute("font-size")).toBe("14")
      expect(t.getAttribute("fill")).toBe(ctx.colors.muted)
      expect(t.getAttribute("y")).not.toBe("16")
    }
  })

  it("places the legend on the same header row, right-aligned, 12px muted", () => {
    const { container } = svg(chart.render(groupedBar, box, ctx))
    const names = headerTexts(container).filter((t) => t.textContent === "冶金" || t.textContent === "化工")
    expect(names.map((t) => t.textContent)).toEqual(["冶金", "化工"])
    for (const t of names) {
      expect(t.getAttribute("y")).toBe("16")
      expect(t.getAttribute("font-size")).toBe("12")
    }
    const swatches = Array.from(container.querySelectorAll("rect")).filter(
      (r) => Number(r.getAttribute("width")) === 10 && Number(r.getAttribute("height")) === 10,
    )
    expect(swatches).toHaveLength(2)
    for (const s of swatches) {
      expect(Number(s.getAttribute("y"))).toBe(6)
    }
    expect(Number(swatches[1]!.getAttribute("x"))).toBeGreaterThan(Number(swatches[0]!.getAttribute("x")))
    expect(Number(names[1]!.getAttribute("x"))).toBeGreaterThan(Number(names[0]!.getAttribute("x")))
    const rightEdge = box.w
    const lastNameRight =
      Number(names[1]!.getAttribute("x")) +
      (names[1]!.textContent!.length * Number(names[1]!.getAttribute("font-size")))
    expect(lastNameRight).toBeLessThanOrEqual(rightEdge + 1)
  })

  it("keeps the tallest bar's value label ≥ 24px below the header baseline (legend must not sit on the peak)", () => {
    const { container } = svg(chart.render(groupedBar, box, ctx))
    const headerY = 16
    const valueLabels = Array.from(container.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-weight") === "600" && t.getAttribute("fill") === ctx.colors.text,
    )
    expect(valueLabels.length).toBeGreaterThan(0)
    const peakY = Math.min(...valueLabels.map((t) => Number(t.getAttribute("y"))))
    expect(peakY - headerY).toBeGreaterThanOrEqual(24)
    const peak = valueLabels.find((t) => t.textContent === "75")!
    expect(Number(peak.getAttribute("y"))).toBe(peakY)
  })

  it("paints cartesian value labels at 13px / 600 / text, and category ticks at 13px muted", () => {
    const { container } = svg(chart.render(groupedBar, box, ctx))
    const seventyFive = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === "75")!
    expect(seventyFive.getAttribute("font-size")).toBe("13")
    expect(seventyFive.getAttribute("font-weight")).toBe("600")
    expect(seventyFive.getAttribute("fill")).toBe(ctx.colors.text)
    const category = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === "第四季度")!
    expect(Number(category.getAttribute("font-size"))).toBe(13)
    expect(category.getAttribute("fill")).toBe(ctx.colors.muted)
    expect(category.getAttribute("font-weight")).toBeNull()
  })
})

// Vertical y-title (微调 C, then Latin fallback). Cartesian vertical-value
// charts (bar / line / area / scatter) park a *pure CJK* unit caption on
// the plot's left, one character per line. A title that carries Latin or
// digits goes back to the header row (left, with the legend on the right).
// Rotating the whole Latin string is still vertical type and is forbidden.
// bar_horizontal keeps the header caption — its left band is row labels,
// not a value axis.
describe("chart component — vertical y-title (cartesian value axis)", () => {
  const barSeries = [
    { name: "Revenue", data: [{ x: "Q1", y: 100 }, { x: "Q2", y: 200 }] },
  ]
  const cjkTitle = "接入设备总量"
  const latinTitle = "Connected equipment"
  const plotBaseline = (container: HTMLElement): number => {
    const bars = Array.from(container.querySelectorAll("rect")).filter(
      (r) => Number(r.getAttribute("width")) !== 10,
    )
    return Math.max(
      ...bars.map((r) => Number(r.getAttribute("y")) + Number(r.getAttribute("height"))),
    )
  }
  const yTitleChars = (container: HTMLElement, chars: string) =>
    Array.from(container.querySelectorAll("text")).filter((t) =>
      chars.split("").includes(t.textContent ?? ""),
    )

  it("stacks a CJK y_title at 14px muted, 18px pitch, last-char baseline on the bar bottom", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { y_title: cjkTitle },
    }
    const { container } = svg(chart.render(component, box, ctx))
    const stacked = yTitleChars(container, cjkTitle)
    expect(stacked.map((t) => t.textContent).join("")).toBe(cjkTitle)
    expect(Array.from(container.querySelectorAll("text")).some((t) => t.textContent === cjkTitle)).toBe(
      false,
    )
    for (const t of stacked) {
      expect(t.getAttribute("font-size")).toBe("14")
      expect(t.getAttribute("fill")).toBe(ctx.colors.muted)
      expect(t.getAttribute("text-anchor")).toBe("middle")
    }
    const ys = stacked.map((t) => Number(t.getAttribute("y")))
    for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBe(18)
    expect(ys[ys.length - 1]).toBe(plotBaseline(container))
  })

  it("reserves a 36px left sidebar for a y_title and does not keep one when the title is absent", () => {
    // Grouped columns, not the first DOM rect: a legend swatch is 10×10 and
    // can sit first or last depending on render order. The leftmost bar of
    // the first cluster is the plot's left edge plus the group gutter.
    const grouped = [
      { name: "冶金", data: [{ x: "Q1", y: 42 }, { x: "Q2", y: 53 }] },
      { name: "化工", data: [{ x: "Q1", y: 30 }, { x: "Q2", y: 36 }] },
    ]
    const noAxes = { type: "chart" as const, chart_type: "bar" as const, series: grouped }
    const withYTitle = { ...noAxes, axes: { y_title: cjkTitle } }
    const barLeft = (c: typeof noAxes | typeof withYTitle) => {
      const rects = Array.from(
        svg(chart.render(c, box, ctx)).container.querySelectorAll("rect"),
      ).filter((r) => Number(r.getAttribute("width")) !== 10)
      return Math.min(...rects.map((r) => Number(r.getAttribute("x"))))
    }
    expect(barLeft(withYTitle) - barLeft(noAxes)).toBe(36)
    const oneCat = [{ name: "Revenue", data: [{ x: "Q1", y: 100 }] }]
    const noTitleOne = { type: "chart" as const, chart_type: "bar" as const, series: oneCat }
    const titledOne = { ...noTitleOne, axes: { y_title: cjkTitle } }
    const barOf = (c: typeof noTitleOne | typeof titledOne) =>
      svg(chart.render(c, box, ctx)).container.querySelector("rect")!
    expect(Number(barOf(noTitleOne).getAttribute("x"))).toBe(4)
    expect(Number(barOf(titledOne).getAttribute("x"))).toBe(40)
  })

  it("does not grow measure() for a CJK y_title alone — the sidebar takes width, not height", () => {
    const base = { type: "chart" as const, chart_type: "bar" as const, series: barSeries }
    expect(chart.measure({ ...base, axes: { y_title: cjkTitle } }, 1120, ctx)).toBe(
      chart.measure(base, 1120, ctx),
    )
  })

  it("grows measure() by the header row for a Latin y_title alone", () => {
    const base = { type: "chart" as const, chart_type: "bar" as const, series: barSeries }
    expect(chart.measure({ ...base, axes: { y_title: latinTitle } }, 1120, ctx)).toBe(
      chart.measure(base, 1120, ctx) + 52,
    )
  })

  it("keeps the header row for a legend only, right-aligned, with no y_title on that row", () => {
    const grouped = {
      type: "chart" as const,
      chart_type: "bar" as const,
      axes: { y_title: cjkTitle },
      series: [
        { name: "冶金", data: [{ x: "Q1", y: 42 }, { x: "Q2", y: 53 }] },
        { name: "化工", data: [{ x: "Q1", y: 30 }, { x: "Q2", y: 36 }] },
      ],
    }
    const { container } = svg(chart.render(grouped, box, ctx))
    expect(
      Array.from(container.querySelectorAll("text")).some((t) => t.textContent === cjkTitle),
    ).toBe(false)
    const names = Array.from(container.querySelectorAll("text")).filter(
      (t) => t.textContent === "冶金" || t.textContent === "化工",
    )
    expect(names.map((t) => t.textContent)).toEqual(["冶金", "化工"])
    for (const t of names) expect(t.getAttribute("y")).toBe("16")
    expect(chart.measure(grouped, 1120, ctx)).toBe(292)
  })

  it("puts a Latin y_title in the header as one string, never a letter column and never rotated", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { y_title: latinTitle },
    }
    const { container } = svg(chart.render(component, box, ctx))
    const texts = Array.from(container.querySelectorAll("text"))
    const yTitle = texts.find((t) => t.textContent === latinTitle)
    expect(yTitle).toBeTruthy()
    expect(texts.filter((t) => t.textContent === "C" || t.textContent === "o")).toHaveLength(0)
    expect(yTitle!.getAttribute("font-size")).toBe("12")
    expect(yTitle!.getAttribute("fill")).toBe(ctx.colors.muted)
    expect(yTitle!.getAttribute("transform")).toBeNull()
    expect(yTitle!.getAttribute("y")).toBe("16")
    expect(yTitle!.getAttribute("x")).toBe("0")
  })

  it("puts a mixed-script y_title in the header as one string — no majority vote, no rotate", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { y_title: "K8s 托管" },
    }
    const { container } = svg(chart.render(component, box, ctx))
    const yTitle = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === "K8s 托管")
    expect(yTitle).toBeTruthy()
    expect(yTitle!.getAttribute("transform")).toBeNull()
    expect(yTitle!.getAttribute("y")).toBe("16")
    expect(Array.from(container.querySelectorAll("text")).some((t) => t.textContent === "K")).toBe(
      false,
    )
  })

  it("puts a CJK y_title that carries ASCII digits in the header, not on the stacked sidebar", () => {
    const component = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { y_title: "营收2024" },
    }
    const { container } = svg(chart.render(component, box, ctx))
    const yTitle = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === "营收2024")
    expect(yTitle).toBeTruthy()
    expect(yTitle!.getAttribute("y")).toBe("16")
    expect(yTitle!.getAttribute("transform")).toBeNull()
    expect(yTitleChars(container, "营收2024")).toHaveLength(0)
  })

  it("shares the header row: Latin y_title left, legend right", () => {
    const grouped = {
      type: "chart" as const,
      chart_type: "bar" as const,
      axes: { y_title: latinTitle },
      series: [
        { name: "冶金", data: [{ x: "Q1", y: 42 }, { x: "Q2", y: 53 }] },
        { name: "化工", data: [{ x: "Q1", y: 30 }, { x: "Q2", y: 36 }] },
      ],
    }
    const { container } = svg(chart.render(grouped, box, ctx))
    const yTitle = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === latinTitle)!
    const names = Array.from(container.querySelectorAll("text")).filter(
      (t) => t.textContent === "冶金" || t.textContent === "化工",
    )
    expect(yTitle.getAttribute("y")).toBe("16")
    expect(yTitle.getAttribute("x")).toBe("0")
    for (const t of names) expect(t.getAttribute("y")).toBe("16")
    expect(Number(names[0]!.getAttribute("x"))).toBeGreaterThan(Number(yTitle.getAttribute("x")))
    expect(chart.measure(grouped, 1120, ctx)).toBe(292)
  })

  it("leaves bar_horizontal y_title in the header — the left band is row labels, not a value axis", () => {
    const base = {
      type: "chart" as const,
      chart_type: "bar" as const,
      direction: "horizontal" as const,
      series: barSeries,
    }
    const component = { ...base, axes: { y_title: cjkTitle } }
    const { container } = svg(chart.render(component, box, ctx))
    const yTitle = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === cjkTitle)
    expect(yTitle).toBeTruthy()
    expect(yTitle!.getAttribute("y")).toBe("16")
    expect(yTitleChars(container, cjkTitle)).toHaveLength(0)
    const barX = (c: typeof base | typeof component) =>
      Number(svg(chart.render(c, box, ctx)).container.querySelector("rect")!.getAttribute("x"))
    expect(barX(component)).toBe(barX(base))
  })

  it("fits an egregiously long CJK y_title in the sidebar, truncation-marked, no overflow", () => {
    const egregious = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { y_title: "超长坐标轴标题".repeat(12) },
    }
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
    expect(auditSvgMarkup(markup).filter((i) => i.kind === "h-overflow" || i.kind === "v-overflow")).toEqual(
      [],
    )
    const root = parseSvgRoot(markup)
    expect(Array.from(root.querySelectorAll('text[data-truncated="1"]')).length).toBeGreaterThanOrEqual(1)
  })

  it("fits an egregiously long Latin y_title rather than overflowing, truncation-marked", () => {
    const egregious = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: barSeries,
      axes: { y_title: "Connected equipment across every validated industry setting ".repeat(4) },
    }
    const { container } = svg(chart.render(egregious, box, ctx))
    const yTitle = Array.from(container.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").startsWith("Connected equipment"),
    )!
    expect(yTitle.getAttribute("data-truncated")).toBe("1")
    expect(yTitle.textContent?.endsWith("…")).toBe(true)
    expect(yTitle.getAttribute("transform")).toBeNull()
    expect(yTitle.getAttribute("y")).toBe("16")
  })

  it("applies the vertical y_title to line, area, and scatter the same way", () => {
    for (const chart_type of ["line", "area", "scatter"] as const) {
      const series =
        chart_type === "scatter"
          ? [{ name: "S", data: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }]
          : [{ name: "S", data: [{ x: "Q1", y: 2 }, { x: "Q2", y: 4 }] }]
      const component = { type: "chart" as const, chart_type, series, axes: { y_title: "数值" } }
      const { container } = svg(chart.render(component, box, ctx))
      expect(yTitleChars(container, "数值").map((t) => t.textContent).join("")).toBe("数值")
    }
  })
})
