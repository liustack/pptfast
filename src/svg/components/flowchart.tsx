import { Fragment } from "react"
import dagre from "dagre"
import type { Component } from "@/ir"
import {
  fitSvgLine,
  layoutSvgText,
  measureTextUnits,
} from "../../lib/svg-text-layout"
import { readableOn } from "../ink"
import { mixHex } from "./color-mix"
import { resolveComponentForm, type FormKnobs } from "./form-assignments"
import type { ComponentCtx, RenderDef, SvgComponent } from "./types"

type FlowchartComponent = Extract<Component, { type: "flowchart" }>

type FlowDirection = "TB" | "TD" | "BT" | "LR" | "RL"

/** dagre accepts TB/BT/LR/RL. Mermaid "TD" is an alias for "TB". */
function toRankdir(d: FlowDirection): "TB" | "BT" | "LR" | "RL" {
  return d === "TD" ? "TB" : d
}

const NODE_MIN_W = 80
const NODE_MAX_W = 260
/**
 * Horizontal breathing room per side, in *local* (dagre) units so it scales
 * with the diagram. It enters the box-width budget (`nodeWidth`) AND the
 * render-time fitting budget (`usableW`) with the same value — the two used
 * to disagree (budget 10px, render-time only 6px fixed) while the render
 * font ran 1.15× hotter than the sizing font, so `fitSvgLine` quietly shrank
 * the text until it filled everything but ~6px per side (user-reported
 * "贴边没有呼吸感").
 */
const NODE_PAD_X = 16
const NODE_H = 56
/** Extra local height per label line beyond the first (multi-line nodes). */
const NODE_LINE_PITCH = 18
/** Defensive cap — a node card is not a paragraph; extra lines merge into the last. */
const NODE_MAX_LINES = 3
const NODE_SEP = 30
const RANK_SEP = 48
const FONT_SIZE = 12
const MIN_FONT_SIZE = 9
/** Diamond node type never shrinks below this unless the whole diagram scale is already smaller. */
const NODE_FONT_FLOOR = 12
/**
 * Inscribed chord of a rhombus, as a fraction of bounding-box width.
 * One centered line sits on the wide diagonal (~78% after glyph half-height).
 * Two lines sit off-axis, so the chord shrinks to ~60%.
 */
const DIAMOND_FRAC_SINGLE = 0.78
const DIAMOND_FRAC_MULTI = 0.6
const STROKE_W = 1.5
const ARROW_SIZE = 6
/** Page-space corner radius for orthogonal elbows. Tight gaps may go down to CORNER_R_MIN. */
const CORNER_R = 8
const CORNER_R_MIN = 6
/** Outward stub before the first bend, in local (dagre) units. */
const PORT_STUB = 12
/** Minimum along-side spacing between same-side attachment points, local units. */
const PORT_FAN_MIN = 12
/** Page-space gap from an edge-label chip's near edge to the connector stroke. */
const LABEL_LINE_CLEAR = 8
const PATH_EPS = 0.05
/**
 * Max height (px) the flowchart may occupy in the content area. The dagre layout
 * is scaled to fit BOTH the target width and this height, so a tall top-to-bottom
 * chart shrinks to fit instead of scaling by width alone and overflowing the slide.
 */
const MAX_FLOW_HEIGHT = 360
/**
 * Fixed *local* (pre-scale, dagre-coordinate) clearance subtracted from an
 * edge's raw gap before it becomes an edge label's fitting budget (see
 * `computeEdgeLabel`) — kept in the same unit space as `NODE_SEP`/`RANK_SEP`
 * so it shrinks right along with the gap at low scale.
 *
 * This used to be subtracted *after* scaling (`spanLocal * scale - 16`), i.e.
 * a page-space pixel amount independent of `scale`. That is only equivalent
 * to a local-space margin at scale=1 — `fitScale` shrinks `scale` well below
 * 1 for any diagram tall enough to hit `MAX_FLOW_HEIGHT` or wide enough to
 * hit the box width (verified empirically: a straight chain hits this by 6
 * TB nodes or 8 LR nodes), and at low scale a flat 16px post-scale bite could
 * consume most or all of `availableWidth` — pushing `fitSvgLine` into
 * `truncateToUnits`'s floor: a bare "…" or (once the budget went negative)
 * an empty string, for every single edge label, regardless of how short the
 * label text was. Subtracting the margin *before* scaling keeps the ratio of
 * clearance-to-gap constant across every scale — the two formulas agree
 * exactly at scale=1 (`(spanLocal-16)*1 == spanLocal*1-16`), so this is a
 * pure fix for the scale coupling, not a behavior change at 1:1.
 */
const LABEL_FIT_MARGIN = 16
/** Backing chip behind an edge label (see `computeEdgeLabel`) — keeps the
 * label legible whether it ends up floating over a node card or a crossing
 * line once labels render as their own layer above the nodes. */
const LABEL_CHIP_PAD_X = 4
const LABEL_CHIP_PAD_Y = 2
const LABEL_CHIP_RX = 2
/**
 * Below this width, `computeEdgeLabel` omits the label instead of fitting it.
 *
 * `truncateToUnits` (svg-text-layout.ts) reserves a flat 1.0-unit budget for
 * the ellipsis before deciding which characters survive, regardless of the
 * ellipsis's actual (~0.46-unit) rendered weight — so at `minFontSize` (9px),
 * even the single heaviest character (a CJK glyph, weight 1.0) only survives
 * that reservation once the caller's budget is at least `2 * minFontSize`
 * (one full-weight char + the reserved unit). Below that, every fit degrades
 * to a bare "…" or, once the budget goes negative, "" — neither of which
 * reads as a label. A missing edge label is still a valid, readable
 * flowchart; a floating "…" (or a chip with nothing legible behind it) reads
 * as a rendering bug, so we skip straight to "no label" instead.
 */
