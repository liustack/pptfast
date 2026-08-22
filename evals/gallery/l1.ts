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
import { __pathBoundingBox, findOverlapIssues } from "@/svg/audit/deck-audit"
import { auditSvgMarkup, parseTransform } from "@/svg/audit/svg-audit"
import {
  IDENTITY_MATRIX,
  boxesIntersect,
  multiplyMatrices,
  parseSvgTransform,
  textInkBox,
  transformBox,
  type DepthBox,
  type SvgMatrix,
} from "@/svg/depth-contract/geometry"
import { isBold, isMonoFontFamily } from "@/svg/fonts"
import { blendOver, contrastRatio } from "@/svg/ink"
import {
  CONTENT_DECOR_CONTRAST_CEILING,
  effectivePaintOpacity,
} from "@/svg/motifs/decor-budget"
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
  "depth-contract",
  "mid-text-bleed",
  "isolated-mid-piece",
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
const DEPTH_GEOMETRY_TOL = 0.01

const DEPTH_LEAF_TAGS = new Set([
  "circle",
  "ellipse",
  "image",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
  "text",
])
const DEPTH_DEFINITION_TAGS = new Set([
  "clippath",
  "defs",
  "lineargradient",
  "mask",
  "pattern",
  "radialgradient",
  "stop",
])
const ISOLATED_STROKE_TAGS = new Set(["line", "path", "polygon", "polyline", "rect"])

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

function inheritedAttr(el: Element, name: string): string | null {
  let current: Element | null = el
  while (current) {
    const value = current.getAttribute(name)
    if (value !== null && value !== "") return value
    if (current.tagName.toLowerCase() === "svg") break
    current = current.parentElement
  }
  return null
}

