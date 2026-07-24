import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

// 数值轴家族（structure-components wave task 2）：另一支满幅组件——不是
// named-slot（swot/bmc 的具名槽治的是「弱模型排错序」），而是「运行合计/
// 比例映射必须逐字节确定性可推导」，见 waterfall.tsx/gantt.tsx 头注。
export const schema = z
  .object({
    type: z.literal("waterfall"),
    /** 瀑布桥图条目：`value` 是带符号增量（相对上一条运行合计的涨跌），
     * `kind` 缺省即普通涨跌делта；显式 "total" 表示该条不是增量而是绝对
     * 合计检查点（渲染层从 0 画到 `value` 本身，不参与增量累加）。3-8
     * 条——末条非 "total" 时渲染层自动补一根合计柱（见 waterfall.tsx）。 */
    items: z
      .array(
        z
          .object({
            label: z.string(),
            value: z.number(),
            kind: z.enum(["delta", "total"]).optional(),
          })
          .strict()
      )
      .min(3)
      .max(8),
    /** 数值单位后缀（如「万」「%」），附加在每条数值标签之后，纯展示。 */
    unit: z.string().optional(),
  })
  .strict()

export const aliases = {
  items: [{ itemsKey: "items", aliases: { amount: "value" } }],
} satisfies ComponentAliasSpec

export const traits = {
  stretchable: false,
  selfVisual: false,
  scalable: false,
  passthroughShell: false,
  fullBody: true,
  evidence: false,
} as const satisfies ComponentTraits
