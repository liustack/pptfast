// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { pest } from "./pest"
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
  type: "pest" as const,
  political: { items: ["监管趋严", "地缘政治风险上升"] },
  economic: { items: ["利率下行周期"] },
  social: { items: ["消费习惯代际迁移"] },
  technological: { items: ["生成式AI快速渗透"] },
}

describe("pest component", () => {
  it("renders a 2x2 grid: 4 quadrant panels, one rect each (the P/E/S/T letter renders unboxed, as text)", () => {
    const { container } = svg(pest.render(basic, { x: 40, y: 60, w: 1000 }, ctx))
    expect(container.querySelectorAll("rect")).toHaveLength(4)
  })

  it("lays out 2 distinct columns and 2 distinct rows", () => {
    const { container } = svg(pest.render(basic, { x: 40, y: 60, w: 1000 }, ctx))
    const panels = Array.from(container.querySelectorAll("rect"))
    const xs = new Set(panels.map((r) => Math.round(Number(r.getAttribute("x")))))
    const ys = new Set(panels.map((r) => Math.round(Number(r.getAttribute("y")))))
    expect(xs.size).toBe(2)
    expect(ys.size).toBe(2)
  })

  it("badge letters are P/E/S/T, one each", () => {
    const { container } = svg(pest.render(basic, { x: 0, y: 0, w: 1000 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    for (const letter of ["P", "E", "S", "T"]) {
      expect(texts.filter((t) => t === letter)).toHaveLength(1)
    }
  })

  it("default quadrant titles are the fixed English full words", () => {
    const { container } = svg(pest.render(basic, { x: 0, y: 0, w: 1000 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    for (const label of ["Political", "Economic", "Social", "Technological"]) {
      expect(texts).toContain(label)
    }
  })

  it("a quadrant's own inline title overrides only that quadrant's default", () => {
    const withTitle = { ...basic, political: { ...basic.political, title: "政治" } }
    const { container } = svg(pest.render(withTitle, { x: 0, y: 0, w: 1000 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).toContain("政治")
    expect(texts).not.toContain("Political")
    expect(texts).toContain("Economic") // untouched quadrant keeps the default
  })

  it("renders every item across all four quadrants", () => {
    const { container } = svg(pest.render(basic, { x: 0, y: 0, w: 1000 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    for (const item of [
      ...basic.political.items,
      ...basic.economic.items,
      ...basic.social.items,
      ...basic.technological.items,
    ]) {
      expect(texts).toContain(item)
    }
  })

  it("quadrant panel fills are tinted (not plain colors.surface) and mutually distinct", () => {
    const { container } = svg(pest.render(basic, { x: 0, y: 0, w: 1000 }, ctx))
    const panels = Array.from(container.querySelectorAll("rect"))
    const fills = panels.map((r) => r.getAttribute("fill"))
    expect(new Set(fills).size).toBe(4)
    for (const fill of fills) expect(fill).not.toBe(ctx.colors.surface)
  })

  it("box.h stretches the grid to fill the given height (no 1.7x cap)", () => {
    const natural = pest.measure(basic, 1000, ctx)
    const shortRender = svg(pest.render(basic, { x: 0, y: 0, w: 1000, h: natural }, ctx))
    const tallRender = svg(pest.render(basic, { x: 0, y: 0, w: 1000, h: natural * 3 }, ctx))
    const shortPanels = Array.from(shortRender.container.querySelectorAll("rect")).filter(
      (r) => Number(r.getAttribute("width")) > 34,
    )
    const tallPanels = Array.from(tallRender.container.querySelectorAll("rect")).filter(
      (r) => Number(r.getAttribute("width")) > 34,
    )
    const shortRowH = Number(shortPanels[0].getAttribute("height"))
    const tallRowH = Number(tallPanels[0].getAttribute("height"))
    expect(tallRowH).toBeGreaterThan(shortRowH * 2)
  })

  it("measure()/render() are deterministic — same input, same output", () => {
    const a = pest.measure(basic, 1000, ctx)
    const b = pest.measure(basic, 1000, ctx)
    expect(a).toBe(b)
    const markupA = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{pest.render(basic, { x: 0, y: 0, w: 1000 }, ctx)}</svg>,
    )
    const markupB = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{pest.render(basic, { x: 0, y: 0, w: 1000 }, ctx)}</svg>,
    )
    expect(markupA).toBe(markupB)
  })

  it("renders only svg2pptx-subset primitives", () => {
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{pest.render(basic, { x: 0, y: 0, w: 1000 }, ctx)}</svg>,
    )
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
  })

  it("marks an over-long item truncated (data-truncated) rather than silently dropping text", () => {
    const longItem = {
      ...basic,
      political: { items: ["一".repeat(200)] },
    }
    const { container } = svg(pest.render(longItem, { x: 0, y: 0, w: 1000 }, ctx))
    expect(container.querySelector('text[data-truncated="1"]')).not.toBeNull()
  })
})
