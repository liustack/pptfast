import { z } from "zod"
import type { ItemFieldAliasSpec } from "../field-aliases"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

// Sankey flow diagram (structure-components wave 2 task 3 — the wave's
// largest component and its sharpest differentiator: Anthropic's own
// official pptx-authoring skill classifies a sankey as "PowerPoint has no
// native form for this" and ships it as a rasterized image. This component
// routes every node bar and flow band through the existing SVG path ->
// custGeom pipeline instead, so the export carries zero `<p:pic>` for it —
// natively editable vectors, not a picture of a chart).
//
// Two named sub-schemas (not inlined, same "cross-field refine needs its own
// symbol" precedent GanttItemSchema set above): `nodes`/`links` is a graph,
// not a named-slot family (swot/pest's own "positional array a weak model
// could mis-order" concern doesn't apply here — a node's identity is its own
// `id`, referenced by `links[].from`/`to`, not by array position), so this
// stays the natural {nodes[], links[]} shape rather than forcing named slots
// where none would make sense.
const SankeyNodeSchema = z
  .object({
    id: z.string(),
    label: z.string(),
  })
  .strict()

/**
 * Classic 3-color DFS cycle detection, returning one concrete node-id path
 * (e.g. `["a","b","c","a"]`) rather than just "a cycle exists somewhere" —
 * actionable for a weak model to repair by naming exactly which link to
 * remove or redirect (plan task 3 item 1: "带可执行消息"). Iterates
 * `nodeIds`/each node's outgoing adjacency list in *authored array order*
 * (both built from `c.nodes`/`c.links` by the caller, never a Map/Set
 * iteration for anything order-sensitive), so the specific cycle reported is
 * deterministic across runs even when a graph contains more than one.
 *
 * Written as a return-threading recursive helper — not a closure mutating an
 * outer `let` — deliberately: an earlier version threaded a shared `let
 * cyclePath` through the recursive `visit` closure instead, which TS's
 * control-flow narrowing couldn't follow across the closure boundary
 * (`cyclePath` narrowed to `never` at the read site despite the runtime
 * value being correct) — functional return-threading sidesteps that
 * whole class of narrowing fragility rather than fighting it with a type
 * assertion.
 */
function findSankeyCycle(nodeIds: readonly string[], adjacency: ReadonlyMap<string, string[]>): string[] | null {
  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>(nodeIds.map((id) => [id, WHITE]))
  const stack: string[] = []

  const visit = (id: string): string[] | null => {
    color.set(id, GRAY)
    stack.push(id)
    for (const next of adjacency.get(id) ?? []) {
      if (color.get(next) === GRAY) {
        const start = stack.indexOf(next)
        return [...stack.slice(start), next]
      }
      if (color.get(next) === WHITE) {
        const found = visit(next)
        if (found) return found
      }
    }
    stack.pop()
    color.set(id, BLACK)
    return null
  }

  for (const id of nodeIds) {
    if (color.get(id) === WHITE) {
      const found = visit(id)
      if (found) return found
    }
  }
  return null
}

const SankeyLinkSchema = z
  .object({
    from: z.string(),
    to: z.string(),
    /** Flow magnitude, strictly positive (`z.number().positive()` — the
     * schema-level decision for "value > 0 or explicit zero-value handling",
     * plan task 3 item 1). A zero or negative value carries no visible flow
     * to draw — rejecting it at the schema is a clearer signal than silently
     * rendering an invisible or degenerate band, and matches this schema's
     * own posture elsewhere (gantt's item `.refine` rejects a zero-duration
     * bar the same way, for the same reason: a valid-looking but
     * un-renderable-as-intended value is a schema-time error, not a
     * render-time silent no-op). A *tiny-but-positive* value is legal and
     * handled at render time instead — `sankey.tsx`'s `MIN_BAND_H` floors it
     * to a visible minimum thickness rather than letting it vanish, the
     * pathological case named in the plan's "extreme value ratio (1:10000)"
     * probe. */
    value: z.number().positive(),
  })
  .strict()

