import { z } from "zod"
import { IconNameSchema } from "./shared"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

export const schema = z
  .object({
    type: z.literal("icon_cards"),
    /** 2-4 项单行并列，5-6 项自动 2 行 3 列宫格（2026-07-11 用户借鉴）。 */
    items: z
      .array(
        z
          .object({
            icon: IconNameSchema,
            title: z.string(),
            text: z.string(),
          })
          .strict()
      )
      .min(2)
      .max(6),
  })
  .strict()

export const aliases = {} satisfies ComponentAliasSpec

export const traits = {
  stretchable: true,
  selfVisual: false,
  scalable: false,
  passthroughShell: false,
  fullBody: false,
  evidence: false,
} as const satisfies ComponentTraits
