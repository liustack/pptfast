import { describe, it, expect } from "vitest"
import { getTheme } from "./index"
import { renderSlideSvg, validateIr } from "../api"

describe("theme.tokens override merging", () => {
  it("merges palette/fonts/shape over the base theme", () => {
    const t = getTheme("consulting", undefined, {
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

  it("tokens wins over the narrow theme.override", () => {
    const t = getTheme("consulting", { primary: "#222222" }, { colors: { primary: "#333333" } })
    expect(t.colors.primary).toBe("#333333")
  })

  it("no tokens keeps the identical base reference (zero-cost default)", () => {
    expect(getTheme("consulting", undefined, undefined)).toBe(getTheme("consulting"))
  })

  it("theme.tokens reaches the rendered SVG", () => {
    const v = validateIr({
      version: "2",
      filename: "t.pptx",
      theme: { id: "consulting", tokens: { colors: { primary: "#0B5FFF" } } },
      slides: [{ type: "cover", heading: "Hello Tokens" }],
    })
    expect(v.ok).toBe(true)
    expect(renderSlideSvg(v.ir!, 0)).toContain("#0B5FFF")
  })
})
