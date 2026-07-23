/**
 * Weight/face hint threaded through the estimator (bold-metrics fix,
 * 2026-07-24 — see the calibration comment above `measureTextUnits` for
 * why this exists). Both fields default to the estimator's original,
 * Regular-calibrated behavior when omitted, so every call site this fix
 * didn't touch stays byte-identical.
 */
export interface TextWeightHint {
  /** True when the consuming text renders `font-weight >= 600` (this
   * codebase's own bold threshold — `isBold()` in `src/svg/fonts.ts`,
   * shared with the export converter's OOXML `b="1"` decision, is the
   * canonical judgment this mirrors). Default `false`. */
  bold?: boolean
  /** The CSS font-family list actually flowing to the rendered `<text>`
   * (`ComponentCtx.fonts.heading`/`.body`/`.mono`, i.e. `resolveFontStack`'s
   * output) — only its first member (the Windows-safe exported face) is
   * read, mirroring `svg2pptx/text.ts`'s own `firstFontFamily`. `undefined`
   * (the default) selects the conservative cross-face envelope — see
   * `classifyFace` below. */
  fontFamily?: string
}

export interface SvgTextLayoutOptions extends TextWeightHint {
  maxWidth: number
  fontSize: number
  maxLines?: number
  lineHeightRatio?: number
  /**
   * Widow avoidance (opt-in, heading call sites via `fitHeadingLines`): after
   * the greedy wrap, if the last line is much shorter than the widest one
   * (「年度战略回」+「顾」), re-wrap at the balanced per-line budget so the same
   * line count splits evenly. Off by default so body/subtitle layouts keep
   * their established greedy geometry.
   */
  balanceLines?: boolean
}

export interface SvgTextLayout {
  lines: string[]
  fontSize: number
  lineHeight: number
  /** truncation-visibility wave, Task 2: `true` exactly when the caller had
   *  to drop characters (an ellipsis cut) to fit. `layoutSvgText` itself
   *  never truncates — it only wraps/merges lines, so this is always
   *  `false` here. `fitHeadingLines` (`../svg/heading-fit.ts`) is the one
   *  caller that can set it `true`, and only when its own `truncateToUnits`
   *  call actually changed the string (not merely on taking that code
   *  branch — a wrap/shrink that lands under budget without dropping a
   *  character must stay `false`). The render layer reads it to stamp
   *  `data-truncated="1"` on the rendered heading `<text>`. */
  truncated: boolean
}

// S3c fix. User-reported bug: a bento callout with a long em-dash-separated
// sentence wrapped its line one character too wide, so the real glyphs then
// overran the box and clipped the trailing "60%". CJK fonts render the em
// dash and the curly-quote block at full ideographic width, same as the
// ideographs, ideographic punctuation, and fullwidth forms this class
// already covered. Two sub-ranges, though, sat outside the two ranges below
// and used to fall through to the 0.46 "other" weight, underestimating their
// rendered width by more than half:
//   - U+2014 (EM DASH): doubled up, it is the idiomatic CJK long-dash mark.
//     That underestimate is exactly what let `wrapWithUnits` accept one more
//     character per line than actually fits.
//   - U+2018 through U+201F: the quotation-mark sub-block of General
//     Punctuation (left/right single and double quotes, plus the low-9 and
//     reversed-9 variants).
//
// Ideographic punctuation (U+3000 through U+303F: the ideographic comma,
// full stop, corner brackets, book-title marks, etc.) and fullwidth forms
// (U+FF00 through U+FFEF: fullwidth colon, percent sign, Latin letters,
// etc.) were already covered: the first range below spans 0x2E80-0x9FFF, a
// superset of 0x3000-0x303F, and the second range below is 0xFF00-0xFFEF
// itself. So only the two sub-ranges named above needed adding; nothing here
// duplicates coverage the class already had.
//
// Half-width ASCII punctuation (period, comma, colon, parens, the ASCII
// hyphen, etc.) intentionally stays in the "other" 0.46 bucket below: it
// really does render narrower than a CJK glyph.
const WIDE_CHAR_RE = /[\u2014\u2018-\u201f\u2e80-\u9fff\uff00-\uffef]/