const MIN_LABEL_WIDTH = 2 * MIN_FONT_SIZE

/** Uniform scale that fits the dagre layout within width `w` and MAX_FLOW_HEIGHT. */
function fitScale(layout: Layout, w: number): number {
  // 允许适度放大填充画布（上限 1.4，避免 3 节点小图膨胀失真）
  return Math.min(w / layout.width, MAX_FLOW_HEIGHT / layout.height, 1.4)
}

/**
 * Split a node label into display lines. Models steadily write mermaid-style
 * `<br/>` inside flowchart labels (the system prompt legitimately teaches it
 * for the *mermaid* tool, and the habit crosses over) — the SVG renderer used
 * to draw the tag literally. `<br>`/`<br/>` and `\n` all break lines; blank
 * segments drop; anything beyond NODE_MAX_LINES merges into the last line
 * (fitSvgLine then shrinks/truncates it like any long line).
 */
export function normalizeLabelLines(label: string): string[] {
  const lines = label
    .split(/<br\s*\/?>|\n/i)
    .map((s) => s.trim())
    .filter(Boolean)
  if (lines.length === 0) return [""]
  if (lines.length <= NODE_MAX_LINES) return lines
  return [...lines.slice(0, NODE_MAX_LINES - 1), lines.slice(NODE_MAX_LINES - 1).join(" ")]
}

/** Node box width sized by the widest line's estimated width (units × font size). */
function nodeWidth(lines: string[]): number {
  const maxUnits = Math.max(...lines.map((l) => measureTextUnits(l)), 0)
  const textW = maxUnits * FONT_SIZE + NODE_PAD_X * 2
  return Math.min(NODE_MAX_W, Math.max(NODE_MIN_W, textW))
}

/** Node box height grows with the label's line count. */
function nodeHeight(lines: string[]): number {
  return NODE_H + (lines.length - 1) * NODE_LINE_PITCH
}

function diamondInscribedFrac(lineCount: number): number {
  return lineCount > 1 ? DIAMOND_FRAC_MULTI : DIAMOND_FRAC_SINGLE
}

/** Diamond bounding width so the inscribed chord holds `lines` at FONT_SIZE. */
function diamondWidthForLines(lines: string[]): number {
  const maxUnits = Math.max(...lines.map((l) => measureTextUnits(l)), 0)
  const textW = maxUnits * FONT_SIZE
  const needed = (textW + NODE_PAD_X * 2) / diamondInscribedFrac(lines.length)
  return Math.min(NODE_MAX_W, Math.max(NODE_MIN_W, Math.ceil(needed + 8)))
}

/**
 * Size a diamond from its inscribed text band, not from the rectangle formula.
 * CJK of 4+ characters wraps to 2 lines so the rhombus does not have to
 * swallow a 4-em row in a NODE_MIN_W box. Latin just widens.
 */
function wrapDiamondLabel(label: string): string[] {
  const raw = normalizeLabelLines(label)
  if (raw.length > 1) return raw.slice(0, NODE_MAX_LINES)
  const line = raw[0] ?? ""
  if (!line) return [""]
  const minUsable = NODE_MIN_W * diamondInscribedFrac(1) - NODE_PAD_X * 2
  if (measureTextUnits(line) * FONT_SIZE <= minUsable) return raw
  const oneW = diamondWidthForLines(raw)
  const hasCjk = /[\u2e80-\u9fff]/.test(line)
  if (!hasCjk || Array.from(line).length <= 3) {
    if (oneW <= NODE_MAX_W) return raw
  }
  const half = Math.max(FONT_SIZE * 2, (measureTextUnits(line) * FONT_SIZE) / 2)
  const wrapped = layoutSvgText(line, {
    maxWidth: half,
    fontSize: FONT_SIZE,
    maxLines: 2,
    balanceLines: true,
    minPt: FONT_SIZE,
  })
  return wrapped.lines.length > 0 ? wrapped.lines : raw
}

