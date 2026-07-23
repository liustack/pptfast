import type { Component } from "@/ir"
import { fitSvgLine, measureTextUnits } from "../../lib/svg-text-layout"
import { rotateChartPalette } from "../chart-palette"
import { accessibleInk } from "../ink"
import type { SvgComponent } from "./types"

type SankeyComponent = Extract<Component, { type: "sankey" }>

/**
 * Layered flow diagram (structure-components wave 2 task 3 — the wave's
 * largest component and its sharpest differentiator): Anthropic's own
 * official pptx-authoring skill classifies a sankey as "PowerPoint has no
 * native form for this" and ships it as a rasterized image. This component
 * routes every node bar (native `<rect>`) and flow band (a cubic-bezier
 * `<path>`) through the existing SVG -> custGeom pipeline
 * (`pptx/svg2pptx/path.ts`'s `pathToOp`/`segsToOp` — a single fully generic
 * SVG-path-grammar walker with no per-shape idiom branches anywhere in that
 * file. M/L/C/Z is exactly the command set it already handles for every
 * `<path>` this codebase emits, this one included — verified by
 * `generate-sankey-export.test.ts`'s zero-p:pic assertion) — the export
 * carries zero `<p:pic>` for this component, natively editable vectors, not
 * a picture of a chart.
 *
 * **Layout: deterministic, hand-rolled — deliberately not dagre.**
 * `flowchart.tsx` is this codebase's existing dagre consumer, and dagre is
 * available, but a sankey's node *height* must be proportional to its total
 * through-flow (value-driven geometry, plan task 3 item 2) — dagre lays out
 * fixed-size boxes, it has no notion of a node's size being a function of
 * the edges touching it, so reusing it here would only buy the x-axis
 * (layer) assignment while still requiring a fully custom y-axis (value
 * stacking) pass on top. Given that, this file owns 100% of the geometry
 * itself end to end ("engine owns geometry", `docs/concepts.md`'s settled
 * decision) rather than splitting one diagram's layout across two different
 * algorithms with two different determinism stories to audit. Every step
 * below is pure arithmetic over `nodes`/`links` in their *authored array
 * order* — no `Math.random`, no `Date`, and every `Map`/`Set` is only ever
 * read via `.get(id)` keyed off that array order, never iterated directly
 * for a result-order-sensitive purpose — so two renders of the same
 * component are byte-identical by construction (pinned directly:
 * `sankey.test.tsx`'s "determinism" describe block, a multi-layer and a
 * dense-crossing-topology fixture, both rendered twice and diffed as
 * strings).
 *
 * **Layer assignment** (`computeLayers`): longest path from any source
 * (in-degree 0) via Kahn's algorithm with relaxation — `layer[v] =
 * max(layer[v], layer[u]+1)` on every `u -> v` edge, processed in
 * topological order. The initial queue is `nodes` filtered to in-degree 0
 * (authored order), and every subsequent enqueue walks a node's outgoing
 * links in the order `links` declared them — so the *traversal* order is
 * deterministic even though the resulting layer *values* are a pure
 * structural fact of the graph (any valid topological order yields the same
 * values). Schema-level cycle rejection (`ir/index.ts`'s `.superRefine`)
 * guarantees this terminates for any document that reached render through
 * `validateIr`. A defensive fallback below still terminates (never hangs)
 * for a hand-built `ComponentCtx`/component object that skipped validation
 * (e.g. a unit test), by dumping any node Kahn's couldn't resolve into one
 * trailing layer rather than looping forever.
 *
 * **Disconnected nodes render standalone, not rejected** (plan task 3 item
 * 4's explicit "decide with rationale"): a node with no links has in-degree
 * 0 by construction, so it lands in layer 0 automatically, no special case
 * needed. Rejecting it would punish a rough, legitimate graph description
 * (a model naming a node it hasn't wired up flows for yet) for a property
 * that costs nothing to render honestly — the same permissive posture this
 * codebase already takes for e.g. an empty optional field elsewhere.
 *
 * **Node weight -> height** (`nodeWeight`): a node's rendered height is
 * proportional to `max(inSum, outSum)` when it has both an inbound and
 * outbound side (the standard "a pass-through node is at least as tall as
 * its busier side" convention — this renderer does not force artificial
 * flow conservation), or whichever sum is nonzero for a pure source/sink.
 * A fully disconnected node falls back to the smallest real link value in
 * the diagram (`fallbackWeight`) — a deterministic, data-derived size
 * rather than an arbitrary constant, so it reads as "small" relative to
 * whatever else is on the page instead of an unrelated fixed number.
 *
 * **Value -> pixel scale, budgeted not exploded** (`computeValueScale` —
 * cite the EMU/clamp lesson `chart-svg.tsx`'s `MAX_CHART_GEOMETRY_PX` names,
 * plan task 3 item 2's "no absolute-value geometry explosions"): unlike
 * that clamp, which bounds an *unanchored* ratio-scaled extent (a bar chart
 * value has no fixed total to fit inside), a sankey's node stack has a
 * hard, known ceiling — the content box's own height — so the scale is
 * solved backward from that ceiling instead of forward from the raw value:
 * `scale = min` over every layer of `(availableHeight - thatLayer'sGapBudget)
 * / thatLayer'sTotalWeight`. The most-loaded layer is always the binding
 * constraint, and every other, lighter layer necessarily fits with room to
 * spare — there is no code path that can scale a value into an
 * off-canvas/EMU-overflow extent the way an unanchored ratio can, so no
 * `MAX_CHART_GEOMETRY_PX`-style ceiling is needed here (mirrors
 * `heatmap.tsx`'s own "values feed a bounded quantity, not an absolute
 * extent" reasoning, confirmed empirically the same way:
 * `generate-sankey-export.test.ts`'s 1:10000-ratio fixture exports cleanly
 * through the real `generatePptx`). `MIN_NODE_H`/`MIN_BAND_H` still floor
 * an individual tiny-but-positive value at a visible minimum thickness
 * (plan task 3 item 4's "bands floor at visible minimum" decision, chosen
 * over dropping — a dropped band would silently misrepresent the graph's
 * own declared topology) — the one place this component deliberately lets
 * the tightest layer's total run a few px past `availableHeight`, bounded by
 * `node/link count * floor`, never by the value ratio itself, so it can
 * never explode.
 *
 * **Band opacity is a deliberate contrast-safety choice, not just a look**
 * (plan task 3 item 3's "DECORATIVE_ALPHA threshold awareness"): bands
 * cross each other and cross the horizontal gap where a neighboring node's
 * label sits, so `BAND_OPACITY` (0.45) is chosen to sit *below*
 * `deck-audit.ts`'s `MIN_BG_OPACITY` (0.5) — the gate that decides whether a
 * painted shape becomes a contrast-attribution background candidate at all
 * (`docs/contrast-system.md`'s "Audit measurement" section). Below that
 * floor, a band can **never** be mis-picked as a label's background, no
 * matter how a label's box happens to overlap a band's own (approximate,
 * AABB-based — the generic `pathBoundingBox` fallback, since a sankey
 * ribbon isn't the donut/pie idiom `parseWedgePath` special-cases) bounding
 * box. This sidesteps the whole attribution-precision question by
 * construction instead of relying on exact non-overlap, which layered
 * diagrams can't generally guarantee. Every node label therefore always
 * resolves against the real page background (`ctx.defaultBg ??
 * ctx.colors.bg`) regardless of which bands visually pass behind it —
 * confirmed, not just asserted, by `full-matrix-contrast.test.ts`'s
 * dense-crossing 13-theme sweep.
 *
 * **Band color and node color are deliberately different roles**: a band's
 * fill is keyed to its *source* node's stable index into `chartPalette`
 * (`rotateChartPalette(ctx.colors.chartPalette, ctx.chartPaletteOffset ??
 * 0)` — the same per-deck seed-phase rotation `chart.tsx` already opts into,
 * verified by this file's own "ctx.chartPaletteOffset rotates band colors"
 * test) — every band
 * leaving one node reads as one consistent color, the conventional sankey
 * reading ("trace this source's share downstream"). A node's own bar stays
 * a flat, unblended `colors.surface` (the same "flat-surface" class
 * `icon_cards.tsx`/`kpi.tsx`'s card shells already are, pre-verified at
 * 4.5:1 by the bento-panel contrast check) — coloring the *node* by
 * palette would be ambiguous for a pass-through node with multiple
 * differently-colored inbound bands, so nodes stay neutral and only bands
 * carry the palette.
 *
 * **No text ever renders on a band or a node bar's own fill beyond the
 * label itself**: link values are deliberately not drawn as text (unlike
 * `heatmap.tsx`'s optional `show_values`) — keeping this file to exactly
 * one text-bearing surface (the node label, always on the page background)
 * avoids a second self-painted-surface contrast chain to maintain for a v1
 * scope the plan does not ask for. `MUTED_SURFACE_CLASS["sankey"]` is
 * therefore `"no-muted-fill"` — this component never renders `colors.muted`
 * at all, node labels use `colors.text` routed through `accessibleInk`.
 */

