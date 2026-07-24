import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

export const schema = z
  .object({
    type: z.literal("quote"),
    text: z.string(),
    attribution: z.string().optional(),
  })
  .strict()

export const aliases = {
  block: { content: "text", author: "attribution", by: "attribution" },
} satisfies ComponentAliasSpec

export const traits = {
  stretchable: false,
  selfVisual: true,
  scalable: false,
  passthroughShell: true,
  fullBody: false,
  evidence: false,
} as const satisfies ComponentTraits
