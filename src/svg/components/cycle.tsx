import type { Component } from "@/ir"
import { fitSvgLine, layoutSvgText, truncateToUnits } from "../../lib/svg-text-layout"
import { readableOn } from "../ink"
import type { RenderDef, SvgComponent } from "./types"

type CycleComponent = Extract<Component, { type: "cycle" }>
type CycleItem = CycleComponent["items"][number]

/**
 * Ring layout (裁定 2, plan-cycle.md): nodes sit at equal angular steps
 * around a circle, angle = index/n * 2π measured from the top (12
 * o'clock), sweeping clockwise — a pure function of `n` and nothing else,
 * so the same IR always produces the same bytes. The connecting arrow
 * between adjacent nodes is a single SVG path `A` (arc) segment following
 * that same ring — the closing edge (last node back to the first) is drawn
 * by the exact same code as every other edge, not a special case, which is
 * the whole point: a cycle has no "back edge", every edge is the same kind
 * of edge.
 *
 * All local (pre-scale) constants below live in one shared coordinate
 * space centered on the ring's own center (0,0) — `resolveGeometry`
 * computes a single uniform `scale` (same fit-to-box idiom as
 * flowchart.tsx's `fitScale`) that the render pass multiplies every local
 * coordinate by, so node size, arc thickness's *reach*, and font size all
 * shrink together as `n` (or a long title/description) pushes the ring
 * past its box — "字号随 capacity 机制缩" via the one shared scale factor,
 * not a second, independently-tuned per-n formula.
 */

/** Node circle radius (local units) — fixed regardless of `n`; the ring's
 * own radius (see `ringRadius`) is what grows with `n` to keep a
 * consistent gap between nodes, not this. */
const NODE_R = 58
/** Minimum local edge-to-edge gap between adjacent node circles — enough
 * room for the connecting arc and its arrowhead to read clearly instead of
 * disappearing into the nodes it connects. */
const NODE_GAP = 40
/** Floor on the ring radius so a 3-4 node cycle doesn't collapse into a
 * cramped cluster near the center — `ringRadius`'s own derivation already
 * grows past this floor once `n` is large enough to need it. */
const MIN_RING_R = 120
/** Extra local clearance (beyond the node's own radius) an arc's endpoint
 * is pulled back before it touches a node — keeps the arrowhead visibly
 * clear of the node it points into instead of burying its tip under the
 * node's own fill. */
const ARC_CLEARANCE = 8
const ARC_STROKE_W = 2
const ARROW_SIZE = 9

const NODE_FONT_SIZE = 16
const NODE_MIN_FONT_SIZE = 10
/** Usable text width inside a node circle, as a fraction of its diameter —
 * the inscribed-rectangle approximation every circular-badge label in this
 * codebase uses (steps.tsx's numbered badge is the same idea at a smaller
 * scale), not an exact chord computation. */
const NODE_TEXT_W_RATIO = 0.72

const DESC_FONT_SIZE = 13
const DESC_MIN_FONT_SIZE = 9
const DESC_MAX_LINES = 2
const DESC_LINE_HEIGHT_RATIO = 1.3
/** Local width budget a description wraps within — deliberately generous
 * (outside the ring, nothing else contests this space radially). */
const DESC_W = 190
/** Local gap between a node's own outer edge and its description's inner edge. */
const GAP_NODE_DESC = 14

const TITLE_FONT_SIZE = 22
const TITLE_MIN_FONT_SIZE = 15
/** Local band height reserved above the ring for the optional overall `title`. */
const TITLE_BAND = 44
/** Local padding between the diagram's own top edge and the title's baseline. */
const TITLE_TOP_PAD = 6

/** Height (px) this component may occupy — same role as flowchart.tsx's
 * `MAX_FLOW_HEIGHT`: self-bounding so the ring always fits its content
 * rect instead of relying on layout.ts's box.h overflow-defense (which
 * this non-fullBody, non-truncating component never receives). */
const MAX_CYCLE_HEIGHT = 400
/** Matches flowchart.tsx's own upscale cap — a 3-node cycle in a wide
 * column shouldn't balloon past a size that still reads as "one diagram
 * among other content", even though it has plenty of room to. */
const MAX_UPSCALE = 1.3

interface Pt {
  x: number
  y: number
}

/** Node i's angle (radians), 0 at 12 o'clock, increasing clockwise (SVG's
 * y-down coordinate space makes increasing angle sweep visually clockwise —
 * verified against `pointOnCircle`'s own convention below). Pure function
 * of `(i, n)` only, per this file's own header comment. */