const NODE_W = 18
const NODE_GAP = 14
const MIN_NODE_H = 6
const MIN_BAND_H = 3
const LABEL_GAP = 8
const MAX_LABEL_W = 150
const LABEL_FONT = 12.5
const LABEL_MIN_FONT = 9.5
/** Natural (unstretched) fallback height — full-body geometry is always
 * driven by the given `box.h` at render time (`checkFullBodyExclusivity`
 * guarantees this is always the slide's sole component), so this only
 * matters for a caller that invokes `measure`/`render` directly without
 * going through the full-body path (mirrors `waterfall.tsx`/`gantt.tsx`'s
 * own `NATURAL_H`). */
const NATURAL_H = 420
/**
 * Below `deck-audit.ts`'s `MIN_BG_OPACITY` (0.5) by design — see this file's
 * own header comment, "Band opacity is a deliberate contrast-safety choice".
 */
const BAND_OPACITY = 0.45

interface Layout {
  nodes: LayoutNode[]
  links: LayoutLink[]
  layerCount: number
}

interface LayoutNode {
  id: string
  label: string
  x: number
  y: number
  h: number
  layer: number
  isLastLayer: boolean
}

interface LayoutLink {
  from: string
  to: string
  fillIndex: number
  x0: number
  y0Top: number
  y0Bottom: number
  x1: number
  y1Top: number
  y1Bottom: number
}

