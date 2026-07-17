import { pxToIn } from "../../constants"
import { applyFill, extractStroke, type FillSpec, type LineSpec } from "./style"
import type { GradientDef } from "./gradient"

/**
 * A pptxgenjs shape draw op for an ellipse/circle.
 * pptxgenjs "ellipse" preset uses the same x/y/w/h bounding-box model as
 * "rect" (see pptxgen.cjs.js line 5416-5418 for xfrm, line 5465 for prstGeom).
 * All positions are in inches. Line width is in points.
 */
export interface EllipseOp {
  kind: "shape"
  text: string
  shape: "ellipse"
  x: number
  y: number
  w: number
  h: number
  fill?: FillSpec
  /** Set alongside `fill` (a solid placeholder) when `fill` was `url(#id)`. */
  gradientFill?: GradientDef
  line?: LineSpec
  /** Set by `svg2pptx/dispatch.ts` when this leaf lives under a `data-blk`-tagged `<g>` (wave-C S3, `elements === "auto"` only). */
  blockIndex?: number
}

function num(el: Element, name: string): number {
  return parseFloat(el.getAttribute(name) ?? "0") || 0
}

/** Convert an SVG `<circle>` element to a pptxgenjs ellipse shape op. */
export function circleToOp(
  el: Element,
  gradients?: ReadonlyMap<string, GradientDef>,
): EllipseOp {
  const cx = num(el, "cx")
  const cy = num(el, "cy")
  const r = num(el, "r")

  const op: EllipseOp = {
    kind: "shape",
    text: "",
    shape: "ellipse",
    x: pxToIn(cx - r),
    y: pxToIn(cy - r),
    w: pxToIn(2 * r),
    h: pxToIn(2 * r),
  }

  applyFill(op, el, gradients)
  const line = extractStroke(el)
  if (line) op.line = line

  return op
}

/** Convert an SVG `<ellipse>` element to a pptxgenjs ellipse shape op. */
export function ellipseToOp(
  el: Element,
  gradients?: ReadonlyMap<string, GradientDef>,
): EllipseOp {
  const cx = num(el, "cx")
  const cy = num(el, "cy")
  const rx = num(el, "rx")
  const ry = num(el, "ry")

  const op: EllipseOp = {
    kind: "shape",
    text: "",
    shape: "ellipse",
    x: pxToIn(cx - rx),
    y: pxToIn(cy - ry),
    w: pxToIn(2 * rx),
    h: pxToIn(2 * ry),
  }

  applyFill(op, el, gradients)
  const line = extractStroke(el)
  if (line) op.line = line

  return op
}
