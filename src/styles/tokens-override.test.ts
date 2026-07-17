import { describe, it, expect } from "vitest"
import { getTheme } from "./index"
import { renderSlideSvg, validateIr } from "../api"

describe("style.tokens override merging", () => {
  it("merges palette/fonts/shape over the base theme", () => {
    const t = getTheme("consulting", {
      colors: { primary: "#0B5FFF", chartPalette: ["#111111"] },
      fonts: { heading: ["Inter"] },
      shape: { radius: 10 },
    })
    expect(t.colors.primary).toBe("#0B5FFF")
    expect(t.colors.chartPalette).toEqual(["#111111"])
    expect(t.fonts.heading).toEqual(["Inter"])
    expect(t.shape?.radius).toBe(10)
    expect(t.colors.bg).toBe(getTheme("consulting").colors.bg)
  })

  it("no tokens keeps the identical base reference (zero-cost default)", () => {
    expect(getTheme("consulting", undefined)).toBe(getTheme("consulting"))
  })

  it("style.tokens reaches the rendered SVG", () => {
    const v = validateIr({
      version: "3",
      filename: "t.pptx",
      style: { id: "consulting", tokens: { colors: { primary: "#0B5FFF" } } },
      slides: [{ type: "cover", heading: "Hello Tokens" }],
    })
    expect(v.ok).toBe(true)
    expect(renderSlideSvg(v.ir!, 0)).toContain("#0B5FFF")
  })
})
