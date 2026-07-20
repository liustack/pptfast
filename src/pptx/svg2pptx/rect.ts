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

/**
 * Floor one axis (x/width or y/height) of a `<rect>` to a minimum 0.75px
 * extent, normalizing sign first — the same 0.75px floor and "keep the true
 * min edge fixed, extend the true max edge" shape as path.ts's
 * buildOp/segsToOp (`Math.max(maxX, minX + 0.75)`) and line.ts's lineToOp
 * use for this exact defect class, generalized from a point cloud's bbox to
 * a rect's own `origin`/`origin+extent` pair. A zero (or negative — SVG's
 * `<rect width>`/`<rect height>` are never negative per spec, but
 * chart-svg.tsx's ratio geometry emits one anyway for a zero/negative data
 * value, e.g. `renderBar`'s `barH = (d.y / max) * plotH`) extent collapses
 * the shape's `a:ext cx`/`cy` to <= 0, which package-audit's
 * invalid-shape-transform rule unconditionally rejects for any non-`line`-
 * preset shape (a rect gets no single-axis-zero exemption the way a
 * connector does — both axes must independently clear the floor).
 *
 * `lo`/`hi` are the true (sign-normalized) low/high edge regardless of
 * whether `extent` was positive or negative — e.g. a negative-height rect's
 * `origin` is its visual *bottom* edge, not its top, so recovering the true
 * top (`lo`) is what makes the output a correctly-positioned rect instead of
 * a same-signed one anchored at the wrong corner.
 */
function floorAxis(origin: number, extent: number): { origin: number; extent: number } {
  const lo = Math.min(origin, origin + extent)
  const hi = Math.max(Math.max(origin, origin + extent), lo + 0.75)
  return { origin: lo, extent: hi - lo }
}

/** Convert an SVG `<rect>` element to a pptxgenjs shape op. */
export function rectToOp(el: Element, gradients?: ReadonlyMap<string, GradientDef>): ShapeOp {
  const rx = num(el, "rx")
  const xAxis = floorAxis(num(el, "x"), num(el, "width"))
  const yAxis = floorAxis(num(el, "y"), num(el, "height"))
  const op: ShapeOp = {
    kind: "shape",
    text: "",
    shape: rx > 0 ? "roundRect" : "rect",
    x: pxToIn(xAxis.origin),
    y: pxToIn(yAxis.origin),
    w: pxToIn(xAxis.extent),
    h: pxToIn(yAxis.extent),
  }
  if (rx > 0) op.rectRadius = pxToIn(rx)

  applyFill(op, el, gradients)
  const line = extractStroke(el)
  if (line) op.line = line

  return op
}
