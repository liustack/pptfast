/**
 * Constitutional decoration budget (gallery review r2, group B).
 *
 * A decoration piece is one named visual unit, not every SVG leaf.
 * Repeating marks that read as one field or chain count as one piece
 * (a confetti field, a row of binding holes, a spark trail, a node
 * chain with its tracks). A paired rule (double line, inner and outer
 * frame) is one piece. A mark plus its satellite (a foot rule with a
 * midpoint diamond, a chip and the date on it) is one piece. Distinct
 * families on the same page count separately. Motif text that labels a
 * piece is not a piece.
 *
 * Motifs wrap each piece in `<g data-decor-piece>`. Paint stays on the
 * leaves. An unwrapped painted leaf also counts as a piece, so a new
 * mark that is not wrapped fails the budget instead of hiding.
 */

import type { StyleColors } from "../../themes/tokens"
import { blendOver, contrastRatio } from "../ink"

export const MAX_DECOR_PIECES = 3
export const DECOR_PIECE_ATTR = "data-decor-piece"

/**
 * Content-page motif ink, composited over the page ground, must stay
 * below this contrast against that ground. 3:1 is the large-text / meta
 * floor. Body copy at 4.5:1 then sits clearly in front.
 */
export const CONTENT_DECOR_CONTRAST_CEILING = 3

/** Stay visible. Hairlines and already-quiet tokens can sit near 1. */
export const CONTENT_DECOR_CONTRAST_FLOOR = 1.05

/**
 * The global lower bound for a theme's midground saturation ceiling. The
 * value keeps a restrained color presence instead of forcing every theme
 * to neutral gray. A theme whose own muted structural ink is more
 * saturated keeps that higher ceiling.
 */
export const MIDGROUND_SATURATION_FLOOR = 0.35

const PAINTED_TAGS = new Set(["rect", "circle", "ellipse", "line", "polyline", "polygon", "path"])

export function paintedLeaves(root: Element): Element[] {
  return Array.from(root.querySelectorAll("*")).filter((el) => PAINTED_TAGS.has(el.tagName.toLowerCase()))
}

export function countDecorPieces(root: Element): number {
  const groups = Array.from(root.querySelectorAll(`[${DECOR_PIECE_ATTR}]`)).filter(
    (el) => !el.parentElement?.closest(`[${DECOR_PIECE_ATTR}]`),
  )
  const unwrapped = paintedLeaves(root).filter((el) => !el.closest(`[${DECOR_PIECE_ATTR}]`))
  return groups.length + unwrapped.length
}

function ancestorAttr(el: Element, name: string): string | null {
  let n: Element | null = el
  while (n) {
    const v = n.getAttribute(name)
    if (v !== null && v !== "") return v
    n = n.parentElement
  }
  return null
}

export function leafOpacity(el: Element): number {
  let o = 1
  let n: Element | null = el
  while (n && n.tagName.toLowerCase() !== "svg") {
    const v = n.getAttribute("opacity")
    if (v !== null && v !== "") o *= Number(v)
    n = n.parentElement
  }
  return o
}

/** Effective fill or stroke alpha after inherited and group opacity. */
export function effectivePaintOpacity(el: Element, kind: "fill" | "stroke"): number {
  let groupOpacity = 1
  let paintOpacity: number | null = null
  let n: Element | null = el
  while (n && n.tagName.toLowerCase() !== "svg") {
    const opacity = n.getAttribute("opacity")
    if (opacity !== null && opacity !== "") groupOpacity *= Number(opacity)
    if (paintOpacity === null) {
      const local = n.getAttribute(`${kind}-opacity`)
      if (local !== null && local !== "") paintOpacity = Number(local)
    }
    n = n.parentElement
  }
  return groupOpacity * (paintOpacity ?? 1)
}

interface Hsl {
  h: number
  s: number
  l: number
}

function parseHexRgb(hex: string): [number, number, number] | null {
  let raw = hex.trim().replace(/^#/, "")
  if (raw.length === 3) raw = [...raw].map((char) => char + char).join("")
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null
  const value = Number.parseInt(raw, 16)
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}

function rgbToHsl([r, g, b]: [number, number, number]): Hsl {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const l = (max + min) / 2
  if (delta === 0) return { h: 0, s: 0, l }
  const s = delta / (1 - Math.abs(2 * l - 1))
  const h =
    max === r
      ? 60 * (((g - b) / delta) % 6)
      : max === g
        ? 60 * ((b - r) / delta + 2)
        : 60 * ((r - g) / delta + 4)
  return { h: h < 0 ? h + 360 : h, s, l }
}

function hslToHex({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r1, g1, b1] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x]
  const m = l - c / 2
  const channel = (value: number) => Math.round((value + m) * 255).toString(16).padStart(2, "0")
  return `#${channel(r1)}${channel(g1)}${channel(b1)}`.toUpperCase()
}

export function hexSaturation(hex: string): number {
  const rgb = parseHexRgb(hex)
  return rgb ? rgbToHsl(rgb).s : 0
}

