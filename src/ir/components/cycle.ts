import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

// cycle component wave (`.issues/2026-08-05-component-waves/plan-cycle.md`,
// 控制器裁定 1-4): closes the probe evidence gate's "closed-loop process"
// finding (2/2 — p02's 4-stage English process, 4/4 DEGRADED; p10's 5-stage
// Chinese ESG lifecycle reproduced the same failure on dsPro). Forced to
// draw a process that loops back to its own start, `flowchart` either
// paints the closing back-edge as a long stray line/arc crossing the whole
// diagram (dagre has no notion of "this is a ring", every edge is just
// another line to route), or the model gives up on structure entirely and
// falls back to `steps` (no back-edge capability at all) plus a sentence
// doing the structural work in prose instead of the picture ("this cycle
// continues, re-design loops back to design"). `cycle` closes that gap by
// making the closed loop the geometry itself — a ring, not a graph layout
// that happens to have one more edge than usual.
//
// 裁定 1 — minimal semantic surface: no `direction` field (always clockwise
// — no probe evidence names a counter-clockwise reading), no center-text
// slot (more placeholders crowd an already-tight ring; deferred pending
// real evidence), no per-item icon.
export const schema = z
  .object({
    type: z.literal("cycle"),
    title: z.string().optional(),
    items: z
      .array(
        z
          .object({
            label: z
              .string()
              .describe("Short label shown inside the stage's node on the ring."),
            description: z
              .string()
              .optional()
              .describe("Optional short explanation shown outside the node, next to it."),
          })
          .strict()
      )
      // 2 stages can't visually close into a ring (an ellipse or a single
      // back-and-forth line either way doesn't read as "a cycle") — the
      // right component for anything that short is `flowchart` (a process
      // with an endpoint) or `steps` (a short linear process, no
      // back-edge). 8 is the geometric ceiling this component's own ring
      // layout accepts before nodes crowd past legible size on a 1280x720
      // slide — a process with more stages should split across multiple
      // cycle slides rather than cram a 9th+ node onto one ring.
      .min(
        3,
        `cycle.items needs at least 3 stages to read as a closed loop — 2 stages can't visually close into a ring; use "flowchart" for a process with an endpoint, or "steps" for a short linear one`
      )
      .max(
        8,
        `cycle.items accepts at most 8 stages — more would crowd the ring past a legible size on a 1280x720 slide; split into multiple cycle slides instead`
      )
      .describe(
        "3-8 stages placed at equal steps around a closed ring, connected clockwise, the last stage " +
          "arcing back to the first — author them in reading order."
      ),
  })
  .strict()
  // Schema guidance (device_mockup wave's Important-1 fix established this
  // precedent — `pptfast schema`/`irJsonSchema()` is the surface a model
  // actually reads before writing IR, so the flowchart-vs-cycle selection
  // test this schema's own top comment already reasons through needs to
  // live here too, not just in a source comment nobody consuming the JSON
  // Schema output ever sees). Same style: name the concrete alternative
  // component, state the one-line test that decides between them.
  .describe(
    "Lays 3-8 stages out on a closed ring with arrow connectors, for a process that has no endpoint — it " +
      "loops back to its own start (PDCA, a product lifecycle, a flywheel, a seasonal cycle). Use cycle when " +
      "the last stage leads back into the first; use `flowchart` instead when the process reaches a real " +
      "endpoint, even if it branches on the way — forcing a closed loop through flowchart draws the closing " +
      "edge as a stray line crossing the whole diagram, not a ring."
  )

export const aliases = {} satisfies ComponentAliasSpec

// selfVisual: false / passthroughShell: true — same posture as this
// component's two closest siblings, `flowchart` and `architecture`: each
// node paints its own shape+text, so bento's outline shell painted
// underneath would be a redundant second shell around an already-carded
// diagram (component-traits.ts's own PASSTHROUGH_SHELL_TYPES doc comment).
// Not evidence-eligible — no probe evidence names a cycle diagram as an
// evidence-carrying visual the way chart/data_table/device_mockup are.
export const traits = {
  stretchable: false,
  selfVisual: false,
  scalable: false,
  passthroughShell: true,
  fullBody: false,
  evidence: false,
} as const satisfies ComponentTraits