// Export-font calibration (borrow-wave Task 3, 2026-07-21): this weight
// table is font-agnostic by design, but heading/body text ultimately
// exports in whatever `resolveFontFace` (fonts.ts) resolves -- Georgia (the
// consulting theme's default heading+body face, and academic/insight's
// heading face) and Microsoft YaHei (the resolved body face for 12 of
// pptfast's 13 themes -- declared directly by 10, and by academic/insight's
// role-default fallback since neither's declared body stack hits
// SAFE_FONTS -- every theme except consulting, whose body resolves to
// Georgia). Both were measured against the real
// exported binaries (Georgia: the genuine macOS system font. Microsoft
// YaHei: the genuine binary Microsoft ships inside Office for Mac's private
// font bundle, identity-confirmed via that file's own `name` table, not a
// visually-similar stand-in like PingFang SC) using fontTools' `hmtx`
// advance-width table, cross-validated to 4 decimal places against a real
// Chromium `canvas.measureText()` reading of the identical file. Per-class
// deviation from this file's weights (positive = real wider = the
// dangerous direction, since `wrap:false` on export turns an underestimate
// into visible horizontal overflow, not a caught/wrapped line):
//   Georgia   upper -0.3%, lower/digit -10.4%, space -31.1%, other -17.0%
//   YaHei     cjk +0.2%, upper -1.4%, lower/digit -0.6%, space -15.5%, other -2.2%
// Every Georgia class is safe-direction (real narrower, which only leaves
// more margin). YaHei's cjk class is a hair on the dangerous side of zero
// (+0.2%) but well inside the 3% no-action band this task's controlling
// brief set (mirroring the `MONO_WIDTH_SAFETY` precedent's tolerance
// discipline). Every other YaHei class is safe-direction too. Conclusion:
// no-action -- this table needs no per-role safety factor for Georgia or
// Microsoft YaHei. Full corpus and methodology: task-3-report.md
// (borrow-wave scratchpad, not shipped in this repo).
//
// Separately (not a width-calibration finding, recorded here since it
// surfaced during this same measurement): neither Georgia nor Consolas
// (src/svg/components/code.tsx) has any CJK glyph in its `cmap` at all --
// a CJK character in text declared under either face never renders from
// that face -- PowerPoint substitutes some other, currently uncontrolled
// font at the glyph level. That is a font-identity gap, not a width-
// estimation gap, and no width safety factor can address it -- see
// task-3-report.md's "unexpected findings" section.
// Bold-width correction (bold-metrics fix, 2026-07-24). The calibration
// above is Regular-only -- task-3-report.md's corpus never rendered a
// weight >= 600 -- but 96% of this codebase's archetype heading `<text>`
// declarations do (root-cause.md S5: 50/52 `fontWeight` literals across
// src/svg/archetypes/*.tsx are >=600 or the literal "bold"), and OOXML
// export collapses any of those into a real Bold glyph outline
// (`isBold()`, `src/svg/fonts.ts`). The user-reported defect is exactly
// this gap: cover-fashion-masthead.tsx's "Components Demo" line measured
// 1166.21 units-as-px (fits the 1168px budget) under this file's unweighted
// estimate, but Georgia Bold's real hmtx-table width is 1366.79px (+17.2%,
// root-cause.md S3) -- comfortably over budget, with no wrap/ellipsis to
// catch it (`wrap="none"` on export, `render.ts`).
//
// Per-class factors below are `bold_real_em / assumed_estimator_weight`,
// read verbatim off this task's data pack (`bold-data-pack.json`
// `derived_bold_factors`, `bold-data-pack.md` for full methodology/
// provenance/corpus -- scratchpad, not shipped in this repo, dated
// 2026-07-24). Georgia/Microsoft YaHei are `genuine-file-hmtx`: fontTools
// `hmtx`-table reads of the real exported Bold binaries (Georgia
// Bold.ttf/msyhbd.ttc), identity-confirmed via each file's own `name`
// table -- not a visually-similar stand-in. SimSun/KaiTi have no genuine
// Bold binary anywhere (exhaustively searched, `bold-data-pack.md` S1) --
// their `upper`/`lowerDigit` factors are `conservative-proxy`: the real
// SimSun/KaiTi Regular baseline advanced by Georgia's own measured Bold
// growth rate, a deliberately conservative (wider, not narrower) bound,
// not a measurement of this face's real synthetic-bold behavior
// (`bold-data-pack.md` S3.3's first-principles argument for why Georgia's
// growth rate, not the incidental Noto-Sans-CJK-SC reading also on file,
// is the conservative choice).
type WeightMode = "regular" | "bold"
interface ClassFactor {
  regular: number
  bold: number
}
const NO_CORRECTION: ClassFactor = { regular: 1, bold: 1 }
interface FaceFactorTable {
  space: ClassFactor
  wide: ClassFactor
  upper: ClassFactor
  lowerDigit: ClassFactor
  other: ClassFactor
}