function nodeAngle(i: number, n: number): number {
  return -Math.PI / 2 + (i * 2 * Math.PI) / n
}

/** A point at `angle` on a circle of radius `r` centered at `center` — the
 * one trig primitive every other geometry helper in this file composes. */
function pointOnCircle(center: Pt, r: number, angle: number): Pt {
  return { x: center.x + r * Math.cos(angle), y: center.y + r * Math.sin(angle) }
}

/** Unit tangent direction at `angle` on a circle, facing the clockwise
 * (increasing-angle) direction of travel — the arrowhead's forward
 * direction at an arc's end point. */
function tangentAtAngle(angle: number): Pt {
  return { x: -Math.sin(angle), y: Math.cos(angle) }
}

/**
 * Ring radius (local units) for `n` nodes: derived, not guessed — the
 * radius that puts `n` equally-spaced `NODE_R`-sized circles exactly
 * `NODE_GAP` apart edge-to-edge (chord length = `2*NODE_R + NODE_GAP`,
 * solved for `r` via the regular-polygon chord formula
 * `chord = 2*r*sin(π/n)`), floored at `MIN_RING_R`. Grows with `n` (more
 * nodes need more circumference to keep the same per-node size and gap),
 * which is the intended "n 大时挤" pressure `resolveGeometry`'s scale-fit
 * absorbs uniformly, exactly like flowchart.tsx's dagre-produced layout
 * growing with node/edge count before `fitScale` shrinks it back down.
 */
function ringRadius(n: number): number {
  const chord = 2 * NODE_R + NODE_GAP
  return Math.max(MIN_RING_R, chord / (2 * Math.sin(Math.PI / n)))
}

interface CycleGeometry {
  n: number
  ringR: number
  scale: number
  hasTitle: boolean
  descBlockH: number
  /** Local-space offset from the diagram's top-left to the ring's own
   * center — every node/arc/description coordinate is computed relative to
   * the ring center, then this offset (already scaled) places it inside
   * the top-left-anchored `<g>` the render pass translates to `box.x/y`. */
  originX: number
  originY: number
}

/** Whichever item carries the longest description, if any — the local
 * bounding box only needs one conservative per-side reservation, not a
 * per-node one (`resolveGeometry`'s own doc comment). */
function anyHasDescription(component: CycleComponent): boolean {
  return component.items.some((it) => !!it.description?.trim())
}

/**
 * Pure geometry resolution, shared by `measure` and `render` (flowchart.tsx's
 * `resolveLayout` precedent): local bounding box -> uniform scale that fits
 * both `w` and `MAX_CYCLE_HEIGHT` -> the ring center's own offset within
 * that box. A conservative *square* local footprint around the ring
 * (`ringR + NODE_R` on every side, plus a flat description/title
 * reservation when either is present) rather than an exact per-node bbox —
 * safe over-approximation, same posture flowchart.tsx's own `fitScale`
 * takes with dagre's reported width/height.
 */
function resolveGeometry(component: CycleComponent, w: number): CycleGeometry {
  const n = component.items.length
  const ringR = ringRadius(n)
  const hasTitle = !!component.title?.trim()
  const hasDesc = anyHasDescription(component)
  const descBlockH = DESC_MAX_LINES * Math.round(DESC_FONT_SIZE * DESC_LINE_HEIGHT_RATIO)
  const halfExtent = ringR + NODE_R + (hasDesc ? GAP_NODE_DESC + Math.max(DESC_W, descBlockH) : 0)
  const localWidth = 2 * halfExtent
  const localHeight = 2 * halfExtent + (hasTitle ? TITLE_BAND : 0)
  const scale = Math.min(w / localWidth, MAX_CYCLE_HEIGHT / localHeight, MAX_UPSCALE)
  return {
    n,
    ringR,
    scale,
    hasTitle,
    descBlockH,
    originX: halfExtent * scale,
    originY: (halfExtent + (hasTitle ? TITLE_BAND : 0)) * scale,
  }
}

/** Fit one node's label to a single line inside its circle (shrink, then
 * ellipsis-truncate at the floor — same fallback ladder every other
 * self-painted-shape label in this codebase uses). `fontFamily` threaded
 * through explicitly (CJK measurement precedent, 裁定 4). */
