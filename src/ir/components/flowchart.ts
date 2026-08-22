import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

export const schema = z
  .object({
    type: z.literal("flowchart"),
    nodes: z
      .array(
        z
          .object({
            id: z.string(),
            label: z.string(),
            kind: z.enum(["rect", "diamond", "round"]).optional(),
          })
          .strict()
      )
      .max(20),
    edges: z.array(
      z
        .object({
          from: z.string(),
          to: z.string(),
          label: z.string().optional(),
        })
        .strict()
    ),
    direction: z.enum(["TB", "TD", "BT", "LR", "RL"]).optional(),
  })
  .strict()

export const aliases = {} satisfies ComponentAliasSpec

export const traits = {
  stretchable: false,
  selfVisual: false,
  scalable: true,
  passthroughShell: true,
  fullBody: false,
  evidence: false,
} as const satisfies ComponentTraits
