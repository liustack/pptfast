import { pxToIn } from "../../constants"
import { measureTextUnits } from "../../lib/svg-text-layout"
import { rectToOp, type ShapeOp } from "./rect"
import { circleToOp, ellipseToOp, type EllipseOp } from "./ellipse"
import { anchorTextBox, textToOp, type TextOp } from "./text"
import { lineToOp, type LineOp } from "./line"
import { polygonToOp, polylineToOp, pathToOp, type PathOp, type PathPoint } from "./path"
import { imageToOp, type ImageOp } from "./image"
import { collectGradients, type GradientDef } from "./gradient"
import {
  IDENTITY,
  multiply,
  applyPoint,
  parseTransform,
  rotationDeg,
  matrixScale,
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
 * 原始坐标渲染)。仅处理无旋转矩阵。Rotated text takes
 * `positionRotatedText` instead, so this path never sees a (0,0) scale
 * from `rotate(-90)`.
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

/**
 * Presentation attributes that SVG *inherits* down the tree and that the leaf
 * converters below actually read. A `<g>` carrying one of these paints every
 * descendant that does not set its own — which is what the browser draws in
 * the preview, so it is what the export has to reproduce.
 *
 * `opacity` is deliberately not in this list. It is not an inherited property
 * but a group-compositing one: `<g opacity="0.5">` composites its whole
 * subtree at 50%, and a child's own `opacity` *multiplies* with it instead of
 * replacing it. It is carried separately, as `Paint.groupOpacity`.
 *
 * The text presentation attributes `text.ts` reads (`font-family`,
 * `font-size`, `font-weight`, `font-style`, `text-anchor`) inherit in SVG too,
 * and are left out on purpose: no container this renderer emits carries one —
 * every `<text>` states its own — so adding them would be a behavior change
 * with no case behind it. If a component ever paints type at the group level,
 * this is the list to extend.
 */
const INHERITED_PAINT_ATTRS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
] as const

/** Paint an element inherits from its container chain. */
interface Paint {
  /** Nearest-ancestor value per attribute; a leaf's own attribute still wins. */
  readonly attrs: ReadonlyMap<string, string>
  /** Product of every ancestor container's `opacity` (1 when none carried it). */
  readonly groupOpacity: number
}

const NO_PAINT: Paint = { attrs: new Map(), groupOpacity: 1 }

/** An `opacity` attribute as a [0,1] factor; absent or unparseable reads as 1. */
function opacityFactor(raw: string | null): number {
  if (raw == null) return 1
  const v = parseFloat(raw)
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1
}

/** Fold a container's own paint onto what it inherited, for its children. */
function inheritPaint(el: Element, parent: Paint): Paint {
  let attrs: Map<string, string> | null = null
  for (const name of INHERITED_PAINT_ATTRS) {
    const value = el.getAttribute(name)
    if (value == null) continue
    attrs ??= new Map(parent.attrs)
    attrs.set(name, value)
  }
  const factor = opacityFactor(el.getAttribute("opacity"))
  if (attrs === null && factor === 1) return parent
  return {
    attrs: attrs ?? parent.attrs,
    groupOpacity: parent.groupOpacity * factor,
  }
}

/**
 * The element a leaf converter should see: this leaf plus whatever paint it
 * inherits and does not override. Returns the element itself when there is
 * nothing to inherit, and otherwise resolves onto a *copy* — the converters
 * take a plain `Element` and read it with `getAttribute`, and the caller's
 * tree is not ours to rewrite (`svgToOps` is handed the same parsed document
 * the preview came from).
 */
function withInheritedPaint(el: Element, paint: Paint): Element {
  const inherited: [string, string][] = []
  for (const [name, value] of paint.attrs) {
    if (!el.hasAttribute(name)) inherited.push([name, value])
  }
  // Group opacity multiplies with the leaf's own rather than replacing it, so
  // the leaf carrying its own `opacity` is no reason to skip the fold.
  const own = opacityFactor(el.getAttribute("opacity"))
  const effective = paint.groupOpacity * own
  if (inherited.length === 0 && effective === own) return el

  const view = el.cloneNode(true) as Element
  for (const [name, value] of inherited) view.setAttribute(name, value)
  if (effective !== own) view.setAttribute("opacity", String(effective))
  return view
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
  paint: Paint,
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
    // Paint composes down the same way the transform above does: a container's
    // own `fill`/`stroke`/… becomes the default for everything beneath it.
    const childPaint = inheritPaint(el, paint)
    for (const child of Array.from(el.children)) {
      walk(child, ctm, childPaint, out, gradients, ownBlockIndex)
    }
    return
  }

  const op = leafToOp(withInheritedPaint(el, paint), gradients)
  if (!op) return
  // 本渲染器只发 translate/scale。Rotated text still takes the dedicated
  // path below (kept after cartesian y-titles stopped emitting rotate(-90)).
  // 非文本叶子上的旋转/斜切仍不在受控子集内（出现时按未缩放处理）。
  let positioned: Op
  if (op.kind === "text" && Math.abs(rotationDeg(ctm)) > 0.5) {
    positioned = positionRotatedText(op, el, ctm)
  } else {
    const origin = applyPoint(ctm, 0, 0)
    positioned = translateOp(scaleOp(op, ctm[0], ctm[3]), pxToIn(origin.x), pxToIn(origin.y))
    // A text box's width is measured against the canvas, so it is only right
    // once the op is *in* canvas coordinates — which is here, and nowhere
    // earlier (`textToOp` sees this element's local x and nothing else). Every
    // other op kind carries real local geometry that the scale+translate above
    // already maps correctly. See `anchorTextBox`'s own doc comment.
    if (positioned.kind === "text") positioned = anchorTextBox(positioned)
  }
  out.push(ownBlockIndex != null ? { ...positioned, blockIndex: ownBlockIndex } : positioned)
}

