import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

export const schema = z
  .object({
    type: z.literal("comparison"),
    columns: z.array(z.string()),
    rows: z.array(
      z
        .object({ label: z.string(), cells: z.array(z.string()) })
        .strict()
    ),
  })
  .strict()

export const aliases = {} satisfies ComponentAliasSpec

export const traits = {
  stretchable: false,
  selfVisual: true,
  scalable: false,
  passthroughShell: false,
  fullBody: false,
  evidence: true,
} as const satisfies ComponentTraits
