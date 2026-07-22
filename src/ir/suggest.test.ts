import { describe, expect, it } from "vitest"
import { PPTX_ICON_NAMES } from "@/icons"
import { closestMatch, levenshteinDistance } from "./suggest"

describe("levenshteinDistance", () => {
  it("is 0 for identical strings", () => {
    expect(levenshteinDistance("circle-check", "circle-check")).toBe(0)
  })

  it("counts a single insertion as 1", () => {
    expect(levenshteinDistance("kpi_card", "kpi_cards")).toBe(1)
  })

  it("is symmetric", () => {
    expect(levenshteinDistance("abc", "xyz")).toBe(levenshteinDistance("xyz", "abc"))
  })

  it("handles empty strings", () => {
    expect(levenshteinDistance("", "abc")).toBe(3)
    expect(levenshteinDistance("abc", "")).toBe(3)
    expect(levenshteinDistance("", "")).toBe(0)
  })
})

describe("closestMatch", () => {
  it("catches the borrow-wave B report's flagship icon slip via word-reorder (distance 8, past a flat threshold)", () => {
    // The exact P9 probe: real lucide name is "circle-check", a very
    // plausible weak-model guess is "check-circle" — same two words,
    // reversed order. Plain edit distance between them is 8 on 12-char
    // strings (`|check-circle| = |circle-check| = 12`), which a naive flat
    // threshold would reject as "not a typo" — the word-reorder pass exists
    // specifically so this canonical case still resolves.
    expect(levenshteinDistance("check-circle", "circle-check")).toBe(8)
    expect(closestMatch("check-circle", PPTX_ICON_NAMES)).toBe("circle-check")
  })

  it("catches a single missing character (component-type P10 probe: kpi_card -> kpi_cards)", () => {
    const componentTypes = ["bullets", "paragraph", "kpi_cards", "chart"]
    expect(closestMatch("kpi_card", componentTypes)).toBe("kpi_cards")
  })

  it("returns undefined when nothing is a plausible typo", () => {
    expect(closestMatch("xyzzy-totally-unrelated-nonsense", PPTX_ICON_NAMES)).toBeUndefined()
  })

  it("returns the exact candidate unchanged when input already matches one", () => {
    expect(closestMatch("circle-check", PPTX_ICON_NAMES)).toBe("circle-check")
  })

  it("is case-insensitive for the word-reorder pass", () => {
    expect(closestMatch("Circle-Check", PPTX_ICON_NAMES)).toBe("circle-check")
  })
})
