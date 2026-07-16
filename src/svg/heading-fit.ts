/**
 * Heading auto-sizing for the single-source SVG renderer. Ported from the
 * exporter's `text-fit.ts` (deleted once the legacy export path is removed) so
 * the SVG templates own their heading metric. Sizes a heading from its visual
 * length so a long title shrinks to fit instead of overflowing.
 */

import {
  layoutSvgText,
  truncateToUnits,
  type SvgTextLayout,
} from "../lib/svg-text-layout"

// CJK punctuation/symbols (U+3000 ideographic space .. U+303F), ideographs
// (ext-A + unified), compatibility ideographs, and full-width forms — each
// renders ~1 em square. Built from an escaped string so no literal irregular
// whitespace (U+3000) ends up in the source.
//
// S3e fix (same class as S3c's fix to svg-text-layout.ts's WIDE_CHAR_RE —
// see 3f752de0's diff). This file keeps its own, independent CJK-weight
// table (visualUnits' CJK weight is 1.2, vs. measureTextUnits' 1.0 — see
// capacity.ts's own note on the two tables being separate), so S3c's fix
// to the *other* file's regex didn't touch this one — this table had the
// identical gap: U+2014 (EM DASH, doubled as "——", the idiomatic CJK
// long-dash mark) and U+2018 through U+201F (the quotation-mark sub-block
// of General Punctuation) fell through to the narrow "other" 0.56 weight
// below instead of the full CJK-wide 1.2 weight every other ideograph/
// ideographic-punctuation/fullwidth-form character in this range already
// gets. Ideographic punctuation (U+3000-U+303F) and fullwidth forms
// (U+FF00-U+FFEF) were already covered by this regex before this fix —
// only the two sub-ranges named above needed adding.
const CJK_WIDE = new RegExp(
  "[\\u2014\\u2018-\\u201f\\u3000-\\u303f\\u3400-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef]",
)

/** Approximate width of a string in em units (CJK≈1.2, ascii≈0.56, space≈0.3). */
export function visualUnits(text: string): number {
  let u = 0
  for (const ch of text) {
    if (/\s/.test(ch)) u += 0.3
    else if (CJK_WIDE.test(ch)) u += 1.2
    else u += 0.56
  }
  return u
}

/**
 * Largest font size (pt, clamped to [minPt, maxPt]) at which `text` fits within
 * `widthIn` inches across `lines` line(s). 1pt ≈ 1/72 in; one em ≈ fontSize pt.
 */
export function fitHeadingPt(
  text: string,
  opts: { widthIn: number; maxPt: number; minPt?: number; lines?: number },
): number {
  const { widthIn, maxPt, minPt = 28, lines = 1 } = opts
  const u = visualUnits(text)
  if (u <= 0) return maxPt
  const pt = Math.floor((72 * widthIn * lines) / u)
  return Math.max(minPt, Math.min(maxPt, pt))
}

/**
 * Multi-line heading fit: wraps and shrinks like `layoutSvgText`, but when
 * even `minPt` can't make the (possibly pathologically long) full text fit
 * within `maxLines`, truncates the source text first so the final layout
 * still respects the floor. Supersedes single-line `fitHeadingPt` at call
 * sites where the heading may need to wrap — a single `min-Pt`-floored line
 * can still overflow width when the text is long enough (stress content),
 * since `fitHeadingPt` never wraps or truncates.
 *
 * Uses `measureTextUnits`'s CJK weighting (via `layoutSvgText`), the same
 * model the overflow auditor uses, so the returned layout is guaranteed to
 * fit `maxWidth` regardless of whether the `minPt` floor was honored.
 */
export function fitHeadingLines(
  text: string | undefined,
  opts: {
    maxWidth: number
    fontSize: number
    maxLines?: number
    minPt?: number
    lineHeightRatio?: number
  },
): SvgTextLayout {
  const { maxWidth, fontSize, maxLines = 2, minPt = 28, lineHeightRatio } = opts
  const content = text ?? ""
  // balanceLines: headings are the hero surface where a widow line
  // (「年度战略回」+「顾」) reads broken — body/subtitle call sites keep the
  // greedy default (see SvgTextLayoutOptions).
  const first = layoutSvgText(content, {
    maxWidth,
    fontSize,
    maxLines,
    lineHeightRatio,
    balanceLines: true,
  })
  if (!content.trim() || first.fontSize >= minPt) return first
  const budget = (maxWidth / minPt) * maxLines
  const truncated = truncateToUnits(content, budget)
  return layoutSvgText(truncated, {
    maxWidth,
    fontSize: minPt,
    maxLines,
    lineHeightRatio,
    balanceLines: true,
  })
}
