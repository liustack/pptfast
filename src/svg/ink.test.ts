import { describe, expect, it } from "vitest"
import { accessibleInk, accessibleOpacity, contrastRatio, metaInk, readableOn, requiredContrastRatio } from "./ink"

// `readableOn`'s own behavior is unchanged by the W4 fix-round extraction
// out of `cover-split-diagonal.tsx` — these are the same assertions that
// used to live in that layout's test file, now testing the shared
// module directly.
describe("readableOn", () => {
  it("dark background (academic primary #006A4E) gets white ink", () => {
    expect(readableOn("#006A4E")).toBe("#FFFFFF")
  })

  it("light background (tech primary #2DD4E6) gets near-black ink", () => {
    expect(readableOn("#2DD4E6")).toBe("#0A0E14")
  })

  it("HexColor short-hand/alpha forms (schema allows 3-8 digits): #RGB expands, #RRGGBBAA drops alpha", () => {
    // Bright yellow shorthand #FFC == #FFFFCC, high luminance -> dark ink
    // (regression lock for the pre-extraction bug: the original 6-digit-only
    // parser scored this as 0 luminance and picked white).
    expect(readableOn("#FFC")).toBe("#0A0E14")
    // Dark green with alpha -> agrees with the 6-digit judgment
    expect(readableOn("#006A4EFF")).toBe("#FFFFFF")
    // 4-digit #RGBA: expand then drop alpha
    expect(readableOn("#FFCF")).toBe("#0A0E14")
  })

  it("never returns a theme color, only the neutral black/white pair", () => {
    for (const bg of ["#006A4E", "#2DD4E6", "#3D2E78", "#F6F1EA", "#161310"]) {
      expect(["#FFFFFF", "#0A0E14"]).toContain(readableOn(bg))
    }
  })
})

describe("contrastRatio", () => {
  it("is 21:1 for pure black against pure white (WCAG's maximum)", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0)
  })

  it("is 1:1 for a color against itself", () => {
    expect(contrastRatio("#2DD4E6", "#2DD4E6")).toBeCloseTo(1, 5)
  })

  it("is symmetric (argument order doesn't matter)", () => {
    expect(contrastRatio("#051C2C", "#F7F7F2")).toBeCloseTo(contrastRatio("#F7F7F2", "#051C2C"), 10)
  })
})

describe("requiredContrastRatio", () => {
  it("is 3:1 at and above the 24px large-text cutoff", () => {
    expect(requiredContrastRatio(24)).toBe(3)
    expect(requiredContrastRatio(88)).toBe(3)
  })

  it("is 4.5:1 below the 24px cutoff", () => {
    expect(requiredContrastRatio(23.9)).toBe(4.5)
    expect(requiredContrastRatio(14)).toBe(4.5)
  })
})

describe("accessibleInk", () => {
  it("keeps the preferred fill unchanged when it already clears the required ratio (byte-identical, no fallback)", () => {
    // white heading (34px, large tier, needs 3:1) on academic's dark-green
    // chapter background — the pre-fix hardcoded value, already passing.
    expect(accessibleInk("#FFFFFF", "#006A4E", 34)).toBe("#FFFFFF")
    // consulting's colors.text on its own light content background.
    expect(accessibleInk("#051C2C", "#F7F7F2", 46)).toBe("#051C2C")
  })

  it("falls back to readableOn's neutral ink when the preferred fill fails the required ratio", () => {
    // white heading on runway's white chapter background: 1:1, fails even
    // the relaxed 3:1 large-text floor.
    expect(accessibleInk("#FFFFFF", "#FFFFFF", 84)).toBe(readableOn("#FFFFFF"))
    expect(accessibleInk("#FFFFFF", "#FFFFFF", 84)).toBe("#0A0E14")
  })

  it("uses the size-appropriate threshold — a fill passing 3:1 but not 4.5:1 keeps preferred at large size, falls back at body size", () => {
    // Contrast ratio between these two is ~3.5:1 (in the WCAG 3-4.5 gap):
    // pick a background/fill pair that lands there.
    const bg = "#3D2E78" // campaign bg
    const fill = "#F0559E" // campaign primary — measured ~3.2:1 against bg
    const ratio = contrastRatio(fill, bg)
    expect(ratio).toBeGreaterThanOrEqual(3)
    expect(ratio).toBeLessThan(4.5)
    expect(accessibleInk(fill, bg, 24)).toBe(fill) // large text: 3:1 clears
    expect(accessibleInk(fill, bg, 16)).toBe(readableOn(bg)) // body text: needs 4.5:1, falls back
  })
})

