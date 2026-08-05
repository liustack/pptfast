import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

// people_cards component wave (`.issues/2026-08-05-component-waves/
// plan-people-cards.md`, 控制器裁定 1-4): closes the probe evidence gate's
// "people roster" finding (2/2). p05's 5-exec-intro first case named only
// a missing initials-avatar axis — every other field (name/title/
// background/remit) already survived on `row_cards`/`icon_cards`, a
// narrow case easy to misread as "just add an icon". p12's second case is
// the harder, machine-checkable one: a 9-speaker conference lineup blows
// straight through both siblings' schema-level `.max(6)` — the only
// single-shot model call that actually returned valid IR split the roster
// into two unlabeled "(1/2)"/"(2/2)" pages with no semantic grouping
// behind the split (the other three timed out/rate-limited on the longer
// prompt, never producing IR at all). `people_cards` closes both gaps at
// once: a dedicated initials-badge identity axis, and enough headroom
// (12) to hold p12's 9 speakers on one page with margin to spare.
//
// 裁定 1 — minimal semantic surface: `name` is the only required field on
// each person; `role`/`org` stay optional. No photo field — a slide with
// real headshots already has `image_grid`, and photo licensing is the
// author's own problem, not something this schema should speculate a slot
// for. No contact/social-link fields either — no probe evidence names
// either one; this component's entire differentiator is the zero-asset
// initials badge, not a contact card.
export const schema = z
  .object({
    type: z.literal("people_cards"),
    title: z.string().optional(),
    people: z
      .array(
        z
          .object({
            name: z
              .string()
              .describe(
                "Full name as written — the initials badge is derived from this exact string " +
                  "(deriveInitials, people-initials.ts): a Latin name takes the first letter of " +
                  "each of its first two words, a single Latin word takes its own first two " +
                  "letters, and a CJK name takes only its first character (surname), never two.",
              ),
            role: z
              .string()
              .optional()
              .describe("Optional one-line role, title, or topic shown under the name."),
            org: z
              .string()
              .optional()
              .describe("Optional affiliation/organization shown under role."),
          })
          .strict(),
      )
      // 2 is the floor — a single person doesn't need a grid; use
      // `callout` or plain text for one person's bio instead. 12 is the
      // ceiling (裁定 1 — covers p12's 9 speakers with margin; a larger
      // roster should split across multiple people_cards slides rather
      // than cram a 13th+ card onto one grid).
      .min(
        2,
        `people_cards.people needs at least 2 people — a single person's bio doesn't need a grid; use "callout" or plain text instead`,
      )
      .max(
        12,
        `people_cards.people accepts at most 12 people — a larger roster should split across multiple people_cards slides instead of cramming more cards onto one grid`,
      )
      .describe(
        "2-12 people laid out on an equal-weight card grid (1-3 rows, sized by count), each card an " +
          "initials badge (derived from name, no photo needed) plus name and optional role/org — author " +
          "them in the reading order you want the grid to fill row-major.",
      ),
  })
  .strict()
  // Schema guidance (device_mockup/cycle precedent — `pptfast schema`/
  // `irJsonSchema()` is the surface a model actually reads before writing
  // IR): name the concrete alternative components and state the one-line
  // test that decides between them.
  .describe(
    "Lays 2-12 people out on an equal-weight card grid, each with a deterministic initials badge in place " +
      "of a photo, for content that is fundamentally about *people* — a team roster, a speaker lineup, a " +
      "judging panel, an author list. Use people_cards when every item names a person; keep `row_cards`/" +
      "`icon_cards` (both capped at 6 items) for non-person enumerations — features, milestones, topics — " +
      "even when they happen to share the same name/role/org-shaped fields.",
  )

export const aliases = {} satisfies ComponentAliasSpec

// stretchable: true — same "卡壳类" density-stretch posture as its closest
// siblings `row_cards`/`icon_cards` (`component-traits.ts`'s own doc
// comment): a people_cards grid with fewer people than the slot has room
// for grows its cards to fill the leftover height instead of leaving it
// dead, capped the same way. Not selfVisual/scalable/passthroughShell —
// same reasoning as row_cards/icon_cards: each card is an ordinary
// bento-grid cell, not an already-carded diagram or a scale-to-fill
// graphic. Not evidence — no probe evidence names a people roster as an
// evidence-carrying visual the way chart/data_table/device_mockup are.
export const traits = {
  stretchable: true,
  selfVisual: false,
  scalable: false,
  passthroughShell: false,
  fullBody: false,
  evidence: false,
} as const satisfies ComponentTraits
