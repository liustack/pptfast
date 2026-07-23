import { describe, expect, it } from "vitest"
import { measureTextUnits } from "./svg-text-layout"

// Bold golden anchors (bold-metrics fix, 2026-07-24; round 2, same date,
// after Georgia/YaHei moved from a class-average-plus-margin model to an
// exact per-character advance table -- see svg-text-layout.ts's EPITAPH
// comment for why). Same discipline and same tautology this file's
// Regular sibling (`svg-text-layout.golden.test.ts`) closes: a test that
// only calls `measureTextUnits(text, { bold: true, ... })` and asserts
// against that same function's own output can never catch the underlying
// tables drifting away from what real Bold fonts actually render — these
// anchors pin against genuine hmtx reads instead (`bold-data-pack.json`'s
// `validation_strings`, this fix's own `extract_exact_tables.py`
// re-measurement for lines the pack never tabulated separately). Every
// string here is a real fixture string or a real user-facing marketing
// heading a controller-ordered review used to find two genuine clipping
// defects (see the last `describe` block below) — none invented for this
// file.
//
// Assertion shape, round 2: Georgia/Microsoft YaHei are now an EXACT
// per-character model, not a class average — the estimate should match a
// genuine hmtx reading to a fraction of a percent (float/rounding noise
// from this table's own 4-decimal-place storage, not a deliberate safety
// margin), so these anchors assert a *tight* two-sided band, not round 1's
// "safe-direction-plus-generous-overshoot" shape (that shape's whole
// premise — a deliberate margin makes real deviation from genuine readings
// designed-for, not drift to bound tightly — no longer applies once the
// model is exact instead of averaged). SimSun/KaiTi (still a class-average
// model — see `SIMSUN_KAITI`'s own comment in svg-text-layout.ts for why
// that face's Latin metrics have no per-character variance to be exact
// *about* in the first place) also use this same tight shape in round 2:
// round 1's extra margin on top of the pack's own conservative-proxy
// number is retired there too, so the estimator now reproduces that proxy
// number directly, not "safely wider than it."
function assertTight(estimateUnits: number, realEm: number, maxAbsPct: number) {
  const gapPct = ((estimateUnits - realEm) / realEm) * 100
  expect(Math.abs(gapPct)).toBeLessThanOrEqual(maxAbsPct)
}

const CONSULTING_HEADING = "Georgia, Songti SC, STSong, serif" // resolveFontStack("consulting" theme)
const CAMPAIGN_HEADING = "Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif"

function estimateUnits(text: string, fontFamily: string): number {
  return measureTextUnits(text, { bold: true, fontFamily })
}