function fitNodeLabel(label: string, scale: number, fontFamily: string) {
  return fitSvgLine(label, {
    maxWidth: 2 * NODE_R * NODE_TEXT_W_RATIO * scale,
    fontSize: Math.max(NODE_MIN_FONT_SIZE, Math.round(NODE_FONT_SIZE * scale)),
    minFontSize: NODE_MIN_FONT_SIZE,
    fontFamily,
  })
}

/** Wrap+fit one node's outside description (up to `DESC_MAX_LINES` lines) —
 * mirrors steps.tsx's `layoutStepItem` defensive post-wrap truncation:
 * `layoutSvgText` itself never truncates (it only wraps/shrinks/merges), so
 * a line that's still too wide after merging past `maxLines` gets an
 * explicit `truncateToUnits` pass. */
function fitDescription(text: string, scale: number, fontFamily: string) {
  const maxWidth = DESC_W * scale
  const wrapped = layoutSvgText(text, {
    maxWidth,
    fontSize: Math.max(DESC_MIN_FONT_SIZE, Math.round(DESC_FONT_SIZE * scale)),
    maxLines: DESC_MAX_LINES,
    lineHeightRatio: DESC_LINE_HEIGHT_RATIO,
    fontFamily,
  })
  const maxUnits = maxWidth / wrapped.fontSize
  const lines = wrapped.lines.map((line) => truncateToUnits(line, maxUnits))
  const truncated = lines.some((line, i) => line !== wrapped.lines[i])
  return { ...wrapped, lines, truncated }
}

