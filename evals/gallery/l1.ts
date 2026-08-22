/**
 * L1 gallery audit: geometry and taboo markers, zero model.
 *
 * Reuses `auditSvgMarkup` (overflow / page-overflow) and `findOverlapIssues`.
 * Extra checks: strikethrough vs underline, ink-box overlap, boxless card
 * overflow, page-edge stick, font-size floor, overflow markers, Latin
 * vertical type. Five-dot progress is left to L2.
 */

import { measureMonoTextUnits, measureTextUnits } from "@/lib/svg-text-layout"
import { getPlatform } from "@/platform/registry"
import { findOverlapIssues } from "@/svg/audit/deck-audit"
import { auditSvgMarkup, parseTransform } from "@/svg/audit/svg-audit"
import { isBold, isMonoFontFamily } from "@/svg/fonts"
import { bleedExemption } from "./bbox-exemptions"
import { layoutOf } from "./bbox"

export const L1_CODES = [
  "overflow",
  "out-of-bounds",
  "overlap",
  "strikethrough",
  "edge-stick",
  "font-size",
  "overflow-marker",
  "latin-vertical",
] as const

export type L1Code = (typeof L1_CODES)[number]

export interface L1Finding {
  readonly code: L1Code
  readonly message: string
}

export interface L1Result {
  readonly findings: readonly L1Finding[]
}

const PAGE_W = 1280
const PAGE_H = 720
const EDGE_PX = 4
const FONT_FLOOR = 12
const DIVIDER_MIN_W = 400
const STRIKE_MIN_W = 40
const CARD_MIN = 40
const BOXLESS_TOL = 6
const INK_ASCENT = 0.72
const INK_DESCENT = 0.12
const STRIKE_BAND_TOP = 0.85
const STRIKE_BAND_BOTTOM = 0.02
const UNDERLINE_BELOW = 0.08
const STRIKE_X_FRAC = 0.25
const INK_OVERLAP_RATIO = 0.08
const WATERMARK_SIZE = 160
const WATERMARK_OPACITY = 0.1