function numericAttr(el: Element, name: string, fallback = 0): number {
  const raw = el.getAttribute(name)
  if (raw === null || raw === "") return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function pointListBox(raw: string | null): DepthBox | null {
  const values = Array.from(
    (raw ?? "").matchAll(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi),
    (match) => Number(match[0]),
  )
  if (values.length < 2) return null
  const xs: number[] = []
  const ys: number[] = []
  for (let index = 0; index + 1 < values.length; index += 2) {
    xs.push(values[index]!)
    ys.push(values[index + 1]!)
  }
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return { x: left, y: top, w: Math.max(...xs) - left, h: Math.max(...ys) - top }
}

function localDepthBox(el: Element): DepthBox | null {
  const tag = el.tagName.toLowerCase()
  let box: DepthBox | null = null
  if (tag === "text") {
    const content = (el.textContent ?? "").trim()
    if (!content) return null
    box = textInkBox({
      content,
      x: numericAttr(el, "x"),
      y: numericAttr(el, "y"),
      fontSize: Number(inheritedAttr(el, "font-size") ?? 16),
      fontFamily: inheritedAttr(el, "font-family") ?? "",
      fontWeight: inheritedAttr(el, "font-weight"),
      textAnchor: inheritedAttr(el, "text-anchor") ?? "start",
    })
  } else if (tag === "rect" || tag === "image") {
    box = {
      x: numericAttr(el, "x"),
      y: numericAttr(el, "y"),
      w: Math.max(0, numericAttr(el, "width")),
      h: Math.max(0, numericAttr(el, "height")),
    }
  } else if (tag === "circle") {
    const radius = Math.max(0, numericAttr(el, "r"))
    box = {
      x: numericAttr(el, "cx") - radius,
      y: numericAttr(el, "cy") - radius,
      w: radius * 2,
      h: radius * 2,
    }
  } else if (tag === "ellipse") {
    const rx = Math.max(0, numericAttr(el, "rx"))
    const ry = Math.max(0, numericAttr(el, "ry"))
    box = {
      x: numericAttr(el, "cx") - rx,
      y: numericAttr(el, "cy") - ry,
      w: rx * 2,
      h: ry * 2,
    }
  } else if (tag === "line") {
    const x1 = numericAttr(el, "x1")
    const x2 = numericAttr(el, "x2")
    const y1 = numericAttr(el, "y1")
    const y2 = numericAttr(el, "y2")
    box = {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.abs(x2 - x1),
      h: Math.abs(y2 - y1),
    }
  } else if (tag === "polygon" || tag === "polyline") {
    box = pointListBox(el.getAttribute("points"))
  } else if (tag === "path") {
    box = __pathBoundingBox(el.getAttribute("d") ?? "")
  }
  if (!box) return null

  const stroke = inheritedAttr(el, "stroke")
  const strokeWidth = Number(inheritedAttr(el, "stroke-width") ?? 1)
  if (!stroke || stroke === "none" || !Number.isFinite(strokeWidth) || strokeWidth <= 0) return box
  const inset = strokeWidth / 2
  return { x: box.x - inset, y: box.y - inset, w: box.w + strokeWidth, h: box.h + strokeWidth }
}

interface DepthLeaf {
  readonly el: Element
  readonly tag: string
  readonly box: DepthBox
}

function collectDepthLeaves(root: Element): DepthLeaf[] {
  const leaves: DepthLeaf[] = []
  const visit = (el: Element, parentMatrix: SvgMatrix) => {
    const matrix = multiplyMatrices(parentMatrix, parseSvgTransform(el.getAttribute("transform")))
    const tag = el.tagName.toLowerCase()
    if (DEPTH_DEFINITION_TAGS.has(tag)) return
    if (DEPTH_LEAF_TAGS.has(tag)) {
      const local = localDepthBox(el)
      if (local) leaves.push({ el, tag, box: transformBox(local, matrix) })
      return
    }
    for (const child of Array.from(el.children)) visit(child, matrix)
  }
  visit(root, IDENTITY_MATRIX)
  return leaves
}

interface HexPaint {
  readonly color: string
  readonly alpha: number
}

function parseHexPaint(raw: string | null): HexPaint | null {
  if (!raw) return null
  let hex = raw.trim().replace(/^#/, "")
  if (hex.length === 3 || hex.length === 4) hex = [...hex].map((char) => char + char).join("")
  if (!/^[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(hex)) return null
  const alpha = hex.length === 8 ? Number.parseInt(hex.slice(6), 16) / 255 : 1
  return { color: `#${hex.slice(0, 6).toUpperCase()}`, alpha }
}

function containsPoint(box: DepthBox, x: number, y: number): boolean {
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h
}

function backgroundAt(leaves: readonly DepthLeaf[], x: number, y: number): string | null {
  let ground: string | null = null
  for (const leaf of leaves) {
    if (!containsPoint(leaf.box, x, y)) continue
    if (leaf.tag === "image") {
      ground = null
      continue
    }
    if (leaf.tag !== "rect") continue
    const paint = parseHexPaint(inheritedAttr(leaf.el, "fill") ?? "#000000")
    if (!paint) continue
    const opacity = Math.min(1, Math.max(0, effectivePaintOpacity(leaf.el, "fill") * paint.alpha))
    if (opacity >= 1) ground = paint.color
    else if (ground) ground = blendOver(paint.color, ground, opacity)
  }
  return ground
}

function depthGroup(root: Element, depth: "bg" | "mid" | "fg"): Element | null {
  return Array.from(root.querySelectorAll("[data-depth]")).find(
    (el) => el.getAttribute("data-depth") === depth,
  ) ?? null
}

function findDepthContract(root: Element, findings: L1Finding[]): void {
  const all = Array.from(root.querySelectorAll("[data-depth]"))
  const direct = Array.from(root.children).filter((el) => el.hasAttribute("data-depth"))
  const order = direct.map((el) => el.getAttribute("data-depth"))
  const expected = ["bg", "mid", "fg"]
  const exact = all.length === 3 && order.length === 3 && order.every((value, index) => value === expected[index])
  if (!exact) {
    findings.push({
      code: "depth-contract",
      message: `depth groups must be exactly bg, mid, fg in paint order, got ${order.join(", ") || "none"}`,
    })
  }

  const mid = depthGroup(root, "mid")
  const bg = depthGroup(root, "bg")
  if (!mid || !bg) return
  const backgrounds = collectDepthLeaves(bg)
  for (const leaf of collectDepthLeaves(mid)) {
    const x = leaf.box.x + leaf.box.w / 2
    const y = leaf.box.y + leaf.box.h / 2
    const ground = backgroundAt(backgrounds, x, y)
    if (!ground || leaf.tag === "image") continue
    for (const kind of ["fill", "stroke"] as const) {
      const fallback = kind === "fill" && !["line", "polyline"].includes(leaf.tag) ? "#000000" : null
      const paint = parseHexPaint(inheritedAttr(leaf.el, kind) ?? fallback)
      if (!paint) continue
      const opacity = Math.min(1, Math.max(0, effectivePaintOpacity(leaf.el, kind) * paint.alpha))
      if (opacity <= 0) continue
      const ratio = contrastRatio(blendOver(paint.color, ground, opacity), ground)
      if (ratio >= CONTENT_DECOR_CONTRAST_CEILING) {
        findings.push({
          code: "depth-contract",
          message: `midground ${leaf.tag} ${kind} contrast ${ratio.toFixed(2)} reaches the ${CONTENT_DECOR_CONTRAST_CEILING}:1 ceiling`,
        })
      }
    }
  }
}

function findMidTextBleed(root: Element, findings: L1Finding[]): void {
  const mid = depthGroup(root, "mid")
  if (!mid) return
  for (const leaf of collectDepthLeaves(mid)) {
    if (leaf.tag !== "text") continue
    const right = leaf.box.x + leaf.box.w
    const bottom = leaf.box.y + leaf.box.h
    if (
      leaf.box.x < -DEPTH_GEOMETRY_TOL ||
      leaf.box.y < -DEPTH_GEOMETRY_TOL ||
      right > PAGE_W + DEPTH_GEOMETRY_TOL ||
      bottom > PAGE_H + DEPTH_GEOMETRY_TOL
    ) {
      const label = (leaf.el.textContent ?? "").trim().slice(0, 24)
      findings.push({
        code: "mid-text-bleed",
        message: `midground text "${label}" has glyph ink outside the 1280×720 canvas`,
      })
    }
  }
}

function decorPieceOf(el: Element): Element | null {
  let current: Element | null = el.parentElement
  while (current) {
    if (current.hasAttribute("data-decor-piece")) return current
    current = current.parentElement
  }
  return null
}

function expandedBox(box: DepthBox, inset: number): DepthBox {
  return { x: box.x - inset, y: box.y - inset, w: box.w + inset * 2, h: box.h + inset * 2 }
}

function visibleStroke(el: Element): boolean {
  const stroke = inheritedAttr(el, "stroke")
  return Boolean(stroke && stroke !== "none" && effectivePaintOpacity(el, "stroke") > 0)
}

function visibleFill(leaf: DepthLeaf): boolean {
  if (leaf.tag === "line" || leaf.tag === "polyline") return false
  const fill = inheritedAttr(leaf.el, "fill") ?? "#000000"
  return fill !== "none" && effectivePaintOpacity(leaf.el, "fill") > 0
}

function findIsolatedMidPieces(root: Element, findings: L1Finding[]): void {
  const mid = depthGroup(root, "mid")
  if (!mid) return
  const leaves = collectDepthLeaves(mid).filter((leaf) => leaf.tag !== "text" && leaf.tag !== "image")
  for (const leaf of leaves) {
    if (!ISOLATED_STROKE_TAGS.has(leaf.tag) || !visibleStroke(leaf.el) || visibleFill(leaf)) continue
    if (leaf.box.w >= CARD_MIN || leaf.box.h >= CARD_MIN) continue

    const piece = decorPieceOf(leaf.el)
    const grouped = piece !== null && leaves.some((other) => other.el !== leaf.el && decorPieceOf(other.el) === piece)
    if (grouped) continue

    const nearbyStructure = leaves.some(
      (other) =>
        other.el !== leaf.el &&
        (other.box.w >= CARD_MIN || other.box.h >= CARD_MIN) &&
        boxesIntersect(expandedBox(leaf.box, BOXLESS_TOL), other.box),
    )
    if (nearbyStructure) continue

    findings.push({
      code: "isolated-mid-piece",
      message: `small stroked midground ${leaf.tag} at ${leaf.box.x.toFixed(0)},${leaf.box.y.toFixed(0)} is isolated from structural geometry`,
    })
  }
}

function hasDecor(el: Element | null): boolean {
  let cur: Element | null = el
  while (cur) {
    if (
      typeof cur.hasAttribute === "function" &&
      (cur.hasAttribute("data-decor") || cur.getAttribute("data-depth") === "mid")
    ) return true
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
  findDepthContract(root, findings)
  findMidTextBleed(root, findings)
  findIsolatedMidPieces(root, findings)
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
