import {
  fitSvgLine,
  layoutSvgText,
  measureTextUnits,
  truncateToUnits,
  type TextWeightHint,
} from "../../../lib/svg-text-layout"

/** User-visible type floors for component-form item titles and body (1280×720 px). */
export const FORM_TITLE_FLOOR = 20
export const FORM_BODY_FLOOR = 15

/** Board rhythm for vertical cards: 300×280, title 23, body 16.5. */
export const BOARD_CARD_W = 300
export const BOARD_CARD_H = 280
export const BOARD_TITLE = 23
export const BOARD_BODY = 16.5
export const TITLE_BODY_RATIO = BOARD_TITLE / BOARD_BODY

const TITLE_LH = 1.4
const BODY_LH = 1.4

/** Tall-card grid: n=4 wraps 2×2 so type does not shrink to fit one cramped row. */
export function formGridCols(n: number): number {
  if (n <= 3) return Math.max(1, n)
  if (n === 4) return 2
  return 3
}

/**
 * Icon columns are not a tall card shell. 4-across is OK when a 640-wide
 * slot still clears the floors with wrap. Narrower slots fall back to 2×2.
 */
export function formIconColumnCols(n: number, boxW: number, colInset = 16): number {
  if (n <= 3) return Math.max(1, n)
  if (n !== 4) return 3
  const contentW = Math.max(24, boxW / 4 - colInset)
  const titleChars = (contentW / FORM_TITLE_FLOOR) * 2
  const bodyChars = (contentW / FORM_BODY_FLOOR) * 4
  if (titleChars >= 6 && bodyChars >= 16 && contentW >= FORM_TITLE_FLOOR * 2) return 4
  return 2
}

/** Width-scaled board type, clamped to the floors. Pass cardH to cap by height. */
export function boardTypeScale(cardW: number, cardH?: number): { title: number; body: number } {
  const wScale = cardW / BOARD_CARD_W
  const scale =
    cardH != null && cardH > 0 ? Math.min(wScale, cardH / BOARD_CARD_H) : wScale
  const title = Math.max(FORM_TITLE_FLOOR, BOARD_TITLE * scale)
  const body = Math.max(FORM_BODY_FLOOR, title / TITLE_BODY_RATIO)
  return { title, body }
}

export function formLineHeight(fontSize: number, ratio = TITLE_LH): number {
  return Math.round(fontSize * ratio)
}

/**
 * Wrap at a frozen font size. Never shrinks below `fontSize`. Extra glyphs
 * clip on the last of `maxLines` (host overflow), they do not shrink type.
 */
export function layoutAtSize(
  text: string,
  opts: {
    maxWidth: number
    fontSize: number
    maxLines: number
    lineHeightRatio?: number
    fontFamily?: string
    bold?: boolean
  },
): { lines: string[]; fontSize: number; lineHeight: number; truncated: boolean } {
  const content = text?.trim() ?? ""
  const fontSize = opts.fontSize
  const ratio = opts.lineHeightRatio ?? BODY_LH
  const lineHeight = formLineHeight(fontSize, ratio)
  const weight: TextWeightHint = { bold: opts.bold, fontFamily: opts.fontFamily }
  if (!content) return { lines: [], fontSize, lineHeight: 0, truncated: false }

  const laid = layoutSvgText(content, {
    maxWidth: opts.maxWidth,
    fontSize,
    maxLines: opts.maxLines,
    lineHeightRatio: ratio,
    bold: opts.bold,
    fontFamily: opts.fontFamily,
    minPt: fontSize,
  })
  const maxUnits = opts.maxWidth / fontSize
  if (laid.fontSize >= fontSize - 0.01 && laid.lines.length <= opts.maxLines) {
    const lines = laid.lines.map((line) => truncateToUnits(line, maxUnits, weight))
    return {
      lines,
      fontSize,
      lineHeight,
      truncated: lines.some((line, i) => line !== laid.lines[i]),
    }
  }

  const wide = layoutSvgText(content, {
    maxWidth: opts.maxWidth,
    fontSize,
    maxLines: Math.max(opts.maxLines, 12),
    lineHeightRatio: ratio,
    bold: opts.bold,
    fontFamily: opts.fontFamily,
    minPt: fontSize,
  })
  const source = wide.fontSize >= fontSize - 0.01 ? wide.lines : laid.lines
  let truncated = source.length > opts.maxLines
  let lines: string[]
  if (source.length > opts.maxLines) {
    const head = source.slice(0, opts.maxLines - 1)
    const rest = source.slice(opts.maxLines - 1).join("")
    lines = [...head, truncateToUnits(rest, maxUnits, weight)]
  } else {
    lines = source.map((line) => {
      const clipped = truncateToUnits(line, maxUnits, weight)
      if (clipped !== line) truncated = true
      return clipped
    })
  }
  return { lines, fontSize, lineHeight, truncated }
}

