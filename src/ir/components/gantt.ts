import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

// gantt's own item schema is pulled out to a named const (structure-
// components wave task 2, decision 6) rather than inlined in the union
// array below, purely so its `.refine` — the one item shape in this whole
// union that needs cross-field validation — reads as a standalone unit
// instead of being buried in the middle of a 400-line array literal.
// `ComponentSchema.options.map((option) => option.shape.type.value)`
// (`COMPONENT_TYPES` below) requires every *top-level* union member to stay
// a plain `ZodObject` (`.shape` doesn't exist on the `ZodEffects` a `.refine`
// wrapper produces) — this only matters for `gantt`'s own top-level object,
// which stays untouched; the refine lives one level down, on the item
// schema nested inside `z.array(...)`, where that constraint doesn't apply.
const GanttItemSchema = z
  .object({
    label: z.string(),
    start: z.number(),
    end: z.number(),
  })
  .strict()
  .refine((item) => item.end > item.start, {
    message: "gantt item's end must be greater than its start (no zero/negative-duration bars)",
    path: ["end"],
  })

export const schema = z
  .object({
    type: z.literal("gantt"),
    /** 共享数值轴时间条：`start`/`end` 是同一条数轴上的数值（周序/月序/
     * 任意模型自定的单位），不解析日期字符串——轴界=所有条目 start 的最小
     * 值与 end 的最大值。2-8 条，每条 `end` 必须大于 `start`
     * （{@link GanttItemSchema} 的 `.refine`）。 */
    items: z.array(GanttItemSchema).min(2).max(8),
    /** 可选刻度标签，沿轴均匀分布展示（不必与 items 的 start/end 值对齐
     * ——纯展示刻度，如 ["W1","W2","W3","W4"]）。 */
    axis_labels: z.array(z.string()).optional(),
  })
  .strict()

export const aliases = {
  items: [{ itemsKey: "items", aliases: { from: "start", to: "end" } }],
} satisfies ComponentAliasSpec

export const traits = {
  stretchable: false,
  selfVisual: false,
  scalable: false,
  passthroughShell: false,
  fullBody: true,
  evidence: false,
} as const satisfies ComponentTraits