const OVERFLOW_MARKER = /\+\d+\s*(…|\.{3}|more|项)/i
const OVERFLOW_MARKER_ZH = /另有\s*\d+\s*项/
const VERTICAL_WM = /^(tb|tb-rl|vertical-rl|vertical-lr)$/i
const LATIN = /[A-Za-z]/
const PUNCT_ONLY = /^[\s"'“”‘’「」『』（）()[\]【】…·•、，。！？：:;,.!?/-]+$/

function parseRoot(markup: string): Element {
  const Parser = getPlatform().domParser ?? globalThis.DOMParser
  if (!Parser) {
    throw new Error("DOMParser unavailable — call installNodePlatform() first")
  }
  return new Parser().parseFromString(markup, "image/svg+xml").documentElement
}

function hasDecor(el: Element | null): boolean {
  let cur: Element | null = el
  while (cur) {
    if (typeof cur.hasAttribute === "function" && cur.hasAttribute("data-decor")) return true
    cur = cur.parentElement
  }
  return false
}

function writingModeOf(el: Element): string {
  let cur: Element | null = el
  while (cur) {
    const wm = cur.getAttribute("writing-mode")
    if (wm) return wm
    cur = cur.parentElement
  }
  return ""
}

function textWidth(el: Element, content: string, fontSize: number): number {
  const fontFamily = el.getAttribute("font-family") ?? ""
  const units = isMonoFontFamily(fontFamily)
    ? measureMonoTextUnits(content)
    : measureTextUnits(content, { bold: isBold(el.getAttribute("font-weight")), fontFamily })
  return units * fontSize
}

function collectDividers(root: Element): { y: number; x1: number; x2: number }[] {
  const out: { y: number; x1: number; x2: number }[] = []
  const visit = (el: Element, ox: number, oy: number, os: number) => {
    const { dx, dy, scale } = parseTransform(el)
    const ax = ox + os * dx
    const ay = oy + os * dy
    const as = os * scale
    const tag = el.tagName.toLowerCase()
    if (tag === "line") {
      const x1 = ax + Number(el.getAttribute("x1") ?? 0) * as
      const x2 = ax + Number(el.getAttribute("x2") ?? 0) * as
      const y1 = ay + Number(el.getAttribute("y1") ?? 0) * as
      const y2 = ay + Number(el.getAttribute("y2") ?? 0) * as
      if (Math.abs(y1 - y2) <= 2 && Math.abs(x2 - x1) > DIVIDER_MIN_W) {
        out.push({ y: (y1 + y2) / 2, x1: Math.min(x1, x2), x2: Math.max(x1, x2) })
      }
    }
    if (tag === "rect") {
      const x = ax + Number(el.getAttribute("x") ?? 0) * as
      const y = ay + Number(el.getAttribute("y") ?? 0) * as
      const w = Number(el.getAttribute("width") ?? 0) * as
      const h = Number(el.getAttribute("height") ?? 0) * as
      if (h > 0 && h <= 4 && w > DIVIDER_MIN_W) {
        out.push({ y: y + h / 2, x1: x, x2: x + w })
      }
    }
    for (const child of Array.from(el.children)) visit(child, ax, ay, as)
  }
  visit(root, 0, 0, 1)
  return out
}

interface Strike {
  y: number
  x1: number
  x2: number
}

interface CardRect {
  x: number
  y: number
  w: number
  h: number
  bento: boolean
  decor: boolean
}

interface CollectedText {
  tx: number
  ty: number
  left: number
  right: number
  fontSize: number
  label: string
  content: string
  decor: boolean
  bleed: boolean
  watermark: boolean
  hasAuditBox: boolean
  cards: CardRect[]
}

interface Geometry {
  texts: CollectedText[]
  strikes: Strike[]
  cards: CardRect[]
}

function isPageSized(w: number, h: number): boolean {
  return Math.abs(w - PAGE_W) <= 1 && Math.abs(h - PAGE_H) <= 1
}

function isCardLike(w: number, h: number): boolean {
  return w > CARD_MIN && h > CARD_MIN && !isPageSized(w, h)
}

function asCardRect(el: Element, ox: number, oy: number, os: number): CardRect | null {
  if (el.tagName.toLowerCase() !== "rect") return null
  const { dx, dy, scale } = parseTransform(el)
  const ax = ox + os * dx
  const ay = oy + os * dy
  const as = os * scale
  const w = Number(el.getAttribute("width") ?? 0) * as
  const h = Number(el.getAttribute("height") ?? 0) * as
  if (!isCardLike(w, h)) return null
  const bento = el.getAttribute("data-bento-shell") === "true"
  const fill = el.getAttribute("fill")
  if (!bento && fill === "none") return null
  return {
    x: ax + Number(el.getAttribute("x") ?? 0) * as,
    y: ay + Number(el.getAttribute("y") ?? 0) * as,
    w,
    h,
    bento,
    decor: hasDecor(el),
  }
}

function isWatermarkText(el: Element, fontSize: number): boolean {
  const raw = el.getAttribute("opacity")
  const opacity = raw === null ? 1 : Number(raw)
  return fontSize >= WATERMARK_SIZE && opacity <= WATERMARK_OPACITY
}

function collectGeometry(root: Element): Geometry {
  const texts: CollectedText[] = []
  const strikes: Strike[] = []
  const cards: CardRect[] = []

  const visit = (
    el: Element,
    ox: number,
    oy: number,
    os: number,
    inheritedCards: CardRect[],
    hasAuditBox: boolean,
  ) => {
    const { dx, dy, scale } = parseTransform(el)
    const ax = ox + os * dx
    const ay = oy + os * dy
    const as = os * scale
    if (el.hasAttribute("data-audit-box")) hasAuditBox = true

    const tag = el.tagName.toLowerCase()
    if (tag === "line") {
      const x1 = ax + Number(el.getAttribute("x1") ?? 0) * as
      const x2 = ax + Number(el.getAttribute("x2") ?? 0) * as
      const y1 = ay + Number(el.getAttribute("y1") ?? 0) * as
      const y2 = ay + Number(el.getAttribute("y2") ?? 0) * as
      const w = Math.abs(x2 - x1)
      if (Math.abs(y1 - y2) <= 2 && w >= STRIKE_MIN_W) {
        strikes.push({ y: (y1 + y2) / 2, x1: Math.min(x1, x2), x2: Math.max(x1, x2) })
      }
    }
    if (tag === "rect") {
      const x = ax + Number(el.getAttribute("x") ?? 0) * as
      const y = ay + Number(el.getAttribute("y") ?? 0) * as
      const w = Number(el.getAttribute("width") ?? 0) * as
      const h = Number(el.getAttribute("height") ?? 0) * as
      if (h > 0 && h <= 4 && w >= STRIKE_MIN_W) {
        strikes.push({ y: y + h / 2, x1: x, x2: x + w })
      }
      const card = asCardRect(el, ox, oy, os)
      if (card) cards.push(card)
    }

    const localCards: CardRect[] = []
    for (const child of Array.from(el.children)) {
      const card = asCardRect(child, ax, ay, as)
      if (card) localCards.push(card)
    }
    const cardsHere = localCards.length > 0 ? [...inheritedCards, ...localCards] : inheritedCards

    if (tag === "text") {
      const content = (el.textContent ?? "").trim()
      if (content) {
        const fontSize = Number(el.getAttribute("font-size") ?? 16) * as
        const tx = ax + Number(el.getAttribute("x") ?? 0) * as
        const ty = ay + Number(el.getAttribute("y") ?? 0) * as
        const width = textWidth(el, content, fontSize)
        const anchor = el.getAttribute("text-anchor") ?? "start"
        const left = anchor === "end" ? tx - width : anchor === "middle" ? tx - width / 2 : tx
        texts.push({
          tx,
          ty,
          left,
          right: left + width,
          fontSize,
          label: content.slice(0, 24),
          content,
          decor: hasDecor(el),
          bleed: el.hasAttribute("data-bleed"),
          watermark: isWatermarkText(el, fontSize),
          hasAuditBox,
          cards: cardsHere,
        })
      }
    }

    for (const child of Array.from(el.children)) visit(child, ax, ay, as, cardsHere, hasAuditBox)
  }

  visit(root, 0, 0, 1, [], false)
  return { texts, strikes, cards }
}

function inkBox(t: CollectedText): { left: number; right: number; top: number; bottom: number } {
  return {
    left: t.left,
    right: t.right,
    top: t.ty - INK_ASCENT * t.fontSize,
    bottom: t.ty + INK_DESCENT * t.fontSize,
  }
}

function findStrikethrough(geo: Geometry, findings: L1Finding[]): void {
  for (const t of geo.texts) {
    if (t.decor || !t.content) continue
    const width = t.right - t.left
    if (width <= 0) continue
    const bandTop = t.ty - STRIKE_BAND_TOP * t.fontSize
    const bandBottom = t.ty + STRIKE_BAND_BOTTOM * t.fontSize
    const underlineY = t.ty + UNDERLINE_BELOW * t.fontSize
    for (const s of geo.strikes) {
      if (s.y >= underlineY) continue
      if (s.y < bandTop || s.y >= bandBottom) continue
      const overlap = Math.min(t.right, s.x2) - Math.max(t.left, s.x1)
      if (overlap > STRIKE_X_FRAC * width) {
        findings.push({
          code: "strikethrough",
          message: `a horizontal rule crosses the x-height of "${t.label}" (underline belongs below the baseline)`,
        })
        break
      }
    }
  }
}

function findInkOverlap(geo: Geometry, findings: L1Finding[]): void {
  const inks = geo.texts.filter((t) => !t.decor && t.content && !PUNCT_ONLY.test(t.content))
  for (let i = 0; i < inks.length; i++) {
    const a = inkBox(inks[i]!)
    const areaA = Math.max(0, a.right - a.left) * Math.max(0, a.bottom - a.top)
    for (let j = i + 1; j < inks.length; j++) {
      const b = inkBox(inks[j]!)
      const areaB = Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top)
      const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
      const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
      const inter = ix * iy
      const minArea = Math.min(areaA, areaB)
      if (minArea > 0 && inter / minArea > INK_OVERLAP_RATIO) {
        findings.push({
          code: "overlap",
          message: `text ink boxes overlap by ${Math.round((inter / minArea) * 100)}% of the smaller box — near "${inks[i]!.label}" and "${inks[j]!.label}"`,
        })
      }
    }
  }
}

