import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

export const schema = z
  .object({
    type: z.literal("code"),
    language: z.string(),
    code: z.string(),
  })
  .strict()

export const aliases = {
  block: { content: "code", source: "code", snippet: "code", text: "code" },
} satisfies ComponentAliasSpec

export const traits = {
  stretchable: false,
  selfVisual: true,
  scalable: false,
  passthroughShell: false,
  fullBody: false,
  evidence: false,
} as const satisfies ComponentTraits
