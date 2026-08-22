import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

// 图片排版 P2（2026-07-08）：多图网格与双图对比。
export const schema = z
  .object({
    type: z.literal("image_grid"),
    items: z
      .array(
        z
          .object({
            asset_id: z.string(),
            caption: z.string().optional(),
          })
          .strict()
      )
      .min(2)
      .max(4),
    emphasis: z.enum(["none", "first"]).optional(),
  })
  .strict()
  .describe(
    "A 2-4 photo/screenshot grid with cover-crop cells.",
  )

export const aliases = {} satisfies ComponentAliasSpec

export const traits = {
  stretchable: false,
  selfVisual: false,
  scalable: false,
  passthroughShell: false,
  fullBody: false,
  evidence: false,
} as const satisfies ComponentTraits
