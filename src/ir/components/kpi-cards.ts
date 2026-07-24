import { z } from "zod"
import { IconNameSchema } from "./shared"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

export const schema = z
  .object({
    type: z.literal("kpi_cards"),
    items: z.array(
      z
        .object({
          value: z.string(),
          unit: z.string().optional(),
          label: z.string(),
          delta: z.enum(["up", "down", "flat"]).optional(),
          icon: IconNameSchema.optional(),
          /** 数据来源小字（财经信任语言，2026-07-12 借鉴），如
           * 「来源: Crunchbase」。 */
          source: z.string().optional(),
        })
        .strict()
    ),
  })
  .strict()

export const aliases = {
  items: [{ itemsKey: "items", aliases: { title: "label", name: "label" } }],
} satisfies ComponentAliasSpec

export const traits = {
  stretchable: true,
  selfVisual: false,
  scalable: false,
  passthroughShell: false,
  fullBody: false,
  evidence: true,
} as const satisfies ComponentTraits