// lowerDigit safety margin (red-first verification round, 2026-07-24,
// widened after a second independent confirmation during this fix's own
// visual-QA pass). The data pack's own tolerance bands (no_action <=3%,
// judgment_band 3-5%, danger >5%) are CORPUS-AVERAGE deviations -- they
// describe the class's typical behavior, not a per-string guarantee, and
// `lowerDigit` (a-z + 0-9) spans a wider real-width range than any other
// class here (compare a narrow "i"/"l"/"t" against a wide "m"/"w"/"o") --
// structurally the class most exposed to a short, adversarial string
// landing well outside its own average. Two independent real-world checks
// both caught exactly this gap, on two different faces, for the same
// underlying reason:
//   1. Rendering this fix's own red-first case (cover-fashion-masthead +
//      "Structure Components Demo" + consulting, i.e. Georgia) through the
//      built CLI and LibreOffice, mirroring root-cause.md's own
//      confirmation method: the verbatim Georgia `lowerDigit` factor
//      (1.0461, corpus deviation +4.62%, "judgment_band") left "Components
//      Demo" -- 12 of 15 non-space characters are lowerDigit-class,
//      several (m, o, o, o, m) wider than the corpus's blended average --
//      still visibly clipping ("Components Dem", the trailing "o" gone),
//      even though the estimator's own math said it fit.
//   2. This fix's task-brief-mandated visual-QA sweep (item 6) rendering
//      the same heading under a YaHei-heading theme (campaign): the
//      verbatim YaHei `lowerDigit` factor (1.0266, corpus deviation
//      +2.66%, "no_action" -- the data pack's most confident "safe"
//      verdict) *also* left "Components Demo" visibly clipping. A direct
//      fontTools hmtx re-measurement of this exact string against the
//      genuine msyhbd.ttc confirmed a real 9.7319em advance against this
//      file's pre-margin estimate of ~8.77em -- a genuine ~10% under-count
//      the class's own "no_action" label gave no warning of.
// Conclusion: a `lowerDigit` class-average deviation, however small or
// confidently labeled, is not a reliable per-string bound -- this margin
// applies to `lowerDigit` on every genuine-file face unconditionally, not
// gated on that face's own danger_flag. Every *other* class here keeps the
// original, narrower gate (only judgment-band-or-worse AND already
// pointing the dangerous/wider direction) since neither confirmation above
// implicated them: Georgia's `upper` is independently verified tight
// against this corpus's single worst individual reading ("RISK ASSESSMENT
// SUMMARY," +12.48%, essentially matching `upper`'s own +12.42% class
// factor with no gap to close), and a class whose own recommended factor
// already points narrower/safe (e.g. YaHei's `other`, judgment-band by
// |deviation| but 0.9593 -- already <1.0) gains nothing from inflating it.
// Magnitude: 1.2, this fix's own brief's suggested starting point for a
// Georgia-bold safety factor ("留出余量的固定安全系数起步，例如约 1.2 的
// 除数") -- re-verified empirically against real renders (both faces,
// LibreOffice) after applying it, see this fix's report.
const LOWER_DIGIT_MARGIN = 1.2
// Narrower-gated margin for every other class: judgment-band-or-worse by
// |corpus deviation| AND already pointing the dangerous (wider, >1.0)
// direction. See `LOWER_DIGIT_MARGIN`'s comment for why `lowerDigit`
// itself uses the unconditional margin above instead of this gate.
const JUDGMENT_BAND_MARGIN = 1.2

// Georgia (consulting default heading+body; academic/insight heading).
// Regular stays uncorrected -- already safe per the calibration comment
// above ("every Georgia class is safe-direction"). `upper` is Bold-danger
// (+12.42% vs this file's assumed weight) and independently verified tight
// (see `JUDGMENT_BAND_MARGIN`'s comment) -- applied verbatim, no margin.
// `lowerDigit` gets `LOWER_DIGIT_MARGIN` -- the class the red-first
// verification round found insufficient verbatim, the direct cause of the
// reported defect surviving the first correction pass: "Components Demo"
// is lowerDigit-heavy, and `layoutSvgText`'s `Math.floor(maxWidth /
// longest)` sizing means the single longest line's error is what decides
// the whole heading's font size. `wide` is `NO_CORRECTION` as a deliberate
// don't-care, not a safety claim: Georgia's `cmap` has zero CJK glyphs at
// any weight (S3c's pre-existing finding), so no CJK character ever
// actually renders from this face.
const GEORGIA: FaceFactorTable = {
  space: { regular: 1, bold: 0.7254 },
  wide: NO_CORRECTION,
  upper: { regular: 1, bold: 1.1242 },
  lowerDigit: { regular: 1, bold: 1.0461 * LOWER_DIGIT_MARGIN },
  other: { regular: 1, bold: 0.9159 },
}

