import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

export const schema = z
  .object({
    type: z.literal("matrix"),
    /** 二维定位矩阵：带可选 XY 轴标签的色格网格，items 按行优先填格，
     * tone 决定象限底色。适合定位矩阵/象限分析/组合分类。 */
    x_title: z.string().optional(),
    y_title: z.string().optional(),
    cols: z.number().int().min(2).max(3),
    items: z
      .array(
        z
          .object({
            title: z.string(),
            tag: z.string().optional(),
            tone: z.enum(["neutral", "accent", "info"]).optional(),
          })
          .strict()
      )
      .min(2)
      .max(9),
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
