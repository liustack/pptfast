import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

export const schema = z
  .object({
    type: z.literal("roadmap"),
    /** 阶段路线图卡：2-4 个阶段横排，自动编号 01..N，每阶段含标题、
     * 可选时段（如「0-6 个月」）与若干 label:value 指标行。适合分阶段
     * 推进/路线图/里程碑规划。 */
    items: z
      .array(
        z
          .object({
            title: z.string(),
            period: z.string().optional(),
            rows: z
              .array(z.object({ label: z.string(), value: z.string() }).strict())
              .max(4)
              .optional(),
          })
          .strict()
      )
      .min(2)
      .max(4),
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
