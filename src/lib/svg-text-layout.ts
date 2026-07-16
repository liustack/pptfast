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

export function measureTextUnits(text: string): number {
  return Array.from(text).reduce((sum, char) => {
    if (/\s/.test(char)) return sum + 0.35
    if (WIDE_CHAR_RE.test(char)) return sum + 1
    if (/[A-Z]/.test(char)) return sum + 0.66
    if (/[a-z0-9]/.test(char)) return sum + 0.56
    return sum + 0.46
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

export function fitSvgLine(
  text: string,
  opts: { maxWidth: number; fontSize: number; minFontSize?: number; letterSpacing?: number },
): { text: string; fontSize: number } {
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
  if (units <= 0) return { text, fontSize: opts.fontSize }
  const charCount = Array.from(text).length
  const spacingBudget = Math.max(0, charCount - 1) * letterSpacing
  const availableWidth = Math.max(0, opts.maxWidth - spacingBudget)
  const fitted = Math.min(opts.fontSize, Math.floor(availableWidth / units))
  if (fitted >= minFontSize) return { text, fontSize: fitted }
  return {
    text: truncateToUnits(text, availableWidth / minFontSize),
    fontSize: minFontSize,
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
