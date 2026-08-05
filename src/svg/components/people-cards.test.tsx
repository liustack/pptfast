// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { assertSubset } from "../subset-validate"
import { parseSvgRoot } from "../serialize"
import { auditSvgMarkup } from "../audit/svg-audit"
import { readableOn } from "../ink"
import { deriveInitials } from "./people-initials"
import { peopleCards } from "./people-cards"
import type { ComponentCtx } from "./types"

const ctx: ComponentCtx = {
  colors: {
    bg: "#FFFFFF",
    surface: "#F4F4F4",
    primary: "#051C2C",
    accent: "#00A9E0",
    text: "#0A0E14",
    muted: "#6C6C6C",
    chartPalette: ["#051C2C", "#FFC72C", "#00A9E0", "#6C6C6C"],
  },
  fonts: { heading: "Georgia", body: "Arial", mono: "Consolas" },
  bodyFontPx: 24,
}

function svg(node: React.ReactElement) {
  return render(<svg>{node}</svg>)
}

const component2 = {
  type: "people_cards" as const,
  people: [
    { name: "Sarah Chen", role: "Engineering Lead", org: "Acme Corp" },
    { name: "王小明", role: "Product Manager", org: "Acme Corp" },
  ],
}

const component9 = {
  type: "people_cards" as const,
  title: "Speaker Lineup",
  people: [
    { name: "Dr. Amara Osei", role: "Why most warehouse automation projects stall at pilot", org: "Northbridge Robotics" },
    { name: "Liam Foster", role: "Pricing infrastructure software when nobody agrees on the unit", org: "Independent Consultant" },
    { name: "Priya Deshmukh", role: "What a decade of loyalty-program data actually predicts", org: "Solace Retail" },
    { name: "Tomás Rivera", role: "The dashboard nobody opens: a postmortem", org: "Cobalt Analytics" },
    { name: "Ingrid Larsen", role: "Clinical software that clinicians don't fight", org: "Vantage Health" },
    { name: "Jonas Kim", role: "Forecasting demand when the grid itself is the variable", org: "Bluepeak Energy" },
    { name: "Ren Watanabe", role: "Regulatory approval as a design constraint, not a gate", org: "Arden Biotech" },
    { name: "Sofia Almeida", role: "Route optimization after the easy wins are gone", org: "Frontline Logistics" },
    { name: "Marcus Webb", role: "What operators get wrong pitching to a growth-stage investor", org: "Meridian Capital" },
  ],
}

const component12 = {
  type: "people_cards" as const,
  people: Array.from({ length: 12 }, (_, i) => ({ name: `Person ${i + 1}` })),
}

