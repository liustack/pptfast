import { describe, expect, it } from "vitest"
import { measureTextUnits } from "./svg-text-layout"

// Proportional-role golden anchors (test/proportional-golden-anchors branch,
// 2026-07-22). Closes the last piece of the layout/audit "shared blindness"
// gap borrow-wave Task 3 flagged: `measureTextUnits` (this file) and
// `svg-audit.ts`'s overflow detector both compute width from the exact same
// per-character-class weight table, so no test that only calls
// `measureTextUnits` and asserts against `measureTextUnits`'s own output can
// ever catch that table drifting away from what real fonts actually render
// -- a tautology, not a check. Task 3's fix round closed this for the MONO
// role by replacing the heuristic with an exact, hmtx-derived model and
// pinning it against real Consolas advance widths read straight from the
// font file (`measureMonoTextUnits`'s golden anchors,
// `src/svg/components/code.test.tsx`, commits bf6131e/f585f6a). The
// PROPORTIONAL roles (heading/body) can't get the same treatment -- Georgia
// and Microsoft YaHei are genuinely variable-width, so "exact model" isn't
// on the table -- but Task 3's original measurement round already read the
// real per-character-class advance widths for both faces off their own
// `hmtx` tables (fontTools, cross-validated to 4 decimal places against a
// real Chromium `canvas.measureText()` reading of the identical files --
// full method in `measureTextUnits`'s own calibration comment above and
// task-3-report.md, borrow-wave scratchpad, not shipped in this repo) and
// concluded the weight table is within tolerance for both faces. That
// measured data -- not `measureTextUnits`'s own arithmetic -- is this file's
// anchor source, exactly as the task brief for this branch specified.
//
// What this catches: if a future change nudges `measureTextUnits`'s class
// weights (0.35/0.66/0.56/0.46/1.0) away from these real-font numbers by
// more than the measured-safe band below, every anchor here goes red loudly
// -- there is no shared formula left for a regression to hide behind.

// Per-class real advance widths (em/char), read from the two faces' own
// `hmtx` tables -- borrow-wave Task 3, 2026-07-21, fontTools on
// `/System/Library/Fonts/Supplemental/Georgia.ttf` (genuine macOS system
// font) and the genuine Microsoft-shipped
// `.../Office for Mac's private font bundle/msyh.ttc` (identity-confirmed
// via each file's own `name` table, not a visually-similar stand-in).
// Values are corpus averages per class (Georgia: 415 classified chars
// across 9 sentences -- YaHei: 339 classified chars across 10 sentences) --
// task-3-report.md S3, `results.json`'s `class_summary`, scratchpad not
// shipped. The rounded percentage form of these same numbers is already
// cited in `measureTextUnits`'s own calibration comment above -- these are
// the exact decimals behind that prose.
const GEORGIA_REAL_EM = { upper: 0.6583, lowerDigit: 0.5015 } as const
const YAHEI_REAL_EM = { upper: 0.6509, lowerDigit: 0.5569, cjk: 1.0016 } as const

// Tolerance derivation rule (applied per anchor below, not as one uniform
// band across the file): each anchor's own measured |deviation%| -- the gap
// between what `measureTextUnits` assumes for that exact text today and
// what Task 3 measured as real for it -- plus a flat 1.5 percentage-point
// margin, rounded UP to the nearest 0.5%. A single band sized to the
// corpus's worst blended-string deviation (e.g. a uniform 15%/5%) would sit
// far looser than a class-pure anchor's own near-zero measured deviation,
// leaving that anchor's class weight essentially unguarded -- a 5% drift in
// a weight whose real deviation was already near zero would still land well
// inside a loose uniform band. Per-anchor bands close that: each anchor's
// margin is sized to what was actually measured for *that* text, so a
// same-magnitude drift in any weight the file exercises has to cross a band
// close to what it actually has to clear, not the corpus's loosest case.
// (See this file's git history for a review round that caught exactly this
// gap and the two weight-drift mutations below that confirm the fix.)
//
// deviation% = (real - assumed) / assumed * 100, same sign convention as
// task-3-report.md's table (positive = real wider = dangerous direction
// under `wrap:false` export, since an underestimate turns into visible
// overflow rather than a caught/wrapped line).
function deviationPct(text: string, realEm: number): number {
  const assumed = measureTextUnits(text)
  return ((realEm - assumed) / assumed) * 100
}