/**
 * Longest-path layer assignment via Kahn's algorithm + relaxation. See this
 * file's own header comment ("Layer assignment") for the determinism
 * argument. The trailing `queue.length < component.nodes.length` defensive
 * branch only ever engages for a component object that bypassed schema
 * validation (e.g. a hand-built unit-test fixture with a cycle) —
 * `ir/index.ts`'s `.superRefine` rejects a cyclic graph before it can reach
 * render through the normal validate path.
 */
function computeLayers(component: SankeyComponent): Map<string, number> {
  const inDegree = new Map<string, number>(component.nodes.map((n) => [n.id, 0]))
  const adjacency = new Map<string, string[]>(component.nodes.map((n) => [n.id, [] as string[]]))
  for (const link of component.links) {
    inDegree.set(link.to, (inDegree.get(link.to) ?? 0) + 1)
    adjacency.get(link.from)?.push(link.to)
  }

  const layer = new Map<string, number>(component.nodes.map((n) => [n.id, 0]))
  const remaining = new Map(inDegree)
  const queue: string[] = component.nodes.filter((n) => inDegree.get(n.id) === 0).map((n) => n.id)

  let qi = 0
  while (qi < queue.length) {
    const u = queue[qi++]!
    for (const v of adjacency.get(u) ?? []) {
      layer.set(v, Math.max(layer.get(v)!, layer.get(u)! + 1))
      const left = (remaining.get(v) ?? 0) - 1
      remaining.set(v, left)
      if (left === 0) queue.push(v)
    }
  }

  // Defensive-only (see doc comment): any node Kahn's never enqueued is
  // part of a cycle that should have been schema-rejected. Deterministic —
  // walks `component.nodes` in authored order, never a Map/Set iteration.
  if (queue.length < component.nodes.length) {
    const enqueued = new Set(queue)
    const maxLayer = Math.max(0, ...queue.map((id) => layer.get(id)!))
    for (const n of component.nodes) {
      if (!enqueued.has(n.id)) layer.set(n.id, maxLayer + 1)
    }
  }

  return layer
}

/** Per-node total through-flow -> rendered bar weight. See this file's own
 * header comment ("Node weight -> height"). */
