import { pxToIn } from "../../constants"
import { applyFill, extractStroke, type FillSpec, type LineSpec } from "./style"
import type { GradientDef } from "./gradient"

/**
 * A pptxgenjs shape draw, produced from an SVG `<rect>` / `<circle>` / `<ellipse>`.
 * Rendered later via `slide.addText("", { shape, x, y, w, h, fill, line, rectRadius })`
 * — pptxgenjs merges shape + text in one call, so a bare shape is empty text.
 * All positions are in inches; line width is in points.
 */
export interface ShapeOp {
  kind: "shape"
  text: string
  shape: "rect" | "roundRect"
  x: number
  y: number
  w: number
  h: number
  fill?: FillSpec
  /** Set alongside `fill` (a solid placeholder) when `fill` was `url(#id)`. */
  gradientFill?: GradientDef
  line?: LineSpec
  rectRadius?: number
  /** Set by `svg2pptx/dispatch.ts` when this leaf lives under a `data-blk`-tagged `<g>` (wave-C S3, `elements === "auto"` only). */
  blockIndex?: number
}

function num(el: Element, name: string): number {
  return parseFloat(el.getAttribute(name) ?? "0") || 0
}

/** Convert an SVG `<rect>` element to a pptxgenjs shape op. */
export function rectToOp(el: Element, gradients?: ReadonlyMap<string, GradientDef>): ShapeOp {
  const rx = num(el, "rx")
  const op: ShapeOp = {
    kind: "shape",
    text: "",
    shape: rx > 0 ? "roundRect" : "rect",
    x: pxToIn(num(el, "x")),
    y: pxToIn(num(el, "y")),
    w: pxToIn(num(el, "width")),
    h: pxToIn(num(el, "height")),
  }
  if (rx > 0) op.rectRadius = pxToIn(rx)

  applyFill(op, el, gradients)
  const line = extractStroke(el)
  if (line) op.line = line

  return op
}