/**
 * Map a rotated `<text>` to a tight pptxgenjs box plus `rotate`.
 *
 * The default walk scales by the CTM diagonal (`ctm[0]`, `ctm[3]`). A
 * `rotate(-90)` matrix has zeros on that diagonal, so that path would
 * collapse the text to a zero-size box. pptxgenjs rotates around the box
 * *center*, clockwise, so this rebuilds a tight unrotated box whose center
 * lands the SVG baseline anchor at the right canvas point after that
 * rotation. The wide `anchorTextBox` is skipped: rotating a slide-wide box
 * around its center would throw the caption across the page.
 *
 * Construction is the same at 4° as at 90°/270°: invert the clockwise
 * rotation of the unrotated baseline-offset so the offset lands on
 * `anchor`. A 270°-only shortcut used to park every other angle's box
 * center on `anchor` as if the text were unrotated, which left playbill's
 * 4° date sitting flat on a tilted chip.
 */
function positionRotatedText(op: TextOp, el: Element, ctm: Matrix): TextOp {
  const localX = Number(el.getAttribute("x") ?? 0) || 0
  const localY = Number(el.getAttribute("y") ?? 0) || 0
  const fontSizePx = Number(el.getAttribute("font-size") ?? 16) || 16
  const anchor = applyPoint(ctm, localX, localY)
  const scale = matrixScale(ctm) || 1
  const svgDeg = rotationDeg(ctm)
  // SVG and OOXML share a y-down canvas, so the SVG angle maps onto
  // pptxgenjs clockwise `rotate` without a sign flip. -90° (up the page)
  // becomes 270°. Cardinals snap for numerical cleanliness. 4° stays 4°.
  let rotate = ((svgDeg % 360) + 360) % 360
  if (Math.abs(rotate - 270) < 0.5) rotate = 270
  else if (Math.abs(rotate - 90) < 0.5) rotate = 90
  else if (rotate < 0.5 || Math.abs(rotate - 360) < 0.5) rotate = 0

  const text = op.runs.map((r) => r.text).join("")
  const units = measureTextUnits(text, {
    fontFamily: op.fontFace,
    bold: op.runs.some((r) => r.bold),
  })
  const wPx = Math.max(1, units * fontSizePx * scale)
  const hPx = Math.max(1, fontSizePx * 1.2 * scale)
  // Matches `text.ts`'s ASCENT_RATIO: alphabetic baseline sits ~0.8em below
  // the box top. pptxgenjs clockwise rotation around the box center maps
  // (dx, dy) → (dx cos θ − dy sin θ, dx sin θ + dy cos θ). Invert so the
  // unrotated baseline-anchor offset lands on `anchor` after that rotate.
  const ascent = 0.8 * fontSizePx * scale
  const dx = op.align === "center" ? 0 : op.align === "right" ? wPx / 2 : -wPx / 2
  const dy = -hPx / 2 + ascent
  const rad = (rotate * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const centerX = anchor.x - (dx * cos - dy * sin)
  const centerY = anchor.y - (dx * sin + dy * cos)
  return {
    ...op,
    x: pxToIn(centerX - wPx / 2),
    y: pxToIn(centerY - hPx / 2),
    w: pxToIn(wPx),
    h: pxToIn(hPx),
    fontSize: op.fontSize * scale,
    rotate: rotate || undefined,
    align: "left",
  }
}

/**
 * Walk an SVG element tree depth-first (document order) and convert every
 * drawable leaf into a pptxgenjs op, flattening the two things a `<g>` hands
 * its descendants into each leaf: the translate/scale transform, and the
 * paint (`fill`/`stroke`/`stroke-width`/… — see `INHERITED_PAINT_ATTRS`).
 *
 * `root`'s own transform and paint count: this is called on a decoration
 * subtree as readily as on a whole `<svg>`.
 *
 * Gradients are collected once up front from `<defs>` (`collectGradients`) so
 * any leaf's `fill="url(#id)"` can resolve regardless of document order.
 */
export function svgToOps(root: Element): Op[] {
  const gradients = collectGradients(root)
  const out: Op[] = []
  walk(root, IDENTITY, NO_PAINT, out, gradients, undefined)
  return out
}