function computeWeights(component: SankeyComponent): Map<string, number> {
  const inSum = new Map<string, number>(component.nodes.map((n) => [n.id, 0]))
  const outSum = new Map<string, number>(component.nodes.map((n) => [n.id, 0]))
  for (const link of component.links) {
    outSum.set(link.from, (outSum.get(link.from) ?? 0) + link.value)
    inSum.set(link.to, (inSum.get(link.to) ?? 0) + link.value)
  }
  const fallbackWeight = component.links.length > 0 ? Math.min(...component.links.map((l) => l.value)) : 1

  const weight = new Map<string, number>()
  for (const n of component.nodes) {
    const i = inSum.get(n.id) ?? 0
    const o = outSum.get(n.id) ?? 0
    if (i > 0 && o > 0) weight.set(n.id, Math.max(i, o))
    else if (i > 0) weight.set(n.id, i)
    else if (o > 0) weight.set(n.id, o)
    else weight.set(n.id, fallbackWeight)
  }
  return weight
}

/**
 * Solve one global value->px scale so every layer's node stack — with the
 * `MIN_NODE_H` floor actually applied — fits within `availableH` (see this
 * file's header, "Value -> pixel scale, budgeted not exploded").
 *
 * A closed-form `usable / sumWeight` division (the natural first attempt)
 * only fits *unfloored* heights exactly — it silently under-counts whenever
 * `MIN_NODE_H` bumps a tiny-weight node's height above `weight * scale`,
 * because that per-node "overpayment" isn't visible to a single division.
 * Caught empirically, not just reasoned about on paper: a schema-max layer
 * carrying several disconnected nodes (`fallbackWeight`, deliberately
 * small) alongside a few heavily-loaded real ones pushed real content past
 * the box bottom — `full-matrix-contrast.test.ts`'s "schema-max sankey"
 * sweep failed on all 13 themes with a genuine `v-overflow` finding before
 * this fix, not a cosmetic near-miss.
 *
 * Fixed by binary-searching the largest `scale` for which *every* layer's
 * `sum(max(MIN_NODE_H, weight*scale)) + gapBudget` still fits `availableH`
 * — `fits(scale)` is non-decreasing in `scale` for each layer (raising
 * `scale` can only grow or hold a floored term, never shrink it), so
 * bisection converges monotonically. `hiBound` (the old closed-form
 * division) is always a safe search ceiling: it is exact whenever no floor
 * ever engages, and an overestimate whenever one does (a floor only ever
 * grows a height above the unfloored value) — so when nothing is floored
 * this function returns the same value the old formula did, at the same
 * one-`fits`-call cost. The 60-iteration bisection only spends extra work
 * on the pathological case that actually needs it. Fixed iteration count
 * keeps this deterministic and boundedly fast regardless of input.
 */
function computeValueScale(layersOfIds: string[][], weight: Map<string, number>, availableH: number): number {
  let hiBound = Infinity
  for (const ids of layersOfIds) {
    if (ids.length === 0) continue
    const sumW = ids.reduce((s, id) => s + (weight.get(id) ?? 0), 0)
    const gapBudget = (ids.length - 1) * NODE_GAP
    const usable = Math.max(1, availableH - gapBudget)
    hiBound = Math.min(hiBound, usable / Math.max(sumW, 1e-9))
  }
  if (!Number.isFinite(hiBound) || hiBound <= 0) hiBound = 1

  const fits = (scale: number): boolean => {
    for (const ids of layersOfIds) {
      if (ids.length === 0) continue
      const gapBudget = (ids.length - 1) * NODE_GAP
      const sum = ids.reduce((s, id) => s + Math.max(MIN_NODE_H, (weight.get(id) ?? 0) * scale), 0)
      if (sum + gapBudget > availableH) return false
    }
    return true
  }
  if (fits(hiBound)) return hiBound

  let lo = 0
  let hi = hiBound
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  return lo
}

/** Full deterministic layout: layer/order/position every node, then route
 * every link as a stacked slot on both its source's outgoing side and its
 * target's incoming side. Pure function of `component`/`box.w`/`availableH`. */
