import { z } from "zod"
import { IconNameSchema } from "./shared"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

export const schema = z
  .object({
    type: z.literal("verdict_banner"),
    text: z.string(),
    tone: z.enum(["positive", "warning", "neutral"]),
    icon: IconNameSchema.optional(),
  })
  .strict()

export const aliases = {
  block: { variant: "tone" },
} satisfies ComponentAliasSpec

export const traits = {
  stretchable: false,
  selfVisual: true,
  scalable: false,
  passthroughShell: false,
  fullBody: false,
  evidence: false,
} as const satisfies ComponentTraits
