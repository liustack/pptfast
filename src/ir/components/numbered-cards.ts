import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

export const schema = z
  .object({
    type: z.literal("numbered_cards"),
    /** 编号网格列表（编辑部大数字目录）：自动编号 01..N，无卡壳左竖线
     * 分栏，适合并列名录/作品集/要点集。≤4 项单行，5-8 项两行网格。 */
    items: z
      .array(
        z
          .object({
            title: z.string(),
            text: z.string().optional(),
            sub: z.string().optional(),
          })
          .strict()
      )
      .min(3)
      .max(8),
  })
  .strict()

export const aliases = {
  items: [{ itemsKey: "items", aliases: { description: "text", desc: "text" } }],
} satisfies ComponentAliasSpec

export const traits = {
  stretchable: false,
  selfVisual: false,
  scalable: false,
  passthroughShell: false,
  fullBody: false,
  evidence: false,
} as const satisfies ComponentTraits