interface Aabb {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Resolve layout direction. An explicit `direction` on the component is respected.
 * When unspecified, lay out both TB and LR and keep the orientation that fits
 * the wide slide canvas with the larger scale (ties prefer LR — the 1280×720
 * page is landscape, so long chains read better horizontally).
 */
function resolveLayout(component: FlowchartComponent, w: number): {
  layout: Layout
  scale: number
} {
  // "TB" 是 schema 的历史默认值（存量 deck 全部烤死了 TB），视为自动候选。
  // 只有 TD/BT/LR/RL 这类刻意写出的方向才原样尊重。
  if (component.direction && component.direction !== "TB") {
    const layout = computeLayout(component, component.direction)
    return { layout, scale: fitScale(layout, w) }
  }
  const tb = computeLayout(component, "TB")
  const lr = computeLayout(component, "LR")
  const tbScale = fitScale(tb, w)
  const lrScale = fitScale(lr, w)
  return lrScale >= tbScale
    ? { layout: lr, scale: lrScale }
    : { layout: tb, scale: tbScale }
}

interface LayoutNode {
  id: string
  x: number
  y: number
  w: number
  h: number
  lines: string[]
  kind: "rect" | "diamond" | "round"
}

interface LayoutEdge {
  points: { x: number; y: number }[]
  label: string
}

interface Layout {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  width: number
  height: number
}

type Side = "N" | "S" | "E" | "W"

function almostEq(a: number, b: number): boolean {
  return Math.abs(a - b) < PATH_EPS
}

function collapseColinear(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const cleaned: { x: number; y: number }[] = []
  for (const p of pts) {
    const last = cleaned[cleaned.length - 1]
    if (last && almostEq(last.x, p.x) && almostEq(last.y, p.y)) continue
    cleaned.push(p)
  }
  const out: { x: number; y: number }[] = []
  for (let i = 0; i < cleaned.length; i++) {
    const b = cleaned[i]!
    if (out.length >= 1 && i < cleaned.length - 1) {
      const a = out[out.length - 1]!
      const c = cleaned[i + 1]!
      const colinear =
        (almostEq(a.x, b.x) && almostEq(b.x, c.x)) || (almostEq(a.y, b.y) && almostEq(b.y, c.y))
      if (colinear) continue
    }
    out.push(b)
  }
  return out
}

function pickSides(src: LayoutNode, tgt: LayoutNode): { from: Side; to: Side } {
  const dx = tgt.x + tgt.w / 2 - (src.x + src.w / 2)
  const dy = tgt.y + tgt.h / 2 - (src.y + src.h / 2)
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy >= 0 ? { from: "S", to: "N" } : { from: "N", to: "S" }
  }
  return dx >= 0 ? { from: "E", to: "W" } : { from: "W", to: "E" }
}

function outward(side: Side): { x: number; y: number } {
  if (side === "N") return { x: 0, y: -1 }
  if (side === "S") return { x: 0, y: 1 }
  if (side === "E") return { x: 1, y: 0 }
  return { x: -1, y: 0 }
}

function portOnSide(node: LayoutNode, side: Side, t: number): { x: number; y: number } {
  const u = Math.min(0.9, Math.max(0.1, t))
  let x: number
  let y: number
  if (side === "N") {
    x = node.x + u * node.w
    y = node.y
  } else if (side === "S") {
    x = node.x + u * node.w
    y = node.y + node.h
  } else if (side === "E") {
    x = node.x + node.w
    y = node.y + u * node.h
  } else {
    x = node.x
    y = node.y + u * node.h
  }
  const cx = node.x + node.w / 2
  const cy = node.y + node.h / 2
  const pull = node.kind === "diamond" ? 0.22 : 0.04
  return { x: x + (cx - x) * pull, y: y + (cy - y) * pull }
}

function routeOrthogonal(
  start: { x: number; y: number },
  startSide: Side,
  end: { x: number; y: number },
  endSide: Side,
): { x: number; y: number }[] {
  const so = outward(startSide)
  const eo = outward(endSide)
  const a1 = { x: start.x + so.x * PORT_STUB, y: start.y + so.y * PORT_STUB }
  const b1 = { x: end.x + eo.x * PORT_STUB, y: end.y + eo.y * PORT_STUB }
  const pts: { x: number; y: number }[] = [start, a1]
  if (!(almostEq(a1.x, b1.x) || almostEq(a1.y, b1.y))) {
    if (startSide === "N" || startSide === "S") pts.push({ x: b1.x, y: a1.y })
    else pts.push({ x: a1.x, y: b1.y })
  }
  pts.push(b1, end)
  return collapseColinear(pts)
}

