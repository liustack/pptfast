import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

// 结构化组件族（structure-components wave task 1）：named-slot 满幅组件
// ——不走 bullets 那种弱模型易错序的位置数组，每个语义槽是独立具名字段，
// 模型写错字段名会被 zod strict 直接拒收，而不是静默错标象限/分区。渲染
// 时必须是 slide 的唯一 component（`FULL_BODY_TYPES`, component-traits.ts
// + `checkFullBodyExclusivity`, api.ts 的独占硬门）。
export const schema = z
  .object({
    type: z.literal("swot"),
    /** 内部因素·优势/劣势，外部因素·机会/威胁——经典 2×2 SWOT 矩阵。每槽
     * 1-5 条，各自独立数组（绝不是共享一个位置数组按下标分象限）。 */
    strengths: z.array(z.string()).min(1).max(5),
    weaknesses: z.array(z.string()).min(1).max(5),
    opportunities: z.array(z.string()).min(1).max(5),
    threats: z.array(z.string()).min(1).max(5),
    /** 象限标题覆写（国际化/自定义措辞）——缺省用固定英文 S/W/O/T 全称
     * （Strengths/Weaknesses/Opportunities/Threats），四键均可选，缺的键
     * 落回默认值。 */
    labels: z
      .object({
        strengths: z.string().optional(),
        weaknesses: z.string().optional(),
        opportunities: z.string().optional(),
        threats: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export const aliases = {
  block: {
    strength: "strengths",
    weakness: "weaknesses",
    opportunity: "opportunities",
    threat: "threats",
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
