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
// Bold-width correction (bold-metrics fix, 2026-07-24; upgraded to an exact
// per-character model in round 2, same date, after a controller-ordered
// review found the class-average approach below structurally insufficient
// -- see "EPITAPH" further down before trusting anything about
// "class-average factors" in old comments elsewhere in this codebase).
// 96% of this codebase's archetype heading `<text>` declarations render
// `font-weight >= 600` (root-cause.md S5), and OOXML export collapses any
// of those into a real Bold glyph outline (`isBold()`, `src/svg/fonts.ts`).
// The user-reported defect is exactly this gap: cover-fashion-masthead.tsx's
// "Components Demo" line measured 1166.21 units-as-px (fits the 1168px
// budget) under this file's original unweighted estimate, but Georgia
// Bold's real hmtx-table width is 1366.79px (+17.2%, root-cause.md S3) --
// comfortably over budget, with no wrap/ellipsis to catch it (`wrap="none"`
// on export, `render.ts`).
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

// EPITAPH -- round 1's `LOWER_DIGIT_MARGIN`/`JUDGMENT_BAND_MARGIN`
// (multiplicative safety factors layered on top of the per-class-average
// Bold factors below), retired in round 2. Recorded here, not silently
// deleted, because the reasoning for *why* a margin-on-an-average can never
// be the right fix is the load-bearing lesson, not just this file's own
// history:
//
// Round 1 found the data pack's verbatim per-class averages insufficient
// (real renders of "Components Demo" still clipped on both Georgia and
// YaHei) and patched it with a flat 1.2x margin on the classes that broke.
// A controller-ordered review (this task's own bold-metrics-fix-review,
// scratchpad) then found real, ordinary (not synthetic) headings that
// *still* clipped through that margin -- "Maximum Momentum Wave" (Georgia
// Bold, "Wave"'s trailing "e" cut off the canvas edge) and "MEGAMARKET
// MOMENTUM" (Georgia Bold, "MARKET"'s trailing "T" cut off) -- both
// LibreOffice-confirmed. The reviewer's independent fontTools hmtx read of
// the genuine Georgia Bold.ttf explains exactly why a margin could never
// have closed this gap: `lowerDigit`'s single widest real character, "m",
// has a true advance of 1.0156em -- a 1.8136x ratio over the class's
// assumed 0.56em weight -- while round 1's margined factor
// (1.0461 x 1.2 = 1.2553x) covered barely two thirds of that gap. Georgia's
// `upper` class (which round 1 left *unmargined*, reasoned "independently
// verified tight" against this corpus's own worst sampled string) has the
// same structural problem in the other direction: "W" has a true advance
// of 1.1265em against an assumed 0.66em weight -- a +51.8% deviation, not
// the +12.42% the sampled corpus average suggested.
//
// The generalizable lesson: a class average -- however large the corpus,
// however small the measured deviation, margined or not -- describes the
// *typical* member of an open-ended character class, never its bound. Any
// margin chosen to clear the worst case *known at the time* (round 1's two
// failing strings) is definitionally unfalsifiable against a worst case
// *not yet tried* (round 2's two new ones) -- there is no principled stopping
// point short of the class's true maximum (1.8136x for `lowerDigit`, which
// would in turn over-shrink the overwhelming majority of ordinary headings
// that never come near that character). The only way to be simultaneously
// exact for typical headings and safe for adversarial ones is to stop
// averaging altogether -- which is what the exact per-character tables
// below do for the two faces this task has genuine Bold binaries for.
// SimSun/KaiTi (`SIMSUN_KAITI` below) keep a class-average model, unchanged
// from round 1 apart from also losing their own `LOWER_DIGIT_MARGIN` factor
// -- but that removal doesn't reopen the same hole, because SimSun/KaiTi's
// Latin glyphs have *zero* measured per-character variance in the first
// place (every probed character sits at exactly 0.5em, `bold-data-pack.md`
// S2 -- a rigid design grid, not a statistical average with a long tail),
// so there is no "worst individual character beats the average" case for a
// class average to fail to bound. See `SIMSUN_KAITI`'s own comment for the
// full argument.
//
// Per-class factors below (now used only as the exact-model faces' rare
// fallback, and as `SIMSUN_KAITI`/`ENVELOPE`'s only model) are
// `bold_real_em / assumed_estimator_weight`, read verbatim off this task's
// data pack (`bold-data-pack.json` `derived_bold_factors`, `bold-data-
// pack.md` for full methodology/provenance/corpus -- scratchpad, not
// shipped in this repo, dated 2026-07-24), with no margin layered on top
// (see EPITAPH above for why not). Georgia/Microsoft YaHei's numbers are
// `genuine-file-hmtx`; SimSun/KaiTi have no genuine Bold binary anywhere
// (exhaustively searched, `bold-data-pack.md` S1) so theirs stay
// `conservative-proxy` (Georgia's own measured Bold growth rate applied to
// SimSun/KaiTi's real, zero-variance Regular baseline).
const GEORGIA: FaceFactorTable = {
  space: { regular: 1, bold: 0.7254 },
  wide: NO_CORRECTION,
  upper: { regular: 1, bold: 1.1242 },
  lowerDigit: { regular: 1, bold: 1.0461 },
  other: { regular: 1, bold: 0.9159 },
}