// Microsoft YaHei (heading: campaign/classroom/enterprise/heritage/luxe/
// tech; body: 12/13 themes; ROLE_DEFAULT fallback). Regular stays
// uncorrected -- already safe. No single Bold class crosses the >5% danger
// line in isolation, but `space`/`upper`/`lowerDigit`/`other` are applied
// verbatim (`upper`/`lowerDigit` get margins, see below) rather than
// rounded down to 1.0: bold-data-pack.md's own validation strings show
// "Structure Components Demo" crossing danger under YaHei (+5.92% vs this
// file's unweighted estimate) once `upper`+`lowerDigit` compound across a
// real sentence, even though neither class looks dangerous alone.
// `upper` is judgment-band (+3.17%) and, same reasoning as Georgia's own
// `upper`/`lowerDigit` (see `JUDGMENT_BAND_MARGIN`'s comment), gets the
// margin -- a corpus-average judgment-band class is exactly the shape of
// gap this fix's red-first round found insufficient verbatim. `lowerDigit`
// gets `LOWER_DIGIT_MARGIN` *despite* being this file's most confident
// "no_action" verdict (+2.66%) -- this fix's own visual-QA pass caught
// this exact class, on this exact face, leaving "Components Demo" visibly
// clipping verbatim (see `LOWER_DIGIT_MARGIN`'s comment for the full
// finding); a "no_action" corpus average earned no exemption once a real
// render disproved it. `other` is judgment-band by |deviation| (4.06%) but
// its own recommended factor (0.9593) already points narrower/safe -- the
// margin exists to protect against under-correction, and inflating an
// already-safe number serves no purpose, so it's excluded. `wide` (cjk) is
// the one class rounded to `NO_CORRECTION` despite measuring a nonzero
// +0.14% Bold reading: the data pack's own verdict for it is "no_action",
// it measured 0.00% bold-vs-regular growth (identical to Georgia/SimSun-
// KaiTi's weight-invariant CJK finding, not YaHei-specific), and a
// rounding-level correction that only ever applied to Bold text would
// create an asymmetry (regular CJK == old assumption, bold CJK == a hair
// off it) with no safety benefit to justify the inconsistency.
const YAHEI: FaceFactorTable = {
  space: { regular: 1, bold: 0.8511 },
  wide: NO_CORRECTION,
  upper: { regular: 1, bold: 1.0317 * JUDGMENT_BAND_MARGIN },
  lowerDigit: { regular: 1, bold: 1.0266 * LOWER_DIGIT_MARGIN },
  other: { regular: 1, bold: 0.9593 },
}

// SimSun (heading: bloom/journal/runway) and KaiTi (heading: ink) share one
// table -- their `hmtx` tables are byte-identical on every probed character
// (same legacy GB font-grid design: Latin glyphs rigidly fixed at 0.5em,
// CJK at 1.0em, zero exceptions, bold-data-pack.md S2).
//
// `space`/`other` are the SimSun/KaiTi Regular gap (this fix's item 2, not
// a bold question at all): both classes are already dangerously wrong at
// REGULAR weight (space +42.86%, other +8.70% clean-corpus vs this file's
// assumed weights) -- a rigid-grid artifact of the legacy 256-unitsPerEm
// design, unrelated to font-weight. Faux-bold measured 0% incremental
// growth for both (no ink to embolden for space; the rigid 0.5em Latin grid
// doesn't flex for other either), so `regular` and `bold` are equal here --
// the one asymmetry in this file, and the reason this correction folds in
// regardless of the caller's `bold` flag (see `classifyFace`'s callers).
// `other` uses the clean-corpus value (1.2235) rather than the raw
// corpus's more pessimistic 1.2846: the raw corpus is contaminated by one
// U+00B7 MIDDLE DOT character that a separate, pre-existing `WIDE_CHAR_RE`
// coverage gap misclassifies as "other" instead of CJK-wide -- folding
// that unrelated bug into this factor would overcorrect for the wrong
// reason (bold-data-pack.md S2 side-finding 2).
//
// `upper`/`lowerDigit` are `conservative-proxy`, Bold-only (see file header
// comment above). `lowerDigit` (1.048) gets `LOWER_DIGIT_MARGIN` -- same
// unconditional treatment as Georgia/YaHei's own `lowerDigit` (see that
// constant's comment): this is already a conservative *proxy*, not a
// genuine reading, so the extra margin compounds on top of an
// already-hedged number, which is the right direction to err for a face
// with no real Bold binary to check against. `upper` (0.852) already
// points narrower/safe -- excluded from the margin for the same reason
// YaHei's `other` is (see `JUDGMENT_BAND_MARGIN`'s comment). `wide` is
// `NO_CORRECTION`: three independent genuine-bold sources (YaHei's own
// hmtx, an incidental Noto Sans CJK SC reading, SimSun/KaiTi's own
// zero-variance Regular CJK grid) all agree CJK advance width is
// weight-invariant.
const SIMSUN_KAITI: FaceFactorTable = {
  space: { regular: 1.4286, bold: 1.4286 },
  wide: NO_CORRECTION,
  upper: { regular: 1, bold: 0.852 },
  lowerDigit: { regular: 1, bold: 1.048 * LOWER_DIGIT_MARGIN },
  other: { regular: 1.2235, bold: 1.2235 },
}