describe("measureTextUnits — bold golden widths (data-anchored, bold-metrics fix)", () => {
  describe("Georgia bold (consulting/academic/insight heading) — exact per-character model", () => {
    // The user-reported defect's own trigger line — see
    // cover-fashion-masthead.test.tsx for the full archetype-level
    // red-first assertion. "Components Demo" (the actual overflowing
    // second line, not the full two-word title) is the anchor that
    // matters most here — real_em derived from root-cause.md's own table
    // (1366.79px / 139 = 9.8330 em), cross-confirmed by this round's own
    // direct fontTools re-measurement (9.8328, `extract_exact_tables.py`).
    it("\"Components Demo\" (the reported overflow line): estimate matches the genuine Georgia Bold hmtx reading almost exactly", () => {
      assertTight(estimateUnits("Components Demo", CONSULTING_HEADING), 1366.79 / 139, 0.1)
    })

    it("\"Structure Components Demo\": estimate matches the genuine Georgia Bold hmtx reading almost exactly", () => {
      assertTight(estimateUnits("Structure Components Demo", CONSULTING_HEADING), 15.0273, 0.1)
    })

    it("\"Business Model Canvas\": estimate matches the genuine Georgia Bold hmtx reading almost exactly", () => {
      assertTight(estimateUnits("Business Model Canvas", CONSULTING_HEADING), 12.0098, 0.1)
    })

    it("\"Porter's Five Forces\": estimate matches the genuine Georgia Bold hmtx reading almost exactly (round 1's largest margin-overshoot anchor, now exact)", () => {
      // Round 1 shipped this anchor with a 28% overshoot allowance (the
      // class-average margin's worst compounding case). The exact model
      // has no such compounding — every character, including the
      // apostrophe, is a direct table lookup.
      assertTight(estimateUnits("Porter's Five Forces", CONSULTING_HEADING), 10.2422, 0.1)
    })

    it("\"Regional Performance Heatmap\": estimate matches the genuine Georgia Bold hmtx reading almost exactly", () => {
      assertTight(estimateUnits("Regional Performance Heatmap", CONSULTING_HEADING), 16.5659, 0.1)
    })
  })

  describe("Microsoft YaHei bold (campaign/classroom/enterprise/heritage/luxe/tech heading) — exact per-character model", () => {
    it("\"Components Demo\" (the reported overflow line, second real-world confirmation on this face): estimate matches the genuine YaHei Bold hmtx reading almost exactly", () => {
      // real_em 9.7319, this fix's own direct fontTools re-measurement
      // against the genuine msyhbd.ttc (not tabulated in bold-data-
      // pack.json, which only measured the combined two-line title).
      assertTight(estimateUnits("Components Demo", CAMPAIGN_HEADING), 9.7319, 0.1)
    })

    it("\"Structure Components Demo\": estimate matches the genuine YaHei Bold hmtx reading almost exactly", () => {
      assertTight(estimateUnits("Structure Components Demo", CAMPAIGN_HEADING), 14.7017, 0.1)
    })

    it("\"Business Model Canvas\": estimate matches the genuine YaHei Bold hmtx reading almost exactly", () => {
      assertTight(estimateUnits("Business Model Canvas", CAMPAIGN_HEADING), 11.7095, 0.1)
    })

    it("pure-CJK string: bold estimate exactly matches genuine YaHei Bold hmtx reading (CJK is weight-invariant, still class-based -- exact tables only cover printable ASCII)", () => {
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

  describe("non-bold byte-inertness (round 2's own hard requirement — exact tables must NOT leak into Regular weight)", () => {
    // The exact model applies to Bold only (svg-text-layout.ts's
    // `measureTextUnits`, the `mode === "bold"` gate right above
    // `exactTable`'s own declaration) -- Regular-weight Georgia/YaHei text
    // must stay byte-identical to this file's pre-bold-metrics-fix
    // arithmetic. A genuine Regular exact table exists (`GEORGIA_REGULAR_
    // EXACT`/`YAHEI_REGULAR_EXACT`) and would, if wired into the default
    // path, surface a real but out-of-scope finding (Regular "Components
    // Demo" already sits ~1.25% past its own 1168px budget too, root-
    // cause.md's own number) -- this test locks that it does NOT leak in.
    it("Georgia Regular reproduces the exact pre-fix unweighted estimate, not the exact table", () => {
      const withFontFamily = measureTextUnits("Components Demo", { fontFamily: CONSULTING_HEADING })
      const noFontFamily = measureTextUnits("Components Demo")
      // upper=2*0.66 + lowerDigit=12*0.56 + space=1*0.35, all NO_CORRECTION
      // at Georgia Regular -- see GEORGIA's own table, every `regular` entry
      // is a literal `1`.
      expect(withFontFamily).toBeCloseTo(2 * 0.66 + 12 * 0.56 + 1 * 0.35, 4)
      expect(withFontFamily).toBe(noFontFamily)
    })

    it("Microsoft YaHei Regular reproduces the exact pre-fix unweighted estimate, not the exact table", () => {
      const withFontFamily = measureTextUnits("Components Demo", { fontFamily: CAMPAIGN_HEADING })
      const noFontFamily = measureTextUnits("Components Demo")
      expect(withFontFamily).toBeCloseTo(2 * 0.66 + 12 * 0.56 + 1 * 0.35, 4)
      expect(withFontFamily).toBe(noFontFamily)
    })
  })

  describe("SimSun/KaiTi (heading-only: bloom/journal/runway SimSun, ink KaiTi) -- conservative-proxy, still class-average (see svg-text-layout.ts's SIMSUN_KAITI comment for why this face was deliberately not upgraded to an exact table)", () => {
    const SIMSUN_HEADING = "SimSun, 宋体, Georgia, serif" // resolveFontStack picks "SimSun" first
    const KAITI_HEADING = "KaiTi, 楷体, SimSun, 宋体, serif" // resolveFontStack picks "KaiTi" first

    // No genuine Bold binary exists for either face (bold-data-pack.md §1) --
    // these anchors test that this fix's estimator matches the pack's own
    // *proxy* derivation (bold-data-pack.json's
    // `simsun_kaiti_conservative_proxy`) closely -- round 2 removed the
    // extra margin round 1 layered on top (see svg-text-layout.ts's
    // `SIMSUN_KAITI` comment for why that removal doesn't reopen the gap
    // the margin was covering for Georgia/YaHei), so the estimator now
    // reproduces the pack's own number almost exactly, not just
    // "safely wider."
    it("\"Structure Components Demo\" (SimSun): estimate matches the pack's own conservative-proxy derivation almost exactly", () => {
      // bold_conservative_estimate_em 14.4249 (bold-data-pack.json
      // validation_strings.structure_components_demo.per_face.SimSun).
      assertTight(estimateUnits("Structure Components Demo", SIMSUN_HEADING), 14.4249, 0.1)
    })

    it("\"Structure Components Demo\" (KaiTi): estimate matches the pack's own conservative-proxy derivation almost exactly (identical hmtx to SimSun)", () => {
      assertTight(estimateUnits("Structure Components Demo", KAITI_HEADING), 14.4249, 0.1)
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

    // Round 2 (2026-07-24): the margin this test originally documented
    // (`LOWER_DIGIT_MARGIN`) is retired -- see that constant's own EPITAPH
    // comment in svg-text-layout.ts for the full reasoning (a controller-
    // ordered review found real headings that clipped straight through it,
    // and traced the failure to the structural fact that a class average,
    // margined or not, cannot bound an open-ended class's single worst
    // character). SimSun/KaiTi's `lowerDigit`/`upper` are both verbatim
    // conservative-proxy factors now, no margin on either -- the asymmetry
    // this test used to document (one class margined, one not) no longer
    // exists for this face; what remains true, and worth locking, is that
    // both stay `conservative-proxy` factors applied only at Bold weight
    // (Regular is `NO_CORRECTION`-equivalent for these two classes; see
    // `SIMSUN_KAITI`'s own comment for why this face's Latin metrics never
    // needed the exact-per-character treatment Georgia/YaHei got).
    it("item 2 regression: SimSun/KaiTi's lowerDigit/upper conservative-proxy factors apply at Bold weight only, both verbatim (no margin)", () => {
      const lowerBold = measureTextUnits("a", { bold: true, fontFamily: SIMSUN_HEADING })
      const upperBold = measureTextUnits("A", { bold: true, fontFamily: SIMSUN_HEADING })
      const lowerRegular = measureTextUnits("a", { fontFamily: SIMSUN_HEADING })
      const upperRegular = measureTextUnits("A", { fontFamily: SIMSUN_HEADING })
      expect(lowerBold).toBeCloseTo(0.56 * 1.048, 4)
      expect(upperBold).toBeCloseTo(0.66 * 0.852, 4)
      expect(lowerRegular).toBeCloseTo(0.56, 4) // NO_CORRECTION at Regular
      expect(upperRegular).toBeCloseTo(0.66, 4)
    })
  })

  // Round 2 red-first: the controller-ordered review's own two clipping
  // headings, permanently locked. Both are real, ordinary marketing-style
  // titles (not synthetic worst-case strings) that clipped visibly in a
  // real LibreOffice render under round 1's class-average-plus-margin
  // model, on the *exact* archetype+theme combination the original user
  // report traced to (cover-fashion-masthead + consulting/Georgia). See
  // this fix's report round-2 section for the LibreOffice screenshots
  // (scratchpad, not shipped in this repo) and the single-character
  // fontTools reads that explain why ("W" +51.8% over its class's assumed
  // weight, "m" a 1.8136x ratio -- both now exact table lookups, not class
  // averages, in this file).
  describe("round-2 red-first: the reviewer's two real, ordinary clipping headings (Georgia, consulting theme, cover-fashion-masthead's own 1168px budget)", () => {
    const GEORGIA_ROLE_FONT_FAMILY = CONSULTING_HEADING

    it("\"Maximum Momentum Wave\" wraps to 'Maximum' / 'Momentum Wave' and 'Momentum Wave's exact-model width fits 1168px at the fitted fontSize", async () => {
      const { fitHeadingLines } = await import("../svg/heading-fit")
      const r = fitHeadingLines("Maximum Momentum Wave", {
        maxWidth: 1168,
        fontSize: 150,
        maxLines: 2,
        minPt: 72,
        fontFamily: GEORGIA_ROLE_FONT_FAMILY,
      })
      expect(r.fontSize).toBeLessThan(150) // must have shrunk from the archetype's declared max
      for (const line of r.lines) {
        const w = estimateUnits(line, GEORGIA_ROLE_FONT_FAMILY) * r.fontSize
        expect(w).toBeLessThanOrEqual(1168 + 1) // +1: float rounding slack, same convention as heading-fit.test.ts
      }
    })

    it("\"MEGAMARKET MOMENTUM\" wraps to 'MEGAMARKET' / 'MOMENTUM' and 'MEGAMARKET's exact-model width fits 1168px at the fitted fontSize", async () => {
      const { fitHeadingLines } = await import("../svg/heading-fit")
      const r = fitHeadingLines("MEGAMARKET MOMENTUM", {
        maxWidth: 1168,
        fontSize: 150,
        maxLines: 2,
        minPt: 72,
        fontFamily: GEORGIA_ROLE_FONT_FAMILY,
      })
      expect(r.fontSize).toBeLessThan(150)
      for (const line of r.lines) {
        const w = estimateUnits(line, GEORGIA_ROLE_FONT_FAMILY) * r.fontSize
        expect(w).toBeLessThanOrEqual(1168 + 1)
      }
    })

    // Single-character worst-case anchors: the exact numbers the review's
    // own fontTools re-measurement cited as proof the class-average model
    // couldn't be trusted. Locked directly so any future change that
    // regresses the exact table back toward a class-average approximation
    // fails immediately and obviously, not just via a downstream clip.
    it("Georgia Bold 'W' (this corpus's single widest character) matches the genuine hmtx reading exactly, not a class average", () => {
      expect(estimateUnits("W", CONSULTING_HEADING)).toBeCloseTo(1.1265, 4)
    })

    it("Georgia Bold 'm' matches the genuine hmtx reading exactly, not a class average", () => {
      expect(estimateUnits("m", CONSULTING_HEADING)).toBeCloseTo(1.0156, 4)
    })
  })
})