function computeLayout(component: FlowchartComponent, direction: FlowDirection): Layout {
  const g = new dagre.graphlib.Graph()
  g.setGraph({
    rankdir: toRankdir(direction),
    nodesep: NODE_SEP,
    ranksep: RANK_SEP,
  })
  g.setDefaultEdgeLabel(() => ({}))

  for (const n of component.nodes) {
    const kind = n.kind ?? "rect"
    const lines = kind === "diamond" ? wrapDiamondLabel(n.label) : normalizeLabelLines(n.label)
    g.setNode(n.id, {
      width: kind === "diamond" ? diamondWidthForLines(lines) : nodeWidth(lines),
      height: nodeHeight(lines),
      lines,
      kind,
    })
  }
  const knownIds = new Set(component.nodes.map((n) => n.id))
  for (const e of component.edges) {
    if (!knownIds.has(e.from) || !knownIds.has(e.to)) continue
    // 边标签是单行元素：换行标记（<br/>、\n）归一化成空格。
    g.setEdge(e.from, e.to, {
      label: (e.label ?? "").replace(/<br\s*\/?>|\n/gi, " ").trim(),
    })
  }

  dagre.layout(g)

  const graphLabel = g.graph()
  const width = graphLabel.width ?? 400
  const height = graphLabel.height ?? 200

  const nodes: LayoutNode[] = g.nodes().flatMap((id) => {
    const n = g.node(id) as dagre.Node & {
      lines: string[]
      kind: "rect" | "diamond" | "round"
    }
    if (!n || !Number.isFinite(n.x) || !Number.isFinite(n.width)) return []
    return [
      {
        id,
        x: n.x - n.width / 2,
        y: n.y - n.height / 2,
        w: n.width,
        h: n.height,
        lines: n.lines,
        kind: n.kind,
      },
    ]
  })

  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const planned = component.edges.flatMap((e, edgeI) => {
    const from = nodeById.get(e.from)
    const to = nodeById.get(e.to)
    if (!from || !to) return []
    const sides = pickSides(from, to)
    return [
      {
        edgeI,
        from,
        to,
        sides,
        label: (e.label ?? "").replace(/<br\s*\/?>|\n/gi, " ").trim(),
      },
    ]
  })

  type FanItem = { edgeI: number; end: "from" | "to"; otherX: number; otherY: number }
  const groups = new Map<string, FanItem[]>()
  const addFan = (nodeId: string, side: Side, item: FanItem) => {
    const key = `${nodeId}\0${side}`
    const list = groups.get(key) ?? []
    list.push(item)
    groups.set(key, list)
  }
  for (const p of planned) {
    addFan(p.from.id, p.sides.from, {
      edgeI: p.edgeI,
      end: "from",
      otherX: p.to.x + p.to.w / 2,
      otherY: p.to.y + p.to.h / 2,
    })
    addFan(p.to.id, p.sides.to, {
      edgeI: p.edgeI,
      end: "to",
      otherX: p.from.x + p.from.w / 2,
      otherY: p.from.y + p.from.h / 2,
    })
  }

  const tOf = new Map<string, number>()
  for (const [key, items] of groups) {
    const side = key.split("\0")[1] as Side
    const sorted = [...items].sort((a, b) => {
      const primary = side === "N" || side === "S" ? a.otherX - b.otherX : a.otherY - b.otherY
      if (primary !== 0) return primary
      return a.edgeI - b.edgeI
    })
    const n = sorted.length
    const nodeId = key.split("\0")[0]!
    const host = nodeById.get(nodeId)
    const sideLen = host ? (side === "N" || side === "S" ? host.w : host.h) : NODE_H
    const cramped = n > 1 && sideLen / (n + 1) < PORT_FAN_MIN
    const usable = cramped ? Math.max(0.2, 1 - (PORT_FAN_MIN * 2) / Math.max(sideLen, 1)) : 1
    for (let k = 0; k < n; k++) {
      const item = sorted[k]!
      const t = cramped ? 0.5 - usable / 2 + (usable * k) / (n - 1) : (k + 1) / (n + 1)
      tOf.set(`${item.edgeI}:${item.end}`, t)
    }
  }

  const edges: LayoutEdge[] = planned.map((p) => {
    const tFrom = tOf.get(`${p.edgeI}:from`) ?? 0.5
    const tTo = tOf.get(`${p.edgeI}:to`) ?? 0.5
    const start = portOnSide(p.from, p.sides.from, tFrom)
    const end = portOnSide(p.to, p.sides.to, tTo)
    return {
      points: routeOrthogonal(start, p.sides.from, end, p.sides.to),
      label: p.label,
    }
  })

  return { nodes, edges, width, height }
}

function arrowGeometry(
  points: { x: number; y: number }[],
  scaleX: number,
  scaleY: number,
): { p1x: number; p1y: number; p2x: number; p2y: number; p3x: number; p3y: number } | null {
  if (points.length < 2) return null
  const tip = points[points.length - 1]!
  const prev = points[points.length - 2]!
  const dx = tip.x - prev.x
  const dy = tip.y - prev.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return null
  const ux = dx / len
  const uy = dy / len
  const px = -uy
  const py = ux
  const s = ARROW_SIZE
  const tx = tip.x * scaleX
  const ty = tip.y * scaleY
  const sx = s * scaleX
  const sy = s * scaleY
  return {
    p1x: tx,
    p1y: ty,
    p2x: tx - ux * sx + px * sy * 0.5,
    p2y: ty - uy * sy + py * sx * 0.5,
    p3x: tx - ux * sx - px * sy * 0.5,
    p3y: ty - uy * sy - py * sx * 0.5,
  }
}

/** Build a polygon arrowhead at the end of an edge path. */
function arrowPolygon(
  points: { x: number; y: number }[],
  scaleX: number,
  scaleY: number,
  color: string,
): React.ReactElement | null {
  const g = arrowGeometry(points, scaleX, scaleY)
  if (!g) return null
  return <polygon points={`${g.p1x},${g.p1y} ${g.p2x},${g.p2y} ${g.p3x},${g.p3y}`} fill={color} />
}

function arrowAabb(points: { x: number; y: number }[], scale: number): Aabb | null {
  const g = arrowGeometry(points, scale, scale)
  if (!g) return null
  const xs = [g.p1x, g.p2x, g.p3x]
  const ys = [g.p1y, g.p2y, g.p3y]
  const pad = 2
  const x = Math.min(...xs) - pad
  const y = Math.min(...ys) - pad
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y }
}

interface EdgeLabelVisual {
  x: number
  y: number
  text: string
  fontSize: number
  truncated: boolean
  chipX: number
  chipY: number
  chipW: number
  chipH: number
  /** Left edge / width of the *physical gap* (not the fitted chip) in the
   * same local pre-offset space as the fields above — independent of
   * whatever margin/padding choices the fit made, this is `computeLayout`'s
   * own geometry, so it is what `render()` bakes into the label's
   * `data-audit-box` (see the render-time comment for why that has to be a
   * different number than `chipX`/`chipW`). */
  boxX: number
  boxW: number
}

