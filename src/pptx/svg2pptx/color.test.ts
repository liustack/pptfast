import { describe, it, expect } from "vitest"
import { svgColorToHex, svgColorTransparency } from "./color"

describe("svgColorToHex", () => {
  it("strips the hash and uppercases a 6-digit hex", () => {
    expect(svgColorToHex("#ff0000")).toBe("FF0000")
    expect(svgColorToHex("#1A4A8A")).toBe("1A4A8A")
  })

  it("expands 3-digit shorthand hex", () => {
    expect(svgColorToHex("#f00")).toBe("FF0000")
    expect(svgColorToHex("#abc")).toBe("AABBCC")
  })

  it("converts rgb() to hex", () => {
    expect(svgColorToHex("rgb(255, 0, 0)")).toBe("FF0000")
    expect(svgColorToHex("rgb(26, 74, 138)")).toBe("1A4A8A")
  })

  it("converts rgba() to hex, ignoring the alpha channel", () => {
    expect(svgColorToHex("rgba(255, 0, 0, 0.5)")).toBe("FF0000")
  })
})

describe("svgColorTransparency", () => {
  it("returns the transparency percent from an rgba alpha", () => {
    expect(svgColorTransparency("rgba(0, 0, 0, 0.5)")).toBe(50)
    expect(svgColorTransparency("rgba(0, 0, 0, 0.85)")).toBe(15)
  })

  it("returns null for fully opaque colors", () => {
    expect(svgColorTransparency("#ff0000")).toBeNull()
    expect(svgColorTransparency("rgb(0, 0, 0)")).toBeNull()
    expect(svgColorTransparency("rgba(0, 0, 0, 1)")).toBeNull()
  })
})