function isBleedExempt(layout: string, label: string): boolean {
  return Boolean(
    bleedExemption({ layout, kind: "h-overflow", label }) ||
      bleedExemption({ layout, kind: "v-overflow", label }) ||
      bleedExemption({ layout, kind: "page-overflow", label }),
  )
}

function findBoxlessOverflow(geo: Geometry, layout: string, findings: L1Finding[]): void {
  for (const t of geo.texts) {
    if (t.decor || t.bleed || t.watermark || t.hasAuditBox || !t.content) continue
    if (isBleedExempt(layout, t.label)) continue
    const containing = t.cards.filter((c) => t.tx >= c.x && t.tx <= c.x + c.w && t.ty >= c.y && t.ty <= c.y + c.h)
    if (containing.length === 0) continue
    const card = containing.reduce((best, c) => (c.w * c.h < best.w * best.h ? c : best))
    const ink = inkBox(t)
    const overRight = ink.right - (card.x + card.w)
    const overLeft = card.x - ink.left
    const overTop = card.y - ink.top
    const overBottom = ink.bottom - (card.y + card.h)
    const over = Math.max(overRight, overLeft, overTop, overBottom)
    if (over > BOXLESS_TOL) {
      findings.push({
        code: "overflow",
        message: `text "${t.label}" overflows its card by ${over.toFixed(0)}px (no data-audit-box)`,
      })
    }
  }
}

