import { describe, expect, it } from "vitest"
import { measureTextUnits } from "./svg-text-layout"

// Bold golden anchors (bold-metrics fix, 2026-07-24). Same discipline and
// same tautology this file's Regular sibling (`svg-text-layout.golden.test.ts`)
// closes, extended to the bold correction this fix adds: a test that only
// calls `measureTextUnits(text, { bold: true, ... })` and asserts against
// that same function's own output can never catch the bold factor table
// drifting away from what real Bold fonts actually render — these anchors
// pin against the data pack's genuine `hmtx`-table reads instead
// (`bold-data-pack.json`'s `validation_strings`, `bold-data-pack.md` §4 for
// full methodology/provenance, scratchpad not shipped in this repo, dated
// 2026-07-24). Every string here is a real fixture string (`scripts/e2e.mts`,
// `src/svg/audit/stress-fixtures.ts`), not invented for this file.
//
// Assertion shape (red-first verification round, not the original class-
// average-only design): a bare "|deviation| <= band" tolerance is the wrong
// shape once `JUDGMENT_BAND_MARGIN` exists (svg-text-layout.ts) — that
// margin exists *specifically* to push estimates deliberately wider than
// the corpus average for classes the data pack itself couldn't confidently
// call safe, so a real per-string deviation safely on the wide side is the
// intended, designed-for outcome, not drift to bound tightly. Each anchor
// below instead asserts two separate things with two separate meanings:
//   1. `safeDirection`: `real <= estimate` (the estimator must never
//      under-count a genuine measured Bold reading) with a small epsilon
//      for float/corpus noise -- this is the actual overflow-safety
//      invariant this fix exists to guarantee, and the one a plain
//      |deviation| band can't express (it would pass equally whether the
//      estimator over- or under-shoots).
//   2. `overshoot`: `estimate` doesn't exceed `real` by more than a
//      generous ceiling -- catches the *opposite* failure mode (the table
//      drifting so conservative that headings shrink absurdly, task
//      brief's own explicit "over-shrinks aesthetically" concern) without
//      re-imposing the tight band the margin now deliberately breaks.
function assertSafeAndBounded(estimateUnits: number, realEm: number, maxOvershootPct: number) {
  // Positive `gapPct` = estimate wider than real (safe); negative = the
  // dangerous under-count direction. -0.5% epsilon absorbs float/rounding
  // noise, not a real safety concession (0.5% of a ~130px heading is <1px).
  const gapPct = ((estimateUnits - realEm) / realEm) * 100
  expect(gapPct).toBeGreaterThanOrEqual(-0.5)
  expect(gapPct).toBeLessThanOrEqual(maxOvershootPct)
}

const CONSULTING_HEADING = "Georgia, Songti SC, STSong, serif" // resolveFontStack("consulting" theme)
const CAMPAIGN_HEADING = "Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif"

function estimateUnits(text: string, fontFamily: string): number {
  return measureTextUnits(text, { bold: true, fontFamily })
}

