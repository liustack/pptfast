import { PX_PER_IN, pxToIn, pxToPt } from "../../constants"
import { svgColorToHex, svgColorTransparency } from "./color"
import { elementOpacity } from "./style"

/** EMU per inch — `node_modules/pptxgenjs`'s own `EMU` constant, replicated
 * here because this is the one place in the render chain that needs to
 * anticipate pptxgenjs's `inch2Emu` (`Math.round(EMU * inches)`) rounding
 * *before* handing it a value, not just convert into its units. Not part of
 * `constants.ts`: every other converter only ever produces inches/points and
 * lets pptxgenjs do this conversion itself. */
const EMU_PER_IN = 914400

/** True when an SVG px length is small enough that pptxgenjs's own EMU
 * rounding (`Math.round(px / PX_PER_IN * EMU_PER_IN)`) collapses it to
 * exactly 0 — i.e. genuinely below PowerPoint's unit resolution, not just
 * "a small number". A legitimately thin but visible line (0.5px ≈ 4762 EMU)
 * sits nowhere near this threshold; it only fires for sub-EMU deltas
 * (< ~5.25e-5px). */
function roundsToZeroEmu(px: number): boolean {
  return Math.round((Math.abs(px) / PX_PER_IN) * EMU_PER_IN) === 0
}

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
  // 零长度 line（起终点重合，如 Lucide "÷" 图标的点惯用法 x1=x2/y1=y2）在渲染端
  // 同样是退化 shape——与 path.ts 的 buildOp/segsToOp 同一 0.75px 地板值，但
  // 仅在两轴都为零时触发：单轴为零的真实水平/垂直连接线（audit 的 connector
  // 例外本就允许其中一轴为零）保持原样不受影响，那是合法几何，不是本 bug 的模式。
  //
  // 判等口径故意不是位精确 `dx === 0`：near-equal 但非位精确的端点对（如
  // dumbbell 的 from=1e9,to=1e9+1，经 vx() 比例映射后 dx≈4e-7px）在 IEEE-754
  // 意义上非零、逃过旧判等，但两轴各自 px→EMU 取整（pptxgenjs 自己的
  // inch2Emu = Math.round(EMU_PER_IN * inches)）后同样双双归零，触发
  // package-audit 的 zero-length connector 判定——落地效果和位精确的点一样，
  // 只是路径不同。`roundsToZeroEmu` 问的是"这根轴在 PPTX 的取整精度下还剩不
  // 剩得下"，不是"两端点是否位精确相等"；仍然要求双轴同时成立，单轴为零的
  // 真实水平/垂直连接线（见本文件下方两个未受影响的回归用例）不受影响——那根
  // 非零轴在任何真实量级下都远超 1 EMU。
  const isPoint = roundsToZeroEmu(dx) && roundsToZeroEmu(dy)
  const w = isPoint ? 0.75 : Math.abs(dx)
  const h = isPoint ? 0.75 : Math.abs(dy)

  const strokeColor = el.getAttribute("stroke") || "#000000"
  const strokeWidth = num(el, "stroke-width", 1) || 1

  const op: LineOp = {
    kind: "line",
    x: pxToIn(Math.min(x1, x2)),
    y: pxToIn(Math.min(y1, y2)),
    w: pxToIn(w),
    h: pxToIn(h),
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
