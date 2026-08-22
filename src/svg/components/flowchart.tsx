import { Fragment } from "react"
import dagre from "dagre"
import type { Component } from "@/ir"
import {
  fitSvgLine,
  layoutSvgText,
  measureTextUnits,
} from "../../lib/svg-text-layout"
import type { RenderDef, SvgComponent } from "./types"

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
/** Page-space gap between an edge-label chip and the nearest node box. */
const LABEL_NODE_CLEAR = 6
const STROKE_W = 1.5
const ARROW_SIZE = 6
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
  for (const e of component.edges) {
    // 边标签是单行元素：换行标记（<br/>、\n）归一化成空格。
    g.setEdge(e.from, e.to, {
      label: (e.label ?? "").replace(/<br\s*\/?>|\n/gi, " ").trim(),
    })
  }

  dagre.layout(g)

  const graphLabel = g.graph()
  const width = graphLabel.width ?? 400
  const height = graphLabel.height ?? 200

  const nodes: LayoutNode[] = g.nodes().map((id) => {
    const n = g.node(id) as dagre.Node & {
      lines: string[]
      kind: "rect" | "diamond" | "round"
    }
    return {
      id,
      x: n.x - n.width / 2,
      y: n.y - n.height / 2,
      w: n.width,
      h: n.height,
      lines: n.lines,
      kind: n.kind,
    }
  })

  const edges: LayoutEdge[] = g.edges().map((e) => {
    const edge = g.edge(e) as { points: { x: number; y: number }[]; label?: string }
    return {
      points: edge.points,
      label: edge.label ?? "",
    }
  })

  return { nodes, edges, width, height }
}

