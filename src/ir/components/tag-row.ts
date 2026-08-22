import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

// tag_row component wave (`.issues/2026-08-06-tag-row/plan.md`, 控制器裁定
// 1-3): the 38th component. Closes the internal invented-name gap Cluster C
// (`.issues/2026-08-06-layout-component-research/internal.md` §2.2) — a
// small-label row the pool had no first-class home for, so weak models kept
// inventing one by name:
//
//  - deepseek-agentic q17 ("H2 Engineering Planning Review", a real deck)
//    burned one whole slide brute-forcing 76 component names, `tag`/`pill`/
//    `chip_row`/`label` among them, every one hard-failing `"tag" is not a
//    valid component type` (`results-archive/2026-08-05-round2/
//    deepseek-agentic/report.md`).
//  - the same names recur in the p14 supplier-due-diligence probe workspace
//    (`results-probe/deepseek-agentic/p14/workspace/probe6.json`:
//    `tag`/`tags`/`chip`/`chips`/`pill`/`pills`/`tag_cloud`).
//
// Named after the models' own most-guessed name (裁定: 采模型呼声最高者):
// across the bench+probe archive the exact-string tally is `tag` ×3
// instances / 2 runs and `pill` ×3 / 2 runs (tied highest), then `chips`
// ×2/2, `badge` ×2/2, `chip_row` ×2/1. `pill` is a shape word (a capsule),
// `tag` is the semantic concept the shape carries, so the tie breaks to
// `tag`; the models attested the container suffix `_row` themselves
// (`chip_row` ×2), so `tag_row` = winning semantic root + model-attested
// container word, matching the house `<item>_<row/cards>` convention
// (`row_cards`/`icon_cards`).
//
// 裁定 1 — minimal semantic surface: `items` is a plain array of short
// strings (a tag is a label, not a struct — no per-tag icon, color, or
// link: chartPalette rotation is deliberately NOT used here, 裁定 2, unlike
// people_cards' badges — the two-tier surface/accent fill below carries all
// the emphasis this component needs). An optional overall `title`, and an
// optional `emphasis: "none" | "first"` (image_grid's own field/semantics —
// highlight the first tag as the primary one among secondaries).
export const schema = z
  .object({
    type: z.literal("tag_row"),
    title: z.string().optional(),
    items: z
      .array(
        z
          .string()
          .min(1, `a tag_row item can't be empty`)
          // Per-item length cap (裁定 1 — "标签不是句子"): 24 chars admits the
          // overwhelming majority of real tags (tech names, cert codes,
          // keywords, skills — near-universally ≤24) while rejecting
          // sentence/phrase content, whose home is bullets/row_cards. The
          // error points there by name (裁定 3 — the boundary that stops a
          // model shoving bullet content into tags).
          .max(
            24,
            `each tag_row item must be a short nominal label (≤24 chars), not a sentence — sentence-shaped or described content belongs in "bullets" (a prose list) or "row_cards"/"icon_cards" (labeled items that each carry their own text)`,
          )
          .describe(
            "One short, nominal label — a tech/tool name, a capability, a keyword, a certification/qualification (≤24 chars). Not a sentence and not a described item: those belong in bullets or row_cards/icon_cards.",
          ),
      )
      // 2 is the floor — one label isn't a row; put it in the heading, a
      // callout, or verdict_banner. 16 is the ceiling (裁定 1): past it the
      // row reads as an unsorted keyword dump rather than a scannable set.
      .min(
        2,
        `tag_row.items needs at least 2 tags — a single label isn't a row; put it in the heading, a "callout", or a "verdict_banner"`,
      )
      .max(
        16,
        `tag_row.items accepts at most 16 tags — past 16 the row reads as an unsorted keyword dump; split into multiple tag_row slides or group the tags into labeled sets`,
      )
      .describe(
        "2-16 short parallel labels laid out as a wrapping row of pills — a tech stack, a capability/skill set, a keyword set, applicable certifications/qualifications. Each item is a short nominal label (≤24 chars), NOT a sentence or a described item. Author them in the reading order you want the row to fill left-to-right, wrapping onto new lines.",
      ),
    emphasis: z
      .enum(["none", "first"])
      .optional()
      .describe(
        'Optional. "first" draws the first tag in the theme accent so it stands out as the primary tag among the rest (same field/semantics as image_grid); "none" (the default) draws every tag equal-weight in the low-key surface style.',
      ),
  })
  .strict()
  // Schema guidance (people_cards precedent — the JSON Schema a
  // model reads before writing IR): name the concrete alternatives and the
  // one-line test that decides between them (裁定 3). Lean into the name the
  // models already guess.
  .describe(
    "Lays 2-16 short parallel labels out as a wrapping row of pills — a technology stack, a capability/skill set, a keyword set, the certifications/qualifications a vendor holds, the tags that apply to something. Use tag_row when the content is short nominal labels with no from-hierarchy and no per-item description. The test: is every item a short label (a name, not a sentence)? If each item carries its own descriptive text, use `row_cards`/`icon_cards`; if it's a real prose list, use `bullets`. Optional `emphasis: \"first\"` highlights the first tag as the primary one.",
  )

export const aliases = {} satisfies ComponentAliasSpec

// All-false traits, same posture as `image_grid`: a wrapping row
// of small pills is neither a density-stretch card family (stretchable —
// growing pills to fill leftover column height would look wrong, they keep
// their natural compact height), a self-carded diagram (selfVisual/
// passthroughShell — the pills sit happily inside a bento shell), a
// uniformly-scalable single graphic (scalable — it's reflowable label text,
// not one image), a whole-slide canvas (fullBody), nor a reviewable evidence
// artifact (evidence — a keyword set is not data the way chart/data_table
// are).
export const traits = {
  stretchable: false,
  selfVisual: false,
  scalable: false,
  passthroughShell: false,
  fullBody: false,
  evidence: false,
} as const satisfies ComponentTraits
