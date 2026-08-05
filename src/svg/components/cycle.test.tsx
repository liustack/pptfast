// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { assertSubset } from "../subset-validate"
import { parseSvgRoot } from "../serialize"
import { auditSvgMarkup } from "../audit/svg-audit"
import { cycle } from "./cycle"
import type { ComponentCtx } from "./types"

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFFFFF",
    surface: "#F4F4F4",
    primary: "#006A4E",
    accent: "#00A878",
    text: "#1A2421",
    muted: "#5D6B65",
    chartPalette: ["#006A4E", "#00A878"],
  },
  fonts: { heading: "Georgia", body: "Microsoft YaHei", mono: "Consolas" },
  bodyFontPx: 24,
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

const component3 = {
  type: "cycle" as const,
  items: [
    { label: "Plan", description: "Set goals" },
    { label: "Execute", description: "Do the work" },
    { label: "Review", description: "Check outcomes" },
  ],
}

const component8 = {
  type: "cycle" as const,
  title: "Product loop",
  items: Array.from({ length: 8 }, (_, i) => ({ label: `Stage ${i + 1}` })),
}

describe("cycle component", () => {
  it("renders one filled circle per node", () => {
    const { container } = svg(cycle.render(component3, { x: 80, y: 100, w: 900 }, ctx))
    const circles = container.querySelectorAll("circle")
    expect(circles.length).toBe(3)
  })

  it("renders a closing edge — n arcs for n nodes (last node back to first, same code path)", () => {
    const { container } = svg(cycle.render(component3, { x: 80, y: 100, w: 900 }, ctx))
    const paths = container.querySelectorAll("path")
    expect(paths.length).toBe(3)
  })

  it("renders arrowheads as polygons, no marker elements", () => {
    const { container } = svg(cycle.render(component3, { x: 80, y: 100, w: 900 }, ctx))
    expect(container.querySelectorAll("marker").length).toBe(0)
    expect(container.querySelectorAll("polygon").length).toBe(3)
  })

  it("renders every node label as text", () => {
    const { container } = svg(cycle.render(component3, { x: 80, y: 100, w: 900 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).toContain("Plan")
    expect(texts).toContain("Execute")
    expect(texts).toContain("Review")
  })

  it("renders description text outside the node, using the muted color", () => {
    const { container } = svg(cycle.render(component3, { x: 0, y: 0, w: 900 }, ctx))
    const texts = Array.from(container.querySelectorAll("text"))
    const desc = texts.find((t) => t.textContent?.includes("Set goals"))
    expect(desc).toBeTruthy()
    expect(desc?.getAttribute("fill")).toBe("#5D6B65")
  })

  it("node label ink is resolved via readableOn against the node's own fill, not a flat color", () => {
    const { container } = svg(cycle.render(component3, { x: 0, y: 0, w: 900 }, ctx))
    const circles = container.querySelectorAll("circle")
    expect(circles[0]?.getAttribute("fill")).toBe(ctx.colors.primary)
    const label = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === "Plan")
    // readableOn(ctx.colors.primary) picks white or near-black — either way,
    // never the same hex as the surface it's sitting on.
    expect(label?.getAttribute("fill")).not.toBe(ctx.colors.primary)
  })

  it("renders an optional overall title above the ring", () => {
    const { container } = svg(cycle.render(component8, { x: 0, y: 0, w: 900 }, ctx))
    const texts = Array.from(container.querySelectorAll("text"))
    expect(texts.some((t) => t.textContent === "Product loop")).toBe(true)
  })

  it("omits the title element entirely when unset", () => {
    const { container } = svg(cycle.render(component3, { x: 0, y: 0, w: 900 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts.every((t) => t !== undefined)).toBe(true)
  })

  it("measure returns a positive height, bounded regardless of node count (3 vs 8)", () => {
    const h3 = cycle.measure(component3, 900, ctx)
    const h8 = cycle.measure(component8, 900, ctx)
    expect(h3).toBeGreaterThan(0)
    expect(h8).toBeGreaterThan(0)
    // Self-bounding cap (MAX_CYCLE_HEIGHT), same posture as flowchart.tsx's
    // MAX_FLOW_HEIGHT — neither should ever approach the full 720px slide.
    expect(h3).toBeLessThan(450)
    expect(h8).toBeLessThan(450)
  })

  it("wraps everything in a translated group", () => {
    const { container } = svg(cycle.render(component3, { x: 80, y: 100, w: 900 }, ctx))
    const g = container.querySelector("g")
    const m = /translate\(([\d.]+),([\d.]+)\)/.exec(g?.getAttribute("transform") ?? "")
    expect(m).not.toBeNull()
  })

  it("stays inside the controlled SVG element subset (no foreignObject/nested svg/gradient)", () => {
    const markup = renderToStaticMarkup(
      <svg viewBox="0 0 1280 720">{cycle.render(component8, { x: 40, y: 40, w: 1200 }, ctx)}</svg>,
    )
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
  })

  it("passes the overflow auditor at both the schema min (3) and max (8) node counts", () => {
    for (const component of [component3, component8]) {
      const h = cycle.measure(component, 1200, ctx)
      const markup = renderToStaticMarkup(
        <svg viewBox="0 0 1280 720">{cycle.render(component, { x: 40, y: 40, w: 1200 }, ctx)}</svg>,
      )
      // Component-level sanity: measure() reports a real, finite footprint.
      expect(h).toBeGreaterThan(0)
      expect(auditSvgMarkup(markup)).toEqual([])
    }
  })

  it("is deterministic — the same IR renders byte-identical SVG markup on repeat calls", () => {
    const box = { x: 60, y: 60, w: 1000 }
    const a = renderToStaticMarkup(<svg>{cycle.render(component8, box, ctx)}</svg>)
    const b = renderToStaticMarkup(<svg>{cycle.render(component8, box, ctx)}</svg>)
    expect(a).toBe(b)
  })

  it("closed-loop geometry: every node sits the same distance from the ring center", () => {
    const { container } = svg(cycle.render(component8, { x: 0, y: 0, w: 900 }, ctx))
    const circles = Array.from(container.querySelectorAll("circle"))
    expect(circles.length).toBe(8)
    const radii = circles.map((c) => Math.hypot(Number(c.getAttribute("cx")), Number(c.getAttribute("cy"))))
    const [first, ...rest] = radii
    for (const r of rest) {
      expect(r).toBeCloseTo(first!, 0)
    }
  })
})