export function layoutFormTitle(
  text: string,
  opts: { maxWidth: number; fontSize: number; fontFamily?: string; maxLines?: number },
) {
  return layoutAtSize(text, {
    maxWidth: opts.maxWidth,
    fontSize: Math.max(FORM_TITLE_FLOOR, opts.fontSize),
    maxLines: opts.maxLines ?? 2,
    lineHeightRatio: TITLE_LH,
    bold: true,
    fontFamily: opts.fontFamily,
  })
}

export function layoutFormBody(
  text: string,
  opts: {
    maxWidth: number
    fontSize: number
    fontFamily?: string
    maxLines?: number
    lineHeightRatio?: number
    bold?: boolean
  },
) {
  return layoutAtSize(text, {
    maxWidth: opts.maxWidth,
    fontSize: Math.max(FORM_BODY_FLOOR, opts.fontSize),
    maxLines: opts.maxLines ?? 4,
    lineHeightRatio: opts.lineHeightRatio ?? BODY_LH,
    bold: opts.bold,
    fontFamily: opts.fontFamily,
  })
}

/** Single-line fit that will truncate rather than drop below `floor`. */
export function fitFormLine(
  text: string,
  opts: {
    maxWidth: number
    fontSize: number
    floor?: number
    bold?: boolean
    fontFamily?: string
  },
) {
  const floor = opts.floor ?? FORM_BODY_FLOOR
  const fontSize = Math.max(floor, opts.fontSize)
  return fitSvgLine(text, {
    maxWidth: opts.maxWidth,
    fontSize,
    minFontSize: floor,
    bold: opts.bold,
    fontFamily: opts.fontFamily,
  })
}

export function fitFormTitleLine(
  text: string,
  opts: { maxWidth: number; fontSize: number; fontFamily?: string; bold?: boolean },
) {
  return fitFormLine(text, {
    maxWidth: opts.maxWidth,
    fontSize: Math.max(FORM_TITLE_FLOOR, opts.fontSize),
    floor: FORM_TITLE_FLOOR,
    bold: opts.bold ?? true,
    fontFamily: opts.fontFamily,
  })
}

function maxTitleSize(contentW: number, titles: string[], fontFamily?: string): number {
  let cap = 72
  for (const title of titles) {
    const units = measureTextUnits(title, { bold: true, fontFamily })
    if (units <= 0) continue
    cap = Math.min(cap, (2 * contentW) / units)
  }
  return Math.max(FORM_TITLE_FLOOR, cap)
}

function bodyLineCount(
  text: string,
  maxWidth: number,
  fontSize: number,
  maxLines: number,
  fontFamily?: string,
): number {
  if (!text.trim()) return 0
  return layoutFormBody(text, { maxWidth, fontSize, maxLines, fontFamily }).lines.length
}

