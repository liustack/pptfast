/**
 * How far real ink falls below a baseline, per unit of font size.
 *
 * Measured on the font stacks this layout actually renders with, in a real
 * browser, two ways that agree: an 8x supersampled raster of worst-case
 * descender strings and canvas `actualBoundingBoxDescent`. The serif stacks
 * (Georgia / Bower / KaiTi families) bottom out at 0.219 on Latin
 * descenders and 0.167-0.171 on CJK; the sans stacks (YaHei / Inter
 * families) at 0.213-0.215 and 0.107-0.109. 0.22 rounds the deepest of them
 * up, so the air below is a floor rather than an average — the same
 * discipline `branding-geometry.ts`'s `FOOTNOTE_DESCENT_RATIO` states for the
 * footnote it keeps off the footer divider.
 *
 * Shared by banner-chapter, memo-head, and consulting stat-hero so an
 * underline sits below glyph ink at a size-proportional offset (C9).
 */
export const LATIN_DESCENT_RATIO = 0.22
/** CJK em-box bottom sits near the alphabetic baseline (~0.12em). A little
 * slack so a Songti glyph that hangs lower still clears the rule. */
export const CJK_EM_DESCENT_RATIO = 0.16

/**
 * Air between that ink and the rule, per unit of font size.
 *
 * Proportional, not flat: an underline belongs to its own type, so a 36px
 * subheading and an 84px heading should read with the same optical air
 * rather than the same pixels. 0.11em was enough for the measured Latin
 * descent but kissed CJK em boxes (gallery banner-chapter, 2026-08-22).
 */
export const UNDERLINE_AIR_RATIO = 0.28

export function underlineDescentRatio(text: string): number {
  if (/[A-Za-z]/.test(text)) return LATIN_DESCENT_RATIO
  if (/[\u3400-\u9fff]/.test(text)) return CJK_EM_DESCENT_RATIO
  return LATIN_DESCENT_RATIO
}

/** Distance from alphabetic baseline to the underline, in px. */
export function underlineOffset(fontSize: number, text: string): number {
  return fontSize * (underlineDescentRatio(text) + UNDERLINE_AIR_RATIO)
}

export function underlineYFromBaseline(baseline: number, fontSize: number, text: string): number {
  return Math.round(baseline + underlineOffset(fontSize, text))
}
