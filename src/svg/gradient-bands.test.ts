import { describe, it, expect } from "vitest"
import { gradientBands } from "./gradient-bands"

describe("gradientBands", () => {
  it("returns n colours with first=from and last=to", () => {
    const bands = gradientBands("#000000", "#FF8040", 5)
    expect(bands).toHaveLength(5)
    expect(bands[0]).toBe("#000000")
    expect(bands[4]).toBe("#FF8040")
  })

  it("interpolates mid-colour R/G/B between endpoints", () => {
    const bands = gradientBands("#000000", "#646464", 3)
    // mid should be #323232 (50 in decimal = 0x32)
    expect(bands[1]).toBe("#323232")
  })

  it("produces uppercase hex", () => {
    const bands = gradientBands("#0a0b0c", "#fafbfc", 2)
    expect(bands[0]).toBe("#0A0B0C")
    expect(bands[1]).toBe("#FAFBFC")
  })

  it("mid-colours stay within endpoint range", () => {
    const from = "#102030"
    const to = "#D0E0F0"
    const bands = gradientBands(from, to, 24)
    expect(bands).toHaveLength(24)

    const parseChannel = (hex: string, offset: number) =>
      parseInt(hex.slice(1 + offset * 2, 3 + offset * 2), 16)

    for (let ch = 0; ch < 3; ch++) {
      const lo = parseChannel(bands[0], ch)
      const hi = parseChannel(bands[23], ch)
      for (const b of bands) {
        const v = parseChannel(b, ch)
        expect(v).toBeGreaterThanOrEqual(lo)
        expect(v).toBeLessThanOrEqual(hi)
      }
    }
  })

  it("throws for n < 2", () => {
    expect(() => gradientBands("#000000", "#FFFFFF", 1)).toThrow()
  })
})
