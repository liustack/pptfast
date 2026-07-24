import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

export const schema = z
  .object({
    type: z.literal("bmc"),
    /** Business Model Canvas 经典九宫——固定具名键（非位置数组），每槽
     * 1-4 条。渲染层按 Osterwalder 标准五列画布排布（见 bmc.tsx 头注）。 */
    key_partners: z.array(z.string()).min(1).max(4),
    key_activities: z.array(z.string()).min(1).max(4),
    key_resources: z.array(z.string()).min(1).max(4),
    value_propositions: z.array(z.string()).min(1).max(4),
    customer_relationships: z.array(z.string()).min(1).max(4),
    channels: z.array(z.string()).min(1).max(4),
    customer_segments: z.array(z.string()).min(1).max(4),
    cost_structure: z.array(z.string()).min(1).max(4),
    revenue_streams: z.array(z.string()).min(1).max(4),
  })
  .strict()

export const aliases = {
  block: {
    partners: "key_partners",
    activities: "key_activities",
    resources: "key_resources",
    value_proposition: "value_propositions",
    relationships: "customer_relationships",
    segments: "customer_segments",
    costs: "cost_structure",
    revenue: "revenue_streams",
  },
} satisfies ComponentAliasSpec

export const traits = {
  stretchable: false,
  selfVisual: false,
  scalable: false,
  passthroughShell: false,
  fullBody: true,
  evidence: false,
} as const satisfies ComponentTraits
