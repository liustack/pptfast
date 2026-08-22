import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

// order semantics (probe evidence-gate byproduct, 2026-07-26 —
// `.issues/notes/quality-evidence.md` tier_stack section):
// `layers` is an ordered array and the renderer (`architecture.tsx`) paints
// it top-to-bottom — `layers[0]` is always the topmost band. That is a
// legitimate reading of "architecture" (a system-layering stack diagram is
// naturally authored top-down: presentation layer first, infrastructure
// last), but the probe caught two of four weak models authoring a
// low-to-high maturity ladder ("Rung 1: Ad Hoc" … "Rung 4: Data-Led") in
// the ladder's own natural bottom-up narrative order, which rendered
// upside down (Ad Hoc on top) with no field to correct it — this was an
// underdocumented-semantics bug, not a bad renderer.
//
// `direction` (named to match the two existing sibling fields that already
// own this exact vocabulary slot — chart.ts's `direction: "horizontal" |
// "vertical"` and flowchart.ts's `direction: "TB" | "TD" | "BT" | "LR" |
// "RL"` — reusing the field *name* keeps one predictable place a model
// looks for "which way does this go" across every oriented component, even
// though each component's own value set differs, exactly like those two
// already differ from each other) is additive and optional: omitted (or
// `"top_down"`) is byte-identical to today's behavior, `"bottom_up"` flips
// which end of `layers` paints at the bottom of the stack. Overflow is a
// validate gate (`CAPACITY.architecture`), not a render-time fold.
//
// No `order`-style alias added despite it being a plausible synonym: this
// codebase's alias tables are evidence-driven (see data-table.ts's own
// aliases comment) — ported from real weak-model failure samples, not
// pre-invented for a field with zero production history. Add one if a real
// sample surfaces a model reaching for a synonym here.
export const schema = z
  .object({
    type: z.literal("architecture"),
    layers: z.array(
      z
        .object({ title: z.string(), items: z.array(z.string()) })
        .strict()
    ),
    direction: z.enum(["top_down", "bottom_up"]).optional(),
  })
  .strict()

export const aliases = {
  items: [{ itemsKey: "layers", aliases: { name: "title", components: "items", nodes: "items" } }],
} satisfies ComponentAliasSpec

export const traits = {
  stretchable: false,
  selfVisual: false,
  scalable: false,
  passthroughShell: true,
  fullBody: false,
  evidence: false,
} as const satisfies ComponentTraits
