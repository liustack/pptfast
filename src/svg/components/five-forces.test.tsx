// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { fiveForces } from "./five-forces"
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
  type: "five_forces" as const,
  rivalry: { items: ["头部三家份额超60%"], intensity: "high" as const },
  new_entrants: { items: ["牌照与资质壁垒高"], intensity: "low" as const },
  supplier_power: { items: ["核心元器件二供不足"], intensity: "medium" as const },
  buyer_power: { items: ["大客户集中度高"] },
  substitutes: { items: ["开源方案免费可用"], intensity: "medium" as const },
}

describe("five_forces component", () => {
  it("renders 5 panels, one rect each", () => {
    const { container } = svg(fiveForces.render(basic, { x: 40, y: 60, w: 1000 }, ctx))
    const panels = Array.from(container.querySelectorAll("rect"))
    expect(panels).toHaveLength(5)
  })

  it("draws 4 native <line> connectors from the center panel to each surrounding force", () => {
    const { container } = svg(fiveForces.render(basic, { x: 0, y: 0, w: 1000 }, ctx))
    expect(container.querySelectorAll("line")).toHaveLength(4)
  })

  it("default labels are the classic Porter's-five-forces English full names", () => {
    const { container } = svg(fiveForces.render(basic, { x: 0, y: 0, w: 1000 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).toContain("Competitive Rivalry")
    expect(texts).toContain("Threat of New Entrants")
    expect(texts).toContain("Supplier Power")
    expect(texts).toContain("Buyer Power")
    expect(texts).toContain("Threat of Substitutes")
  })

  it("a panel's own inline label overrides only that panel's default", () => {
    const withLabel = { ...basic, rivalry: { ...basic.rivalry, label: "竞争烈度" } }
    const { container } = svg(fiveForces.render(withLabel, { x: 0, y: 0, w: 1000 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).toContain("竞争烈度")
    expect(texts).not.toContain("Competitive Rivalry")
    expect(texts).toContain("Supplier Power") // untouched panel keeps the default
  })

  it("renders every item across all five panels", () => {
    const { container } = svg(fiveForces.render(basic, { x: 0, y: 0, w: 1000 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    for (const panel of [basic.rivalry, basic.new_entrants, basic.supplier_power, basic.buyer_power, basic.substitutes]) {
      for (const item of panel.items) expect(texts).toContain(item)
    }
  })

  it("intensity renders a deterministic filled-dot count: low=1, medium=2, high=3 (out of 3)", () => {
    const { container } = svg(fiveForces.render(basic, { x: 0, y: 0, w: 1000 }, ctx))
    const rivalryFilled = container.querySelectorAll(
      '[data-intensity-group="rivalry"] [data-intensity-dot="filled"]',
    )
    const newEntrantsFilled = container.querySelectorAll(
      '[data-intensity-group="new_entrants"] [data-intensity-dot="filled"]',
    )
    const supplierFilled = container.querySelectorAll(
      '[data-intensity-group="supplier_power"] [data-intensity-dot="filled"]',
    )
    expect(rivalryFilled).toHaveLength(3) // high
    expect(newEntrantsFilled).toHaveLength(1) // low
    expect(supplierFilled).toHaveLength(2) // medium
  })

  it("omitting intensity renders no intensity dots for that panel", () => {
    const { container } = svg(fiveForces.render(basic, { x: 0, y: 0, w: 1000 }, ctx))
    const buyerDots = container.querySelectorAll('[data-intensity-group="buyer_power"] [data-intensity-dot]')
    expect(buyerDots).toHaveLength(0)
  })

  it("panel fills are tinted (not plain colors.surface) and mutually distinct across all 5", () => {
    const { container } = svg(fiveForces.render(basic, { x: 0, y: 0, w: 1000 }, ctx))
    const panels = Array.from(container.querySelectorAll("rect"))
    const fills = panels.map((r) => r.getAttribute("fill"))
    expect(new Set(fills).size).toBe(5)
    for (const fill of fills) expect(fill).not.toBe(ctx.colors.surface)
  })

  it("box.h stretches the layout to fill the given height (no 1.7x cap)", () => {
    const natural = fiveForces.measure(basic, 1000, ctx)
    const shortRender = svg(fiveForces.render(basic, { x: 0, y: 0, w: 1000, h: natural }, ctx))
    const tallRender = svg(fiveForces.render(basic, { x: 0, y: 0, w: 1000, h: natural * 2.5 }, ctx))
    const shortH = Number(
      shortRender.container.querySelector('rect[data-force="rivalry"]')!.getAttribute("height"),
    )
    const tallH = Number(
      tallRender.container.querySelector('rect[data-force="rivalry"]')!.getAttribute("height"),
    )
    expect(tallH).toBeGreaterThan(shortH * 1.5)
  })

  it("measure()/render() are deterministic — same input, same output", () => {
    const a = fiveForces.measure(basic, 1000, ctx)
    const b = fiveForces.measure(basic, 1000, ctx)
    expect(a).toBe(b)
    const markupA = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{fiveForces.render(basic, { x: 0, y: 0, w: 1000 }, ctx)}</svg>,
    )
    const markupB = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{fiveForces.render(basic, { x: 0, y: 0, w: 1000 }, ctx)}</svg>,
    )
    expect(markupA).toBe(markupB)
  })

  it("renders only svg2pptx-subset primitives", () => {
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">{fiveForces.render(basic, { x: 0, y: 0, w: 1000 }, ctx)}</svg>,
    )
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
  })

  it("marks an over-long item truncated (data-truncated) rather than silently dropping text", () => {
    const longItem = {
      ...basic,
      rivalry: { ...basic.rivalry, items: ["一".repeat(200)] },
    }
    const { container } = svg(fiveForces.render(longItem, { x: 0, y: 0, w: 1000 }, ctx))
    expect(container.querySelector('text[data-truncated="1"]')).not.toBeNull()
  })
})