export function capHexSaturation(hex: string, ceiling: number): string {
  const rgb = parseHexRgb(hex)
  if (!rgb) return hex
  const hsl = rgbToHsl(rgb)
  if (hsl.s <= ceiling) return hex
  let low = 0
  let high = ceiling
  let capped = hslToHex({ ...hsl, s: low })
  for (let index = 0; index < 16; index++) {
    const saturation = (low + high) / 2
    const candidate = hslToHex({ ...hsl, s: saturation })
    if (hexSaturation(candidate) <= ceiling) {
      low = saturation
      capped = candidate
    } else {
      high = saturation
    }
  }
  return capped
}

export function midgroundSaturationCeiling(colors: Pick<StyleColors, "muted" | "border">): number {
  return Math.max(
    MIDGROUND_SATURATION_FLOOR,
    hexSaturation(colors.muted),
    colors.border ? hexSaturation(colors.border) : 0,
  )
}

/** Fill if the leaf paints a fill, otherwise stroke. Null when the leaf is a no-paint spacer. */
export function leafPaint(el: Element): { color: string; kind: "fill" | "stroke" } | null {
  const fill = ancestorAttr(el, "fill")
  if (fill && fill !== "none" && !fill.startsWith("url(")) return { color: fill, kind: "fill" }
  const stroke = ancestorAttr(el, "stroke")
  if (stroke && stroke !== "none" && !stroke.startsWith("url(")) return { color: stroke, kind: "stroke" }
  return null
}

export function contentRecessOpacity(ink: string, bg: string, preferred = 1): number {
  if (preferred <= 0) return preferred
  const atPreferred = contrastRatio(blendOver(ink, bg, preferred), bg)
  if (atPreferred < CONTENT_DECOR_CONTRAST_CEILING) return preferred
  let lo = 0.08
  let hi = preferred
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2
    const ratio = contrastRatio(blendOver(ink, bg, mid), bg)
    if (ratio < CONTENT_DECOR_CONTRAST_CEILING) lo = mid
    else hi = mid
  }
  let v = Math.round(lo * 1000) / 1000
  while (v > 0.08 && contrastRatio(blendOver(ink, bg, v), bg) >= CONTENT_DECOR_CONTRAST_CEILING) {
    v = Math.round((v - 0.001) * 1000) / 1000
  }
  return v
}

export function recessIfContent(slideType: string, ink: string, bg: string, preferred = 1): number {
  if (slideType !== "content") return preferred
  return contentRecessOpacity(ink, bg, preferred)
}

/**
 * Opacity to put on a leaf. `undefined` omits the attribute (cover/chapter/
 * ending at full strength). Pass `preferred` when the leaf already has a
 * designed fade, so content can recede further and other page types keep it.
 */
export function leafRecessOpacity(
  slideType: string,
  ink: string,
  bg: string,
  preferred?: number,
): number | undefined {
  const base = preferred ?? 1
  const v = recessIfContent(slideType, ink, bg, base)
  // Content pages always emit opacity so a recolor that only changes the
  // fade amount is paint, not geometry (`splitPaint` treats a missing
  // attribute as a shape change).
  if (slideType === "content") return v
  if (preferred === undefined && v === 1) return undefined
  return v
}

function polygonPoints(el: Element): { x: number; y: number }[] {
  return (el.getAttribute("points") ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => {
      const [x, y] = p.split(",").map(Number)
      return { x: x ?? 0, y: y ?? 0 }
    })
}

/**
 * A slanted tile is a chip-sized filled rect or 4-point polygon whose tilt
 * from the axis is between 1° and 20°. 45° diamonds are not tiles.
 * Confetti scraps under 40px on the long edge are not tiles.
 */
export function isSlantedTile(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  const paint = leafPaint(el)
  if (!paint || paint.kind !== "fill") return false

  let tilt = 0
  let longEdge = 0
  let shortEdge = 0

  const tr = el.getAttribute("transform") ?? ""
  const rot = /rotate\(\s*(-?[\d.]+)/.exec(tr)

  if (tag === "rect" && rot) {
    tilt = Math.abs(Number(rot[1])) % 90
    tilt = Math.min(tilt, 90 - tilt)
    const w = Number(el.getAttribute("width"))
    const h = Number(el.getAttribute("height"))
    longEdge = Math.max(w, h)
    shortEdge = Math.min(w, h)
  } else if (tag === "polygon") {
    const pts = polygonPoints(el)
    if (pts.length !== 4) return false
    const e1 = Math.hypot(pts[1]!.x - pts[0]!.x, pts[1]!.y - pts[0]!.y)
    const e2 = Math.hypot(pts[2]!.x - pts[1]!.x, pts[2]!.y - pts[1]!.y)
    longEdge = Math.max(e1, e2)
    shortEdge = Math.min(e1, e2)
    const deg = (Math.atan2(pts[1]!.y - pts[0]!.y, pts[1]!.x - pts[0]!.x) * 180) / Math.PI
    const abs = Math.abs(deg)
    tilt = Math.min(abs % 90, 90 - (abs % 90))
  } else {
    return false
  }

  if (tilt < 1 || tilt > 20) return false
  if (shortEdge < 16 || longEdge < 40) return false
  return true
}

export function countSlantedTiles(root: Element): number {
  return paintedLeaves(root).filter(isSlantedTile).length
}
