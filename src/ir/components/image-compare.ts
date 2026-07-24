import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

export const schema = z
  .object({
    type: z.literal("image_compare"),
    left: z.object({ asset_id: z.string(), label: z.string() }).strict(),
    right: z.object({ asset_id: z.string(), label: z.string() }).strict(),
    style: z.enum(["vs", "before_after"]).optional(),
  })
  .strict()

export const aliases = {} satisfies ComponentAliasSpec

export const traits = {
  stretchable: false,
  selfVisual: false,
  scalable: false,
  passthroughShell: false,
  fullBody: false,
  evidence: false,
} as const satisfies ComponentTraits
