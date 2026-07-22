import { describe, expect, it } from "vitest"
import { rotateChartPalette, resolveChartPaletteOffset } from "./chart-palette"

describe("rotateChartPalette", () => {
  const palette = ["a", "b", "c", "d"]

  it("offset 0 is the identity rotation (same values, fresh array)", () => {
    const result = rotateChartPalette(palette, 0)
    expect(result).toEqual(palette)
    expect(result).not.toBe(palette)
  })

  it("a multiple of palette.length is also the identity rotation", () => {
    expect(rotateChartPalette(palette, 4)).toEqual(palette)
    expect(rotateChartPalette(palette, 8)).toEqual(palette)
  })

  it("offset 1 starts the result at the original index 1, wrapping the head to the tail", () => {
    expect(rotateChartPalette(palette, 1)).toEqual(["b", "c", "d", "a"])
  })

  it("offset 3 starts the result at the original index 3", () => {
    expect(rotateChartPalette(palette, 3)).toEqual(["d", "a", "b", "c"])
  })

  it("an offset larger than palette.length wraps via modulo", () => {
    expect(rotateChartPalette(palette, 5)).toEqual(rotateChartPalette(palette, 1))
    expect(rotateChartPalette(palette, 9)).toEqual(rotateChartPalette(palette, 1))
  })

  it("a negative offset wraps correctly", () => {
    expect(rotateChartPalette(palette, -1)).toEqual(rotateChartPalette(palette, 3))
  })

  it("rotation is a pure reordering — same multiset of values for every offset", () => {
    for (let offset = 0; offset < 8; offset++) {
      expect([...rotateChartPalette(palette, offset)].sort()).toEqual([...palette].sort())
    }
  })

  it("relative adjacency is preserved: series i and series i+1 stay exactly one step apart regardless of phase", () => {
    for (let offset = 0; offset < palette.length; offset++) {
      const rotated = rotateChartPalette(palette, offset)
      for (let i = 0; i < palette.length - 1; i++) {
        const idxA = palette.indexOf(rotated[i]!)
        const idxB = palette.indexOf(rotated[i + 1]!)
        expect((idxB - idxA + palette.length) % palette.length).toBe(1)
      }
    }
  })

  it("an empty palette rotates to an empty array regardless of offset", () => {
    expect(rotateChartPalette([], 3)).toEqual([])
  })

  it("a single-color palette is always its own rotation", () => {
    expect(rotateChartPalette(["only"], 5)).toEqual(["only"])
  })
})

describe("resolveChartPaletteOffset", () => {
  it("is deterministic: same seed + same paletteLength always resolves the same offset", () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(resolveChartPaletteOffset(seed, 4)).toBe(resolveChartPaletteOffset(seed, 4))
    }
  })

  it("always resolves within [0, paletteLength)", () => {
    for (let seed = 0; seed < 50; seed++) {
      const offset = resolveChartPaletteOffset(seed, 5)
      expect(offset).toBeGreaterThanOrEqual(0)
      expect(offset).toBeLessThan(5)
    }
  })

  it("resolves offset 0 for a paletteLength of 0 or 1 (nothing to rotate into)", () => {
    expect(resolveChartPaletteOffset(123, 0)).toBe(0)
    expect(resolveChartPaletteOffset(123, 1)).toBe(0)
  })

  it("varies across seeds — different decks land on different phases (not always 0)", () => {
    const offsets = new Set(Array.from({ length: 30 }, (_, seed) => resolveChartPaletteOffset(seed, 4)))
    expect(offsets.size).toBeGreaterThan(1)
  })

  it("every reachable offset in [0, paletteLength) is actually reached over a wide seed sweep", () => {
    const offsets = new Set(Array.from({ length: 200 }, (_, seed) => resolveChartPaletteOffset(seed, 4)))
    expect(offsets).toEqual(new Set([0, 1, 2, 3]))
  })
})
