import { describe, it, expect } from "vitest"
import { resolveStyle } from "./index"
import { renderSlideSvg, validateIr } from "../api"

describe("theme.style override merging", () => {
  it("merges palette/fonts/shape over the base theme", () => {
    const t = resolveStyle("consulting", {
      colors: { primary: "#0B5FFF", chartPalette: ["#111111"] },
      fonts: { heading: ["Inter"] },
      shape: { radius: 10 },
    })
    expect(t.colors.primary).toBe("#0B5FFF")
    expect(t.colors.chartPalette).toEqual(["#111111"])
    expect(t.fonts.heading).toEqual(["Inter"])
    expect(t.shape?.radius).toBe(10)
    expect(t.colors.bg).toBe(resolveStyle("consulting").colors.bg)
  })

  it("no style keeps the identical base reference (zero-cost default)", () => {
    expect(resolveStyle("consulting", undefined)).toBe(resolveStyle("consulting"))
  })

  it("theme.style reaches the rendered SVG", () => {
    const v = validateIr({
      version: "4",
      filename: "t.pptx",
      theme: { id: "consulting", style: { colors: { primary: "#0B5FFF" } } },
      // Explicit `layout` pin (P1 variety wave, task 3 re-pin): this test
      // only cares whether a `theme.style` override reaches render, not
      // which cover archetype auto-pick lands on — an omitted `layout` left
      // that pick to the seed/strategy-weighted auto-pick, which cover
      // identity weighting (task 3) can now legitimately shift to an
      // archetype that never paints `colors.primary` at all (e.g.
      // `tone-adaptive-header`, no color-block). `left-anchor` always
      // paints its 40%-width heading block in `colors.primary`
      // (`cover-left-anchor.tsx`), so pinning it decouples this assertion
      // from selection weighting entirely — the correct fix for a test that
      // was already fragile to any future re-weighting, not just this one.
      slides: [{ type: "cover", heading: "Hello Tokens", layout: "left-anchor" }],
    })
    expect(v.ok).toBe(true)
    expect(renderSlideSvg(v.ir!, 0)).toContain("#0B5FFF")
  })
})