// Conservative envelope for any exported face this pack never measured --
// e.g. a future theme whose heading resolves to one of fonts.ts's other
// SAFE_FONTS members (Arial, Cambria, SimHei, FangSong, ...); none of
// today's 13 themes' heading role resolves to any of them. Per-class MAX
// of the three tables above, `bold` column only: 2 of the 3 measured faces
// need no Regular-weight correction at all (only SimSun/KaiTi's proven,
// face-specific rigid-grid design does), so defaulting an unmeasured
// face's `regular` column to that same correction would assume data this
// pack never measured -- `regular` stays uncorrected, `bold` gets the
// safe-direction envelope (this fix's brief, option 1: "MAX across the
// danger faces actually exported for that role").
const ENVELOPE: FaceFactorTable = {
  space: { regular: 1, bold: Math.max(GEORGIA.space.bold, YAHEI.space.bold, SIMSUN_KAITI.space.bold) },
  wide: { regular: 1, bold: Math.max(GEORGIA.wide.bold, YAHEI.wide.bold, SIMSUN_KAITI.wide.bold) },
  upper: { regular: 1, bold: Math.max(GEORGIA.upper.bold, YAHEI.upper.bold, SIMSUN_KAITI.upper.bold) },
  lowerDigit: {
    regular: 1,
    bold: Math.max(GEORGIA.lowerDigit.bold, YAHEI.lowerDigit.bold, SIMSUN_KAITI.lowerDigit.bold),
  },
  other: { regular: 1, bold: Math.max(GEORGIA.other.bold, YAHEI.other.bold, SIMSUN_KAITI.other.bold) },
}

/**
 * Classifies a resolved CSS font-family list (`ComponentCtx.fonts.*`, i.e.
 * `resolveFontStack`'s output) down to the face this pack measured, by its
 * *first* member -- the Windows-safe exported face `svg2pptx/text.ts`'s own
 * `firstFontFamily` reads (every member after it is `fonts.ts`'s macOS
 * preview-only fallback, e.g. "Georgia, Songti SC, STSong, serif"). Matches
 * case-insensitively with quotes/whitespace trimmed, mirroring
 * `resolveFontFace`'s own convention.
 *
 * SimHei/黑体 and FangSong/仿宋 -- `fonts.ts`'s other two legacy-GB CJK
 * faces, plausibly sharing SimSun/KaiTi's rigid grid by family design but
 * never actually measured -- deliberately fall to `ENVELOPE`, not
 * `SIMSUN_KAITI`: no current theme resolves a heading to either, and
 * assuming unmeasured data would repeat the exact "校准替身非真身"
 * (calibrating a stand-in, not the genuine face) mistake
 * `bold-data-pack.md`'s own methodology exists to catch.
 */