/**
 * Fit an edge's label to the gap it actually has to live in and lay out its
 * backing chip. `mid` (the label's anchor, `text-anchor="middle"`) is one of
 * the polyline's own vertices, not an interpolated point — for the common
 * direct-edge case dagre emits exactly 3 points (source boundary, true gap
 * midpoint, target boundary), so the points flanking the midpoint (skipping
 * over it) bound the *whole* visual gap the label sits in, not half of it.
 * That matches a horizontal (LR/RL) layout's node-to-node gap exactly; for a
 * vertical (TB/BT) layout it degrades to the rank gap, which is tighter but
 * still workable since TB diagrams are typically decision trees with short
 * 是/否-style labels rather than the long descriptive labels LR pipelines use.
 *
 * Returns `null` both when the edge has no label and when the gap is too
 * narrow for even one character to survive `fitSvgLine`'s shrink-then-
 * truncate fallback (see `MIN_LABEL_WIDTH`) — physically no room for
 * anything legible, so the label is omitted rather than rendered as a bare
 * "…" or empty string.
 */
function aabbOverlap(a: Aabb, b: Aabb): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function nodeNameSet(component: FlowchartComponent): Set<string> {
  const names = new Set<string>()
  for (const n of component.nodes) {
    const folded = n.label.replace(/<br\s*\/?>|\n/gi, " ").trim()
    if (folded) names.add(folded)
    for (const line of normalizeLabelLines(n.label)) {
      if (line) names.add(line)
    }
  }
  return names
}

function distPointToSeg(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function minDistChipToPolyline(chip: Aabb, pts: { x: number; y: number }[]): number {
  if (pts.length < 2) return Infinity
  const samples = [
    { x: chip.x, y: chip.y },
    { x: chip.x + chip.w, y: chip.y },
    { x: chip.x, y: chip.y + chip.h },
    { x: chip.x + chip.w, y: chip.y + chip.h },
    { x: chip.x + chip.w / 2, y: chip.y },
    { x: chip.x + chip.w / 2, y: chip.y + chip.h },
    { x: chip.x, y: chip.y + chip.h / 2 },
    { x: chip.x + chip.w, y: chip.y + chip.h / 2 },
  ]
  let gap = Infinity
  for (const p of samples) {
    for (let i = 0; i < pts.length - 1; i++) {
      gap = Math.min(gap, distPointToSeg(p, pts[i]!, pts[i + 1]!))
    }
  }
  return gap
}

/**
 * Park an edge label above/below a horizontal connector (or left/right of a
 * vertical one) so the chip sits outside the connected node boxes instead of
 * on the diamond vertices.
 */
function longestSegment(points: { x: number; y: number }[]): {
  a: { x: number; y: number }
  b: { x: number; y: number }
  len: number
} | null {
  if (points.length < 2) return null
  let best = 0
  let bestLen = -1
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len > bestLen) {
      bestLen = len
      best = i
    }
  }
  return { a: points[best]!, b: points[best + 1]!, len: bestLen }
}

function parkEdgeLabel(
  midX: number,
  midY: number,
  chipW: number,
  chipH: number,
  nodeBoxes: Aabb[],
  scale: number,
  horizontal: boolean,
  ownStroke: { x: number; y: number }[],
  otherStrokes: { x: number; y: number }[][],
  arrowBoxes: Aabb[],
  segA: { x: number; y: number },
  segB: { x: number; y: number },
): { x: number; y: number } | null {
  const chipAt = (cx: number, cy: number): Aabb => ({
    x: cx - chipW / 2,
    y: cy - chipH / 2,
    w: chipW,
    h: chipH,
  })
  const arrowPad = (ARROW_SIZE + 4) * scale
  let cx = midX
  let cy = midY
  if (horizontal) {
    const lo = Math.min(segA.x, segB.x) + arrowPad + chipW / 2
    const hi = Math.max(segA.x, segB.x) - arrowPad - chipW / 2
    if (lo <= hi) cx = Math.min(hi, Math.max(lo, cx))
  } else {
    const lo = Math.min(segA.y, segB.y) + arrowPad + chipH / 2
    const hi = Math.max(segA.y, segB.y) - arrowPad - chipH / 2
    if (lo <= hi) cy = Math.min(hi, Math.max(lo, cy))
  }
  const offsets = horizontal
    ? [
        { x: cx, y: cy - (LABEL_LINE_CLEAR + chipH / 2) },
        { x: cx, y: cy + (LABEL_LINE_CLEAR + chipH / 2) },
      ]
    : [
        { x: cx - (LABEL_LINE_CLEAR + chipW / 2), y: cy },
        { x: cx + (LABEL_LINE_CLEAR + chipW / 2), y: cy },
      ]
  const along = horizontal
    ? [
        { x: (Math.min(segA.x, segB.x) + Math.max(segA.x, segB.x)) / 2, y: cy },
      ]
    : [{ x: cx, y: (Math.min(segA.y, segB.y) + Math.max(segA.y, segB.y)) / 2 }]
  const extra = along.flatMap((p) =>
    horizontal
      ? [
          { x: p.x, y: p.y - (LABEL_LINE_CLEAR + chipH / 2) },
          { x: p.x, y: p.y + (LABEL_LINE_CLEAR + chipH / 2) },
        ]
      : [
          { x: p.x - (LABEL_LINE_CLEAR + chipW / 2), y: p.y },
          { x: p.x + (LABEL_LINE_CLEAR + chipW / 2), y: p.y },
        ],
  )
  const candidates = [...offsets, ...extra]
  const scored: { x: number; y: number; other: number }[] = []
  for (const c of candidates) {
    const chip = chipAt(c.x, c.y)
    if (nodeBoxes.some((n) => aabbOverlap(chip, n))) continue
    if (arrowBoxes.some((a) => aabbOverlap(chip, a))) continue
    const ownDist = minDistChipToPolyline(chip, ownStroke)
    if (ownDist < 6 || ownDist > 10.5) continue
    let other = Infinity
    let blocked = false
    for (const stroke of otherStrokes) {
      const d = minDistChipToPolyline(chip, stroke)
      if (d < 6) {
        blocked = true
        break
      }
      other = Math.min(other, d)
    }
    if (blocked) continue
    scored.push({ x: c.x, y: c.y, other })
  }
  if (scored.length === 0) return null
  scored.sort((a, b) => b.other - a.other)
  return { x: scored[0]!.x, y: scored[0]!.y }
}