function findShellOutOfBounds(geo: Geometry, findings: L1Finding[]): void {
  for (const card of geo.cards) {
    if (card.decor) continue
    const overBottom = card.y + card.h - PAGE_H
    const overRight = card.x + card.w - PAGE_W
    const overLeft = -card.x
    const overTop = -card.y
    const over = Math.max(overBottom, overRight, overLeft, overTop)
    if (over > BOXLESS_TOL) {
      findings.push({
        code: "out-of-bounds",
        message: `card shell extends ${over.toFixed(0)}px past the 1280×720 page`,
      })
    }
  }
}

function walkText(
  root: Element,
  layout: string,
  findings: L1Finding[],
  dividers: { y: number; x1: number; x2: number }[],
): void {
  const visit = (el: Element, ox: number, oy: number, os: number) => {
    const { dx, dy, scale } = parseTransform(el)
    const ax = ox + os * dx
    const ay = oy + os * dy
    const as = os * scale
    if (el.tagName.toLowerCase() === "text") {
      const content = (el.textContent ?? "").trim()
      if (content) {
        const label = content.slice(0, 24)
        const fontSizeAttr = el.getAttribute("font-size")
        const fontSize = Number(fontSizeAttr ?? 16) * as
        const tx = ax + Number(el.getAttribute("x") ?? 0) * as
        const ty = ay + Number(el.getAttribute("y") ?? 0) * as
        const width = textWidth(el, content, fontSize)
        const anchor = el.getAttribute("text-anchor") ?? "start"
        const left = anchor === "end" ? tx - width : anchor === "middle" ? tx - width / 2 : tx
        const right = left + width
        const top = ty - fontSize
        const bottom = ty + fontSize * 0.25
        const decor = hasDecor(el)

        if (OVERFLOW_MARKER.test(content) || OVERFLOW_MARKER_ZH.test(content)) {
          findings.push({
            code: "overflow-marker",
            message: `overflow marker "${label}" is banned`,
          })
        }

        if (!decor && fontSizeAttr !== null && Number(fontSizeAttr) < FONT_FLOOR) {
          findings.push({
            code: "font-size",
            message: `text "${label}" is smaller than the ${FONT_FLOOR}px floor`,
          })
        }

        if (VERTICAL_WM.test(writingModeOf(el)) && LATIN.test(content)) {
          findings.push({
            code: "latin-vertical",
            message: `Latin text "${label}" is set vertically`,
          })
        }

        if (!decor && !el.hasAttribute("data-bleed")) {
          const nearEdge = left < EDGE_PX || top < EDGE_PX || right > PAGE_W - EDGE_PX || bottom > PAGE_H - EDGE_PX
          const exempt =
            nearEdge &&
            bleedExemption({
              layout,
              kind: "page-overflow",
              label,
            })
          if (nearEdge && !exempt) {
            findings.push({
              code: "edge-stick",
              message: `text "${label}" sits within ${EDGE_PX}px of the page edge`,
            })
          } else if (!exempt) {
            for (const d of dividers) {
              const overlap = Math.min(right, d.x2) - Math.max(left, d.x1)
              const gap = Math.min(Math.abs(bottom - d.y), Math.abs(top - d.y), Math.abs(ty - d.y))
              if (overlap > 0 && gap < EDGE_PX) {
                findings.push({
                  code: "edge-stick",
                  message: `text "${label}" sits within ${EDGE_PX}px of a divider`,
                })
                break
              }
            }
          }
        }
      }
    }
    for (const child of Array.from(el.children)) visit(child, ax, ay, as)
  }
  visit(root, 0, 0, 1)
}

export function auditL1(svg: string): L1Result {
  const findings: L1Finding[] = []
  for (const issue of auditSvgMarkup(svg)) {
    if (issue.kind === "page-overflow") {
      findings.push({
        code: "out-of-bounds",
        message: `text "${issue.text}" falls outside the 1280×720 page (${issue.detail})`,
      })
    } else {
      findings.push({
        code: "overflow",
        message: `text "${issue.text}" overflows ${issue.kind === "h-overflow" ? "its column" : "the content area"} (${issue.detail})`,
      })
    }
  }
  for (const issue of findOverlapIssues(svg)) {
    const pct = Math.round(issue.ratio * 100)
    findings.push({
      code: "overlap",
      message: `two regions overlap by ${pct}% of the smaller region's area — near "${issue.a.label}" and "${issue.b.label}"`,
    })
  }
  const root = parseRoot(svg)
  const layout = layoutOf(svg)
  walkText(root, layout, findings, collectDividers(root))
  const geo = collectGeometry(root)
  findStrikethrough(geo, findings)
  findInkOverlap(geo, findings)
  findBoxlessOverflow(geo, layout, findings)
  findShellOutOfBounds(geo, findings)
  return { findings }
}

export function classifyL1(result: L1Result): string[] {
  return [...new Set(result.findings.map((f) => f.code))].sort()
}