const YAHEI: FaceFactorTable = {
  space: { regular: 1, bold: 0.8511 },
  wide: NO_CORRECTION,
  upper: { regular: 1, bold: 1.0317 },
  lowerDigit: { regular: 1, bold: 1.0266 },
  other: { regular: 1, bold: 0.9593 },
}

// SimSun (heading: bloom/journal/runway) and KaiTi (heading: ink) share one
// table -- their `hmtx` tables are byte-identical on every probed character
// (same legacy GB font-grid design: Latin glyphs rigidly fixed at 0.5em,
// CJK at 1.0em, zero exceptions, bold-data-pack.md S2). Still a
// class-average model in round 2, deliberately not upgraded to an exact
// table -- there is nothing to make "exact" about a class whose own real
// measurement already has zero variance (every Latin glyph is precisely
// 0.5em; see the EPITAPH comment above for why that immunizes this face
// from the exact per-character reasoning that forced Georgia/YaHei's
// upgrade). Where the *remaining* uncertainty comes from for this face
// (does Georgia's own Bold growth rate even transplant validly onto
// SimSun/KaiTi's un-measurable faux-bold rendering, a cross-face
// extrapolation question, not a within-class variance question) was
// already argued as a deliberately conservative choice in
// `bold-data-pack.md` S3.3 (Georgia's growth rate picked over the smaller
// Noto-Sans-CJK-SC-observed rate specifically for its larger, safer
// magnitude) -- stacking round 1's now-retired margin on top of an
// already-conservative choice would have been double-counting a safety
// margin with no new evidence behind the second layer, unlike Georgia's
// `lowerDigit`/`upper` where the margin was answering a real, newly-found
// gap. `lowerDigit`/`upper` below are therefore the verbatim
// conservative-proxy factors, no margin -- same disposition as `GEORGIA`/
// `YAHEI` above, for a different underlying reason.
//
// `space`/`other` are the SimSun/KaiTi Regular gap (this fix's item 2, not
// a bold question at all): both classes are already dangerously wrong at
// REGULAR weight (space +42.86%, other +8.70% clean-corpus vs this file's
// assumed weights) -- a rigid-grid artifact of the legacy 256-unitsPerEm
// design, unrelated to font-weight. Faux-bold measured 0% incremental
// growth for both (no ink to embolden for space; the rigid 0.5em Latin grid
// doesn't flex for other either), so `regular` and `bold` are equal here --
// the one asymmetry in this file, and the reason this correction folds in
// regardless of the caller's `bold` flag. `other` uses the clean-corpus
// value (1.2235) rather than the raw corpus's more pessimistic 1.2846: the
// raw corpus is contaminated by one U+00B7 MIDDLE DOT character a separate,
// pre-existing `WIDE_CHAR_RE` coverage gap misclassifies as "other" instead
// of CJK-wide -- folding that unrelated bug into this factor would
// overcorrect for the wrong reason (bold-data-pack.md S2 side-finding 2).
// `wide` is `NO_CORRECTION`: three independent genuine-bold sources
// (YaHei's own hmtx, an incidental Noto Sans CJK SC reading, SimSun/KaiTi's
// own zero-variance Regular CJK grid) all agree CJK advance width is
// weight-invariant.
const SIMSUN_KAITI: FaceFactorTable = {
  space: { regular: 1.4286, bold: 1.4286 },
  wide: NO_CORRECTION,
  upper: { regular: 1, bold: 0.852 },
  lowerDigit: { regular: 1, bold: 1.048 },
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
//
// Honest caveat (round 2): this envelope is *still* a class-average model,
// carrying the exact same structural limitation the EPITAPH comment above
// describes for round 1's now-retired margins -- it cannot bound an
// unmeasured face's own single-worst-character the way it can't for any
// class average. It is unexercised by any of today's 13 themes (every
// theme's heading resolves to one of the three named faces above, never
// this fallback), so this is a forward-looking caveat, not a currently
// live gap -- but a future theme that adds a heading face from
// `SAFE_FONTS` outside {Georgia, Microsoft YaHei, SimSun, KaiTi} would
// inherit this same risk class until that face gets its own exact table
// (Georgia/YaHei's own treatment below) or at least a real per-character
// worst-case reading to size an honest margin from -- not another
// unfalsifiable guess.
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

// ---------------------------------------------------------------------
// Exact per-character advance tables (round 2). Georgia and Microsoft
// YaHei both have genuine Regular+Bold binaries on this rig (see the
// identity table in bold-data-pack.md S1) -- the same precondition
// `measureMonoTextUnits` below already required before treating a face
// exactly instead of heuristically, applied here per-character instead of
// uniformly (a proportional face doesn't have one constant advance the way
// a monospace one does, but it does have a *fixed, measurable* advance per
// glyph -- the thing a class average was only ever approximating).
//
// Coverage: printable ASCII, 0x20 (space) through 0x7E (~), 95 codepoints
// -- the full range any Latin character `measureTextUnits`' upper/
// lowerDigit/other/space classes could ever match (see `WIDE_CHAR_RE`
// above for what's classified CJK-wide instead, unaffected by this table).
// Extraction: fontTools `hmtx`/`unitsPerEm` read of the same genuine
// binaries and paths `bold-data-pack.md` S1's identity table documents
// (`/System/Library/Fonts/Supplemental/Georgia.ttf` /
// `Georgia Bold.ttf`, `.../Microsoft Word.app/.../DFonts/msyh.ttc[0]` /
// `msyhbd.ttc[0]`), each re-confirmed against its own `name` table
// (family/subfamily) immediately before extraction -- identical discipline
// to the data pack's own, re-run rather than trusted secondhand
// (`extract_exact_tables.py`, scratchpad, not shipped in this repo, dated
// 2026-07-24). All 95 codepoints resolved on all four face/weight
// combinations -- zero missing glyphs. Values are `advance / unitsPerEm`
// (both faces measured at unitsPerEm=2048), rounded to 4 decimal places,
// keyed by `charCodeAt(0)` rather than the literal character to keep a
// machine-generated table free of string-escaping ambiguity (`"`, `'`,
// `\` all appear as keys in this range).
//
// Kerning caveat (must be read before trusting this table to the last
// decimal place): these are `hmtx` *advance* widths -- the per-glyph
// spacing before any GPOS kerning-pair adjustment the shaping engine
// applies at layout time. Georgia's own kerning table is small in
// magnitude and, for the vast majority of pairs, *negative* (tightening
// pairs like "AV"/"To" pull glyphs closer, not further apart) -- so
// summing bare advances without kerning is, if anything, a conservative
// (slightly wide) over-estimate for Georgia, the safe direction for this
// fix's whole purpose. This wasn't independently re-derived for this task
// (no on-rig tool extracted this file's actual GPOS pair list) -- it's the
// same "advance-sum, no kerning" simplification `measureMonoTextUnits`
// below already ships with (monospace fonts don't kern at all, so that
// model never had this caveat), now inherited by a proportional model
// where kerning genuinely exists but is second-order. Round-2 review
// estimated the resulting shaping-level uncertainty at roughly 1-2
// percentage points on a typical multi-word heading -- small next to the
// tens-of-percent gaps the exact model closes, and safe-directional, not
// reason to distrust the model, but not zero either.
const GEORGIA_REGULAR_EXACT: Readonly<Record<number, number>> = {32:0.2412,33:0.3311,34:0.4116,35:0.6431,36:0.6099,37:0.8174,38:0.7104,39:0.2153,40:0.375,41:0.375,42:0.4722,43:0.6431,44:0.2695,45:0.374,46:0.2695,47:0.4688,48:0.6138,49:0.4297,50:0.5586,51:0.5518,52:0.5649,53:0.5283,54:0.5659,55:0.5024,56:0.5962,57:0.5659,58:0.3125,59:0.3125,60:0.6431,61:0.6431,62:0.6431,63:0.4785,64:0.9287,65:0.6709,66:0.6538,67:0.6421,68:0.749,69:0.6533,70:0.5991,71:0.7251,72:0.8149,73:0.3896,74:0.5176,75:0.6943,76:0.6035,77:0.9272,78:0.7671,79:0.7441,80:0.6099,81:0.7441,82:0.7017,83:0.561,84:0.6187,85:0.7563,86:0.6665,87:0.9756,88:0.7104,89:0.6152,90:0.6016,91:0.375,92:0.4688,93:0.375,94:0.6431,95:0.6431,96:0.5,97:0.5039,98:0.5601,99:0.4541,100:0.5742,101:0.4834,102:0.3252,103:0.5093,104:0.582,105:0.293,106:0.292,107:0.5356,108:0.2861,109:0.8809,110:0.5908,111:0.5391,112:0.5713,113:0.5596,114:0.4097,115:0.4321,116:0.3452,117:0.5752,118:0.4966,119:0.7373,120:0.5049,121:0.4922,122:0.4438,123:0.4302,124:0.375,125:0.4302,126:0.6431}
const GEORGIA_BOLD_EXACT: Readonly<Record<number, number>> = {32:0.2539,33:0.3765,34:0.5098,35:0.7031,36:0.6406,37:0.8794,38:0.7993,39:0.269,40:0.4468,41:0.4468,42:0.4819,43:0.7031,44:0.3281,45:0.3789,46:0.3281,47:0.4717,48:0.7012,49:0.4897,50:0.6265,51:0.6245,52:0.6494,53:0.5991,54:0.6479,55:0.5542,56:0.6763,57:0.6479,58:0.3672,59:0.3672,60:0.7031,61:0.7031,62:0.7031,63:0.5483,64:0.9668,65:0.7583,66:0.7573,67:0.7153,68:0.834,69:0.7212,70:0.6714,71:0.8071,72:0.9131,73:0.4458,74:0.5952,75:0.8169,76:0.6855,77:1.0234,78:0.8394,79:0.8198,80:0.7012,81:0.8198,82:0.7974,83:0.6489,84:0.6841,85:0.8335,86:0.7622,87:1.1265,88:0.8086,89:0.7319,90:0.6895,91:0.4468,92:0.4717,93:0.4468,94:0.7031,95:0.7031,96:0.5,97:0.5957,98:0.6455,99:0.5312,100:0.6631,101:0.5718,102:0.3931,103:0.5767,104:0.6797,105:0.3535,106:0.3462,107:0.6318,108:0.3442,109:1.0156,110:0.6899,111:0.6357,112:0.6577,113:0.6484,114:0.52,115:0.5127,116:0.3975,117:0.6768,118:0.5669,119:0.8633,120:0.5879,121:0.562,122:0.5254,123:0.5,124:0.3877,125:0.5,126:0.7031}
const YAHEI_REGULAR_EXACT: Readonly<Record<number, number>> = {32:0.2959,33:0.3125,34:0.4355,35:0.6382,36:0.5864,37:0.8896,38:0.8701,39:0.2563,40:0.334,41:0.334,42:0.4551,43:0.7417,44:0.2407,45:0.4326,46:0.2407,47:0.4272,48:0.5864,49:0.5864,50:0.5864,51:0.5864,52:0.5864,53:0.5864,54:0.5864,55:0.5864,56:0.5864,57:0.5864,58:0.2407,59:0.2407,60:0.7417,61:0.7417,62:0.7417,63:0.4829,64:1.0312,65:0.7036,66:0.6274,67:0.6689,68:0.7617,69:0.5498,70:0.5312,71:0.7437,72:0.7734,73:0.2939,74:0.396,75:0.6348,76:0.5132,77:0.9771,78:0.813,79:0.8149,80:0.6118,81:0.8149,82:0.6528,83:0.5771,84:0.5732,85:0.7466,86:0.6763,87:1.0176,88:0.645,89:0.6035,90:0.6201,91:0.334,92:0.416,93:0.334,94:0.7417,95:0.4482,96:0.2949,97:0.5527,98:0.6387,99:0.5015,100:0.6396,101:0.5674,102:0.3467,103:0.6396,104:0.6157,105:0.2661,106:0.2671,107:0.5444,108:0.2661,109:0.937,110:0.6162,111:0.6357,112:0.6387,113:0.6396,114:0.3818,115:0.4629,116:0.3726,117:0.6162,118:0.5249,119:0.7896,120:0.5068,121:0.5293,122:0.4917,123:0.334,124:0.269,125:0.334,126:0.7417}
const YAHEI_BOLD_EXACT: Readonly<Record<number, number>> = {32:0.2979,33:0.3486,34:0.521,35:0.6401,36:0.6167,37:0.9312,38:0.9111,39:0.3081,40:0.3896,41:0.3896,42:0.4873,43:0.7612,44:0.2856,45:0.4365,46:0.2856,47:0.4727,48:0.6167,49:0.6167,50:0.6167,51:0.6167,52:0.6167,53:0.6167,54:0.6167,55:0.6167,56:0.6167,57:0.6167,58:0.2856,59:0.2856,60:0.7612,61:0.7612,62:0.7612,63:0.4741,64:1.0298,65:0.752,66:0.6836,67:0.6733,68:0.7915,69:0.5718,70:0.5581,71:0.7651,72:0.8213,73:0.3354,74:0.4702,75:0.6929,76:0.5469,77:1.0283,78:0.8481,79:0.8184,80:0.6572,81:0.8184,82:0.6982,83:0.6016,84:0.6255,85:0.7764,86:0.7148,87:1.0762,88:0.7002,89:0.6484,90:0.6504,91:0.3896,92:0.4644,93:0.3896,94:0.7612,95:0.4482,96:0.3335,97:0.5776,98:0.666,99:0.5166,100:0.6646,101:0.582,102:0.4053,103:0.6646,104:0.6455,105:0.2959,106:0.3018,107:0.5962,108:0.2959,109:0.9819,110:0.6479,111:0.6572,112:0.666,113:0.6646,114:0.4238,115:0.4937,116:0.4141,117:0.6479,118:0.5771,119:0.8516,120:0.585,121:0.5742,122:0.5137,123:0.3896,124:0.3413,125:0.3896,126:0.7612}

interface ExactFaceTable {
  regular: Readonly<Record<number, number>>
  bold: Readonly<Record<number, number>>
}

type FaceKey = "georgia" | "yahei" | "simsun-kaiti" | "unknown"

const CLASS_TABLE_FOR: Readonly<Record<FaceKey, FaceFactorTable>> = {
  georgia: GEORGIA,
  yahei: YAHEI,
  "simsun-kaiti": SIMSUN_KAITI,
  unknown: ENVELOPE,
}

// Only the two exact-model faces have an entry -- `simsun-kaiti`/`unknown`
// fall through `measureTextUnits`' own `exactTable` lookup (undefined) to
// the class-average path unconditionally, no per-character data existing
// for either.
const EXACT_TABLE_FOR: Readonly<Partial<Record<FaceKey, ExactFaceTable>>> = {
  georgia: { regular: GEORGIA_REGULAR_EXACT, bold: GEORGIA_BOLD_EXACT },
  yahei: { regular: YAHEI_REGULAR_EXACT, bold: YAHEI_BOLD_EXACT },
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
 * never actually measured -- deliberately classify `"unknown"` (the
 * `ENVELOPE` fallback), not `"simsun-kaiti"`: no current theme resolves a
 * heading to either, and assuming unmeasured data would repeat the exact
 * "校准替身非真身" (calibrating a stand-in, not the genuine face) mistake
 * `bold-data-pack.md`'s own methodology exists to catch.
 */
function classifyFaceKey(fontFamily: string | undefined): FaceKey {
  const first = fontFamily?.split(",")[0]?.replace(/['"]/g, "").trim().toLowerCase()
  if (!first) return "unknown"
  if (first === "georgia") return "georgia"
  if (first === "microsoft yahei" || first === "微软雅黑") return "yahei"
  if (first === "simsun" || first === "宋体" || first === "kaiti" || first === "楷体") return "simsun-kaiti"
  return "unknown"
}

/**
 * Per-character-class heuristic width estimator, `WIDE_CHAR_RE`-classified
 * text and the exact-model faces' own rare fallback (see the module-level
 * comment above `GEORGIA_REGULAR_EXACT` for the exact-vs-class-average
 * split). For Georgia/Microsoft YaHei this path only fires for a codepoint
 * outside printable ASCII and outside `WIDE_CHAR_RE` -- an accented Latin
 * letter, Cyrillic, Greek, an emoji, etc. -- genuinely rare in a heading;
 * for SimSun/KaiTi/an unmeasured face it's the *only* path, every
 * character.
 *
 * Georgia's own `cmap` has zero CJK glyphs at any weight (S3c's
 * pre-existing finding, unrelated to width) -- `wide` stays `NO_CORRECTION`
 * there as a deliberate don't-care, not a safety claim, since no CJK
 * character ever actually renders from that face.
 */
function classAverageUnits(char: string, table: FaceFactorTable, mode: WeightMode): number {
  if (/\s/.test(char)) return 0.35 * table.space[mode]
  if (WIDE_CHAR_RE.test(char)) return 1 * table.wide[mode]
  if (/[A-Z]/.test(char)) return 0.66 * table.upper[mode]
  if (/[a-z0-9]/.test(char)) return 0.56 * table.lowerDigit[mode]
  return 0.46 * table.other[mode]
}

export function measureTextUnits(text: string, weight?: TextWeightHint): number {
  const mode: WeightMode = weight?.bold ? "bold" : "regular"
  const faceKey = classifyFaceKey(weight?.fontFamily)
  const classTable = CLASS_TABLE_FOR[faceKey]
  // Exact model applies to Bold only, even though a genuine Regular exact
  // table exists right above (`GEORGIA_REGULAR_EXACT`/`YAHEI_REGULAR_EXACT`)
  // -- Regular-weight text must stay byte-identical to this file's pre-fix
  // arithmetic for every call site this whole task didn't touch (the "non-
  // bold byte-inertness" hard requirement), and Georgia/YaHei's own
  // class-average tables already encode that as a literal `regular: 1`
  // (`NO_CORRECTION`) on every class -- falling through to
  // `classAverageUnits` at Regular weight reproduces the original
  // unweighted sum exactly, unchanged by this file's whole existence. The
  // Regular exact tables are real, correct data (kept for documentation and
  // any future caller that legitimately wants exact Regular widths -- they
  // even surface a genuine, pre-existing, bold-unrelated finding: "Components
  // Demo" sits ~1.25% past its own declared budget at Regular weight too,
  // root-cause.md's own number) -- but *exposing* that pre-existing gap
  // through this function's default Regular path would be an undisclosed
  // behavior change on text this fix promised to leave alone, not something
  // this task's mandate covers.
  const exactTable = mode === "bold" ? EXACT_TABLE_FOR[faceKey]?.bold : undefined
  return Array.from(text).reduce((sum, char) => {
    // WIDE_CHAR_RE (CJK/ideographic-punctuation/fullwidth) always takes the
    // class path, even under an exact-model face: the exact tables only
    // cover printable ASCII, and CJK's own class factor (measured
    // weight-invariant, see the module comment above `GEORGIA_REGULAR_EXACT`
    // and the `wide`/cjk discussion in each face table's own comment) is
    // already as precise as this file gets for that character set.
    if (exactTable && !WIDE_CHAR_RE.test(char)) {
      const exact = exactTable[char.charCodeAt(0)]
      if (exact !== undefined) return sum + exact
    }
    return sum + classAverageUnits(char, classTable, mode)
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

// Atomic-run pattern for tokenize()'s no-space branch below (task R2,
// 2026-07-24). CJK's own wrapping convention allows a break between any
// two ideographs but never inside a run of Latin letters/digits -- this
// repo's own fused heading idiom glues an English brand/metric prefix
// straight onto a CJK clause with no separating space (e.g. "DSpark：让大
// 模型推理快..."). The old no-space tokenizer (`Array.from(normalized)`)
// split every character individually, so a Latin run had no protection at
// all: the greedy per-token line pack (`wrapWithUnits` below) could end a
// line after any single character, landing squarely mid-word once the line
// budget got tight (empirically: ~20 fused-prefix characters at
// cover-left-anchor's 360px budget) -- silently, since a wrap/shrink that
// still lands under budget never touched `truncateToUnits`, so `truncated`
// stayed `false`.
//
// This regex instead matches a maximal run starting and ending in
// `[A-Za-z0-9]`, with `.`/`-`/`%` allowed *inside* the run so a
// hyphen/decimal/percent doesn't fracture a token that reads as one visual
// unit ("60-85%", "v2.3.1-rc.4" each stay a single atomic token) --  but
// never as the run's own first or last character, so a trailing connector
// splits off as its own single-char token ("etc." → ["etc", "."]) and a
// leading one likewise ("-flag" → ["-", "flag"]): a break can still land
// next to a connector, just never inside the alphanumeric run itself. Every
// other character (CJK, punctuation, and deliberately -- see below --
// anything outside ASCII) falls through to the trailing `.` alternative,
// one token per character, unchanged from the old `Array.from` behavior --
// which is what keeps pure-CJK and already-space-delimited text (that
// branch is untouched) byte-identical to pre-fix output.
//
// Deliberately ASCII-only (`[A-Za-z0-9]`, not `\p{L}`/`\p{N}`): an accented
// Latin letter (é, ü) or any other non-CJK, non-ASCII script does NOT
// extend a run -- "café" tokenizes as `["caf", "é"]`, so a break could
// still land between "caf" and "é" under a tight budget. That is a real,
// known boundary, not silently widened past what this task's brief scoped
// (ASCII alphanumerics) -- see the tokenize() doc comment and this task's
// report for the full self-review of mixed-script/connector edge cases.
//
// `splitLongToken` below is intentionally untouched: it remains the
// fallback for the rare case where an atomic run alone is wider than a
// full line (a run that long still can't be rendered unbroken in a bounded
// box -- there is no alternative to a mid-run cut there), now reached with
// a (possibly multi-character) atomic token instead of always a single
// character, which it already handled correctly (it's the same code path
// `splitLongToken` already served for an over-long whitespace-delimited
// word).
const LATIN_RUN_OR_CHAR_RE = /[A-Za-z0-9](?:[A-Za-z0-9.\-%]*[A-Za-z0-9%])?|./gu

/**
 * Splits `text` into wrap tokens. Space-delimited text (contains at least
 * one space anywhere) splits on spaces, same as always -- `wrapWithUnits`
 * re-joins those with a single space within a line (`spaceDelimited: true`
 * is exactly the re-join signal it reads). Text with no space at all (the
 * common case for a CJK clause, with or without a fused Latin/digit prefix)
 * splits per `LATIN_RUN_OR_CHAR_RE` above: one token per CJK/punctuation
 * character, but a maximal atomic token per contiguous ASCII Latin/digit
 * run -- see that constant's own comment for the full boundary discussion.
 */
function tokenize(text: string): { tokens: string[]; spaceDelimited: boolean } {
  const normalized = text.trim().replace(/\s+/g, " ")
  if (!normalized) return { tokens: [], spaceDelimited: false }
  const spaceDelimited = normalized.includes(" ")
  return {
    tokens: spaceDelimited ? normalized.split(" ") : (normalized.match(LATIN_RUN_OR_CHAR_RE) ?? []),
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
