export interface SvgTextLayoutOptions {
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
export function measureTextUnits(text: string): number {
  return Array.from(text).reduce((sum, char) => {
    if (/\s/.test(char)) return sum + 0.35
    if (WIDE_CHAR_RE.test(char)) return sum + 1
    if (/[A-Z]/.test(char)) return sum + 0.66
    if (/[a-z0-9]/.test(char)) return sum + 0.56
    return sum + 0.46
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

function splitLongToken(token: string, maxUnits: number): string[] {
  const chunks: string[] = []
  let current = ""

  for (const char of Array.from(token)) {
    const candidate = `${current}${char}`
    if (current && measureTextUnits(candidate) > maxUnits) {
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

function wrapWithUnits(text: string, maxUnits: number): string[] {
  const lines: string[] = []

  for (const paragraph of text.split(/\n+/)) {
    const { tokens, spaceDelimited } = tokenize(paragraph)
    let current = ""

    for (const token of tokens) {
      const tokenChunks =
        measureTextUnits(token) > maxUnits
          ? splitLongToken(token, maxUnits)
          : [token]

      for (const [chunkIndex, chunk] of tokenChunks.entries()) {
        const prefix = current && spaceDelimited && chunkIndex === 0 ? " " : ""
        const candidate = `${current}${prefix}${chunk}`
        if (current && measureTextUnits(candidate) > maxUnits) {
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
function balanceWrappedLines(content: string, lines: string[]): string[] {
  if (lines.length < 2 || content.includes("\n")) return lines
  const units = lines.map(measureTextUnits)
  const widest = Math.max(...units)
  if (units[units.length - 1] >= widest * 0.5) return lines
  const total = units.reduce((sum, u) => sum + u, 0)
  // Token floor must mirror `tokenize`: space-delimited text wraps by words,
  // so flooring at the longest word keeps `splitLongToken` from ever firing;
  // unspaced (CJK) text wraps per character, so no floor is needed — flooring
  // at the whole string there would collapse the wrap to one oversized line.
  const { tokens } = tokenize(content)
  const longestToken = Math.max(...tokens.map(measureTextUnits), 0)
  let target = Math.max(total / lines.length, longestToken)
  for (let i = 0; i < 8; i += 1) {
    const candidate = wrapWithUnits(content, target)
    // Same line count, evenly split — that's the goal. Fewer lines means the
    // token floor out-widened the greedy budget (giant word): keep greedy.
    if (candidate.length === lines.length) return candidate
    if (candidate.length < lines.length) return lines
    target *= 1.06
  }
  return lines
}

export function truncateToUnits(text: string, maxUnits: number): string {
  if (measureTextUnits(text) <= maxUnits) return text
  const budget = maxUnits - 1 // 预留省略号
  let out = ""
  for (const ch of Array.from(text)) {
    if (measureTextUnits(out + ch) > budget) break
    out += ch
  }
  if (out === "") {
    return measureTextUnits("…") > maxUnits ? "" : "…"
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
  opts: { maxWidth: number; fontSize: number; minFontSize?: number; letterSpacing?: number },
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
  const units = measureTextUnits(text)
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
    text: truncateToUnits(text, availableWidth / minFontSize),
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

  if (!content) {
    return { lines: [], fontSize: options.fontSize, lineHeight: 0 }
  }

  const baseUnits = options.maxWidth / options.fontSize
  let maxUnits = baseUnits
  let lines = wrapWithUnits(content, maxUnits)

  for (let i = 0; lines.length > maxLines && i < 8; i += 1) {
    maxUnits *= 1.14
    lines = wrapWithUnits(content, maxUnits)
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
    lines = balanceWrappedLines(content, lines)
  }

  const longest = Math.max(...lines.map(measureTextUnits), 1)
  const fittedFontSize = Math.min(
    options.fontSize,
    Math.floor(options.maxWidth / longest)
  )
  const fontSize = Math.max(1, fittedFontSize)

  return {
    lines,
    fontSize,
    lineHeight: Math.round(fontSize * lineHeightRatio),
  }
}