// Sankey (structure-components wave 2 task 3) — see SankeyNodeSchema/
// SankeyLinkSchema above for the shape rationale. Bounds: 2-16 nodes
// (a single node has nothing to flow into/out of — `min(2)` is the
// smallest graph with at least one real edge), 1-30 links. Both ceilings
// are a render-geometry derivation, not an arbitrary round number: the
// full-body content box is ~500-600px tall, `sankey.tsx`'s own
// `MIN_NODE_H`+`NODE_GAP` floor keeps even the most-populated single layer
// (worst case: every node lands in one layer, e.g. an all-disconnected
// graph) legible up to about 16 stacked bars before they'd compress below
// a readable minimum — the same "schema max = the largest shape the real
// renderer keeps legible" discipline heatmap's 10x10 bound and gantt's
// 2-8 item bound already establish. 30 links comfortably covers the
// "dense crossing" topology the plan names as a required visual case
// (e.g. a 4-layer, 4-node-per-layer diagram with every adjacent layer
// pair fully connected is 4*4*3=48 possible edges, well above what a
// legible band stack can carry) without inviting an unbounded array.
export const schema = z
  .object({
    type: z.literal("sankey"),
    nodes: z.array(SankeyNodeSchema).min(2).max(16),
    links: z.array(SankeyLinkSchema).min(1).max(30),
  })
  .strict()
  .superRefine((c, ctx) => {
    // 1. Unique node ids — a duplicated id makes every downstream
    // `links[].from`/`to` reference ambiguous (which node?), so this is
    // checked first and independently of the endpoint-existence check
    // below (a link referencing a duplicated id would otherwise "resolve"
    // against either occurrence, masking the real problem).
    const idCounts = new Map<string, number>()
    for (const n of c.nodes) idCounts.set(n.id, (idCounts.get(n.id) ?? 0) + 1)
    const duplicateIds = [...idCounts].filter(([, count]) => count > 1).map(([id]) => id)
    if (duplicateIds.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["nodes"],
        message: `sankey node ids must be unique — duplicated: ${duplicateIds.map((id) => `'${id}'`).join(", ")}`,
      })
    }

    // 2. Every link's from/to must reference a declared node id, and 3. no
    // self-loops (a node flowing into itself has no meaningful band
    // geometry — top/bottom of the same bar — so it's rejected outright
    // rather than special-cased at render time, plan task 3 item 1's
    // explicit "self-loops rejected with an actionable message"). Every
    // message below is single-quoted (never a raw `"` around an id).
    //
    // The endpoint-existence checks' `path` drills to the exact field
    // (`["links", i, "from"]`/`["links", i, "to"]`) — the self-loop
    // check's stays at `["links", i]`, since neither endpoint alone is
    // "wrong" there — both are equal, valid ids, it's the pair that's
    // rejected. This briefly used a workaround, now removed: the
    // browser-distribution e2e leg's `BARE_STATIC_IMPORT` scanner
    // (`scripts/e2e.mts`) used to do a raw text match with no notion of
    // string-literal context, so a compiled zod issue `path` array ending
    // in the literal element `"from"` collided with its bare-import scan
    // exactly like a minified `import x from"pkg"` would. Fixed at the
    // scanner (syntax-aware now — see that file's own doc comment), so
    // the natural, most-precise path is safe again and no longer needs to
    // route around a false positive one layer away from where it lives.
    const nodeIds = new Set(c.nodes.map((n) => n.id))
    const availableIds = [...nodeIds].map((id) => `'${id}'`).join(", ") || "(no nodes declared)"
    let hasStructuralLinkError = false
    c.links.forEach((link, i) => {
      if (link.from === link.to) {
        hasStructuralLinkError = true
        ctx.addIssue({
          code: "custom",
          path: ["links", i],
          message: `sankey link ${i} is a self-loop ('${link.from}' -> '${link.to}') — self-loops are not supported, remove this link or route the flow through an intermediate node instead`,
        })
      }
      if (!nodeIds.has(link.from)) {
        hasStructuralLinkError = true
        ctx.addIssue({
          code: "custom",
          path: ["links", i, "from"],
          message: `sankey link ${i}'s 'from' node id '${link.from}' is not declared in nodes — available: ${availableIds}`,
        })
      }
      if (!nodeIds.has(link.to)) {
        hasStructuralLinkError = true
        ctx.addIssue({
          code: "custom",
          path: ["links", i, "to"],
          message: `sankey link ${i}'s 'to' node id '${link.to}' is not declared in nodes — available: ${availableIds}`,
        })
      }
    })

    // 4. Cycle detection — sankey.tsx's layered layout requires a DAG
    // (layer = longest path from a source, undefined on a cycle). Only
    // runs once the graph is otherwise structurally sound (unique ids,
    // every endpoint resolved, no self-loop) — a dangling reference or
    // self-loop already produced its own actionable issue above, and
    // would make the adjacency walk below meaningless (a self-loop is
    // trivially "a cycle" but the message above is the more useful one).
    // See {@link findSankeyCycle}'s own doc comment for the algorithm and
    // determinism argument.
    if (duplicateIds.length > 0 || hasStructuralLinkError) return
    const adjacency = new Map<string, string[]>(c.nodes.map((n) => [n.id, [] as string[]]))
    for (const link of c.links) adjacency.get(link.from)!.push(link.to)

    const cyclePath = findSankeyCycle(c.nodes.map((n) => n.id), adjacency)
    if (cyclePath) {
      ctx.addIssue({
        code: "custom",
        path: ["links"],
        message: `sankey graph contains a cycle: ${cyclePath.join(" -> ")} — sankey layout requires a directed acyclic graph (DAG), break the cycle by removing or redirecting one of these links`,
      })
    }
  })

// Explicit annotation (not inline in the object literal below) is load-
// bearing here, not stylistic: sankey is the only component with *two*
// item-array alias specs whose `aliases` sub-objects have different key
// sets (links' source/target vs. nodes' name/title). Inferred inline, TS
// widens the array literal to a 2-member union where each branch gains the
// other's keys back as `?: undefined` (its own union-relatedness display
// behavior), which then fails assignability against `FieldAliasMap`'s index
// signature (`Property 'name' is incompatible with index signature. Type
// 'undefined' is not assignable to type 'string'` — reproduced/probed
// directly against this repo's own installed TS 5.9.3 before landing this
// form). Annotating this array on its own gives each element true
// contextual typing against `ItemFieldAliasSpec` (not a union), producing a
// clean, non-widened `readonly ItemFieldAliasSpec[]` — verified to still
// carry through the object's own `satisfies ComponentAliasSpec` (rather
// than an explicit `: ComponentAliasSpec` annotation on the object, which
// W2b separately found widens `.items` to `T | undefined`) with zero casts
// at every consuming aggregator site.
const sankeyItemAliases: readonly ItemFieldAliasSpec[] = [
  { itemsKey: "links", aliases: { source: "from", target: "to" } },
  { itemsKey: "nodes", aliases: { name: "label", title: "label" } },
]

export const aliases = {
  items: sankeyItemAliases,
} satisfies ComponentAliasSpec

export const traits = {
  stretchable: false,
  selfVisual: false,
  scalable: false,
  passthroughShell: false,
  fullBody: true,
  evidence: false,
} as const satisfies ComponentTraits