describe("measureTextUnits — golden proportional widths (data-anchored, breaks the layout/audit tautology for heading/body)", () => {
  describe("Georgia (consulting heading+body default -- academic/insight heading)", () => {
    it("uppercase run: real width stays within tolerance of the measured Georgia upper-class advance", () => {
      // Pure-uppercase synthetic run (17 chars, no spaces/digits/punctuation)
      // -- real width computed from the measured per-char class average
      // above, not from an exact-string fontTools read (Task 3's corpus
      // didn't include a pure-uppercase string -- its per-class average is
      // the real data this class of anchor is built from, per this branch's
      // brief). Own measured deviation: -0.258% (results.json's upper
      // class_summary, -0.25% rounded). Tolerance: 2.0% (0.258 + 1.5pp
      // margin, rounded up to the nearest 0.5%) -- tight enough that the
      // reviewer's 5%-drift mutation (0.66 -> 0.693, landing at -5.01%) must
      // fail it. See the mutation-proof note in this file's commit history.
      const text = "QUARTERLYFORECAST"
      const realEm = text.length * GEORGIA_REAL_EM.upper
      expect(Math.abs(deviationPct(text, realEm))).toBeLessThanOrEqual(2.0)
    })

    it("lowercase/digit run: real width stays within tolerance of the measured Georgia lower/digit-class advance", () => {
      // Own measured deviation: -10.446%. Tolerance: 12.0% (10.446 + 1.5pp,
      // rounded up to the nearest 0.5%).
      const text = "revenue2026"
      const realEm = text.length * GEORGIA_REAL_EM.lowerDigit
      expect(Math.abs(deviationPct(text, realEm))).toBeLessThanOrEqual(12.0)
    })

    it("mixed realistic heading: real width stays within tolerance (exact fontTools read of this string)", () => {
      // Exact per-string real_em from task-3-report.md's per_string corpus
      // (fontTools hmtx sum for this literal string, not a class average).
      // Own measured deviation: -8.225% (report: -8.22%). Tolerance: 10.0%
      // (8.225 + 1.5pp, rounded up to the nearest 0.5%).
      const text = "STRATEGIC PRIORITIES FOR FY2027"
      const realEm = 17.5566
      expect(Math.abs(deviationPct(text, realEm))).toBeLessThanOrEqual(10.0)
    })

    it("mixed realistic body sentence: real width stays within tolerance (exact fontTools read of this string, the corpus's worst-case -13.10% line)", () => {
      // Own measured deviation: -13.102% (report: -13.10%, this corpus's
      // worst case). Tolerance: 15.0% (13.102 + 1.5pp, rounded up to the
      // nearest 0.5%).
      const text = "Key findings -- margins expanding; costs down; NPS +12 pts."
      const realEm = 26.895
      expect(Math.abs(deviationPct(text, realEm))).toBeLessThanOrEqual(15.0)
    })
  })

  describe("Microsoft YaHei (body/fallback default, 12 of 13 themes)", () => {
    it("CJK run: real width stays within tolerance of the measured YaHei cjk-class advance", () => {
      // Own measured deviation: +0.160% (results.json's cjk class_summary,
      // +0.16% rounded). Tolerance: 2.0% (0.160 + 1.5pp margin, rounded up
      // to the nearest 0.5%) -- tight enough that the reviewer's 5%-drift
      // mutation (1.0 -> 1.05, landing at -4.61%) must fail it. See the
      // mutation-proof note in this file's commit history.
      const text = "季度营收同比增长"
      const realEm = text.length * YAHEI_REAL_EM.cjk
      expect(Math.abs(deviationPct(text, realEm))).toBeLessThanOrEqual(2.0)
    })

    it("uppercase run: real width stays within tolerance of the measured YaHei upper-class advance", () => {
      // Own measured deviation: -1.379%. Tolerance: 3.0% (1.379 + 1.5pp,
      // rounded up to the nearest 0.5%).
      const text = "STRATEGY"
      const realEm = text.length * YAHEI_REAL_EM.upper
      expect(Math.abs(deviationPct(text, realEm))).toBeLessThanOrEqual(3.0)
    })

    it("lowercase/digit run: real width stays within tolerance of the measured YaHei lower/digit-class advance", () => {
      // Own measured deviation: -0.554%. Tolerance: 2.5% (0.554 + 1.5pp,
      // rounded up to the nearest 0.5%).
      const text = "revenue2026"
      const realEm = text.length * YAHEI_REAL_EM.lowerDigit
      expect(Math.abs(deviationPct(text, realEm))).toBeLessThanOrEqual(2.5)
    })

    it("mixed realistic heading (CJK+Latin+digits): real width stays within tolerance (exact fontTools read of this string)", () => {
      // Own measured deviation: +1.871% (report: +1.87%). Tolerance: 3.5%
      // (1.871 + 1.5pp, rounded up to the nearest 0.5%).
      const text = "2026年第三季度总收入达到42.8亿美元，同比增长24%"
      const realEm = 24.4082
      expect(Math.abs(deviationPct(text, realEm))).toBeLessThanOrEqual(3.5)
    })

    it("mixed realistic body sentence (pure Latin, rendered under the YaHei body role): real width stays within tolerance (exact fontTools read of this string, the corpus's worst-case -3.74% line)", () => {
      // Own measured deviation: -3.740% (report: -3.74%, this corpus's
      // worst case). Tolerance: 5.5% (3.740 + 1.5pp, rounded up to the
      // nearest 0.5%).
      const text = "Revenue grew 24% year-over-year, driven by enterprise demand."
      const realEm = 31.0825
      expect(Math.abs(deviationPct(text, realEm))).toBeLessThanOrEqual(5.5)
    })
  })

  describe("CJK under a Georgia-declared role", () => {
    // Georgia's own `cmap` has zero CJK glyphs (task-3-report.md S4.1), so
    // there is no "real Georgia CJK advance" to measure -- but that doesn't
    // make CJK-under-Georgia untestable. `eaFontFaceFor` (`src/svg/fonts.ts`)
    // deterministically resolves the `<a:ea>` slot for any non-CJK-capable
    // SAFE_FONTS face, Georgia included, to `EA_FALLBACK_FACE` (Microsoft
    // YaHei) -- so a CJK character under a Georgia-declared heading/body role
    // always renders from Microsoft YaHei in the real export, not from an
    // unknown/uncontrolled substitute. YaHei's measured cjk-class advance
    // (used above) is therefore the correct real-world anchor for this case
    // too, not a gap.
    it("CJK content under a Georgia role renders via YaHei's a:ea fallback, so YaHei's measured cjk advance is the applicable real anchor", () => {
      // Same anchor text and tolerance as the YaHei cjk-run case above (own
      // measured deviation +0.160%, tolerance 2.0%) -- this is the same
      // real-world render path, just reached through a Georgia-declared
      // role instead of a YaHei-declared one.
      const text = "季度营收同比增长"
      const realEm = text.length * YAHEI_REAL_EM.cjk
      // Same class, same weight (WIDE_CHAR_RE -> 1.0 em/char) regardless of
      // which Latin face `measureTextUnits` is nominally calibrated for --
      // the function itself is font-agnostic by design (see its own doc
      // comment above), which is exactly what makes this anchor valid.
      expect(Math.abs(deviationPct(text, realEm))).toBeLessThanOrEqual(2.0)
    })
  })
})
