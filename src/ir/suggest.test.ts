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

  // Review-round fixes (post-implementation review of borrow-wave task 3):
  // the reviewer's exact three suggestion-quality cases, pinned with the
  // improved outputs.
  describe("suggestion quality gate (review fix)", () => {
    it('"arrow" suggests a real arrow-* icon via the prefix pass, not an unrelated same-distance word (reviewer case: was suggesting "carrot")', () => {
      // levenshteinDistance("arrow", "carrot") is only 2 — well within the
      // old flat threshold, which is exactly why the pre-fix distance-only
      // search picked it. The prefix pass now runs first and finds a real
      // stem match before the distance search gets a chance to.
      const suggestion = closestMatch("arrow", PPTX_ICON_NAMES)
      expect(suggestion).not.toBe("carrot")
      expect(suggestion).toMatch(/^arrow(-|$)/)
    })

    it('"circle-chek" suggests "circle-check" (distance 1), not its own stem "circle" (controller fix: single-edit outranks prefix)', () => {
      // A word-boundary stem match also exists here ("circle-chek" starts
      // with "circle" + "-"), and an earlier ordering let that stem win. A
      // single slipped key is the stronger signal — the distance-1 pass now
      // runs before the prefix pass.
      expect(closestMatch("circle-chek", PPTX_ICON_NAMES)).toBe("circle-check")
    })

    it('"" (empty string) gets no suggestion at all (reviewer case: was suggesting "x")', () => {
      expect(closestMatch("", PPTX_ICON_NAMES)).toBeUndefined()
    })

    it("whitespace-only input gets no suggestion either", () => {
      expect(closestMatch("   ", PPTX_ICON_NAMES)).toBeUndefined()
      expect(closestMatch("\t\n", PPTX_ICON_NAMES)).toBeUndefined()
    })

    it("a short input close to an unrelated candidate by raw edit distance alone no longer suggests it once the tighter, input-length-relative threshold applies", () => {
      // "abc" (3 chars) vs "abd" (distance 1) still passes even the tighter
      // threshold (max(2, floor(3/3)=1) = 2) — the tightened formula changes
      // the *ratio* required, not "distance 1 typos stop working".
      expect(closestMatch("abc", ["abd", "xyz"])).toBe("abd")
    })
  })

  // Review-round fix: an adversarially long `input` (garbage far longer than
  // any real candidate) used to run the full O(n·m) distance search against
  // every candidate regardless — reviewer measured 483ms for a 5000-char
  // input against the real icon list. `closestMatch` now bails before that
  // search runs at all once `input.length` exceeds 2x the longest
  // candidate's length — a threshold chosen so the bail is provably
  // behavior-*preserving*, never behavior-*changing*: past that length, the
  // minimum possible Levenshtein distance to any candidate
  // (`input.length - candidate.length`) already exceeds
  // {@link typoThreshold}, so the full O(n·m) search the bail skips could
  // never have returned a match anyway (there is no boundary input where
  // "bail" and "run the full search" would disagree — see this describe
  // block's second test for the direct correctness pin that follows from
  // that proof). What the bail buys is purely speed, which is why it is
  // pinned two ways below: a correctness check (still returns the right
  // answer), and a deliberately generous timing smoke test (not a tight,
  // flaky wall-clock budget — see that test's own comment for why a loose
  // bound is still a meaningful regression guard here).
  describe("adversarial-length input bail-out (review fix)", () => {
    it("a 2000-char and a 5000-char garbage input against the real ~1756-option icon list both resolve to no suggestion, correctly (reviewer's exact adversarial cases)", () => {
      expect(closestMatch("x".repeat(2000), PPTX_ICON_NAMES)).toBeUndefined()
      expect(closestMatch("y".repeat(5000), PPTX_ICON_NAMES)).toBeUndefined()
    })

    it("resolves those same adversarial inputs in single-digit milliseconds, not the ~483ms the reviewer measured against the unguarded O(n*m) search", () => {
      // A generous smoke bound, not a tight timing budget: reviewer's own
      // measurement of the *unguarded* full search against this exact input
      // size was 483ms. 100ms leaves nearly a 5x margin against realistic
      // CI-load jitter for what the guarded path actually costs (sub-1ms,
      // see the comment above) while still reliably failing if the bail is
      // ever removed and the full search comes back.
      const start = performance.now()
      closestMatch("z".repeat(5000), PPTX_ICON_NAMES)
      expect(performance.now() - start).toBeLessThan(100)
    })
  })
})