describe("accessibleOpacity", () => {
  it("keeps the preferred opacity when the blended result still clears the required ratio", () => {
    // white on academic's dark-green chapter background: 6.62:1 at full
    // opacity, comfortably clears 3:1 even blended at 0.7.
    expect(accessibleOpacity("#FFFFFF", "#006A4E", 34, 0.7)).toBe(0.7)
  })

  it("keeps the preferred opacity now that the two-ink comparison picks classroom's higher-contrast option", () => {
    // classroom's chapter background (#6E8E9E == its own colors.primary,
    // luminance ~0.251) used to get white ink under the old fixed-0.4
    // threshold (white measures only ~3.48:1 there — the tightest margin of
    // any theme chapter-rail-chapter.tsx/chapter-banner-chapter.tsx's ink
    // covers, and blending at the layouts' usual 0.7 subheading opacity
    // dropped it to ~2.53:1, under the 3:1 large-text floor, hence the old
    // fallback-to-1 assertion this test used to make). Post backlog item 2
    // (`readableOn`'s real two-ink contrast comparison, `src/svg/ink.ts`):
    // dark ink measures ~5.55:1 against this same background — comfortably
    // higher than white's ~3.48:1 — so `readableOn` now picks dark ink here,
    // and even blended at 0.7 it stays clear of the 3:1 floor, so
    // `accessibleOpacity` no longer needs to fall back to full opacity.
    const bg = "#6E8E9E"
    const ink = readableOn(bg)
    expect(ink).toBe("#0A0E14")
    expect(contrastRatio(ink, bg)).toBeGreaterThanOrEqual(3) // full-opacity ink itself is fine
    expect(accessibleOpacity(ink, bg, 34, 0.7)).toBe(0.7)
  })

  it("never returns something worse than what full opacity already guarantees — accessibleInk's own output always clears the ratio at opacity 1", () => {
    for (const bg of ["#006A4E", "#2DD4E6", "#3D2E78", "#F6F1EA", "#161310", "#6E8E9E"]) {
      const ink = readableOn(bg)
      const opacity = accessibleOpacity(ink, bg, 34, 0.7)
      expect([0.7, 1]).toContain(opacity)
    }
  })
})

// contrast-policy wave, Task T1: `metaInk` is the derivation the two
// `COPYRIGHT_FAINT` file-private orphan colours (ending-banner-ending.tsx /
// ending-rail-ending.tsx) were replaced with — see those files' own header
// comments for why a hardcoded per-file grey was overturned. Real,
// measured fixture values below (not invented): `#8A968F` was
// ending-rail-ending.tsx's own former `COPYRIGHT_FAINT` literal, and
// `#FAFAF6`/`#F7F7F2` are academic's/consulting's own real `ending`
// `defaultBackgrounds` — this is the exact failing/passing pair the policy
// wave's own TDD red step reproduces (see deck-audit.test.ts's "meta tier"
// describe block for the corresponding audit-level red→green pin, and
// task-1-report.md for the correction this uncovered against the
// roadmap/plan's stated 2.93/3.22 theme attribution — the numbers are real,
// which theme they were filed under was not).
describe("metaInk", () => {
  it("keeps the preferred fill when it already clears the 3:1 meta floor", () => {
    // consulting's own former COPYRIGHT_FAINT against consulting's real
    // ending background: 3.224:1, already over the B-tier floor.
    expect(contrastRatio("#8a8a86", "#F7F7F2")).toBeGreaterThanOrEqual(3)
    expect(metaInk("#8a8a86", "#F7F7F2")).toBe("#8a8a86")
  })

  it("nudges a failing preferred fill just far enough to clear 3:1, not all the way to readableOn", () => {
    // academic's own former COPYRIGHT_FAINT against academic's real ending
    // background: 2.934:1 — under the floor.
    const pref = "#8A968F"
    const bg = "#FAFAF6"
    expect(contrastRatio(pref, bg)).toBeLessThan(3)
    const out = metaInk(pref, bg)
    expect(contrastRatio(out, bg)).toBeGreaterThanOrEqual(3)
    // Minimal nudge, not the full jump: the result sits strictly between the
    // failing preferred fill and readableOn's neutral extreme, not equal to
    // either.
    expect(out).not.toBe(pref)
    expect(out).not.toBe(readableOn(bg))
    expect(out).toBe("#848f89")
  })

  it("only reaches for readableOn's full-strength neutral ink when nothing subdued clears the floor", () => {
    // A background whose own luminance sits exactly at the dark/light
    // break-even (readableOn's tightest possible case, ~4.58:1 for either
    // ink) leaves very little room for a light preferred fill to clear 3:1
    // without walking almost all the way to the neutral ink itself.
    const bg = "#6E8E9E" // classroom's own primary — see readableOn's own test above
    const pref = "#DDE7EC" // a light, subdued preferred fill that fails 3:1 here
    expect(contrastRatio(pref, bg)).toBeLessThan(3)
    const out = metaInk(pref, bg)
    expect(contrastRatio(out, bg)).toBeGreaterThanOrEqual(3)
  })

  it("never returns something worse than readableOn's own output — the walk always terminates by alpha=1", () => {
    for (const bg of ["#006A4E", "#2DD4E6", "#3D2E78", "#F6F1EA", "#161310", "#6E8E9E", "#0A0A0C", "#161310", "#060A13"]) {
      for (const pref of ["#8A968F", "#8a8a86", "#5D6B65", "#93939C"]) {
        const out = metaInk(pref, bg)
        expect(contrastRatio(out, bg)).toBeGreaterThanOrEqual(3)
      }
    }
  })
})
