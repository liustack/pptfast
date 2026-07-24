import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

export const schema = z
  .object({
    type: z.literal("architecture"),
    layers: z.array(
      z
        .object({ title: z.string(), items: z.array(z.string()) })
        .strict()
    ),
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
