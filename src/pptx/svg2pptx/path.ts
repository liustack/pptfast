import { pxToIn } from "../../constants"
import { applyFill, extractStroke } from "./style"
import type { GradientDef } from "./gradient"

/**
 * A point inside a custom-geometry path. The shape matches pptxgenjs's
 * `ShapeProps.points` entries exactly, so the render layer passes them straight
 * to `slide.addShape("custGeom", { points })`. Coordinates are inches relative
 * to the shape's bounding-box origin.
 */
/** Center-parameterized arc segment (pptxgenjs `curve.type === "arc"`). */
export interface PathArc {
  type: "arc"
  hR: number
  wR: number
  stAng: number
  swAng: number
}

export type PathPoint =
  | { x: number; y: number; moveTo?: boolean }
  | { x: number; y: number; curve: PathArc }
  | {
      x: number
      y: number
      curve: { type: "cubic"; x1: number; y1: number; x2: number; y2: number }
    }
  | { x: number; y: number; curve: { type: "quadratic"; x1: number; y1: number } }
  | { close: true }

/**
 * A pptxgenjs custom-geometry draw, produced from an SVG
 * `<polygon>` / `<polyline>` / `<path>`. Rendered via
 * `slide.addShape("custGeom", { x, y, w, h, points, fill, line })`.
 * Bounding box is in inches; line width is in points.
 */
export interface PathOp {
  kind: "path"
  x: number
  y: number
  w: number
  h: number
  points: PathPoint[]
  fill?: { color: string; transparency?: number }
  /** Set alongside `fill` (a solid placeholder) when `fill` was `url(#id)`. */
  gradientFill?: GradientDef
  line?: { color: string; width: number }
  /** Set by `svg2pptx/dispatch.ts` when this leaf lives under a `data-blk`-tagged `<g>` (wave-C S3, `elements === "auto"` only). */
  blockIndex?: number
}

interface Pt {
  x: number
  y: number
}

/** Parse an SVG `points` attribute ("x,y x,y" or "x y x y") into px points. */
function parsePoints(attr: string | null): Pt[] {
  if (!attr) return []
  const nums = attr
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => !Number.isNaN(n))
  const pts: Pt[] = []
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push({ x: nums[i], y: nums[i + 1] })
  }
  return pts
}

/** Build a PathOp from absolute px vertices, with a tight bbox + fill/stroke. */
function buildOp(
  pts: Pt[],
  closed: boolean,
  el: Element,
  gradients?: ReadonlyMap<string, GradientDef>,
): PathOp {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  // 零尺寸 custGeom 在渲染端归一化时除零（曾表现为图标被拉成穿页巨柱）
  const maxX = Math.max(Math.max(...xs), minX + 0.75)
  const maxY = Math.max(Math.max(...ys), minY + 0.75)

  const points: PathPoint[] = pts.map((p, i) => ({
    x: pxToIn(p.x - minX),
    y: pxToIn(p.y - minY),
    ...(i === 0 ? { moveTo: true } : {}),
  }))
  if (closed) points.push({ close: true })

  const op: PathOp = {
    kind: "path",
    x: pxToIn(minX),
    y: pxToIn(minY),
    w: pxToIn(maxX - minX),
    h: pxToIn(maxY - minY),
    points,
  }
  applyFill(op, el, gradients)
  const line = extractStroke(el)
  if (line) op.line = line
  return op
}

/** Convert an SVG `<polygon>` to a closed custGeom op. */
export function polygonToOp(
  el: Element,
  gradients?: ReadonlyMap<string, GradientDef>,
): PathOp {
  return buildOp(parsePoints(el.getAttribute("points")), true, el, gradients)
}

/** Convert an SVG `<polyline>` to an open custGeom op. */
export function polylineToOp(
  el: Element,
  gradients?: ReadonlyMap<string, GradientDef>,
): PathOp {
  return buildOp(parsePoints(el.getAttribute("points")), false, el, gradients)
}

/** One resolved path segment in absolute px (or a subpath close marker). */
type Seg =
  | { x: number; y: number; moveTo: boolean }
  | { x: number; y: number; arc: { rx: number; ry: number; stAng: number; swAng: number; cx: number; cy: number } }
  | { x: number; y: number; cubic: { x1: number; y1: number; x2: number; y2: number } }
  | { x: number; y: number; quad: { x1: number; y1: number } }
  | { close: true }

/**
 * Convert an SVG endpoint-parameterized arc to a center parameterization,
 * per the W3C SVG implementation notes (appendix B.2.4), assuming
 * x-axis-rotation = 0 (all arcs our renderer emits are axis-aligned).
 * Returns px radii plus start/sweep angles in degrees (y-down, clockwise),
 * which match DrawingML's stAng/swAng directly.
 */
