import { pxToIn } from "../../constants"
import { rectToOp, type ShapeOp } from "./rect"
import { circleToOp, ellipseToOp, type EllipseOp } from "./ellipse"
import { textToOp, type TextOp } from "./text"
import { lineToOp, type LineOp } from "./line"
import { polygonToOp, polylineToOp, pathToOp, type PathOp, type PathPoint } from "./path"
import { imageToOp, type ImageOp } from "./image"
import { collectGradients, type GradientDef } from "./gradient"
import {
  IDENTITY,
  multiply,
  applyPoint,
  parseTransform,
  type Matrix,
} from "./transform"

/** Any pptxgenjs draw op, discriminated by `kind`. */
export type Op = ShapeOp | EllipseOp | TextOp | LineOp | PathOp | ImageOp

/**
 * Subtrees that define reusable content rather than render inline. We skip
 * them entirely (do not descend), matching how a browser paints the SVG.
 */
const SKIP_TAGS = new Set([
  "defs",
  "clipPath",
  "mask",
  "marker",
  "pattern",
  "symbol",
  "linearGradient",
  "radialGradient",
  "filter",
  "style",
  "title",
  "desc",
  "metadata",
])

/** Containers we descend into, composing any transform they carry. */
const CONTAINER_TAGS = new Set(["svg", "g", "a"])

/** Shift an op's anchor by an inch offset (a flattened translate). */
function translateOp<T extends Op>(op: T, dx: number, dy: number): T {
  return { ...op, x: op.x + dx, y: op.y + dy }
}

/**
 * Apply a uniform-ish scale to an op's local geometry (icons emit
 * `translate(...) scale(...)`——此前 scale 在叶子被丢弃，图标始终按 24px
 * 原始坐标渲染)。仅处理无旋转矩阵（本渲染器只发 translate/scale）。
 */
function scaleOp(op: Op, sx: number, sy: number): Op {
  if (sx === 1 && sy === 1) return op
  const avg = (sx + sy) / 2
  const box = { x: op.x * sx, y: op.y * sy, w: op.w * sx, h: op.h * sy }
  switch (op.kind) {
    case "text":
      return {
        ...op,
        ...box,
        fontSize: op.fontSize * avg,
        runs: op.runs.map((r) =>
          r.fontSize != null ? { ...r, fontSize: r.fontSize * avg } : r,
        ),
      }
    case "path":
      return {
        ...op,
        ...box,
        ...(op.line ? { line: { ...op.line, width: op.line.width * avg } } : {}),
        points: op.points.map((pt): PathPoint => {
          if ("close" in pt) return pt
          if ("curve" in pt) {
            if (pt.curve.type === "arc") {
              return {
                x: pt.x * sx,
                y: pt.y * sy,
                curve: { ...pt.curve, wR: pt.curve.wR * sx, hR: pt.curve.hR * sy },
              }
            }
            if (pt.curve.type === "cubic") {
              return {
                x: pt.x * sx,
                y: pt.y * sy,
                curve: {
                  type: "cubic",
                  x1: pt.curve.x1 * sx,
                  y1: pt.curve.y1 * sy,
                  x2: pt.curve.x2 * sx,
                  y2: pt.curve.y2 * sy,
                },
              }
            }
            return {
              x: pt.x * sx,
              y: pt.y * sy,
              curve: { type: "quadratic", x1: pt.curve.x1 * sx, y1: pt.curve.y1 * sy },
            }
          }
          return { ...pt, x: pt.x * sx, y: pt.y * sy }
        }),
      }
    case "line":
      return { ...op, ...box, line: { ...op.line, width: op.line.width * avg } }
    case "shape":
      return {
        ...op,
        ...box,
        ...(op.line ? { line: { ...op.line, width: op.line.width * avg } } : {}),
        ...("rectRadius" in op && op.rectRadius != null
          ? { rectRadius: op.rectRadius * avg }
          : {}),
      }
    default:
      return { ...op, ...box }
  }
}

/** Convert a single leaf element to an op, or null if it isn't drawable. */
function leafToOp(el: Element, gradients: ReadonlyMap<string, GradientDef>): Op | null {
  switch (el.tagName.toLowerCase()) {
    case "rect":
      return rectToOp(el, gradients)
    case "circle":
      return circleToOp(el, gradients)
    case "ellipse":
      return ellipseToOp(el, gradients)
    case "text":
      return textToOp(el)
    case "line":
      return lineToOp(el)
    case "polygon":
      return polygonToOp(el, gradients)
    case "polyline":
      return polylineToOp(el, gradients)
    case "path":
      return pathToOp(el, gradients)
    case "image":
      return imageToOp(el)
    default:
      return null
  }
}

function walk(
  el: Element,
  parent: Matrix,
  out: Op[],
  gradients: ReadonlyMap<string, GradientDef>,
  blockIndex: number | undefined,
): void {
  const tag = el.tagName.toLowerCase()
  if (SKIP_TAGS.has(tag)) return

  // Compose this element's own transform onto the inherited one.
  const own = el.getAttribute("transform")
  const ctm = own ? multiply(parent, parseTransform(own)) : parent

  // Wave-C S3 (elements === "auto" only): `components/index.tsx`'s `renderComponent`
  // wraps a component's content in `<g data-blk="{index}">`. Once entered, every
  // descendant leaf inherits that index — a component can nest its own `<g>`s
  // (icon groups, card rows) without losing the tag — until a *different*
  // `data-blk` is encountered, which overrides it for its own subtree.
  const dataBlk = el.getAttribute("data-blk")
  const ownBlockIndex = dataBlk != null ? Number(dataBlk) : blockIndex

  if (CONTAINER_TAGS.has(tag)) {
    for (const child of Array.from(el.children)) walk(child, ctm, out, gradients, ownBlockIndex)
    return
  }

  const op = leafToOp(el, gradients)
  if (!op) return
  // 本渲染器只发 translate/scale：先按矩阵对角项缩放局部几何，再平移到
  // 原点像。旋转/斜切不在受控子集内（出现时按未缩放处理并靠门测试拦截）。
  const origin = applyPoint(ctm, 0, 0)
  const positioned = translateOp(scaleOp(op, ctm[0], ctm[3]), pxToIn(origin.x), pxToIn(origin.y))
  out.push(ownBlockIndex != null ? { ...positioned, blockIndex: ownBlockIndex } : positioned)
}

/**
 * Walk an SVG element tree depth-first (document order) and convert every
 * drawable leaf into a pptxgenjs op, flattening inherited `<g>` translate
 * transforms into each leaf's coordinates.
 *
 * Gradients are collected once up front from `<defs>` (`collectGradients`) so
 * any leaf's `fill="url(#id)"` can resolve regardless of document order.
 */
export function svgToOps(root: Element): Op[] {
  const gradients = collectGradients(root)
  const out: Op[] = []
  walk(root, IDENTITY, out, gradients, undefined)
  return out
}