/** How many title/body lines fit in `innerH` at the frozen sizes. */
export function linesThatFit(opts: {
  innerH: number
  titleSize: number
  bodySize: number
  gap: number
  extraAbove?: number
  titleMax?: number
  bodyMax?: number
}): { titleMaxLines: number; bodyMaxLines: number } {
  const extra = opts.extraAbove ?? 0
  const budget = Math.max(0, opts.innerH - extra)
  const tLH = formLineHeight(opts.titleSize)
  const bLH = formLineHeight(opts.bodySize)
  const titleMax = opts.titleMax ?? 2
  const bodyMax = opts.bodyMax ?? 8
  if (tLH <= 0) return { titleMaxLines: 1, bodyMaxLines: 0 }
  let titleLines = Math.min(titleMax, Math.max(1, Math.floor(budget / tLH)))
  if (
    titleLines >= 2 &&
    budget - 2 * tLH - opts.gap < bLH &&
    budget - tLH - opts.gap >= bLH
  ) {
    titleLines = 1
  }
  const leftover = budget - titleLines * tLH - opts.gap
  const bodyLines = leftover >= bLH ? Math.min(bodyMax, Math.floor(leftover / bLH)) : 0
  return { titleMaxLines: titleLines, bodyMaxLines: bodyLines }
}

export function fillCardType(opts: {
  innerH: number
  contentW: number
  titleSize: number
  bodySize: number
  gap: number
  extraAbove?: number
  longestBody?: string
  titles?: string[]
  fonts?: { heading?: string; body?: string }
  titleLhRatio?: number
  bodyLhRatio?: number
}): { titleSize: number; bodySize: number; bodyMaxLines: number } {
  const titleLh = opts.titleLhRatio ?? TITLE_LH
  const bodyLh = opts.bodyLhRatio ?? BODY_LH
  const extra = opts.extraAbove ?? 0
  let titleSize = Math.max(FORM_TITLE_FLOOR, opts.titleSize)
  let bodySize = Math.max(FORM_BODY_FLOOR, opts.bodySize)
  const longest = opts.longestBody ?? ""
  const cap = maxTitleSize(opts.contentW, opts.titles ?? [], opts.fonts?.heading)

  const stackH = (t: number, b: number, lines: number) =>
    extra + formLineHeight(t, titleLh) + opts.gap + lines * formLineHeight(b, bodyLh)

  const linesFor = (b: number, maxLines: number) =>
    Math.max(longest.trim() ? 1 : 0, bodyLineCount(longest, opts.contentW, b, maxLines, opts.fonts?.body))

  let bodyMaxLines = Math.max(longest.trim() ? 2 : 0, linesFor(bodySize, 8))
  let h = stackH(titleSize, bodySize, bodyMaxLines)

  if (opts.innerH > 0 && h < opts.innerH * 0.55) {
    const lo0 = 1
    let hi = Math.min(cap / titleSize, Math.max(1.15, (opts.innerH * 0.78) / Math.max(h, 1)))
    hi = Math.max(lo0, hi)
    let lo = lo0
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2
      const t = titleSize * mid
      const b = Math.max(FORM_BODY_FLOOR, t / TITLE_BODY_RATIO)
      const lines = Math.max(bodyMaxLines, linesFor(b, 8))
      const ns = stackH(t, b, lines)
      if (ns > opts.innerH * 0.92 || t > cap) hi = mid
      else lo = mid
    }
    titleSize *= lo
    bodySize = Math.max(FORM_BODY_FLOOR, titleSize / TITLE_BODY_RATIO)
    bodyMaxLines = Math.max(bodyMaxLines, linesFor(bodySize, 8))
  } else if (opts.innerH > 0 && h > opts.innerH && longest.trim()) {
    for (let extraLines = bodyMaxLines; extraLines <= 8; extraLines++) {
      const lines = linesFor(bodySize, extraLines)
      bodyMaxLines = Math.max(2, lines)
      h = stackH(titleSize, bodySize, bodyMaxLines)
      if (h <= opts.innerH) break
    }
  }

  titleSize = Math.min(Math.max(FORM_TITLE_FLOOR, titleSize), cap)
  bodySize = Math.max(FORM_BODY_FLOOR, titleSize / TITLE_BODY_RATIO)
  if (!longest.trim()) bodyMaxLines = 0
  else bodyMaxLines = Math.max(2, bodyMaxLines)
  return { titleSize, bodySize, bodyMaxLines }
}

/** Smallest bubble radius whose 0.42 type scale still clears the body floor. */
export const FORM_BUBBLE_R_MIN = Math.ceil(FORM_BODY_FLOOR / 0.42)
