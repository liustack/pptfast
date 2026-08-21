/**
 * One question, asked of a label's own characters: may this text be set as a
 * top-to-bottom column of single characters?
 *
 * Three components render a vertical-axis title (`matrix.tsx`, `heatmap.tsx`,
 * `chart.tsx`). CJK still stacks one `<text>` node per character down a
 * narrow left band. That is ordinary typography for Chinese, Japanese and
 * Korean, whose glyphs are square and carry meaning one at a time. It is
 * not typography at all for a Latin word: "Tempo" comes out as T/e/m/p/o
 * down the page, and a reader has to reassemble the word letter by letter
 * (2026-08-20 review, `component--heatmap--mixed` and
 * `component--matrix--en`). When this returns false, matrix and heatmap
 * keep the title as one horizontal line. Chart rotates the whole string
 * -90° (Western y-axis convention) instead — never a Latin letter column.
 *
 * The rule is content-driven and total: same string in, same answer out, no
 * locale, config or seed involved, so a deck's axis titles look the same on
 * every machine and across every revision.
 *
 * **Mixed-script labels do not stack.** The test is an allowlist over every
 * character, not a majority vote over the string: one Latin run inside an
 * otherwise-Chinese label ("K8s 托管") is exactly the defect — a majority rule
 * would still shatter "K8s" into K/8/s while calling the label Chinese. The
 * asymmetry is deliberate: a Chinese label set horizontally is merely less
 * traditional, a Latin word set vertically is unreadable, so every uncertain
 * case resolves toward horizontal.
 *
 * Deliberately a third character table rather than a reuse of the two that
 * already exist: `svg-text-layout.ts`'s `WIDE_CHAR_RE` classifies characters
 * for *width measurement*, and `people-initials.ts`'s `CJK_IDEOGRAPH_RE`
 * picks a *badge letter*. Neither answers this question, and widening either
 * one to cover all three jobs would tie three unrelated behaviors together.
 */

/**
 * The square scripts themselves. Written as escapes rather than as literal
 * characters so a reader can check a range against a code chart without
 * trusting their own font:
 *
 *   3040-30FF  hiragana and katakana, including ・ and ー
 *   3400-4DBF  CJK Unified Ideographs Extension A
 *   4E00-9FFF  CJK Unified Ideographs
 *   AC00-D7A3  Hangul syllables
 *   F900-FAFF  CJK Compatibility Ideographs
 */
const SQUARE_SCRIPT = "\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uac00-\\ud7a3\\uf900-\\ufaff"

/**
 * What may ride along with a square script inside one stackable label:
 *
 *   2014-2015  em dash and horizontal bar — the CJK dash, which
 *              `heading-fit.ts` already weighs as an ideograph rather than
 *              as narrow Latin punctuation
 *   2018-201F  curly quotes, the pairs CJK prose actually quotes with
 *   2E80-303F  CJK radicals, Kangxi radicals, CJK symbols and punctuation
 *   FF00-FFEF  halfwidth and fullwidth forms
 *
 * plus ASCII digits and whitespace, which stack without losing anything.
 */
const STACKABLE_COMPANION = "\\s0-9\\u2014\\u2015\\u2018-\\u201f\\u2e80-\\u303f\\uff00-\\uffef"

const STACKABLE_ONLY_RE = new RegExp(`^[${SQUARE_SCRIPT}${STACKABLE_COMPANION}]*$`)

/**
 * At least one real square glyph. Punctuation and digits alone do not earn a
 * vertical column ("2026" or "…" as a stacked stub reads as debris, not as a
 * title), so a label has to actually be written in a square script before it
 * may stack.
 */
const HAS_SQUARE_GLYPH_RE = new RegExp(`[${SQUARE_SCRIPT}]`)

/**
 * True when `text` may be set as a column of one character per line — see
 * this file's own header for the rule and the review finding behind it.
 * False for every Latin, Cyrillic, Greek, Arabic and mixed-script label, and
 * for the empty string.
 */
export function stacksVertically(text: string): boolean {
  return HAS_SQUARE_GLYPH_RE.test(text) && STACKABLE_ONLY_RE.test(text)
}