function computeLayout(component: SankeyComponent, boxX: number, boxY: number, w: number, availableH: number): Layout {
  const layer = computeLayers(component)
  const weight = computeWeights(component)
  const maxLayer = Math.max(0, ...component.nodes.map((n) => layer.get(n.id)!))
  const layerCount = maxLayer + 1

  const layersOfIds: string[][] = Array.from({ length: layerCount }, () => [])
  for (const n of component.nodes) layersOfIds[layer.get(n.id)!]!.push(n.id)

  const scale = computeValueScale(layersOfIds, weight, availableH)

  // Column x positions: layerCount bars of NODE_W, remaining width spread
  // across (layerCount-1) gaps. layerCount is always >= 2 (schema requires
  // >=1 link, and a link's target always lands at least one layer past its
  // source), so this never divides by zero.
  const totalBarsW = layerCount * NODE_W
  const layerGap = layerCount > 1 ? Math.max(4, (w - totalBarsW) / (layerCount - 1)) : 0
  const xOfLayer = (l: number) => boxX + l * (NODE_W + layerGap)

  const nodeX = new Map<string, number>()
  const nodeY = new Map<string, number>()
  const nodeH = new Map<string, number>()
  const nodeIndex = new Map<string, number>(component.nodes.map((n, i) => [n.id, i]))

  for (const ids of layersOfIds) {
    const heights = ids.map((id) => Math.max(MIN_NODE_H, (weight.get(id) ?? 0) * scale))
    const stackH = heights.reduce((a, b) => a + b, 0) + Math.max(0, ids.length - 1) * NODE_GAP
    // Center each column's own stack within the available height —
    // per-column centering (not a whole-diagram bounding-box center), a
    // deliberate simplicity choice: with per-layer weight sums that can
    // differ substantially, a single shared vertical center still reads
    // naturally column-by-column without the extra bookkeeping a
    // whole-diagram centroid would need.
    let cursor = boxY + Math.max(0, (availableH - stackH) / 2)
    ids.forEach((id, i) => {
      nodeX.set(id, xOfLayer(layer.get(id)!))
      nodeY.set(id, cursor)
      nodeH.set(id, heights[i]!)
      cursor += heights[i]! + NODE_GAP
    })
  }

  const layoutNodes: LayoutNode[] = component.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    x: nodeX.get(n.id)!,
    y: nodeY.get(n.id)!,
    h: nodeH.get(n.id)!,
    layer: layer.get(n.id)!,
    isLastLayer: layer.get(n.id)! === maxLayer,
  }))

  // Per-link thickness computed once, reused for both the source-side and
  // target-side stacking passes below, so a band's two ends are always
  // exactly parallel (no independent floating-point drift between passes).
  const thickness = new Map<SankeyComponent["links"][number], number>(
    component.links.map((l) => [l, Math.max(MIN_BAND_H, l.value * scale)]),
  )

  // Outgoing slots per node, ordered by the *target*'s stable authored
  // index (deterministic tie-break, never Map/Set iteration) — the
  // conventional "bands leaving a node stack in the same order as the
  // columns they head toward" sankey convention.
  const outSlotTop = new Map<SankeyComponent["links"][number], number>()
  const outSlotBottom = new Map<SankeyComponent["links"][number], number>()
  for (const n of component.nodes) {
    const outgoing = component.links.filter((l) => l.from === n.id).sort((a, b) => nodeIndex.get(a.to)! - nodeIndex.get(b.to)!)
    let cursor = nodeY.get(n.id)!
    for (const l of outgoing) {
      const t = thickness.get(l)!
      outSlotTop.set(l, cursor)
      outSlotBottom.set(l, cursor + t)
      cursor += t
    }
  }

  // Incoming slots per node, ordered by the *source*'s stable authored index.
  const inSlotTop = new Map<SankeyComponent["links"][number], number>()
  const inSlotBottom = new Map<SankeyComponent["links"][number], number>()
  for (const n of component.nodes) {
    const incoming = component.links.filter((l) => l.to === n.id).sort((a, b) => nodeIndex.get(a.from)! - nodeIndex.get(b.from)!)
    let cursor = nodeY.get(n.id)!
    for (const l of incoming) {
      const t = thickness.get(l)!
      inSlotTop.set(l, cursor)
      inSlotBottom.set(l, cursor + t)
      cursor += t
    }
  }

  const paletteSize = Math.max(1, component.nodes.length)
  const layoutLinks: LayoutLink[] = component.links.map((l) => ({
    from: l.from,
    to: l.to,
    fillIndex: nodeIndex.get(l.from)! % paletteSize,
    x0: nodeX.get(l.from)! + NODE_W,
    y0Top: outSlotTop.get(l)!,
    y0Bottom: outSlotBottom.get(l)!,
    x1: nodeX.get(l.to)!,
    y1Top: inSlotTop.get(l)!,
    y1Bottom: inSlotBottom.get(l)!,
  }))

  return { nodes: layoutNodes, links: layoutLinks, layerCount }
}

