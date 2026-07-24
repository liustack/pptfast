import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

// Porter's Five Forces hub-and-spoke (structure-components wave 2 task 1,
// second component of this task): `rivalry` is the center panel
// (competitive rivalry — the model's own namesake force), the other four
// are the surrounding forces. All five named slots share one shape —
// `intensity` is meaningful for `rivalry` too, a market's own competitive
// intensity is exactly what the center panel measures, so it isn't
// special-cased out of the shared schema the way a "hub has no intensity"
// design would have done.
const FiveForcesPanelSchema = z
  .object({
    label: z.string().optional(),
    intensity: z.enum(["low", "medium", "high"]).optional(),
    items: z.array(z.string()).min(1).max(5),
  })
  .strict()

export const schema = z
  .object({
    type: z.literal("five_forces"),
    /** 波特五力——中心「竞争强度」+ 四向力量（新进入者/供应商议价力/买方
     * 议价力/替代品威胁）。五槽同构，`intensity` 对中心槽同样有意义（见
     * {@link FiveForcesPanelSchema}）。 */
    rivalry: FiveForcesPanelSchema,
    new_entrants: FiveForcesPanelSchema,
    supplier_power: FiveForcesPanelSchema,
    buyer_power: FiveForcesPanelSchema,
    substitutes: FiveForcesPanelSchema,
  })
  .strict()

export const aliases = {
  block: {
    entrants: "new_entrants",
    suppliers: "supplier_power",
    buyers: "buyer_power",
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