function classifyFace(fontFamily: string | undefined): FaceFactorTable {
  const first = fontFamily?.split(",")[0]?.replace(/['"]/g, "").trim().toLowerCase()
  if (!first) return ENVELOPE
  if (first === "georgia") return GEORGIA
  if (first === "microsoft yahei" || first === "微软雅黑") return YAHEI
  if (first === "simsun" || first === "宋体" || first === "kaiti" || first === "楷体") return SIMSUN_KAITI
  return ENVELOPE
}

export function measureTextUnits(text: string, weight?: TextWeightHint): number {
  const mode: WeightMode = weight?.bold ? "bold" : "regular"
  const table = classifyFace(weight?.fontFamily)
  return Array.from(text).reduce((sum, char) => {
    if (/\s/.test(char)) return sum + 0.35 * table.space[mode]
    if (WIDE_CHAR_RE.test(char)) return sum + 1 * table.wide[mode]
    if (/[A-Z]/.test(char)) return sum + 0.66 * table.upper[mode]
    if (/[a-z0-9]/.test(char)) return sum + 0.56 * table.lowerDigit[mode]
    return sum + 0.46 * table.other[mode]
  }, 0)
}

// Mono-role exact width model (borrow-wave Task 3 fix round, 2026-07-21).
// `measureTextUnits` above is a *proportional* heuristic -- per-character-
// class weights calibrated for variable-width faces, where a space really
// is narrower than a letter. Code (`code.tsx`) renders in `ctx.fonts.mono`,
// which resolves to Consolas for all 13 themes (`fonts.ts` ROLE_DEFAULT) --
// a genuinely monospace face, where "character-class width" isn't a
// heuristic to approximate, it's a known constant: every glyph advances
// the same fixed amount, read directly off the font.
//
// Consolas's own `hmtx` (advance-width) table gives 1126 font units at
// unitsPerEm=2048 for *every* glyph sampled (space, upper, lower, digit,
// punctuation alike):
//   MONO_ADVANCE_EM = 1126 / 2048 = 0.5498 em
// -- the defining, unfakeable signature of a monospace face (contrast
// Georgia's 0.24-0.66 em spread across character classes in the
// calibration note above `measureTextUnits`. A variable-width font simply
// cannot show this uniformity). Measured twice, independently, to the same
// 4 decimal places: borrow-wave Task 3's fontTools `hmtx` read of the
// genuine Consolas.ttf (Microsoft Office for Mac's private font bundle,
// identity-confirmed via that file's own `name` table), and that task's
// review, which re-derived it from a from-scratch Node.js sfnt/hmtx parser
// sharing no code with fontTools (see task-3-report.md / task-3-review.md,
// borrow-wave scratchpad, not shipped in this repo).
//
// The proportional weights structurally underestimate this face's
// whitespace and punctuation as a result (+57.1%/+19.5% real-vs-assumed
// for the space/"other" classes, same corpus) -- and that gap has no
// ceiling: it grows with indentation depth, since a deep-indent line is
// almost entirely the single most-underestimated class. See
// MONO_WIDTH_SAFETY's derivation comment in code.tsx for what that did to
// the safety-factor approach this model replaces.
//
// The one exception: CJK/wide characters (`WIDE_CHAR_RE`, shared with
// `measureTextUnits` above) stay at 1.0 em/char, not 0.5498. Consolas's
// `cmap` contains zero CJK glyphs at all (task-3-report.md's S4.1 finding,
// exhaustively re-verified in task-3-review.md by scanning every cmap
// segment/group, not sampling) -- a CJK character declared under a mono
// role never actually renders from Consolas. PowerPoint silently
// substitutes some other, uncontrolled font at the glyph level. That
// substituted font's real metrics are unknowable (it isn't even
// deterministic which font it will be), so this keeps the same 1.0 em/char
// assumption `measureTextUnits`'s WIDE_CHAR_RE class already uses for CJK
// (consistent with the sibling measurement of Microsoft YaHei's CJK class
// landing at +0.16%, i.e. ~1em -- see the calibration note above
// `measureTextUnits`) rather than invent a new, unmeasured number. This is
// a font-identity gap, not a metrics gap -- fonts.ts originally recorded it
// as a known, unresolved risk no width model could fix, and has since
// closed it (a:ea follow-up task -- `eaFontFaceFor` plus the JSZip patch in
// `src/pptx/pptx-ea-fonts.ts`): a mono-role CJK character now
// deterministically renders from Microsoft YaHei, exactly the face this
// 1.0 em/char estimate already assumed. No change needed to this model --
// it was betting on that face before the fix existed, and the fix made the
// bet true (see `eaFontFaceFor`'s own doc comment in fonts.ts for that
// cross-reference).
const MONO_ADVANCE_EM = 1126 / 2048

export function measureMonoTextUnits(text: string): number {
  return Array.from(text).reduce((sum, char) => {
    if (WIDE_CHAR_RE.test(char)) return sum + 1
    return sum + MONO_ADVANCE_EM
  }, 0)
}

function splitLongToken(token: string, maxUnits: number, weight?: TextWeightHint): string[] {
  const chunks: string[] = []
  let current = ""

  for (const char of Array.from(token)) {
    const candidate = `${current}${char}`
    if (current && measureTextUnits(candidate, weight) > maxUnits) {
      chunks.push(current)
      current = char
    } else {
      current = candidate
    }
  }

  if (current) chunks.push(current)
  return chunks
}

function tokenize(text: string): { tokens: string[]; spaceDelimited: boolean } {
  const normalized = text.trim().replace(/\s+/g, " ")
  if (!normalized) return { tokens: [], spaceDelimited: false }
  const spaceDelimited = normalized.includes(" ")
  return {
    tokens: spaceDelimited ? normalized.split(" ") : Array.from(normalized),
    spaceDelimited,
  }
}

function wrapWithUnits(text: string, maxUnits: number, weight?: TextWeightHint): string[] {
  const lines: string[] = []

  for (const paragraph of text.split(/\n+/)) {
    const { tokens, spaceDelimited } = tokenize(paragraph)
    let current = ""

    for (const token of tokens) {
      const tokenChunks =
        measureTextUnits(token, weight) > maxUnits
          ? splitLongToken(token, maxUnits, weight)
          : [token]

      for (const [chunkIndex, chunk] of tokenChunks.entries()) {
        const prefix = current && spaceDelimited && chunkIndex === 0 ? " " : ""
        const candidate = `${current}${prefix}${chunk}`
        if (current && measureTextUnits(candidate, weight) > maxUnits) {
          lines.push(current)
          current = chunk
        } else {
          current = candidate
        }
      }
    }

    if (current) lines.push(current)
  }

  return lines
}

/**
 * Re-wrap `content` so its lines split evenly instead of greedy-filling, when
 * the greedy result ends in a widow (last line < half the widest line).
 *
 * The balanced budget starts at `max(total/N, longest token)` — flooring at
 * the longest whitespace-delimited token guarantees `splitLongToken` never
 * fires, so balancing can shorten lines but never split a word mid-way (for
 * CJK the "tokens" are single chars, so the floor is a no-op). The budget
 * steps up ×1.06 until the re-wrap stops exceeding the original line count;
 * if 8 steps can't get there, the greedy result stands. Explicit newlines are
 * the author's own breaks — those layouts are returned untouched.
 */
function balanceWrappedLines(content: string, lines: string[], weight?: TextWeightHint): string[] {
  if (lines.length < 2 || content.includes("\n")) return lines
  const units = lines.map((l) => measureTextUnits(l, weight))
  const widest = Math.max(...units)
  if (units[units.length - 1] >= widest * 0.5) return lines
  const total = units.reduce((sum, u) => sum + u, 0)
  // Token floor must mirror `tokenize`: space-delimited text wraps by words,
  // so flooring at the longest word keeps `splitLongToken` from ever firing;
  // unspaced (CJK) text wraps per character, so no floor is needed — flooring
  // at the whole string there would collapse the wrap to one oversized line.
  const { tokens } = tokenize(content)
  const longestToken = Math.max(...tokens.map((t) => measureTextUnits(t, weight)), 0)
  let target = Math.max(total / lines.length, longestToken)
  for (let i = 0; i < 8; i += 1) {
    const candidate = wrapWithUnits(content, target, weight)
    // Same line count, evenly split — that's the goal. Fewer lines means the
    // token floor out-widened the greedy budget (giant word): keep greedy.
    if (candidate.length === lines.length) return candidate
    if (candidate.length < lines.length) return lines
    target *= 1.06
  }
  return lines
}

export function truncateToUnits(text: string, maxUnits: number, weight?: TextWeightHint): string {
  if (measureTextUnits(text, weight) <= maxUnits) return text
  const budget = maxUnits - 1 // 预留省略号
  let out = ""
  for (const ch of Array.from(text)) {
    if (measureTextUnits(out + ch, weight) > budget) break
    out += ch
  }
  if (out === "") {
    return measureTextUnits("…", weight) > maxUnits ? "" : "…"
  }
  return `${out}…`
}

// Mono sibling of `truncateToUnits` above, measuring with
// `measureMonoTextUnits` instead of `measureTextUnits` -- a separate
// function rather than a parameterized one so `truncateToUnits`'s existing
// callers (bullets/kpi/citation/steps/icon-cards/BigNumber/emphasis/
// heading-fit, all proportional-model roles) are untouched by this borrow-
// wave Task 3 fix-round addition. Only `code.tsx` calls this one.
export function truncateToMonoUnits(text: string, maxUnits: number): string {
  if (measureMonoTextUnits(text) <= maxUnits) return text
  const budget = maxUnits - 1 // 预留省略号，与 truncateToUnits 同一约定
  let out = ""
  for (const ch of Array.from(text)) {
    if (measureMonoTextUnits(out + ch) > budget) break
    out += ch
  }
  if (out === "") {
    return measureMonoTextUnits("…") > maxUnits ? "" : "…"
  }
  return `${out}…`
}

export function fitSvgLine(
  text: string,
  opts: {
    maxWidth: number
    fontSize: number
    minFontSize?: number
    letterSpacing?: number
  } & TextWeightHint,
): { text: string; fontSize: number; truncated: boolean } {
  const minFontSize = opts.minFontSize ?? 12
  // `letterSpacing` is an SVG attribute in absolute px, independent of
  // font-size — unlike `measureTextUnits`' per-character weights, it doesn't
  // scale down when the line shrinks to fit. A caller that renders this
  // line with `letterSpacing` (kicker/section labels across every theme do)
  // adds (charCount - 1) * letterSpacing extra px that this estimator was
  // previously blind to — real getBBox measurement on long CJK section
  // labels showed exactly this drift (real bbox ~80-220px wider than the
  // declared maxWidth). Budget it out of maxWidth up front so the fitted
  // font-size/truncation account for it.
  const letterSpacing = opts.letterSpacing ?? 0
  const weight: TextWeightHint = { bold: opts.bold, fontFamily: opts.fontFamily }
  const units = measureTextUnits(text, weight)
  if (units <= 0) return { text, fontSize: opts.fontSize, truncated: false }
  const charCount = Array.from(text).length
  const spacingBudget = Math.max(0, charCount - 1) * letterSpacing
  const availableWidth = Math.max(0, opts.maxWidth - spacingBudget)
  const fitted = Math.min(opts.fontSize, Math.floor(availableWidth / units))
  if (fitted >= minFontSize) return { text, fontSize: fitted, truncated: false }
  // `truncated` (bench-driven fix round, defect E): `true` exactly when the
  // shrink-to-`minFontSize` step still wasn't enough and `truncateToUnits`
  // had to drop characters — the caller-visible signal `deck-audit.ts`'s new
  // `content-truncated` advisory reads to mark the rendered `<text>` with
  // `data-truncated="1"`, so real content loss (not just a smaller font) is
  // auditable instead of requiring a human/model to eyeball every SVG. Not
  // `text !== originalText` — an author's own text can legitimately be
  // shorter than what it started as for unrelated reasons upstream; this
  // flag reports the *mechanism* (did this call take the truncate branch),
  // which is unambiguous regardless of what the input happened to contain.
  return {
    text: truncateToUnits(text, availableWidth / minFontSize, weight),
    fontSize: minFontSize,
    truncated: true,
  }
}

export function layoutSvgText(
  text: string | undefined,
  options: SvgTextLayoutOptions
): SvgTextLayout {
  const content = text?.trim() ?? ""
  const maxLines = options.maxLines ?? 2
  const lineHeightRatio = options.lineHeightRatio ?? 1.08
  const weight: TextWeightHint = { bold: options.bold, fontFamily: options.fontFamily }

  if (!content) {
    return { lines: [], fontSize: options.fontSize, lineHeight: 0, truncated: false }
  }

  const baseUnits = options.maxWidth / options.fontSize
  let maxUnits = baseUnits
  let lines = wrapWithUnits(content, maxUnits, weight)

  for (let i = 0; lines.length > maxLines && i < 8; i += 1) {
    maxUnits *= 1.14
    lines = wrapWithUnits(content, maxUnits, weight)
  }

  if (lines.length > maxLines) {
    lines = [
      ...lines.slice(0, maxLines - 1),
      lines.slice(maxLines - 1).join(""),
    ]
  }

  // After the merge fallback a too-long text's last line is long, not a
  // widow, so balancing naturally skips it — only genuine widows re-wrap.
  if (options.balanceLines) {
    lines = balanceWrappedLines(content, lines, weight)
  }

  const longest = Math.max(...lines.map((l) => measureTextUnits(l, weight)), 1)
  const fittedFontSize = Math.min(
    options.fontSize,
    Math.floor(options.maxWidth / longest)
  )
  const fontSize = Math.max(1, fittedFontSize)

  return {
    lines,
    fontSize,
    lineHeight: Math.round(fontSize * lineHeightRatio),
    truncated: false,
  }
}