function computeEdgeLabel(
  edge: LayoutEdge,
  scale: number,
  nodeBoxes: Aabb[],
  nodeNames: Set<string>,
  ownStroke: { x: number; y: number }[],
  otherStrokes: { x: number; y: number }[][],
  arrowBoxes: Aabb[],
): EdgeLabelVisual | null {
  if (!edge.label) return null
  if (nodeNames.has(edge.label)) return null
  const { points } = edge
  if (points.length < 2) return null
  const seg = longestSegment(points)
  if (!seg || seg.len < PATH_EPS) return null

  const mid = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 }
  const horizontal = Math.abs(seg.b.x - seg.a.x) >= Math.abs(seg.b.y - seg.a.y)
  const spanLocal = seg.len
  // Margin subtracted in local space *before* scaling (see LABEL_FIT_MARGIN)
  // so it shrinks together with the gap instead of eating a scale-independent
  // bite out of an already-scaled-down span.
  const availableWidth = Math.max(0, (spanLocal - LABEL_FIT_MARGIN) * scale)
  if (availableWidth < MIN_LABEL_WIDTH) return null

  const idealFont = Math.max(9, Math.min(16, Math.round(FONT_SIZE * scale)))
  const fitted = fitSvgLine(edge.label, {
    maxWidth: availableWidth,
    fontSize: idealFont,
    minFontSize: MIN_FONT_SIZE,
  })

  const labelW = measureTextUnits(fitted.text) * fitted.fontSize
  const chipW = labelW + LABEL_CHIP_PAD_X * 2
  const chipH = fitted.fontSize + LABEL_CHIP_PAD_Y * 2
  const parked = parkEdgeLabel(
    mid.x * scale,
    mid.y * scale,
    chipW,
    chipH,
    nodeBoxes,
    scale,
    horizontal,
    ownStroke,
    otherStrokes,
    arrowBoxes,
    { x: seg.a.x * scale, y: seg.a.y * scale },
    { x: seg.b.x * scale, y: seg.b.y * scale },
  )
  if (!parked) return null
  const x = parked.x
  const y = parked.y
  // The *un-margined* gap, centered on the same point as the chip/text —
  // deliberately wider than `availableWidth` (which already has the fit
  // margin taken out): this is the real physical space neighboring nodes
  // leave for the label, so auditing against it (rather than against the
  // chip's own self-referential size, which would always trivially pass)
  // actually re-checks the constraint the original bug violated — a label
  // spilling into a neighboring node card.
  const gapWidth = spanLocal * scale

  return {
    x,
    y,
    text: fitted.text,
    fontSize: fitted.fontSize,
    truncated: fitted.truncated,
    chipX: x - chipW / 2,
    chipY: y - chipH / 2,
    chipW,
    chipH,
    boxX: x - gapWidth / 2,
    boxW: gapWidth,
  }
}

interface PreparedFlow {
  layout: Layout
  scale: number
  labels: (EdgeLabelVisual | null)[]
  width: number
  height: number
}

