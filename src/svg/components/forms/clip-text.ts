import {
  layoutSvgText,
  truncateToUnits,
  type TextWeightHint,
} from "../../../lib/svg-text-layout"

/** Wrap, then clip every line so a CJK/Latin mix cannot h-overflow the budget. */
export function wrapClip(
  text: string,
  opts: {
    maxWidth: number
    fontSize: number
    maxLines: number
    lineHeightRatio?: number
    fontFamily?: string
    bold?: boolean
    minPt?: number
  },
) {
  const weight: TextWeightHint = { fontFamily: opts.fontFamily, bold: opts.bold }
  const wrapped = layoutSvgText(text, {
    maxWidth: opts.maxWidth,
    fontSize: opts.fontSize,
    maxLines: opts.maxLines,
    lineHeightRatio: opts.lineHeightRatio ?? 1.35,
    fontFamily: opts.fontFamily,
    bold: opts.bold,
    minPt: opts.minPt,
  })
  const fontSize =
    opts.minPt != null ? Math.max(wrapped.fontSize, opts.minPt) : wrapped.fontSize
  const maxUnits = opts.maxWidth / fontSize
  return {
    ...wrapped,
    fontSize,
    lineHeight: Math.round(fontSize * (opts.lineHeightRatio ?? 1.35)),
    lines: wrapped.lines.map((line) => truncateToUnits(line, maxUnits, weight)),
  }
}
