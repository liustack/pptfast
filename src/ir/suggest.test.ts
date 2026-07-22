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

  // Review round: an adversarially long `input` (garbage far longer than any
  // real candidate) used to run the full O(n·m) distance search against
  // every candidate regardless — reviewer measured 483ms for a 5000-char
  // input against the real icon list. `closestMatch` now bails before that
  // search runs at all once `input.length` exceeds 2x the longest
  // candidate's length — a threshold chosen so the bail is provably
  // behavior-*preserving*, never behavior-*changing*: past that length, the
  // minimum possible Levenshtein distance to any candidate
  // (`input.length - candidate.length`) already exceeds {@link typoThreshold},
  // so the full search the bail skips could never have returned a match
  // anyway — what the bail buys is purely speed. Pinned two ways: a
  // correctness check (still returns the right answer), and a deliberately
  // generous timing smoke test (not a tight, flaky wall-clock budget — see
  // that test's own comment for why a loose bound is still a meaningful
  // regression guard here).
  describe("adversarial-length input bail-out (review fix)", () => {
    it("a 2000-char and a 5000-char garbage input against the real ~1756-option icon list both resolve to no suggestion, correctly (reviewer's exact adversarial cases)", () => {
      expect(closestMatch("x".repeat(2000), PPTX_ICON_NAMES)).toBeUndefined()
      expect(closestMatch("y".repeat(5000), PPTX_ICON_NAMES)).toBeUndefined()
    })

    it("resolves those same adversarial inputs in single-digit milliseconds, not the ~483ms the reviewer measured against the unguarded O(n*m) search", () => {
      // A generous smoke bound, not a tight timing budget: reviewer's own
      // measurement of the *unguarded* full search against this exact input
      // size was 483ms. 100ms leaves nearly a 5x margin against realistic
      // CI-load jitter for what the guarded path actually costs (sub-1ms)
      // while still reliably failing if the bail is ever removed and the
      // full search comes back.
      const start = performance.now()
      closestMatch("z".repeat(5000), PPTX_ICON_NAMES)
      expect(performance.now() - start).toBeLessThan(100)
    })
  })
})