/** Layout + parked labels, origin-shifted so every chip stays in positive local space. */
function prepareFlow(component: FlowchartComponent, w: number): PreparedFlow {
  const { layout, scale } = resolveLayout(component, w)
  const nodeBoxes: Aabb[] = layout.nodes.map((n) => ({
    x: n.x * scale,
    y: n.y * scale,
    w: n.w * scale,
    h: n.h * scale,
  }))
  const names = nodeNameSet(component)
  const strokes = layout.edges.map((e) => e.points.map((p) => ({ x: p.x * scale, y: p.y * scale })))
  const arrows = layout.edges
    .map((e) => arrowAabb(e.points, scale))
    .filter((b): b is Aabb => b !== null)
  const labels = layout.edges.map((edge, i) =>
    computeEdgeLabel(
      edge,
      scale,
      nodeBoxes,
      names,
      strokes[i]!,
      strokes.filter((_, j) => j !== i),
      arrows,
    ),
  )
  let minX = 0
  let minY = 0
  let maxX = layout.width * scale
  let maxY = layout.height * scale
  for (const n of nodeBoxes) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.w)
    maxY = Math.max(maxY, n.y + n.h)
  }
  for (const label of labels) {
    if (!label) continue
    minX = Math.min(minX, label.chipX)
    minY = Math.min(minY, label.chipY)
    maxX = Math.max(maxX, label.chipX + label.chipW)
    maxY = Math.max(maxY, label.chipY + label.chipH)
  }
  const ox = -minX
  const oy = -minY
  const shifted: Layout = {
    ...layout,
    nodes: layout.nodes.map((n) => ({ ...n, x: n.x + ox / scale, y: n.y + oy / scale })),
    edges: layout.edges.map((e) => ({
      ...e,
      points: e.points.map((p) => ({ x: p.x + ox / scale, y: p.y + oy / scale })),
    })),
  }
  const shiftedLabels = labels.map((label) =>
    label
      ? {
          ...label,
          x: label.x + ox,
          y: label.y + oy,
          chipX: label.chipX + ox,
          chipY: label.chipY + oy,
          boxX: label.boxX + ox,
        }
      : null,
  )
  return {
    layout: shifted,
    scale,
    labels: shiftedLabels,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function pathCoord(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * 正交圆角肘（2026-08-23 用户裁定，推翻 2026-07-14「一律曲线」）：共轴直段，
 * 非共轴走直角弯，弯角 Q r=8（紧时至少 6）。禁斜线。箭头仍用 polygon，
 * svg2pptx 会跳过 marker。
 */
function orthogonalRoundedPath(
  points: { x: number; y: number }[],
  sx: number,
  sy: number,
): string {
  const p = collapseColinear(points.map((q) => ({ x: q.x * sx, y: q.y * sy })))
  if (p.length === 0) return ""
  if (p.length === 1) return `M ${pathCoord(p[0]!.x)} ${pathCoord(p[0]!.y)}`
  if (p.length === 2) {
    return `M ${pathCoord(p[0]!.x)} ${pathCoord(p[0]!.y)} L ${pathCoord(p[1]!.x)} ${pathCoord(p[1]!.y)}`
  }
  let d = `M ${pathCoord(p[0]!.x)} ${pathCoord(p[0]!.y)}`
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1]!
    const b = p[i]!
    const c = p[i + 1]!
    const inLen = Math.hypot(b.x - a.x, b.y - a.y)
    const outLen = Math.hypot(c.x - b.x, c.y - b.y)
    let r = Math.min(CORNER_R, inLen / 2, outLen / 2)
    if (r < CORNER_R_MIN) r = r < 0.5 ? 0 : r
    const inDirX = Math.sign(b.x - a.x)
    const inDirY = Math.sign(b.y - a.y)
    const outDirX = Math.sign(c.x - b.x)
    const outDirY = Math.sign(c.y - b.y)
    const entryX = b.x - inDirX * r
    const entryY = b.y - inDirY * r
    const exitX = b.x + outDirX * r
    const exitY = b.y + outDirY * r
    d += ` L ${pathCoord(entryX)} ${pathCoord(entryY)}`
    if (r > 0) d += ` Q ${pathCoord(b.x)} ${pathCoord(b.y)} ${pathCoord(exitX)} ${pathCoord(exitY)}`
  }
  const last = p[p.length - 1]!
  d += ` L ${pathCoord(last.x)} ${pathCoord(last.y)}`
  return d
}

function focalNodeId(component: FlowchartComponent): string | null {
  const diamond = component.nodes.find((n) => n.kind === "diamond")
  if (diamond) return diamond.id
  const rounds = component.nodes.filter((n) => n.kind === "round")
  if (rounds.length > 0) return rounds[rounds.length - 1]!.id
  return component.nodes[component.nodes.length - 1]?.id ?? null
}

function nodeRx(kind: LayoutNode["kind"], knobs: FormKnobs): number {
  if (kind === "round") return 20
  if (knobs.radius === "square") return 0
  if (knobs.radius === "round") return 12
  return 6
}

function nodePaints(
  kind: LayoutNode["kind"],
  knobs: FormKnobs,
  ctx: ComponentCtx,
  focal: boolean,
): { fill: string; stroke: string; text: string } {
  const stroke =
    knobs.nodeStroke === "border" ? (ctx.colors.border ?? ctx.colors.muted) : ctx.colors.primary
  if (focal) {
    const fill = mixHex(ctx.colors.surface, ctx.colors.accent, 0.22)
    return { fill, stroke: ctx.colors.accent, text: readableOn(fill) }
  }
  if (kind === "round") {
    const fill = mixHex(ctx.colors.surface, ctx.colors.muted ?? ctx.colors.primary, 0.14)
    return { fill, stroke, text: readableOn(fill) }
  }
  if (knobs.nodeFill === "none") {
    return { fill: ctx.colors.bg, stroke, text: ctx.colors.text }
  }
  return { fill: ctx.colors.surface, stroke, text: ctx.colors.text }
}

