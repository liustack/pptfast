import { pxToIn, pxToPt } from "../../constants"
import { svgColorToHex, svgColorTransparency } from "./color"
import { elementOpacity } from "./style"

/**
 * pptxgenjs line dash type.
 * Valid values from pptxgenjs types/index.d.ts line 1040:
 * 'solid' | 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'sysDash' | 'sysDot'
 */
type DashType =
  | "solid"
  | "dash"
  | "dashDot"
  | "lgDash"
  | "lgDashDot"
  | "lgDashDotDot"
  | "sysDash"
  | "sysDot"

/**
 * A pptxgenjs line draw op, produced from an SVG `<line>`.
 *
 * Rendered via `slide.addShape(pptxgen.shapes.LINE, { x, y, w, h, line, flipH, flipV })`.
 * All positions in inches. line.width in points.
 *
 * **Direction (from pptxgen.cjs.js source):**
 * - pptxgenjs emits `<a:xfrm flipH="1">` / `<a:xfrm flipV="1">` as attributes
 *   of the xfrm element (lines 5162-5165, 5416 in pptxgen.cjs.js).
 * - A `line` preset geometry (`prstGeom prst="line"`) draws the default
 *   diagonal from the top-left corner of the bounding box to the bottom-right.
 * - `flipV` mirrors the line vertically within its bounding box, producing a
 *   bottom-left → top-right diagonal.
 *
 * So: when the SVG line's dx and dy have opposite signs (one positive, one
 * negative), the line runs along the anti-diagonal and we need `flipV = true`.
 * When they share the same sign (or either is zero), no flip is needed.
 */
export interface LineOp {
  kind: "line"
  x: number
  y: number
  w: number
  h: number
  line: {
    color: string
    width: number
    dashType?: DashType
    transparency?: number
  }
  flipH?: boolean
  flipV?: boolean
  /** Set by `svg2pptx/dispatch.ts` when this leaf lives under a `data-blk`-tagged `<g>` (wave-C S3, `elements === "auto"` only). */
  blockIndex?: number
}

function num(el: Element, name: string, fallback = 0): number {
  const v = el.getAttribute(name)
  if (v == null) return fallback
  return parseFloat(v) || fallback
}

/**
 * Map SVG `stroke-dasharray` to a pptxgenjs `dashType`.
 *
 * Minimal mapping (not attempting to cover every SVG pattern):
 * - absent / empty → undefined (solid, omitted from op)
 * - dash length ≤ 2 (dot-like, e.g. "1,3" / "2,4") → "sysDot"
 * - anything else → "dash"
 *
 * pptxgenjs valid dashType values (types/index.d.ts line 1040):
 * 'solid' | 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'sysDash' | 'sysDot'
 */
function mapDashArray(el: Element): DashType | undefined {
  const raw = el.getAttribute("stroke-dasharray")
  if (!raw || raw === "none") return undefined
  const parts = raw.split(/[\s,]+/).map(Number).filter((n) => !isNaN(n))
  if (parts.length === 0) return undefined
  // First value is the dash/dot length. If ≤ 2px it looks like a dot pattern.
  return parts[0] <= 2 ? "sysDot" : "dash"
}

/** Convert an SVG `<line>` element to a pptxgenjs line op. */
export function lineToOp(el: Element): LineOp {
  const x1 = num(el, "x1")
  const y1 = num(el, "y1")
  const x2 = num(el, "x2")
  const y2 = num(el, "y2")

  const dx = x2 - x1
  const dy = y2 - y1

  const strokeColor = el.getAttribute("stroke") || "#000000"
  const strokeWidth = num(el, "stroke-width", 1) || 1

  const op: LineOp = {
    kind: "line",
    x: pxToIn(Math.min(x1, x2)),
    y: pxToIn(Math.min(y1, y2)),
    w: pxToIn(Math.abs(dx)),
    h: pxToIn(Math.abs(dy)),
    line: {
      color: svgColorToHex(strokeColor),
      width: pxToPt(strokeWidth),
    },
  }

  const dashType = mapDashArray(el)
  if (dashType) op.line.dashType = dashType

  const alpha =
    (1 - (svgColorTransparency(strokeColor) ?? 0) / 100) *
    elementOpacity(el, "stroke-opacity")
  const transparency = Math.round((1 - alpha) * 100)
  if (transparency > 0) op.line.transparency = transparency

  // When dx and dy have opposite signs the line runs along the anti-diagonal
  // (bottom-left ↔ top-right). pptxgenjs default is top-left → bottom-right,
  // so we flip vertically to get the correct direction.
  // Zero dx or dy means a horizontal/vertical line. no flip needed.
  if (dx !== 0 && dy !== 0 && Math.sign(dx) !== Math.sign(dy)) {
    op.flipV = true
  }

  return op
}
