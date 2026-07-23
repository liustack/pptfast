// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { auditSvgMarkup } from "../audit/svg-audit"
import { contrastRatio } from "../ink"
import { heatmap } from "./heatmap"
import type { ComponentCtx } from "./types"

const ctx: ComponentCtx = {
  colors: {
    bg: "#F7F7F2",
    surface: "#FFFFFF",
    primary: "#051C2C",
    accent: "#FFC72C",
    text: "#051C2C",
    muted: "#6C6C6C",
    chartPalette: ["#051C2C", "#FFC72C"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24,
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

const basic = {
  type: "heatmap" as const,
  x_labels: ["Q1", "Q2", "Q3"],
  y_labels: ["North", "South"],
  values: [
    [10, 20, 30],
    [5, 15, 25],
  ],
}

describe("heatmap component", () => {
  it("renders one cell rect per value (rows x cols)", () => {
    const { container } = svg(heatmap.render(basic, { x: 0, y: 0, w: 900, h: 300 }, ctx))
    expect(container.querySelectorAll("rect")).toHaveLength(6)
  })

  it("renders x_labels and y_labels as header text", () => {
    const { container } = svg(heatmap.render(basic, { x: 0, y: 0, w: 900, h: 300 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    for (const label of [...basic.x_labels, ...basic.y_labels]) expect(texts).toContain(label)
  })

  it("higher values map to a more saturated fill (monotonic ramp, single hue toward colors.primary)", () => {
    const { container } = svg(heatmap.render(basic, { x: 0, y: 0, w: 900, h: 300 }, ctx))
    const rects = Array.from(container.querySelectorAll("rect"))
    // basic.values flattened in row-major order: [10,20,30,5,15,25] — domain
    // defaults to [5,30], so the lowest (5, index 3) and highest (30, index
    // 2) fills must differ, and the highest must sit strictly closer to
    // colors.primary (lower contrast against it) than the lowest.
    const lowFill = rects[3].getAttribute("fill")!
    const highFill = rects[2].getAttribute("fill")!
    expect(lowFill).not.toBe(highFill)
    expect(contrastRatio(highFill, ctx.colors.primary)).toBeLessThan(contrastRatio(lowFill, ctx.colors.primary))
  })

  it("degenerate domain (all values equal) renders every cell the same flat mid-tone fill, no NaN/Infinity", () => {
    const flat = { ...basic, values: [[7, 7, 7], [7, 7, 7]] }
    const { container } = svg(heatmap.render(flat, { x: 0, y: 0, w: 900, h: 300 }, ctx))
    const fills = Array.from(container.querySelectorAll("rect")).map((r) => r.getAttribute("fill"))
    expect(new Set(fills).size).toBe(1)
    for (const f of fills) {
      expect(f).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  it("an explicit degenerate domain override (min === max) also renders a flat fill, not a crash", () => {
    const withDomain = { ...basic, domain: { min: 5, max: 5 } }
    expect(() => svg(heatmap.render(withDomain, { x: 0, y: 0, w: 900, h: 300 }, ctx))).not.toThrow()
    const { container } = svg(heatmap.render(withDomain, { x: 0, y: 0, w: 900, h: 300 }, ctx))
    const fills = Array.from(container.querySelectorAll("rect")).map((r) => r.getAttribute("fill"))
    expect(new Set(fills).size).toBe(1)
  })

  it("renders a single-row grid (1 y_label) without throwing", () => {
    const singleRow = { type: "heatmap" as const, x_labels: ["a", "b", "c"], y_labels: ["only"], values: [[1, 2, 3]] }
    const { container } = svg(heatmap.render(singleRow, { x: 0, y: 0, w: 900, h: 200 }, ctx))
    expect(container.querySelectorAll("rect")).toHaveLength(3)
  })

  it("renders a single-column grid (1 x_label) without throwing", () => {
    const singleCol = { type: "heatmap" as const, x_labels: ["only"], y_labels: ["a", "b", "c"], values: [[1], [2], [3]] }
    const { container } = svg(heatmap.render(singleCol, { x: 0, y: 0, w: 900, h: 300 }, ctx))
    expect(container.querySelectorAll("rect")).toHaveLength(3)
  })

  it("renders a single 1x1 cell without throwing", () => {
    const one = { type: "heatmap" as const, x_labels: ["x"], y_labels: ["y"], values: [[42]] }
    const { container } = svg(heatmap.render(one, { x: 0, y: 0, w: 900, h: 200 }, ctx))
    expect(container.querySelectorAll("rect")).toHaveLength(1)
  })

  it("accepts negative values and still produces valid, in-range fills", () => {
    const negative = { ...basic, values: [[-100, -50, 0], [-75, -25, 25]] }
    const { container } = svg(heatmap.render(negative, { x: 0, y: 0, w: 900, h: 300 }, ctx))
    const fills = Array.from(container.querySelectorAll("rect")).map((r) => r.getAttribute("fill"))
    for (const f of fills) expect(f).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  describe("show_values cell ink", () => {
    it("renders no value text when show_values is unset", () => {
      const { container } = svg(heatmap.render(basic, { x: 0, y: 0, w: 900, h: 300 }, ctx))
      const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
      expect(texts).not.toContain("30")
    })

    it("renders one value text per cell when show_values is set", () => {
      const withValues = { ...basic, show_values: true }
      const { container } = svg(heatmap.render(withValues, { x: 0, y: 0, w: 900, h: 300 }, ctx))
      const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
      for (const v of basic.values.flat()) expect(texts).toContain(String(v))
    })

    it("every cell's value text clears 4.5:1 against that cell's own computed fill (accessibleInk, self-painted-surface discipline) across a wide value spread", () => {
      const spread = {
        type: "heatmap" as const,
        x_labels: ["a", "b", "c", "d", "e"],
        y_labels: ["r"],
        values: [[0, 25, 50, 75, 100]],
        show_values: true,
      }
      const { container } = svg(heatmap.render(spread, { x: 0, y: 0, w: 900, h: 200 }, ctx))
      const rects = Array.from(container.querySelectorAll("rect"))
      const valueTexts = Array.from(container.querySelectorAll("text")).filter((t) =>
        ["0", "25", "50", "75", "100"].includes(t.textContent ?? ""),
      )
      expect(valueTexts).toHaveLength(5)
      for (let i = 0; i < valueTexts.length; i++) {
        const fill = rects[i].getAttribute("fill")!
        const ink = valueTexts[i].getAttribute("fill")!
        const fontSize = Number(valueTexts[i].getAttribute("font-size"))
        const ratio = contrastRatio(ink, fill)
        const required = fontSize >= 24 ? 3 : 4.5
        expect(ratio).toBeGreaterThanOrEqual(required)
      }
    })
  })

  describe("x_title/y_title (chart.axes fitting idiom reused)", () => {
    const withTitles = { ...basic, x_title: "Quarter", y_title: "Region" }

    it("renders x_title and a per-char stacked y_title", () => {
      const { container } = svg(heatmap.render(withTitles, { x: 0, y: 0, w: 900, h: 300 }, ctx))
      const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
      expect(texts.some((t) => t?.includes("Quarter") && t?.includes("→"))).toBe(true)
      expect(texts.filter((t) => "Region".includes(t ?? "\x00")).length).toBeGreaterThanOrEqual(4)
    })

    it("measure() grows when x_title/y_title are present vs absent", () => {
      const withT = heatmap.measure(withTitles, 900, ctx)
      const without = heatmap.measure(basic, 900, ctx)
      expect(withT).toBeGreaterThan(without)
    })

    it("fits an egregiously long x_title within its declared box (real-render h-overflow oracle), truncation-marked", () => {
      const egregious = { ...withTitles, x_title: "超长坐标轴标题".repeat(12) }
      const box = { x: 60, y: 200, w: 560 }
      const markup = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
          <g data-audit-box={`${box.x},${box.y},${box.w}`}>{heatmap.render(egregious, box, ctx)}</g>
        </svg>,
      )
      const hOverflow = auditSvgMarkup(markup).filter((i) => i.kind === "h-overflow")
      expect(hOverflow).toEqual([])
      const root = parseSvgRoot(markup)
      const xTitleText = Array.from(root.querySelectorAll("text")).find((t) =>
        t.textContent?.includes("超长坐标轴标题"),
      )
      expect(xTitleText?.getAttribute("data-truncated")).toBe("1")
    })
  })

  it("truncates an over-long column/row label with the data-truncated marker", () => {
    const longLabels = {
      type: "heatmap" as const,
      x_labels: ["一个非常非常非常非常长的列标签名称用于测试截断行为", "b"],
      y_labels: ["一个非常非常非常非常长的行标签名称用于测试截断行为", "b"],
      values: [
        [1, 2],
        [3, 4],
      ],
    }
    const { container } = svg(heatmap.render(longLabels, { x: 0, y: 0, w: 500, h: 300 }, ctx))
    const truncated = Array.from(container.querySelectorAll("text[data-truncated='1']"))
    expect(truncated.length).toBeGreaterThan(0)
  })

  it("box.h stretches row height to fill the given height (no cap, full-body idiom)", () => {
    const natural = heatmap.measure(basic, 900, ctx)
    const shortRender = svg(heatmap.render(basic, { x: 0, y: 0, w: 900, h: natural }, ctx))
    const tallRender = svg(heatmap.render(basic, { x: 0, y: 0, w: 900, h: natural * 3 }, ctx))
    const shortH = Number(shortRender.container.querySelector("rect")!.getAttribute("height"))
    const tallH = Number(tallRender.container.querySelector("rect")!.getAttribute("height"))
    expect(tallH).toBeGreaterThan(shortH * 2)
  })

  it("renders the schema-max 10x10 grid without throwing", () => {
    const big = {
      type: "heatmap" as const,
      x_labels: Array.from({ length: 10 }, (_, i) => `x${i}`),
      y_labels: Array.from({ length: 10 }, (_, i) => `y${i}`),
      values: Array.from({ length: 10 }, (_, r) => Array.from({ length: 10 }, (_, c) => r * 10 + c)),
      show_values: true,
    }
    const { container } = svg(heatmap.render(big, { x: 0, y: 0, w: 880, h: 400 }, ctx))
    expect(container.querySelectorAll("rect")).toHaveLength(100)
  })

  it("measure()/render() are deterministic — same input, same output", () => {
    const a = heatmap.measure(basic, 900, ctx)
    const b = heatmap.measure(basic, 900, ctx)
    expect(a).toBe(b)
    const markupA = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{heatmap.render(basic, { x: 0, y: 0, w: 900, h: 300 }, ctx)}</svg>,
    )
    const markupB = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{heatmap.render(basic, { x: 0, y: 0, w: 900, h: 300 }, ctx)}</svg>,
    )
    expect(markupA).toBe(markupB)
  })

  it("renders only svg2pptx-subset primitives", () => {
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{heatmap.render(basic, { x: 0, y: 0, w: 900, h: 300 }, ctx)}</svg>,
    )
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
  })
})