describe("people_cards component", () => {
  it("renders one badge circle per person", () => {
    const { container } = svg(peopleCards.render(component2, { x: 0, y: 0, w: 900 }, ctx))
    expect(container.querySelectorAll("circle").length).toBe(2)
  })

  it("renders one card shell rect per person", () => {
    const { container } = svg(peopleCards.render(component2, { x: 0, y: 0, w: 900 }, ctx))
    expect(container.querySelectorAll("rect").length).toBe(2)
  })

  it("renders every person's full name as text", () => {
    const { container } = svg(peopleCards.render(component2, { x: 0, y: 0, w: 900 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).toContain("Sarah Chen")
    expect(texts).toContain("王小明")
  })

  it("renders each person's own derived initials inside their badge, not a shared placeholder", () => {
    const { container } = svg(peopleCards.render(component2, { x: 0, y: 0, w: 900 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).toContain(deriveInitials("Sarah Chen"))
    expect(texts).toContain(deriveInitials("王小明"))
  })

  it("badge fill rotates through chartPalette by list index, not seeded", () => {
    const { container } = svg(peopleCards.render(component2, { x: 0, y: 0, w: 900 }, ctx))
    const circles = Array.from(container.querySelectorAll("circle"))
    expect(circles[0]?.getAttribute("fill")).toBe(ctx.colors.chartPalette[0])
    expect(circles[1]?.getAttribute("fill")).toBe(ctx.colors.chartPalette[1])
  })

  it("badge ink is resolved via readableOn against each badge's own fill, per palette entry", () => {
    const { container } = svg(peopleCards.render(component2, { x: 0, y: 0, w: 900 }, ctx))
    const circles = Array.from(container.querySelectorAll("circle"))
    const badgeTexts = Array.from(container.querySelectorAll("text")).filter(
      (t) => t.textContent === deriveInitials("Sarah Chen") || t.textContent === deriveInitials("王小明"),
    )
    const fill0 = circles[0]!.getAttribute("fill")!
    const matchingLabel = badgeTexts.find((t) => t.textContent === deriveInitials("Sarah Chen"))
    expect(matchingLabel?.getAttribute("fill")).toBe(readableOn(fill0))
  })

  it("renders role and org text using the muted color", () => {
    const { container } = svg(peopleCards.render(component2, { x: 0, y: 0, w: 900 }, ctx))
    const texts = Array.from(container.querySelectorAll("text"))
    const role = texts.find((t) => t.textContent?.includes("Engineering Lead"))
    const org = texts.find((t) => t.textContent === "Acme Corp")
    expect(role?.getAttribute("fill")).toBe(ctx.colors.muted)
    expect(org?.getAttribute("fill")).toBe(ctx.colors.muted)
  })

  it("omits role/org text entirely when unset — only the badge initials + name render per card", () => {
    const component = { type: "people_cards" as const, people: [{ name: "Solo One" }, { name: "Solo Two" }] }
    const { container } = svg(peopleCards.render(component, { x: 0, y: 0, w: 900 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    // 2 people x (1 badge-initials + 1 name) = 4 text nodes, no role/org lines.
    expect(texts).toHaveLength(4)
    expect(texts).toContain("Solo One")
    expect(texts).toContain("Solo Two")
    expect(texts).toContain(deriveInitials("Solo One"))
    expect(texts).toContain(deriveInitials("Solo Two"))
  })

  it("renders an optional overall title above the grid", () => {
    const { container } = svg(peopleCards.render(component9, { x: 0, y: 0, w: 1200 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).toContain("Speaker Lineup")
  })

  it("omits the title element entirely when unset — measure() reports no title band", () => {
    const untitled = { type: "people_cards" as const, people: component9.people }
    const measuredUntitled = peopleCards.measure(untitled, 1200, ctx)
    const measuredTitled = peopleCards.measure(component9, 1200, ctx)
    expect(measuredTitled).toBeGreaterThan(measuredUntitled)
    const { container } = svg(peopleCards.render(untitled, { x: 0, y: 0, w: 1200 }, ctx))
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).not.toContain("Speaker Lineup")
  })

  it("all 9 people are visible (badge + name each) at the p12 evidence's own 9-speaker count", () => {
    const { container } = svg(peopleCards.render(component9, { x: 0, y: 0, w: 1200 }, ctx))
    expect(container.querySelectorAll("circle").length).toBe(9)
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
    for (const person of component9.people) {
      expect(texts).toContain(person.name)
    }
  })

  it("measure returns a positive height, growing with row count (2 vs 9 vs 12 people)", () => {
    const h2 = peopleCards.measure(component2, 900, ctx)
    const h9 = peopleCards.measure(component9, 1200, ctx)
    const h12 = peopleCards.measure(component12, 1200, ctx)
    expect(h2).toBeGreaterThan(0)
    expect(h9).toBeGreaterThan(h2)
    expect(h12).toBeGreaterThan(0)
  })

  it("wraps everything in a translated group", () => {
    const { container } = svg(peopleCards.render(component2, { x: 80, y: 100, w: 900 }, ctx))
    const g = container.querySelector("g")
    const m = /translate\(([\d.]+),([\d.]+)\)/.exec(g?.getAttribute("transform") ?? "")
    expect(m).not.toBeNull()
  })

  it("stays inside the controlled SVG element subset (no foreignObject/nested svg/gradient)", () => {
    const markup = renderToStaticMarkup(
      <svg viewBox="0 0 1280 720">{peopleCards.render(component12, { x: 40, y: 40, w: 1200 }, ctx)}</svg>,
    )
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
  })

  it("passes the overflow auditor at the schema min (2), the p12 count (9), and the schema max (12)", () => {
    for (const component of [component2, component9, component12]) {
      const h = peopleCards.measure(component, 1200, ctx)
      const markup = renderToStaticMarkup(
        <svg viewBox="0 0 1280 720">{peopleCards.render(component, { x: 40, y: 40, w: 1200, h }, ctx)}</svg>,
      )
      expect(h).toBeGreaterThan(0)
      expect(auditSvgMarkup(markup)).toEqual([])
    }
  })

  it("is deterministic — the same IR renders byte-identical SVG markup on repeat calls", () => {
    const box = { x: 60, y: 60, w: 1200 }
    const a = renderToStaticMarkup(<svg>{peopleCards.render(component9, box, ctx)}</svg>)
    const b = renderToStaticMarkup(<svg>{peopleCards.render(component9, box, ctx)}</svg>)
    expect(a).toBe(b)
  })

  it("is deterministic across the schema's full n range (2, 9, 12), not just one count", () => {
    for (const component of [component2, component9, component12]) {
      const box = { x: 0, y: 0, w: 1200 }
      const a = renderToStaticMarkup(<svg>{peopleCards.render(component, box, ctx)}</svg>)
      const b = renderToStaticMarkup(<svg>{peopleCards.render(component, box, ctx)}</svg>)
      expect(a).toBe(b)
    }
  })

  it("grid tiers: 2-4 people lay out on a single row (all cards share the same cardY)", () => {
    const { container } = svg(peopleCards.render(component2, { x: 0, y: 0, w: 900 }, ctx))
    const boxes = Array.from(container.querySelectorAll("[data-audit-box]")).map((el) =>
      el.getAttribute("data-audit-box"),
    )
    const ys = boxes.map((b) => b!.split(",")[1])
    expect(new Set(ys).size).toBe(1)
  })

  it("grid tiers: 9 people lay out on 3 rows (9-12 tier)", () => {
    const { container } = svg(peopleCards.render(component9, { x: 0, y: 0, w: 1200 }, ctx))
    const boxes = Array.from(container.querySelectorAll("[data-audit-box]")).map((el) =>
      el.getAttribute("data-audit-box"),
    )
    const ys = boxes.map((b) => b!.split(",")[1])
    expect(new Set(ys).size).toBe(3)
  })

  it("grid tiers: 12 people lay out on 3 rows with 4 columns each", () => {
    const { container } = svg(peopleCards.render(component12, { x: 0, y: 0, w: 1200 }, ctx))
    const boxes = Array.from(container.querySelectorAll("[data-audit-box]")).map((el) =>
      el.getAttribute("data-audit-box"),
    )
    const ys = boxes.map((b) => b!.split(",")[1])
    expect(new Set(ys).size).toBe(3)
  })

  it("density stretch: box.h larger than measured grows every card's shell evenly", () => {
    const measuredH = peopleCards.measure(component2, 900, ctx)
    const { container } = svg(peopleCards.render(component2, { x: 0, y: 0, w: 900, h: measuredH + 120 }, ctx))
    const rects = Array.from(container.querySelectorAll("rect"))
    const heights = rects.map((r) => Number(r.getAttribute("height")))
    expect(heights[0]).toBeGreaterThan(0)
    expect(new Set(heights.map((h) => Math.round(h))).size).toBe(1)
  })
})