export const cycle: SvgComponent<CycleComponent> = {
  measure(component, w) {
    const g = resolveGeometry(component, w)
    const halfExtent = g.ringR + NODE_R + (anyHasDescription(component) ? GAP_NODE_DESC + Math.max(DESC_W, g.descBlockH) : 0)
    const localHeight = 2 * halfExtent + (g.hasTitle ? TITLE_BAND : 0)
    return localHeight * g.scale
  },

  render(component, box, ctx) {
    const g = resolveGeometry(component, box.w)
    const { n, ringR, scale } = g
    // Horizontal centering, same idiom as flowchart.tsx's `dx`: the local
    // footprint is a fixed square regardless of box width, so a wide
    // column leaves the ring centered rather than pinned to the left edge.
    const halfExtent = g.originX / scale
    const dx = Math.max(0, (box.w - 2 * halfExtent * scale) / 2)
    const originAbsX = box.x + dx + g.originX
    const originAbsY = box.y + g.originY

    const nodeAngles = component.items.map((_, i) => nodeAngle(i, n))
    // Angular half-margin (chord-based, exact for a circular clearance
    // radius on a circle of radius `ringR`) an arc's endpoint is pulled
    // back from its node's own angle, so the arc's visible portion starts
    // and ends just outside the node circles rather than diving underneath
    // them — same role as flowchart.tsx's `LABEL_FIT_MARGIN`, a physical
    // clearance kept in local (pre-scale) units.
    const clearanceR = NODE_R + ARC_CLEARANCE
    const margin = 2 * Math.asin(Math.min(1, clearanceR / (2 * ringR)))

    return (
      <g transform={`translate(${originAbsX},${originAbsY})`}>
        {/* Arcs drawn first — nodes painted on top cover the portion of
            each arc that geometrically sits under a node circle (both node
            and the arc it's the endpoint of live at the same ring radius,
            per this file's own header comment), leaving only the visible
            connecting gap. */}
        {nodeAngles.map((a0, i) => {
          const a1 = nodeAngles[(i + 1) % n]! + (i === n - 1 ? 2 * Math.PI : 0)
          const start = pointOnCircle({ x: 0, y: 0 }, ringR, a0 + margin)
          const endAngle = a1 - margin
          const end = pointOnCircle({ x: 0, y: 0 }, ringR, endAngle)
          const tangent = tangentAtAngle(endAngle)
          const sx = start.x * scale
          const sy = start.y * scale
          const ex = end.x * scale
          const ey = end.y * scale
          const s = ARROW_SIZE * scale
          const perp = { x: -tangent.y, y: tangent.x }
          const baseX = ex - tangent.x * s
          const baseY = ey - tangent.y * s
          return (
            <g key={`edge-${i}`}>
              <path
                d={`M ${sx} ${sy} A ${ringR * scale} ${ringR * scale} 0 0 1 ${ex} ${ey}`}
                fill="none"
                stroke={ctx.colors.muted}
                strokeWidth={ARC_STROKE_W}
              />
              <polygon
                points={`${ex},${ey} ${baseX + perp.x * s * 0.5},${baseY + perp.y * s * 0.5} ${baseX - perp.x * s * 0.5},${baseY - perp.y * s * 0.5}`}
                fill={ctx.colors.muted}
              />
            </g>
          )
        })}

        {/* Nodes: filled circle + label, ink resolved via readableOn
            against the node's own fill (裁定 2). */}
        {component.items.map((item: CycleItem, i) => {
          const a = nodeAngles[i]!
          const pos = pointOnCircle({ x: 0, y: 0 }, ringR, a)
          const cx = pos.x * scale
          const cy = pos.y * scale
          const r = NODE_R * scale
          const fit = fitNodeLabel(item.label, scale, ctx.fonts.body)
          const ink = readableOn(ctx.colors.primary)
          return (
            <g
              key={`node-${i}`}
              data-audit-box={`${originAbsX + cx - r},${originAbsY + cy - r},${2 * r}`}
            >
              <circle cx={cx} cy={cy} r={r} fill={ctx.colors.primary} />
              <text
                data-truncated={fit.truncated ? "1" : undefined}
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily={ctx.fonts.body}
                fontSize={fit.fontSize}
                fontWeight="600"
                fill={ink}
              >
                {fit.text}
              </text>
            </g>
          )
        })}

        {/* Descriptions: outside each node, along its own radial (outward)
            direction — never inward, so a top-half node's caption grows
            upward (away from the ring's interior) instead of drifting back
            toward the center (裁定 2's "放节点外侧"). */}
        {component.items.map((item: CycleItem, i) => {
          if (!item.description?.trim()) return null
          const a = nodeAngles[i]!
          const outward = { x: Math.cos(a), y: Math.sin(a) }
          const anchorR = ringR + NODE_R + GAP_NODE_DESC
          const anchor = pointOnCircle({ x: 0, y: 0 }, anchorR, a)
          const ax = anchor.x * scale
          const ay = anchor.y * scale
          const desc = fitDescription(item.description, scale, ctx.fonts.body)
          const textAnchor = outward.x > 0.3 ? "start" : outward.x < -0.3 ? "end" : "middle"
          const stackUp = outward.y < 0
          const totalH = desc.lines.length * desc.lineHeight
          const topY = stackUp ? ay - totalH : ay
          return (
            <g key={`desc-${i}`}>
              {desc.lines.map((line, li) => (
                <text
                  key={li}
                  data-truncated={desc.truncated ? "1" : undefined}
                  x={ax}
                  y={topY + li * desc.lineHeight + desc.fontSize}
                  textAnchor={textAnchor}
                  fontFamily={ctx.fonts.body}
                  fontSize={desc.fontSize}
                  fill={ctx.colors.muted}
                >
                  {line}
                </text>
              ))}
            </g>
          )
        })}

        {/* Optional overall title — centered above the ring. */}
        {g.hasTitle &&
          (() => {
            const title = fitSvgLine(component.title!, {
              maxWidth: 2 * halfExtent * scale,
              fontSize: Math.max(TITLE_MIN_FONT_SIZE, Math.round(TITLE_FONT_SIZE * scale)),
              minFontSize: TITLE_MIN_FONT_SIZE,
              bold: true,
              fontFamily: ctx.fonts.heading,
            })
            return (
              <text
                data-truncated={title.truncated ? "1" : undefined}
                x={0}
                // Baseline sits `TITLE_TOP_PAD + TITLE_FONT_SIZE` below the
                // diagram's own top edge (box top = `halfExtent + TITLE_BAND`
                // above the ring center/origin) — always strictly above the
                // ring's own top edge (`-halfExtent*scale`, see `g.originX`'s
                // doc comment) since `TITLE_BAND` was sized to hold exactly
                // one line at `TITLE_FONT_SIZE` plus this padding.
                y={(-(halfExtent + TITLE_BAND) + TITLE_FONT_SIZE + TITLE_TOP_PAD) * scale}
                textAnchor="middle"
                fontFamily={ctx.fonts.heading}
                fontSize={title.fontSize}
                fontWeight="700"
                fill={ctx.colors.text}
              >
                {title.text}
              </text>
            )
          })()}
      </g>
    )
  },
}

export const renderDef: RenderDef<CycleComponent> = { type: "cycle", measure: cycle.measure, render: cycle.render }