export const flowchart: SvgComponent<FlowchartComponent> = {
  measure(component, w) {
    return prepareFlow(component, w).height
  },

  render(component, box, ctx) {
    const flow = prepareFlow(component, box.w)
    const { layout, scale, labels } = flow
    const scaleX = scale
    const scaleY = scale // uniform scale, bounded by width AND height
    // 宽屏画布下水平居中，避免整图贴左留出大片死白
    const dx = Math.max(0, (box.w - flow.width) / 2)
    const assignment = resolveComponentForm("flowchart", ctx.themeId)
    const typed = assignment?.form === "typed_nodes"
    const knobs = assignment?.knobs ?? {}
    const focalId = typed ? focalNodeId(component) : null

    return (
      <g transform={`translate(${box.x + dx},${box.y})`}>
        {/* Edges: lines + arrowheads only. Labels render in their own layer
            after the nodes (below) so a node card can never cover one. */}
        {layout.edges.map((edge, i) => {
          const d = orthogonalRoundedPath(edge.points, scaleX, scaleY)

          return (
            <Fragment key={`e${i}`}>
              <path
                d={d}
                fill="none"
                stroke={ctx.colors.muted}
                strokeWidth={STROKE_W}
              />
              {arrowPolygon(edge.points, scaleX, scaleY, ctx.colors.muted)}
            </Fragment>
          )
        })}

        {/* Nodes */}
        {layout.nodes.map((n) => {
          const nx = n.x * scaleX
          const ny = n.y * scaleY
          const nw = n.w * scaleX
          const nh = n.h * scaleY
          // 呼吸感：留白在局部预算（nodeWidth 的 NODE_PAD_X）与渲染预算里
          // 同值同源，并随 scale 缩放。diamond 按内接弦宽定盒，渲染用同一
          // 比例，不再按矩形定宽再砍 40%。
          const padX = NODE_PAD_X * scaleX
          const frac = n.kind === "diamond" ? diamondInscribedFrac(n.lines.length) : 1
          const usableW = nw * frac - padX * 2
          // 字号与盒宽预算同源（FONT_SIZE × scale）：图缩小时框和字同步小
          //（保底 10，diamond 在 scale≥1 时保底 12），放大时最大 18。
          const rawScaled = FONT_SIZE * scale
          const scaledFont = Math.max(
            n.kind === "diamond" ? Math.min(NODE_FONT_FLOOR, Math.max(MIN_FONT_SIZE, rawScaled)) : 10,
            Math.min(18, rawScaled),
          )
          const fits = n.lines.map((line) =>
            fitSvgLine(line, {
              maxWidth: Math.max(1, usableW),
              fontSize: scaledFont,
              minFontSize: MIN_FONT_SIZE,
            }),
          )
          // 多行共用同一字号（取各行 fit 的最小值）：小字号下更短的行天然放得下。
          const sharedFont = Math.min(...fits.map((f) => f.fontSize))
          const pitch = NODE_LINE_PITCH * scaleY
          const firstLineY =
            ny + nh / 2 - ((n.lines.length - 1) * pitch) / 2
          const paints = typed
            ? nodePaints(n.kind, knobs, ctx, n.id === focalId)
            : { fill: ctx.colors.surface, stroke: ctx.colors.primary, text: ctx.colors.text }
          const rx = typed ? nodeRx(n.kind, knobs) : n.kind === "round" ? 20 : 6

          return (
            <g key={n.id} data-flow-node="1">
              {n.kind === "diamond" ? (
                <polygon
                  points={`${nx + nw / 2},${ny} ${nx + nw},${ny + nh / 2} ${nx + nw / 2},${ny + nh} ${nx},${ny + nh / 2}`}
                  fill={paints.fill}
                  stroke={paints.stroke}
                  strokeWidth={STROKE_W}
                />
              ) : (
                <rect
                  x={nx}
                  y={ny}
                  width={nw}
                  height={nh}
                  rx={rx}
                  fill={paints.fill}
                  stroke={paints.stroke}
                  strokeWidth={STROKE_W}
                />
              )}
              {fits.map((fitted, i) => (
                <text
                  key={i}
                  data-truncated={fitted.truncated ? "1" : undefined}
                  x={nx + nw / 2}
                  y={firstLineY + i * pitch}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily={ctx.fonts.body}
                  fontSize={sharedFont}
                  fill={paints.text}
                >
                  {fitted.text}
                </text>
              ))}
            </g>
          )
        })}

        {/* Edge labels: own layer above the nodes, each fit to its gap and
            backed by a small chip so it stays legible whether it lands over
            open space, a crossing line, or (pre-fit, the reported bug) a
            neighboring node card. */}
        {labels.map((label, i) => {
          if (!label) return null
          return (
            <Fragment key={`l${i}`}>
              {/* `data-audit-box` carries the *gap's* geometry (label.boxX/
                  boxW), not the chip's own — the chip is sized from the
                  already-fitted text, so auditing text-against-its-own-chip
                  would always trivially pass. Auditing against the physical
                  gap re-checks the constraint this whole component exists for
                  (a label spilling past its gap into a neighboring node
                  card), the same way each node's own `data-audit-box` below
                  checks its label against the node's real box rather than
                  a self-fitted one. Baked in absolute page coordinates
                  (box.x + dx + local) to match `svg-audit.ts`'s contract:
                  it composes `<text>` coordinates against the accumulated
                  ancestor transform, but reads `data-audit-box` values
                  literally. */}
              <rect
                data-audit-box={`${box.x + dx + label.boxX},${box.y + label.chipY},${label.boxW}`}
                x={label.chipX}
                y={label.chipY}
                width={label.chipW}
                height={label.chipH}
                rx={LABEL_CHIP_RX}
                fill={ctx.colors.bg}
              />
              <text
                data-truncated={label.truncated ? "1" : undefined}
                x={label.x}
                y={label.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily={ctx.fonts.body}
                fontSize={label.fontSize}
                fill={ctx.colors.muted}
              >
                {label.text}
              </text>
            </Fragment>
          )
        })}
      </g>
    )
  },
}

export const renderDef: RenderDef<FlowchartComponent> = { type: "flowchart", measure: flowchart.measure, render: flowchart.render }
