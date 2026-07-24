import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

export const schema = z
  .object({
    type: z.literal("steps"),
    items: z
      .array(
        z
          .object({
            title: z.string(),
            text: z.string(),
          })
          .strict()
      )
      .min(2)
      .max(5),
  })
  .strict()

export const aliases = {
  items: [{ itemsKey: "items", aliases: { description: "text", desc: "text" } }],
} satisfies ComponentAliasSpec

export const traits = {
  stretchable: false,
  selfVisual: false,
  scalable: false,
  passthroughShell: true,
  fullBody: false,
  evidence: false,
} as const satisfies ComponentTraits
