// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { chart } from "./chart"
import type { BlockCtx } from "./types"

const ctx: BlockCtx = {
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
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

const box = { x: 80, y: 100, w: 1120 }

describe("chart block", () => {
  it("measure returns 240", () => {
    const block = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: [{ name: "S1", data: [{ x: "A", y: 10 }] }],
    }
    expect(chart.measure(block, 1120, ctx)).toBe(240)
  })

  it("bar chart renders at least one rect per data point", () => {
    const block = {
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
    const { container } = svg(chart.render(block, box, ctx))
    const rects = container.querySelectorAll("rect")
    expect(rects.length).toBeGreaterThanOrEqual(3)
  })

  it("pie chart renders one path per data sector", () => {
    const block = {
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
    const { container } = svg(chart.render(block, box, ctx))
    const paths = container.querySelectorAll("path")
    expect(paths.length).toBe(4)
  })

  it("line chart renders polyline elements", () => {
    const block = {
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
    const { container } = svg(chart.render(block, box, ctx))
    const polylines = container.querySelectorAll("polyline")
    expect(polylines.length).toBeGreaterThanOrEqual(1)
  })

  it("does not contain nested svg elements", () => {
    const block = {
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
    const { container } = svg(chart.render(block, box, ctx))
    const nested = container.querySelectorAll("svg svg")
    expect(nested.length).toBe(0)
  })

  it("wraps output in a translated g element", () => {
    const block = {
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
    const { container } = svg(chart.render(block, box, ctx))
    const g = container.querySelector("g")
    expect(g?.getAttribute("transform")).toBe("translate(80,100)")
  })

  it("bar chart renders a muted category label and a value label per bar", () => {
    const block = {
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
    const { container } = svg(chart.render(block, box, ctx))
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
    const block = {
      type: "chart" as const,
      chart_type: "bar" as const,
      series: [{ name: "S1", data: [{ x: longLabel, y: 10 }] }],
    }
    // A single bar spans the whole 1120px box — a 24-char CJK label at the
    // default 11px would be far wider than that, so fitSvgLine must shrink
    // it down to (or truncate it at) the configured minimum font size.
    const { container } = svg(chart.render(block, box, ctx))
    const category = Array.from(container.querySelectorAll("text")).find(
      (t) => t.getAttribute("fill") === ctx.colors.muted,
    )!
    expect(Number(category.getAttribute("font-size"))).toBeLessThanOrEqual(11)
    expect(Number(category.getAttribute("font-size"))).toBeGreaterThanOrEqual(8)
  })

  it("line chart renders a category label per point and value labels only at the endpoints", () => {
    const block = {
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
    const { container } = svg(chart.render(block, box, ctx))
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
    const block = {
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
    const { container } = svg(chart.render(block, box, ctx))
    const rects = Array.from(container.querySelectorAll("rect"))
    const maxBar = rects.find((r) => r.getAttribute("fill") === ctx.colors.accent)
    expect(maxBar).toBeTruthy()
  })

  it("wires ctx.colors.accent through to the line renderer's endpoint marker", () => {
    const block = {
      type: "chart" as const,
      chart_type: "line" as const,
      series: [{ name: "Trend", data: [{ x: 1, y: 10 }, { x: 2, y: 30 }] }],
    }
    const { container } = svg(chart.render(block, box, ctx))
    const dot = Array.from(container.querySelectorAll("circle")).find(
      (c) => c.getAttribute("r") === "4",
    )
    expect(dot?.getAttribute("fill")).toBe(ctx.colors.accent)
  })
})