function svgArcToCenter(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rxIn: number,
  ryIn: number,
  fA: number,
  fS: number,
): { rx: number; ry: number; stAng: number; swAng: number; cx: number; cy: number } {
  let rx = Math.abs(rxIn)
  let ry = Math.abs(ryIn)
  const x1p = (x1 - x2) / 2
  const y1p = (y1 - y2) / 2
  // Scale up radii if they're too small to span the chord.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) {
    const s = Math.sqrt(lambda)
    rx *= s
    ry *= s
  }
  const sign = fA !== fS ? 1 : -1
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  const coef = sign * Math.sqrt(Math.max(0, num / den))
  const cxp = (coef * (rx * y1p)) / ry
  const cyp = (coef * -(ry * x1p)) / rx

  const ux = (x1p - cxp) / rx
  const uy = (y1p - cyp) / ry
  const vx = (-x1p - cxp) / rx
  const vy = (-y1p - cyp) / ry
  const angleBetween = (ax: number, ay: number, bx: number, by: number) => {
    const dot = ax * bx + ay * by
    const len = Math.sqrt((ax * ax + ay * ay) * (bx * bx + by * by))
    let a = Math.acos(Math.min(1, Math.max(-1, dot / len)))
    if (ax * by - ay * bx < 0) a = -a
    return a
  }
  const theta1 = angleBetween(1, 0, ux, uy)
  let dTheta = angleBetween(ux, uy, vx, vy)
  if (fS === 0 && dTheta > 0) dTheta -= 2 * Math.PI
  if (fS === 1 && dTheta < 0) dTheta += 2 * Math.PI

  const toDeg = (r: number) => (r * 180) / Math.PI
  const stAng = ((toDeg(theta1) % 360) + 360) % 360
  // 圆心（x-axis-rotation=0）：中点坐标系平移回原坐标
  const cx = cxp + (x1 + x2) / 2
  const cy = cyp + (y1 + y2) / 2
  return { rx, ry, stAng, swAng: toDeg(dTheta), cx, cy }
}

/** Tokenize a `d` string into command letters and numeric operands. */
function tokenizePath(d: string): string[] {
  return d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []
}

/**
 * Walk an SVG `d` path (M/L/H/V/Z, absolute and relative) into absolute-px
 * segments. Extra coordinate pairs after M/L are implicit lineTos, per spec.
 */
function parsePathData(d: string): Seg[] {
  const tokens = tokenizePath(d)
  const segs: Seg[] = []
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  let lastCtrl: { x: number; y: number; kind: "cubic" | "quad" } | null = null
  let i = 0
  let cmd = ""
  const next = () => parseFloat(tokens[i++])

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) {
      cmd = tokens[i++]
    } else if (cmd === "M") {
      cmd = "L"
    } else if (cmd === "m") {
      cmd = "l"
    }
    const rel = cmd === cmd.toLowerCase()
    switch (cmd.toUpperCase()) {
      case "M": {
        const x = next()
        const y = next()
        cx = rel ? cx + x : x
        cy = rel ? cy + y : y
        sx = cx
        sy = cy
        segs.push({ x: cx, y: cy, moveTo: true })
        break
      }
      case "L": {
        const x = next()
        const y = next()
        cx = rel ? cx + x : x
        cy = rel ? cy + y : y
        segs.push({ x: cx, y: cy, moveTo: false })
        break
      }
      case "H": {
        const x = next()
        cx = rel ? cx + x : x
        segs.push({ x: cx, y: cy, moveTo: false })
        break
      }
      case "V": {
        const y = next()
        cy = rel ? cy + y : y
        segs.push({ x: cx, y: cy, moveTo: false })
        break
      }
      case "A": {
        const rx = next()
        const ry = next()
        next() // x-axis-rotation (assumed 0)
        const fA = next()
        const fS = next()
        const tx = next()
        const ty = next()
        const ex = rel ? cx + tx : tx
        const ey = rel ? cy + ty : ty
        const arc = svgArcToCenter(cx, cy, ex, ey, rx, ry, fA, fS)
        segs.push({ x: ex, y: ey, arc })
        cx = ex
        cy = ey
        break
      }
      case "C": {
        const x1 = next()
        const y1 = next()
        const x2 = next()
        const y2 = next()
        const tx = next()
        const ty = next()
        const c = rel
          ? { x1: cx + x1, y1: cy + y1, x2: cx + x2, y2: cy + y2 }
          : { x1, y1, x2, y2 }
        cx = rel ? cx + tx : tx
        cy = rel ? cy + ty : ty
        segs.push({ x: cx, y: cy, cubic: c })
        lastCtrl = { x: c.x2, y: c.y2, kind: "cubic" }
        continue
      }
      case "S": {
        const x2 = next()
        const y2 = next()
        const tx = next()
        const ty = next()
        // 反射前一 cubic 的第二控制点，无前控制点时取当前点
        const refX: number = lastCtrl?.kind === "cubic" ? 2 * cx - lastCtrl.x : cx
        const refY: number = lastCtrl?.kind === "cubic" ? 2 * cy - lastCtrl.y : cy
        const c = rel
          ? { x1: refX, y1: refY, x2: cx + x2, y2: cy + y2 }
          : { x1: refX, y1: refY, x2, y2 }
        cx = rel ? cx + tx : tx
        cy = rel ? cy + ty : ty
        segs.push({ x: cx, y: cy, cubic: c })
        lastCtrl = { x: c.x2, y: c.y2, kind: "cubic" }
        continue
      }
      case "Q": {
        const x1 = next()
        const y1 = next()
        const tx = next()
        const ty = next()
        const q = rel ? { x1: cx + x1, y1: cy + y1 } : { x1, y1 }
        cx = rel ? cx + tx : tx
        cy = rel ? cy + ty : ty
        segs.push({ x: cx, y: cy, quad: q })
        lastCtrl = { x: q.x1, y: q.y1, kind: "quad" }
        continue
      }
      case "T": {
        const tx = next()
        const ty = next()
        const refX: number = lastCtrl?.kind === "quad" ? 2 * cx - lastCtrl.x : cx
        const refY: number = lastCtrl?.kind === "quad" ? 2 * cy - lastCtrl.y : cy
        cx = rel ? cx + tx : tx
        cy = rel ? cy + ty : ty
        segs.push({ x: cx, y: cy, quad: { x1: refX, y1: refY } })
        lastCtrl = { x: refX, y: refY, kind: "quad" }
        continue
      }
      case "Z": {
        segs.push({ close: true })
        cx = sx
        cy = sy
        break
      }
      default:
        // Unsupported command — skip its tokens defensively.
        i++
    }
    // 曲线命令以 continue 跳过此行。其余命令重置平滑反射基准（SVG 规范）。
    lastCtrl = null
  }
  return segs
}