/** Build a polygon arrowhead at the end of an edge path. */
function arrowPolygon(
  points: { x: number; y: number }[],
  scaleX: number,
  scaleY: number,
  color: string,
): React.ReactElement | null {
  if (points.length < 2) return null
  const tip = points[points.length - 1]
  const prev = points[points.length - 2]
  const dx = tip.x - prev.x
  const dy = tip.y - prev.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return null

  const ux = dx / len
  const uy = dy / len
  // perpendicular
  const px = -uy
  const py = ux

  const s = ARROW_SIZE
  const tx = tip.x * scaleX
  const ty = tip.y * scaleY
  const sx = s * scaleX
  const sy = s * scaleY

  // Three points: tip, and two base corners
  const p1x = tx
  const p1y = ty
  const p2x = tx - ux * sx + px * sy * 0.5
  const p2y = ty - uy * sy + py * sx * 0.5
  const p3x = tx - ux * sx - px * sy * 0.5
  const p3y = ty - uy * sy - py * sx * 0.5

  return (
    <polygon
      points={`${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}`}
      fill={color}
    />
  )
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
function boxesContainingPoint(p: { x: number; y: number }, nodeBoxes: Aabb[], scale: number): Aabb[] {
  const x = p.x * scale
  const y = p.y * scale
  const slop = Math.max(4, 4 * scale)
  return nodeBoxes.filter(
    (n) => x >= n.x - slop && x <= n.x + n.w + slop && y >= n.y - slop && y <= n.y + n.h + slop,
  )
}

function connectedNodeBoxes(edge: LayoutEdge, nodeBoxes: Aabb[], scale: number): Aabb[] {
  const start = edge.points[0]
  const end = edge.points[edge.points.length - 1]
  if (!start || !end) return []
  const out: Aabb[] = []
  for (const n of [...boxesContainingPoint(start, nodeBoxes, scale), ...boxesContainingPoint(end, nodeBoxes, scale)]) {
    if (!out.some((o) => o.x === n.x && o.y === n.y && o.w === n.w && o.h === n.h)) out.push(n)
  }
  return out
}

function aabbOverlap(a: Aabb, b: Aabb): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/**
 * Park an edge label above/below a horizontal connector (or left/right of a
 * vertical one) so the chip sits outside the connected node boxes instead of
 * on the diamond vertices.
 */
function parkEdgeLabel(
  x: number,
  y: number,
  chipW: number,
  chipH: number,
  edge: LayoutEdge,
  nodeBoxes: Aabb[],
  scale: number,
): { x: number; y: number } {
  const { points } = edge
  const midIdx = Math.floor(points.length / 2)
  const mid = points[midIdx]
  const before = points[Math.max(0, midIdx - 1)]
  const after = points[Math.min(points.length - 1, midIdx + 1)]
  if (!mid || !before || !after) return { x, y }
  const horizontal = Math.abs(after.x - before.x) >= Math.abs(after.y - before.y)
  const lean = horizontal ? mid.y - (before.y + after.y) / 2 : mid.x - (before.x + after.x) / 2
  const preferPositive = lean > 0.5
  const connected = connectedNodeBoxes(edge, nodeBoxes, scale)
  const hit = connected.length > 0 ? connected : nodeBoxes
  if (hit.length === 0) return { x, y }
  const signs = preferPositive ? [1, -1] : [-1, 1]
  const chipAt = (cx: number, cy: number): Aabb => ({
    x: cx - chipW / 2,
    y: cy - chipH / 2,
    w: chipW,
    h: chipH,
  })
  const overlaps = (cx: number, cy: number) => nodeBoxes.some((n) => aabbOverlap(chipAt(cx, cy), n))

  const candidates: { x: number; y: number }[] = []
  if (horizontal) {
    const top = Math.min(...hit.map((n) => n.y))
    const bot = Math.max(...hit.map((n) => n.y + n.h))
    for (const s of signs) {
      candidates.push(
        s < 0
          ? { x, y: top - LABEL_NODE_CLEAR - chipH / 2 }
          : { x, y: bot + LABEL_NODE_CLEAR + chipH / 2 },
      )
    }
  } else {
    const left = Math.min(...hit.map((n) => n.x))
    const right = Math.max(...hit.map((n) => n.x + n.w))
    for (const s of signs) {
      candidates.push(
        s < 0
          ? { x: left - LABEL_NODE_CLEAR - chipW / 2, y }
          : { x: right + LABEL_NODE_CLEAR + chipW / 2, y },
      )
    }
  }
  return candidates.find((c) => !overlaps(c.x, c.y)) ?? candidates[0] ?? { x, y }
}

function computeEdgeLabel(edge: LayoutEdge, scale: number, nodeBoxes: Aabb[]): EdgeLabelVisual | null {
  if (!edge.label) return null
  const { points } = edge
  const midIdx = Math.floor(points.length / 2)
  const mid = points[midIdx]
  if (!mid) return null

  const before = points[Math.max(0, midIdx - 1)]
  const after = points[Math.min(points.length - 1, midIdx + 1)]
  const spanLocal = Math.hypot(after.x - before.x, after.y - before.y)
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
  const parked = parkEdgeLabel(mid.x * scale, mid.y * scale, chipW, chipH, edge, nodeBoxes, scale)
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
  const labels = layout.edges.map((edge) => computeEdgeLabel(edge, scale, nodeBoxes))
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

/**
 * 平滑 edge 路径（2026-07-14 用户裁决：流程图连线用曲线不用折线）：把
 * dagre 路由的折点用 Catmull-Rom → 三次贝塞尔连成平滑曲线。端点钳制
 * （首/末点重复）使起止切线沿首/末段方向，箭头（用末两点算方向）仍贴合。
 * 共线折点得到的曲线退化为直线（不硬弯），<3 点直连。svg2pptx 支持 C。
 */
function smoothEdgePath(
  points: { x: number; y: number }[],
  sx: number,
  sy: number,
): string {
  const p = points.map((q) => ({ x: q.x * sx, y: q.y * sy }))
  if (p.length < 3) {
    return p.map((q, j) => `${j === 0 ? "M" : "L"} ${q.x} ${q.y}`).join(" ")
  }
  let d = `M ${p[0].x} ${p[0].y}`
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i === 0 ? 0 : i - 1]
    const p1 = p[i]
    const p2 = p[i + 1]
    const p3 = p[i + 2 < p.length ? i + 2 : p.length - 1]
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`
  }
  return d
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

    return (
      <g transform={`translate(${box.x + dx},${box.y})`}>
        {/* Edges: lines + arrowheads only. Labels render in their own layer
            after the nodes (below) so a node card can never cover one. */}
        {layout.edges.map((edge, i) => {
          const d = smoothEdgePath(edge.points, scaleX, scaleY)

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

          return (
            <g key={n.id} data-flow-node="1">
              {n.kind === "diamond" ? (
                <polygon
                  points={`${nx + nw / 2},${ny} ${nx + nw},${ny + nh / 2} ${nx + nw / 2},${ny + nh} ${nx},${ny + nh / 2}`}
                  fill={ctx.colors.surface}
                  stroke={ctx.colors.primary}
                  strokeWidth={STROKE_W}
                />
              ) : (
                <rect
                  x={nx}
                  y={ny}
                  width={nw}
                  height={nh}
                  rx={n.kind === "round" ? 20 : 6}
                  fill={ctx.colors.surface}
                  stroke={ctx.colors.primary}
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
                  fill={ctx.colors.text}
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
