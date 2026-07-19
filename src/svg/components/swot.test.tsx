// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { swot } from "./swot"
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
  bodyFontPx: 24, // balanced default — this suite doesn't exercise body-text sizing
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

const basic = {
  type: "swot" as const,
  strengths: ["强大的品牌认知度", "稳定的现金流"],
  weaknesses: ["产品线相对单一"],
  opportunities: ["新兴市场快速增长"],
  threats: ["新进入者价格战风险"],
}

describe("swot component", () => {
  it("renders a 2x2 grid: 4 quadrant panels, one rect each (the S/W/O/T letter renders unboxed, as text)", () => {
    const { container } = svg(swot.render(basic, { x: 40, y: 60, w: 1000 }, ctx))
    expect(container.querySelectorAll("rect")).toHaveLength(4)
  })

  it("lays out 2 distinct columns and 2 distinct rows", () => {
    const { container } = svg(swot.render(basic, { x: 40, y: 60, w: 1000 }, ctx))
    const panels = Array.from(container.querySelectorAll("rect"))
    const xs = new Set(panels.map((r) => Math.round(Number(r.getAttribute("x")))))
    const ys = new Set(panels.map((r) => Math.round(Number(r.getAttribute("y")))))
    expect(xs.size).toBe(2)
    expect(ys.size).toBe(2)
  })

  it("badge letters are S/W/O/T, one each", () => {
    const { container } = svg(swot.render(basic, { x: 0, y: 0, w: 1000 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    for (const letter of ["S", "W", "O", "T"]) {
      expect(texts.filter((t) => t === letter)).toHaveLength(1)
    }
  })

  it("default quadrant titles are the fixed English full words", () => {
    const { container } = svg(swot.render(basic, { x: 0, y: 0, w: 1000 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    for (const label of ["Strengths", "Weaknesses", "Opportunities", "Threats"]) {
      expect(texts).toContain(label)
    }
  })

  it("labels override replaces only the overridden quadrant's title", () => {
    const withLabels = { ...basic, labels: { strengths: "优势" } }
    const { container } = svg(swot.render(withLabels, { x: 0, y: 0, w: 1000 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).toContain("优势")
    expect(texts).not.toContain("Strengths")
    expect(texts).toContain("Weaknesses") // untouched quadrant keeps the default
  })

  it("renders every item across all four quadrants (5 total here)", () => {
    const { container } = svg(swot.render(basic, { x: 0, y: 0, w: 1000 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    for (const item of [...basic.strengths, ...basic.weaknesses, ...basic.opportunities, ...basic.threats]) {
      expect(texts).toContain(item)
    }
  })

  it("quadrant panel fills are tinted (not plain colors.surface) and mutually distinct", () => {
    const { container } = svg(swot.render(basic, { x: 0, y: 0, w: 1000 }, ctx))
    const panels = Array.from(container.querySelectorAll("rect"))
    const fills = panels.map((r) => r.getAttribute("fill"))
    expect(new Set(fills).size).toBe(4)
    for (const fill of fills) expect(fill).not.toBe(ctx.colors.surface)
  })

  it("box.h stretches the grid to fill the given height (no 1.7x cap)", () => {
    const natural = swot.measure(basic, 1000, ctx)
    const shortRender = svg(swot.render(basic, { x: 0, y: 0, w: 1000, h: natural }, ctx))
    const tallRender = svg(swot.render(basic, { x: 0, y: 0, w: 1000, h: natural * 3 }, ctx))
    const shortPanels = Array.from(shortRender.container.querySelectorAll("rect")).filter(
      (r) => Number(r.getAttribute("width")) > 34,
    )
    const tallPanels = Array.from(tallRender.container.querySelectorAll("rect")).filter(
      (r) => Number(r.getAttribute("width")) > 34,
    )
    const shortRowH = Number(shortPanels[0].getAttribute("height"))
    const tallRowH = Number(tallPanels[0].getAttribute("height"))
    // A 3x taller box grows each quadrant row well past the natural height —
    // unlike STRETCHABLE_TYPES' growStretchables path, there is no cap here.
    expect(tallRowH).toBeGreaterThan(shortRowH * 2)
  })

  it("measure()/render() are deterministic — same input, same output", () => {
    const a = swot.measure(basic, 1000, ctx)
    const b = swot.measure(basic, 1000, ctx)
    expect(a).toBe(b)
    const markupA = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{swot.render(basic, { x: 0, y: 0, w: 1000 }, ctx)}</svg>,
    )
    const markupB = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{swot.render(basic, { x: 0, y: 0, w: 1000 }, ctx)}</svg>,
    )
    expect(markupA).toBe(markupB)
  })

  it("renders only svg2pptx-subset primitives", () => {
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{swot.render(basic, { x: 0, y: 0, w: 1000 }, ctx)}</svg>,
    )
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
  })
})
