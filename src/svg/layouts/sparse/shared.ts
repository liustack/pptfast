import { parseEmphasis, sliceEmphasisForLines, stripEmphasis } from "../../emphasis"
import { fitHeadingLines } from "../../heading-fit"
import { fitSvgLine, measureTextUnits } from "../../../lib/svg-text-layout"
import type { Slide } from "@/ir"
import type { EmphasisSegment } from "../../emphasis"

export function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/**
 * Four-digit year + non-digit separator + 1–2 digit month.
 * Same shape as motif-poster-motif's `quarterLabel`. Unreadable dates
 * return undefined so a guessed quarter never prints.
 */
export function yearQuarter(date: string | undefined): { year: string; quarter: string } | undefined {
  const m = /^(\d{4})\D+(\d{1,2})(?:\D|$)/.exec(date ?? "")
  if (!m) return undefined
  const month = Number(m[2])
  if (month < 1 || month > 12) return undefined
  return { year: m[1], quarter: `Q${Math.floor((month - 1) / 3) + 1}` }
}

export function splitTrailingPercent(value: string): { body: string; percent: boolean } {
  const trimmed = value.trim()
  if (trimmed.endsWith("%")) return { body: trimmed.slice(0, -1), percent: true }
  return { body: trimmed, percent: false }
}

/** True when the hero value is a short signed number / percent, not a sentence. */
export function isNumericHero(value: string): boolean {
  return /^-?\d+(?:[.,]\d+)?%?$/.test(value.trim())
}

export function fitHeroLine(
  value: string,
  opts: { maxWidth: number; fontSize: number; fontFamily: string; bold: boolean },
): { text: string; fontSize: number } {
  const minFontSize = Math.max(48, Math.round(opts.fontSize * (64 / 180)))
  const fitted = fitSvgLine(value, {
    maxWidth: opts.maxWidth,
    fontSize: opts.fontSize,
    minFontSize,
    fontFamily: opts.fontFamily,
    bold: opts.bold,
  })
  return { text: fitted.text, fontSize: fitted.fontSize }
}

/**
 * Bake a CSS-clockwise rotated rect into polygon points (y-down). Positive
 * `cssDeg` is SVG/CSS clockwise. The y-down matrix already turns a positive
 * angle clockwise (same as playbill-motif after PATCH_DEG = +4), so the
 * angle is not negated.
 */
export function rotateRectPolygon(
  cx: number,
  cy: number,
  width: number,
  height: number,
  cssDeg: number,
): string {
  const a = (cssDeg * Math.PI) / 180
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  const hw = width / 2
  const hh = height / 2
  const round1 = (v: number) => Math.round(v * 10) / 10
  const corners: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ]
  return corners
    .map(([lx, ly]) => `${round1(cx + lx * ca - ly * sa)},${round1(cy + lx * sa + ly * ca)}`)
    .join(" ")
}

export function evidenceSource(slide: Slide): string | undefined {
  const footnote = slide.footnote?.trim()
  if (footnote) return footnote
  const citation = slide.components.find((c) => c.type === "citation")
  if (citation?.type === "citation") {
    const label = citation.sources[0]?.label?.trim()
    if (label) return label
  }
  return undefined
}

const CJK_STOP = /[，。；、]/

/** Split on CJK stops, keeping the stop on the phrase it closed. */
export function splitCjkPhrases(plain: string): string[] {
  const parts: string[] = []
  let buf = ""
  for (const ch of Array.from(plain)) {
    buf += ch
    if (CJK_STOP.test(ch) && buf.trim()) {
      parts.push(buf)
      buf = ""
    }
  }
  if (buf) parts.push(buf)
  return parts.filter((p) => p.trim().length > 0)
}

function phraseWrap(
  plain: string,
  opts: { maxWidth: number; fontSize: number; maxLines: number; fontFamily: string; bold: boolean },
): string[] | null {
  const parts = splitCjkPhrases(plain)
  if (parts.length < 2 || parts.length > opts.maxLines) return null
  const weight = { bold: opts.bold, fontFamily: opts.fontFamily }
  const fits = parts.every((p) => measureTextUnits(p, weight) * opts.fontSize <= opts.maxWidth)
  return fits ? parts : null
}

export function fitSparseHeading(
  heading: string | undefined,
  opts: {
    maxWidth: number
    fontSize: number
    maxLines: number
    minPt: number
    lineHeightRatio: number
    fontFamily: string
    bold: boolean
  },
): {
  fontSize: number
  lineHeight: number
  lines: string[]
  truncated: boolean
  lineSegs: EmphasisSegment[][]
  hasEmphasis: boolean
} {
  const source = heading ?? ""
  const segments = parseEmphasis(source)
  const plain = stripEmphasis(source)
  const phrases = phraseWrap(plain, opts)
  if (phrases) {
    return {
      fontSize: opts.fontSize,
      lineHeight: Math.round(opts.fontSize * opts.lineHeightRatio),
      lines: phrases,
      truncated: false,
      lineSegs: sliceEmphasisForLines(segments, phrases),
      hasEmphasis: segments.some((s) => s.emphasized),
    }
  }
  const layout = fitHeadingLines(plain, {
    maxWidth: opts.maxWidth,
    fontSize: opts.fontSize,
    maxLines: opts.maxLines,
    minPt: opts.minPt,
    lineHeightRatio: opts.lineHeightRatio,
    fontFamily: opts.fontFamily,
    bold: opts.bold,
  })
  return {
    fontSize: layout.fontSize,
    lineHeight: layout.lineHeight,
    lines: layout.lines,
    truncated: layout.truncated,
    lineSegs: sliceEmphasisForLines(segments, layout.lines),
    hasEmphasis: segments.some((s) => s.emphasized),
  }
}

/** Pixel box of the first emphasized run, for chalk arcs and underlines. */
export function firstEmphasisRun(
  lineSegs: EmphasisSegment[][],
  opts: { originX: number; firstY: number; lineHeight: number; fontSize: number; fontFamily: string; bold: boolean },
): { x: number; y: number; w: number; lineIndex: number } | null {
  for (let i = 0; i < lineSegs.length; i++) {
    let x = opts.originX
    for (const seg of lineSegs[i]) {
      const w = measureTextUnits(seg.text, { bold: opts.bold, fontFamily: opts.fontFamily }) * opts.fontSize
      if (seg.emphasized && seg.text.length > 0) {
        return { x, y: opts.firstY + i * opts.lineHeight, w, lineIndex: i }
      }
      x += w
    }
  }
  return null
}