/** Classic sankey S-curve ribbon: a horizontal cubic-bezier top edge from
 * the source slot down to the target slot, a straight right edge (the
 * band's own thickness at the target), a mirrored bottom curve back, and a
 * straight left edge closing the shape. `M`/`C`/`L`/`Z` only — lands in
 * `pptx/svg2pptx/path.ts`'s `pathToOp` cleanly, the same fully generic
 * grammar walker every `<path>` in this codebase goes through (see this
 * file's own header comment for why no per-shape idiom branch exists to
 * worry about there). */
function bandPath(link: LayoutLink): string {
  const midX = (link.x0 + link.x1) / 2
  return [
    `M ${link.x0} ${link.y0Top}`,
    `C ${midX} ${link.y0Top} ${midX} ${link.y1Top} ${link.x1} ${link.y1Top}`,
    `L ${link.x1} ${link.y1Bottom}`,
    `C ${midX} ${link.y1Bottom} ${midX} ${link.y0Bottom} ${link.x0} ${link.y0Bottom}`,
    "Z",
  ].join(" ")
}

export const sankey: SvgComponent<SankeyComponent> = {
  measure() {
    return NATURAL_H
  },
  render(component, box, ctx) {
    const h = box.h ?? NATURAL_H
    const layout = computeLayout(component, box.x, box.y, box.w, h)
    const palette = rotateChartPalette(ctx.colors.chartPalette, ctx.chartPaletteOffset ?? 0)
    const bg = ctx.defaultBg ?? ctx.colors.bg

    return (
      <g>
        {layout.links.map((link, i) => (
          <path
            key={`l${i}`}
            d={bandPath(link)}
            fill={palette[link.fillIndex % palette.length]}
            fillOpacity={BAND_OPACITY}
          />
        ))}
        {layout.nodes.map((n) => {
          const labelFit = fitSvgLine(n.label, {
            maxWidth: Math.min(MAX_LABEL_W, Math.max(24, (box.w - layout.layerCount * NODE_W) / Math.max(1, layout.layerCount - 1) - LABEL_GAP * 2)),
            fontSize: LABEL_FONT,
            minFontSize: LABEL_MIN_FONT,
          })
          const labelX = n.isLastLayer ? n.x - LABEL_GAP : n.x + NODE_W + LABEL_GAP
          const labelAnchor = n.isLastLayer ? "end" : "start"
          const labelY = n.y + n.h / 2 + labelFit.fontSize * 0.35
          const ink = accessibleInk(ctx.colors.text, bg, labelFit.fontSize)
          // Audit box covers the true rendered extent of *both* the node
          // bar and its label, whichever combination of anchor/side is in
          // play (`textAnchor="end"` pulls the label leftward from `labelX`,
          // "start" pushes it rightward) — not a hand-waved constant, the
          // same "box = real content extent" discipline `flowchart.tsx`'s
          // own node `data-audit-box` follows.
          const labelW = measureTextUnits(labelFit.text) * labelFit.fontSize
          const boxLeft = n.isLastLayer ? labelX - labelW : n.x
          const boxRight = n.isLastLayer ? n.x + NODE_W : labelX + labelW
          return (
            <g key={n.id} data-audit-box={`${boxLeft},${n.y},${boxRight - boxLeft}`}>
              <rect x={n.x} y={n.y} width={NODE_W} height={n.h} fill={ctx.colors.surface} stroke={ctx.colors.primary} strokeWidth={1} />
              <text
                data-truncated={labelFit.truncated ? "1" : undefined}
                x={labelX}
                y={labelY}
                textAnchor={labelAnchor}
                fontSize={labelFit.fontSize}
                fill={ink}
                fontFamily={ctx.fonts.body}
                dominantBaseline="alphabetic"
              >
                {labelFit.text}
              </text>
            </g>
          )
        })}
      </g>
    )
  },
}
