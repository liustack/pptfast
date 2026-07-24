import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

// 值驱动数值网格家族（structure-components wave 2 task 2）：另一支满幅
// 组件——形状由 x_labels/y_labels 两个具名数组直接推导（无独立 cols/rows
// 字段，杜绝两套数字互相打架），values 矩形性用三条 `.refine` 校验
// （行数=y_labels 长度、每行列数=x_labels 长度、可选 domain.max>=min）。
// zod v4 下 `.refine()` 直接挂在 discriminatedUnion 成员对象上仍保留
// `.shape`（经本任务实测确认，不同于 v3 的 ZodEffects 包装丢 `.shape`
// 的旧顾虑——`GanttItemSchema` 当年绕开的那个坑在 v4 已不成立），因此这里
// 不必像 gantt 的 refine 那样退一层塞进嵌套数组项，直接写在组件对象本身。
export const schema = z
  .object({
    type: z.literal("heatmap"),
    /** 列头（沿横轴，每列一个），1-10 项——1 项即单列热力图（病态但合法，
     * 见 heatmap.tsx 头注）。 */
    x_labels: z.array(z.string()).min(1).max(10),
    /** 行头（沿纵轴，每行一个），1-10 项——1 项即单行热力图。 */
    y_labels: z.array(z.string()).min(1).max(10),
    /** 值矩阵，行优先：`values[row][col]`。行数必须等于 y_labels 长度、
     * 每行列数必须等于 x_labels 长度（下方 `.refine`）——不接受锯齿数组。
     * 无正负号约束（负值合法业务数据，如同比降幅）。 */
    values: z.array(z.array(z.number())).min(1),
    /** 显式色阶值域覆写，缺省取 values 的真实 min/max。`min===max`
     * （退化域）合法——渲染层落回统一中间色调，不是 schema 层拒收的
     * 病态（见 heatmap.tsx 的 `valueT`）。`min>max`（真正的顺序错误）
     * 才是 schema 层拒收的对象（下方 `.refine`）。 */
    domain: z.object({ min: z.number(), max: z.number() }).strict().optional(),
    /** 每格叠加显示数值（原样 `String(value)`，不做千分位/小数位格式化——
     * 格式化留给未来任务，v1 范围内如实展示原始数字）。缺省不显示。 */
    show_values: z.boolean().optional(),
    /** 横轴/纵轴整体说明（如「季度」/「地区」），复用 chart.tsx 的
     * axes.x_title/y_title 拟合机制——与 x_labels/y_labels（每列/每行的
     * 具体刻度）是两个不同语义层，同时可选、互不依赖。 */
    x_title: z.string().optional(),
    y_title: z.string().optional(),
  })
  .strict()
  .refine((c) => c.values.length === c.y_labels.length, {
    message: "heatmap values row count must equal y_labels length (one row per y_label)",
    path: ["values"],
  })
  .refine((c) => c.values.every((row) => row.length === c.x_labels.length), {
    message: "heatmap every values row's length must equal x_labels length (one column per x_label)",
    path: ["values"],
  })
  .refine((c) => !c.domain || c.domain.max >= c.domain.min, {
    message: "heatmap domain.max must be greater than or equal to domain.min",
    path: ["domain"],
  })

export const aliases = {
  block: {
    rows: "y_labels",
    columns: "x_labels",
    data: "values",
    range: "domain",
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
