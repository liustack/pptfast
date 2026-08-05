import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

// logo_wall component wave (`.issues/2026-08-06-logo-wall/plan.md`, 控制器
// 裁定 1-5): the 4th evidence-gate component (37th overall). Closes the probe
// evidence gate's "logo wall" finding (2/2) with two orthogonal render
// defects, each confirmed on real rendered pixels:
//
//  - p13 (会展致谢 sponsor wall, 8 wide-aspect wordmark logos): forced onto
//    `image_grid`, whose equal-width cells crop with `xMidYMid slice`
//    (cover) — over half the sponsor wordmarks lost their own text to the
//    crop ("NORTHBR", "lian Capi"), and one model silently dropped half the
//    roster to dodge the `image_grid` `.max(4)` cap.
//  - p14 (媒体报道墙, 10 transparent single-ink press logos, 5 dark + 5
//    light): `image_grid` never paints a backing behind a real asset (only a
//    1px border), so transparent logos let the slide background show straight
//    through — a white-ink logo on a light theme rendered as an empty box,
//    and one deepseek run burned its whole round budget brute-forcing 450+
//    non-existent component names (`logo_wall`, `press_wall`, `media_wall`…)
//    555 times without ever producing renderable IR. The model named this
//    component itself.
//
// 裁定 1 — minimal semantic surface: each item is a required `asset_id` plus
// an optional `label` (double duty — accessibility alt fallback and the
// missing-asset degrade text, 裁定 3). An optional overall `title`. No
// grayscale/monochrome treatment option (recoloring someone's logo is a
// trademark landmine), no per-cell link, no size/weight tiers (sponsorship
// grading has no probe evidence — deferred). The floor is 4: fewer logos
// belong in `image`/`image_grid`, and the error text says so.
export const schema = z
  .object({
    type: z.literal("logo_wall"),
    title: z.string().optional(),
    items: z
      .array(
        z
          .object({
            asset_id: z
              .string()
              .describe(
                "Asset id of one logo image (declared in `assets.images`). The logo is drawn " +
                  "contain-fit (never cropped) on an auto-generated neutral backing panel, so a " +
                  "transparent single-ink logo — the way press kits ship them — stays legible " +
                  "whatever its ink color or the slide's background.",
              ),
            label: z
              .string()
              .optional()
              .describe(
                "Optional name of the organization this logo belongs to. Used as the image's " +
                  "accessibility text when the asset itself carries no alt, and as the visible " +
                  "fallback text if the asset is missing — never drawn on top of a present logo.",
              ),
          })
          .strict(),
      )
      // 4 is the floor (裁定 1) — 1-3 logos don't need a wall; use `image` for
      // one or `image_grid` for a couple. 12 is the ceiling (裁定 4): past it,
      // contain-fit cells at the tightest tier (3×4) shrink each logo below a
      // legible size — split a larger set across multiple logo_wall slides.
      .min(
        4,
        `logo_wall.items needs at least 4 logos — for 1-3 logos use "image" (one) or "image_grid" (a couple) instead of a wall`,
      )
      .max(
        12,
        `logo_wall.items accepts at most 12 logos — past 12 each logo shrinks below a legible size on the grid; split a larger set across multiple logo_wall slides`,
      )
      .describe(
        "4-12 organization/brand logos laid out on an even wall, each drawn contain-fit (never " +
          "cropped) on its own neutral backing panel so transparent single-ink logos stay legible. " +
          "Author them in the reading order you want the wall to fill row-major.",
      ),
  })
  .strict()
  // Schema guidance (device_mockup/cycle/people_cards precedent — the JSON
  // Schema a model reads before writing IR): name the concrete alternatives
  // and the one-line test that decides between them. 裁定 5: models already
  // guess this component's own name (`logo_wall`), so lean into it.
  .describe(
    "Lays 4-12 organization/brand logos out on an even wall — a sponsor wall, a client roster, a " +
      "press/'as seen in' media wall, a partner strip — each logo drawn contain-fit (never cropped) on " +
      "an auto-generated neutral backing panel that keeps a transparent single-ink logo legible on any " +
      "theme. Use logo_wall whenever the content is a set of third-party identity marks. Keep `image_grid` " +
      "(2-4 items, capped) for ordinary photographs that fill their own frame, and `device_mockup` for a " +
      "single product screenshot framed as running software — a logo is neither.",
  )

export const aliases = {} satisfies ComponentAliasSpec

// All-false traits, same posture as `image_grid`/`image`/`image_compare`: a
// logo wall is a plain grid of images, not a density-stretch card family
// (stretchable), a self-carded diagram (selfVisual), a uniformly scalable
// single graphic (scalable — the wall is many cells, not one image), a
// self-chromed node set (passthroughShell), a whole-slide canvas (fullBody),
// or an enlargeable evidence graphic (evidence — a wall of third-party marks
// is social proof, not a reviewable data artifact the way chart/data_table/
// device_mockup are).
export const traits = {
  stretchable: false,
  selfVisual: false,
  scalable: false,
  passthroughShell: false,
  fullBody: false,
  evidence: false,
} as const satisfies ComponentTraits
