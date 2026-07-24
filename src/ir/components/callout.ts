import { z } from "zod"
import { IconNameSchema } from "./shared"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

export const schema = z
  .object({
    type: z.literal("callout"),
    variant: z.enum(["info", "warn", "tip"]),
    text: z.string(),
    icon: IconNameSchema.optional(),
  })
  .strict()

export const aliases = {
  block: { tone: "variant" },
} satisfies ComponentAliasSpec

export const traits = {
  stretchable: false,
  selfVisual: true,
  scalable: false,
  passthroughShell: false,
  fullBody: false,
  evidence: false,
} as const satisfies ComponentTraits
