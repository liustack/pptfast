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

  // Review round 3 re-filed the 2026-08-15 complaint ("圆点距标题 8.5px、距要
  // 点 17px"): the dot meter still read as stuck to the underside of the
  // title. Nothing pinned the header's vertical rhythm, so the constants
  // could be (and were) raised without the render moving the way the raise
  // claimed. These three assertions pin the rhythm itself, in panel-local
  // coordinates read straight off the drawn attributes.
  describe("intensity-header vertical rhythm", () => {
    /** Title baseline, dot band and first item row of one panel, as drawn. */
    function headerGeometry(force: string) {
      const { container } = svg(fiveForces.render(basic, { x: 0, y: 0, w: 1000 }, ctx))
      const rect = container.querySelector(`rect[data-force="${force}"]`)!
      const panel = rect.parentElement!
      const texts = Array.from(panel.querySelectorAll("text"))
      const labelBaseline = Number(texts[0]!.getAttribute("y"))
      const dot = panel.querySelector("[data-intensity-dot]")!
      const dotR = Number(dot.getAttribute("r"))
      const dotTop = Number(dot.getAttribute("cy")) - dotR
      const itemFontSize = Number(texts[1]!.getAttribute("font-size"))
      // `renderPanel` draws an item's baseline at `rowY + itemSize`.
      const firstItemRowY = Number(texts[1]!.getAttribute("y")) - itemFontSize
      return { labelBaseline, dotR, dotTop, dotBottom: dotTop + dotR * 2, firstItemRowY }
    }

    it("drops the dot meter a clear step below the title baseline, not half a dot below it", () => {
      const g = headerGeometry("rivalry")
      expect(g.dotTop - g.labelBaseline).toBe(16)
    })

    it("draws the marker inside the band panelLayout reserves for it — declared air is drawn air", () => {
      // The reserved band is `gapLabelMarker + markerDotR * 2` below the
      // title baseline (`panelLayout`'s `markerH`), and the item list starts
      // `gapHeaderItems` after that band ends. Drawing the marker any higher
      // than its own band top spends part of the title gap and leaves the
      // slack at the bottom instead, which is exactly what the old
      // `- markerDotR / 2` did.
      const g = headerGeometry("rivalry")
      expect(g.firstItemRowY - g.dotBottom).toBe(18)
    })

    it("separates the header from the items by more than the title separates from the dots", () => {
      const g = headerGeometry("rivalry")
      const withinHeader = g.dotTop - g.labelBaseline
      const headerToItems = g.firstItemRowY - g.dotBottom
      expect(headerToItems).toBeGreaterThan(withinHeader)
    })

    it("a panel without intensity keeps the same header-to-items air, measured from the title baseline", () => {
      // `buyer_power` carries no intensity, so `markerH` is 0 and the items
      // start `gapHeaderItems` straight off the title baseline. Pinned so a
      // future raise can't move only the with-marker branch.
      const { container } = svg(fiveForces.render(basic, { x: 0, y: 0, w: 1000 }, ctx))
      const panel = container.querySelector('rect[data-force="buyer_power"]')!.parentElement!
      const texts = Array.from(panel.querySelectorAll("text"))
      const labelBaseline = Number(texts[0]!.getAttribute("y"))
      const itemFontSize = Number(texts[1]!.getAttribute("font-size"))
      const firstItemRowY = Number(texts[1]!.getAttribute("y")) - itemFontSize
      expect(firstItemRowY - labelBaseline).toBe(18)
    })

    // The raise above costs 30px of natural height, and the one fixture
    // already at the edge (full-matrix-contrast's schema-max sweep) could
    // not pay it — it needed a font scale of 0.756 against a 0.792 floor,
    // and 15.2px of item text spilled out of the content rect on all 17
    // themes. Air is the only vertical term with no legibility obligation,
    // so it is what an undersized box spends first.
    describe("an undersized box spends air before it shrinks type", () => {
      /** Header rhythm and item type size of one panel at a given box height. */
      function atHeight(h: number) {
        const { container } = svg(fiveForces.render(basic, { x: 0, y: 0, w: 1000, h }, ctx))
        const panel = container.querySelector('rect[data-force="rivalry"]')!.parentElement!
        const texts = Array.from(panel.querySelectorAll("text"))
        const labelBaseline = Number(texts[0]!.getAttribute("y"))
        const dot = panel.querySelector("[data-intensity-dot]")!
        const dotR = Number(dot.getAttribute("r"))
        const dotTop = Number(dot.getAttribute("cy")) - dotR
        const itemSize = Number(texts[1]!.getAttribute("font-size"))
        return {
          itemSize,
          labelSize: Number(texts[0]!.getAttribute("font-size")),
          gapLabelMarker: dotTop - labelBaseline,
          gapHeaderItems: Number(texts[1]!.getAttribute("y")) - itemSize - (dotTop + dotR * 2),
        }
      }

      // Three governing row bands, each carrying an intensity marker, each
      // holding 5px of marker gap and 5px of header gap above its tight
      // value: the comfort the box has to be able to afford.
      const COMFORT_SPAN = 30
      const natural = fiveForces.measure(basic, 1000, ctx)

      it("keeps the full comfortable rhythm when the box is exactly its natural height", () => {
        const g = atHeight(natural)
        expect(g.gapLabelMarker).toBe(16)
        expect(g.gapHeaderItems).toBe(18)
      })

      it("gives the air back, and only the air, when the box is short by exactly the comfort span", () => {
        const g = atHeight(natural - COMFORT_SPAN)
        // Air fully spent: both gaps are back at their pre-2026-08-20 values…
        expect(g.gapLabelMarker).toBe(11)
        expect(g.gapHeaderItems).toBe(13)
        // …and type has not been touched at all, which is the whole point.
        expect(g.itemSize).toBe(12)
        expect(g.labelSize).toBe(13.5)
      })

      it("slides the air part-way for a box short by less than the span — no cliff at natural height", () => {
        const g = atHeight(natural - COMFORT_SPAN / 2)
        expect(g.gapLabelMarker).toBeCloseTo(13.5, 5)
        expect(g.gapHeaderItems).toBeCloseTo(15.5, 5)
        expect(g.itemSize).toBe(12)
      })

      it("only then shrinks type, with the air already at its tight value", () => {
        const g = atHeight(natural * 0.6)
        expect(g.itemSize).toBeLessThan(12)
        // Air is at tight and rides the same fontScale as everything else,
        // so it never climbs back above the tight value while type is small.
        expect(g.gapLabelMarker).toBeCloseTo(11 * (g.itemSize / 12), 5)
      })

      it("never shrinks type below the item-legibility floor, air spent or not", () => {
        const g = atHeight(natural * 0.2)
        expect(g.itemSize).toBeCloseTo(12 * (9.5 / 12), 5)
      })
    })

    it("measure() budgets the header band it draws — every intensity panel's own reserved air", () => {
      // Guards the other half of the same defect: the drawn rhythm above and
      // the height `measure()` asks the layout engine for must move
      // together, or the panels grow air the component never claimed.
      const withoutMarkers = {
        ...basic,
        rivalry: { items: basic.rivalry.items },
        new_entrants: { items: basic.new_entrants.items },
        supplier_power: { items: basic.supplier_power.items },
        substitutes: { items: basic.substitutes.items },
      }
      // Three of the five panels govern a row band (top / mid / bottom), so
      // dropping every marker drops three reserved bands of
      // `GAP_LABEL_MARKER + MARKER_DOT_R * 2` = 16 + 8.
      expect(fiveForces.measure(basic, 1000, ctx) - fiveForces.measure(withoutMarkers, 1000, ctx)).toBe(24 * 3)
    })
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
