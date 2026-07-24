import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

export const schema = z
  .object({
    type: z.literal("timeline"),
    /** 版式：缺省 horizontal（存量语义）。vertical=左 date/中轴圆点/右
     * 标题描述的编辑部竖排时间线，适合 4-8 个叙事型节点。 */
    layout: z.enum(["horizontal", "vertical"]).optional(),
    milestones: z.array(
      z
        .object({
          date: z.string(),
          title: z.string(),
          desc: z.string().optional(),
          /** 强调节点：accent 色 + 大圆点（时间线上的「转折点」语义）。 */
          highlight: z.boolean().optional(),
        })
        .strict()
    ),
  })
  .strict()

export const aliases = {
  items: [{ itemsKey: "milestones", aliases: { year: "date", text: "desc", description: "desc" } }],
} satisfies ComponentAliasSpec

export const traits = {
  stretchable: false,
  selfVisual: false,
  scalable: false,
  passthroughShell: true,
  fullBody: false,
  evidence: false,
} as const satisfies ComponentTraits