/** Build a PathOp from absolute-px segments, with a tight bbox + fill/stroke. */
function segsToOp(
  segs: Seg[],
  el: Element,
  gradients?: ReadonlyMap<string, GradientDef>,
): PathOp {
  const anchors = segs.filter((s): s is Extract<Seg, { x: number }> => "x" in s)
  const xs = anchors.map((p) => p.x)
  const ys = anchors.map((p) => p.y)
  for (const seg of segs) {
    if ("cubic" in seg) {
      xs.push(seg.cubic.x1, seg.cubic.x2)
      ys.push(seg.cubic.y1, seg.cubic.y2)
    } else if ("quad" in seg) {
      xs.push(seg.quad.x1)
      ys.push(seg.quad.y1)
    } else if ("arc" in seg) {
      // 弧的鼓出可越过锚点连线（如扁平弧 M3 12 A9 3 ... 21 12 的下缘），
      // 仅当扫掠覆盖 0/90/180/270° 时计入该轴向极值（角度为 y 向下顺时针，
      // 与 DrawingML stAng/swAng 一致），避免 bbox 塌成零高又不粗放过界。
      const { rx, ry, stAng, swAng, cx, cy } = seg.arc
      const within = (deg: number) => {
        const delta = (((deg - stAng) % 360) + 360) % 360
        return swAng >= 0 ? delta <= swAng : delta - 360 >= swAng
      }
      if (within(0)) xs.push(cx + rx)
      if (within(180)) xs.push(cx - rx)
      if (within(90)) ys.push(cy + ry)
      if (within(270)) ys.push(cy - ry)
    }
  }
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)

  const points: PathPoint[] = segs.map((s) => {
    if ("close" in s) return { close: true }
    if ("cubic" in s) {
      return {
        x: pxToIn(s.x - minX),
        y: pxToIn(s.y - minY),
        curve: {
          type: "cubic",
          x1: pxToIn(s.cubic.x1 - minX),
          y1: pxToIn(s.cubic.y1 - minY),
          x2: pxToIn(s.cubic.x2 - minX),
          y2: pxToIn(s.cubic.y2 - minY),
        },
      }
    }
    if ("quad" in s) {
      return {
        x: pxToIn(s.x - minX),
        y: pxToIn(s.y - minY),
        curve: {
          type: "quadratic",
          x1: pxToIn(s.quad.x1 - minX),
          y1: pxToIn(s.quad.y1 - minY),
        },
      }
    }
    if ("arc" in s) {
      return {
        x: pxToIn(s.x - minX),
        y: pxToIn(s.y - minY),
        curve: {
          type: "arc",
          wR: pxToIn(s.arc.rx),
          hR: pxToIn(s.arc.ry),
          stAng: s.arc.stAng,
          swAng: s.arc.swAng,
        },
      }
    }
    return {
      x: pxToIn(s.x - minX),
      y: pxToIn(s.y - minY),
      ...(s.moveTo ? { moveTo: true } : {}),
    }
  })

  const op: PathOp = {
    kind: "path",
    x: pxToIn(minX),
    y: pxToIn(minY),
    w: pxToIn(maxX - minX),
    h: pxToIn(maxY - minY),
    points,
  }
  applyFill(op, el, gradients)
  const line = extractStroke(el)
  if (line) op.line = line
  return op
}

/** Convert an SVG `<path>` (M/L/H/V/Z) to a custGeom op. */
export function pathToOp(
  el: Element,
  gradients?: ReadonlyMap<string, GradientDef>,
): PathOp {
  return segsToOp(parsePathData(el.getAttribute("d") ?? ""), el, gradients)
}