describe("measureTextUnits — bold golden widths (data-anchored, bold-metrics fix)", () => {
  describe("Georgia bold (consulting/academic/insight heading)", () => {
    // The user-reported defect's own trigger line — see
    // cover-fashion-masthead.test.tsx for the full archetype-level
    // red-first assertion and .../verify/render's LibreOffice confirmation
    // (this fix's report has the screenshots); this anchor pins the
    // underlying estimator number in isolation. "Components Demo" (the
    // actual overflowing second line, not the full two-word title) is the
    // anchor that matters most here — real_em derived from root-cause.md's
    // own table (1366.79px / 139 = 9.8330 em), since the data pack's own
    // validation_strings only tabulates the combined two-line title.
    it("\"Components Demo\" (the reported overflow line): estimate is safely wider than the genuine Georgia Bold hmtx reading, not absurdly so", () => {
      const real = 1366.79 / 139
      assertSafeAndBounded(estimateUnits("Components Demo", CONSULTING_HEADING), real, 15.0)
    })

    it("\"Structure Components Demo\": estimate is safely wider than the genuine Georgia Bold hmtx reading", () => {
      // real_em 15.0273 (bold-data-pack.json validation_strings
      // .structure_components_demo.per_face.Georgia.bold_real_em).
      assertSafeAndBounded(estimateUnits("Structure Components Demo", CONSULTING_HEADING), 15.0273, 15.0)
    })

    it("\"Business Model Canvas\": estimate is safely wider than the genuine Georgia Bold hmtx reading", () => {
      // real_em 12.0098.
      assertSafeAndBounded(estimateUnits("Business Model Canvas", CONSULTING_HEADING), 12.0098, 18.0)
    })

    it("\"Porter's Five Forces\": estimate is safely wider than the genuine Georgia Bold hmtx reading (this corpus's largest overshoot -- see this fix's report for the visual-QA call on it)", () => {
      // real_em 10.2422. Short string (20 chars) with a single "other"-class
      // apostrophe and lowerDigit-heavy composition, so `JUDGMENT_BAND_
      // MARGIN` compounds hardest here — own measured overshoot ~26.9%,
      // this corpus's largest. Recorded, not silently loosened away: see
      // this fix's report's visual-QA section for whether it reads as
      // over-shrunk in a real render, not just in this number.
      assertSafeAndBounded(estimateUnits("Porter's Five Forces", CONSULTING_HEADING), 10.2422, 28.0)
    })

    it("\"Regional Performance Heatmap\": estimate is safely wider than the genuine Georgia Bold hmtx reading (the corpus's own +6.46% danger case, pre-fix)", () => {
      // real_em 16.5659 -- bold-data-pack.md §4 flags this string's
      // deviation vs the *unweighted* estimator as the corpus's worst
      // danger case (+6.46%, i.e. UNDER by 6.46% pre-fix). Post-fix it must
      // have flipped to the safe (over) side.
      assertSafeAndBounded(estimateUnits("Regional Performance Heatmap", CONSULTING_HEADING), 16.5659, 15.0)
    })
  })

  describe("Microsoft YaHei bold (campaign/classroom/enterprise/heritage/luxe/tech heading)", () => {
    // "Components Demo" — the exact overflow line, YaHei face (second real-
    // world confirmation this fix's own visual-QA pass caught, see
    // `LOWER_DIGIT_MARGIN`'s derivation comment in svg-text-layout.ts): a
    // direct fontTools hmtx re-measurement against the genuine msyhbd.ttc
    // gives 9.7319em, not tabulated in bold-data-pack.json (which only
    // measured the combined two-line title) so recorded here verbatim with
    // its own provenance rather than folded into the pack's own numbers.
    it("\"Components Demo\" (the reported overflow line, confirmed via LibreOffice on the campaign theme): estimate is safely wider than the genuine YaHei Bold hmtx reading", () => {
      assertSafeAndBounded(estimateUnits("Components Demo", CAMPAIGN_HEADING), 9.7319, 10.0)
    })

    it("\"Structure Components Demo\": estimate is safely wider than the genuine YaHei Bold hmtx reading", () => {
      // real_em 14.7017. YaHei's `upper` and `lowerDigit` both carry a
      // margin (see svg-text-layout.ts's YAHEI table comment) after this
      // fix's own visual-QA pass found the `lowerDigit` class's official
      // "no_action" verdict wasn't a safe per-string guarantee either.
      assertSafeAndBounded(estimateUnits("Structure Components Demo", CAMPAIGN_HEADING), 14.7017, 20.0)
    })

    it("\"Business Model Canvas\": estimate is safely wider than the genuine YaHei Bold hmtx reading", () => {
      // real_em 11.7095.
      assertSafeAndBounded(estimateUnits("Business Model Canvas", CAMPAIGN_HEADING), 11.7095, 25.0)
    })

    it("pure-CJK string: bold estimate exactly matches genuine YaHei Bold hmtx reading (CJK is weight-invariant)", () => {
      // real_em 9.0, byte-identical to the Regular reading (bold-data-pack.md
      // §2: "季度营收增长超预期" measured +0.00% bold-vs-regular, and this
      // file's own YAHEI table rounds the class's own +0.14% Bold reading to
      // NO_CORRECTION -- see that table's derivation comment) -- the CJK
      // class factor is NO_CORRECTION (1.0), so this must reproduce the
      // unweighted estimate exactly, not just "within tolerance."
      const bold = measureTextUnits("季度营收增长超预期", { bold: true, fontFamily: CAMPAIGN_HEADING })
      const regular = measureTextUnits("季度营收增长超预期", { fontFamily: CAMPAIGN_HEADING })
      expect(bold).toBe(regular)
      expect(bold).toBeCloseTo(9.0, 1)
    })
  })

  describe("SimSun/KaiTi (heading-only: bloom/journal/runway SimSun, ink KaiTi) -- conservative-proxy, not genuine-file-hmtx", () => {
    const SIMSUN_HEADING = "SimSun, 宋体, Georgia, serif" // resolveFontStack picks "SimSun" first
    const KAITI_HEADING = "KaiTi, 楷体, SimSun, 宋体, serif" // resolveFontStack picks "KaiTi" first

    // No genuine Bold binary exists for either face (bold-data-pack.md §1) --
    // these anchors test that this fix's estimator stays safely wider than
    // the pack's own *proxy* derivation (bold-data-pack.json's
    // `simsun_kaiti_conservative_proxy`), itself already a conservative
    // bound, not a genuine measurement — a second, compounded layer of
    // safety margin, appropriate for a face with no real Bold binary to
    // ever check against.
    it("\"Structure Components Demo\" (SimSun): estimate is safely wider than the pack's own conservative-proxy derivation", () => {
      // bold_conservative_estimate_em 14.4249 (bold-data-pack.json
      // validation_strings.structure_components_demo.per_face.SimSun).
      assertSafeAndBounded(estimateUnits("Structure Components Demo", SIMSUN_HEADING), 14.4249, 18.0)
    })

    it("\"Structure Components Demo\" (KaiTi): estimate is safely wider than the pack's own conservative-proxy derivation (identical hmtx to SimSun)", () => {
      assertSafeAndBounded(estimateUnits("Structure Components Demo", KAITI_HEADING), 14.4249, 18.0)
    })

    it("pure-CJK string: bold estimate exactly matches regular (CJK weight-invariant, 3-source corroboration incl. SimSun/KaiTi's own zero-variance grid)", () => {
      const bold = measureTextUnits("季度营收增长超预期", { bold: true, fontFamily: SIMSUN_HEADING })
      const regular = measureTextUnits("季度营收增长超预期", { fontFamily: SIMSUN_HEADING })
      expect(bold).toBe(regular)
    })

    // bold-metrics fix item 2: the SimSun/KaiTi Regular gap (space +42.86%,
    // other +8.70% clean-corpus) folds in regardless of the `bold` flag --
    // this is the one place `regular` and `bold` estimates for the *same*
    // text legitimately differ from every other face in this file only in
    // that they're supposed to be EQUAL to each other (not that either
    // equals the unweighted baseline). Direct regression lock, independent
    // of the `bold-golden` framing above.
    it("item 2 regression: the SimSun/KaiTi space/other correction applies at Regular weight too, not just Bold", () => {
      const spaceRegular = measureTextUnits(" ", { fontFamily: SIMSUN_HEADING })
      const spaceBold = measureTextUnits(" ", { bold: true, fontFamily: SIMSUN_HEADING })
      const spaceUncorrected = measureTextUnits(" ") // no fontFamily -> envelope, regular column = 1.0
      expect(spaceRegular).toBe(spaceBold) // 0% bold-vs-regular delta (bold-data-pack.md S2)
      expect(spaceRegular).toBeGreaterThan(spaceUncorrected) // but both exceed the old blind 0.35 assumption
      expect(spaceRegular).toBeCloseTo(0.35 * 1.4286, 4)
    })

    it("item 2 regression: the SimSun/KaiTi lowerDigit judgment-band margin applies at Bold weight only (upper stays verbatim, already safe-direction)", () => {
      // Documents the asymmetry `JUDGMENT_BAND_MARGIN`'s comment describes:
      // `lowerDigit` (0.5 real baseline, judgment-band, wider direction)
      // gets the margin; `upper` (0.5 real baseline, already narrower/safe
      // at 0.852) does not.
      const lower = measureTextUnits("a", { bold: true, fontFamily: SIMSUN_HEADING })
      const upper = measureTextUnits("A", { bold: true, fontFamily: SIMSUN_HEADING })
      expect(lower).toBeCloseTo(0.56 * 1.048 * 1.2, 4)
      expect(upper).toBeCloseTo(0.66 * 0.852, 4)
    })
  })
})
