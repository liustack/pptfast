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
// real Chromium `canvas.measureText()` reading of the identical files; full
// method in `measureTextUnits`'s own calibration comment above and
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
// across 9 sentences; YaHei: 339 classified chars across 10 sentences) --
// task-3-report.md S3, `results.json`'s `class_summary`, scratchpad not
// shipped. The rounded percentage form of these same numbers is already
// cited in `measureTextUnits`'s own calibration comment above; these are
// the exact decimals behind that prose.
const GEORGIA_REAL_EM = { upper: 0.6583, lowerDigit: 0.5015 } as const
const YAHEI_REAL_EM = { upper: 0.6509, lowerDigit: 0.5569, cjk: 1.0016 } as const

// Tolerance bands (module scope: the "CJK under a Georgia role" describe
// block below borrows YAHEI_TOLERANCE_PCT, since that's the applicable real
// anchor there too -- see that block's own comment).
//
// Georgia: Task 3's corpus range is -0.25% (upper, class-level) to -13.10%
// (the "Key findings" mixed sentence below, per-string) -- every anchor is
// safe-direction (real narrower than assumed). 15% = 13.10% max observed
// magnitude + ~2pp margin, rounded to a clean number -- small headroom over
// what was actually measured, not a "looks close enough" band. A weight
// change that pushed any Georgia anchor past 15% would mean Georgia has
// drifted materially past what Task 3 verified safe, including possibly
// flipping into the dangerous direction, which this test would then catch.
const GEORGIA_TOLERANCE_PCT = 15

// YaHei: Task 3's corpus range is +0.16% (cjk, class-level) to -3.74% (the
// "Revenue grew" mixed body sentence below, per-string). 5% = 3.74% max
// observed magnitude + ~1.3pp margin, rounded to a clean number.
const YAHEI_TOLERANCE_PCT = 5

// deviation% = (real - assumed) / assumed * 100, same sign convention as
// task-3-report.md's table (positive = real wider = dangerous direction
// under `wrap:false` export, since an underestimate turns into visible
// overflow rather than a caught/wrapped line).
function deviationPct(text: string, realEm: number): number {
  const assumed = measureTextUnits(text)
  return ((realEm - assumed) / assumed) * 100
}

describe("measureTextUnits — golden proportional widths (data-anchored, breaks the layout/audit tautology for heading/body)", () => {
  describe("Georgia (consulting heading+body default; academic/insight heading)", () => {
    // Tolerance derivation: see GEORGIA_TOLERANCE_PCT's module-scope comment.
    it("uppercase run: real width stays within tolerance of the measured Georgia upper-class advance", () => {
      // Pure-uppercase synthetic run (17 chars, no spaces/digits/punctuation)
      // -- real width computed from the measured per-char class average
      // above, not from an exact-string fontTools read (Task 3's corpus
      // didn't include a pure-uppercase string; its per-class average is the
      // real data this class of anchor is built from, per this branch's
      // brief).
      const text = "QUARTERLYFORECAST"
      const realEm = text.length * GEORGIA_REAL_EM.upper
      expect(Math.abs(deviationPct(text, realEm))).toBeLessThanOrEqual(GEORGIA_TOLERANCE_PCT)
    })

    it("lowercase/digit run: real width stays within tolerance of the measured Georgia lower/digit-class advance", () => {
      const text = "revenue2026"
      const realEm = text.length * GEORGIA_REAL_EM.lowerDigit
      expect(Math.abs(deviationPct(text, realEm))).toBeLessThanOrEqual(GEORGIA_TOLERANCE_PCT)
    })

    it("mixed realistic heading: real width stays within tolerance (exact fontTools read of this string)", () => {
      // Exact per-string real_em from task-3-report.md's per_string corpus
      // (fontTools hmtx sum for this literal string, not a class average).
      const text = "STRATEGIC PRIORITIES FOR FY2027"
      const realEm = 17.5566
      expect(Math.abs(deviationPct(text, realEm))).toBeLessThanOrEqual(GEORGIA_TOLERANCE_PCT)
    })

    it("mixed realistic body sentence: real width stays within tolerance (exact fontTools read of this string, the corpus's worst-case -13.10% line)", () => {
      const text = "Key findings -- margins expanding; costs down; NPS +12 pts."
      const realEm = 26.895
      expect(Math.abs(deviationPct(text, realEm))).toBeLessThanOrEqual(GEORGIA_TOLERANCE_PCT)
    })
  })

  describe("Microsoft YaHei (body/fallback default, 12 of 13 themes)", () => {
    // Tolerance derivation: see YAHEI_TOLERANCE_PCT's module-scope comment.
    it("CJK run: real width stays within tolerance of the measured YaHei cjk-class advance", () => {
      const text = "季度营收同比增长"
      const realEm = text.length * YAHEI_REAL_EM.cjk
      expect(Math.abs(deviationPct(text, realEm))).toBeLessThanOrEqual(YAHEI_TOLERANCE_PCT)
    })

    it("uppercase run: real width stays within tolerance of the measured YaHei upper-class advance", () => {
      const text = "STRATEGY"
      const realEm = text.length * YAHEI_REAL_EM.upper
      expect(Math.abs(deviationPct(text, realEm))).toBeLessThanOrEqual(YAHEI_TOLERANCE_PCT)
    })

    it("lowercase/digit run: real width stays within tolerance of the measured YaHei lower/digit-class advance", () => {
      const text = "revenue2026"
      const realEm = text.length * YAHEI_REAL_EM.lowerDigit
      expect(Math.abs(deviationPct(text, realEm))).toBeLessThanOrEqual(YAHEI_TOLERANCE_PCT)
    })

    it("mixed realistic heading (CJK+Latin+digits): real width stays within tolerance (exact fontTools read of this string)", () => {
      const text = "2026年第三季度总收入达到42.8亿美元，同比增长24%"
      const realEm = 24.4082
      expect(Math.abs(deviationPct(text, realEm))).toBeLessThanOrEqual(YAHEI_TOLERANCE_PCT)
    })

    it("mixed realistic body sentence (pure Latin, rendered under the YaHei body role): real width stays within tolerance (exact fontTools read of this string, the corpus's worst-case -3.74% line)", () => {
      const text = "Revenue grew 24% year-over-year, driven by enterprise demand."
      const realEm = 31.0825
      expect(Math.abs(deviationPct(text, realEm))).toBeLessThanOrEqual(YAHEI_TOLERANCE_PCT)
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
      const text = "季度营收同比增长"
      const realEm = text.length * YAHEI_REAL_EM.cjk
      // Same class, same weight (WIDE_CHAR_RE -> 1.0 em/char) regardless of
      // which Latin face `measureTextUnits` is nominally calibrated for --
      // the function itself is font-agnostic by design (see its own doc
      // comment above), which is exactly what makes this anchor valid.
      expect(Math.abs(deviationPct(text, realEm))).toBeLessThanOrEqual(YAHEI_TOLERANCE_PCT)
    })
  })
})
