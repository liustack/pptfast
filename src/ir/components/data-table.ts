import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

// data_table（R1 证据表达波 Task T3 —— 第 33 个组件，wave-2 域文件自持流程
// 首次真实演练）：结构化证据表格，与 comparison（纯文本、无独立列宽/对齐/
// 强调概念）互补——comparison 适合"逐维度并排对比"，data_table 适合"一批
// 带列头的行记录"（如指标明细、时间序列快照）。
//
// 契约按 roadmap §6.2 修订版（用户已批准的宽容修订，而非最初的全 strict
// 草案）：
//   - columns 2-8：key 列内唯一（hard error，下方 superRefine）、label、
//     可选 align。
//   - rows 1-12：cells 是 Record<colKey, string|number>，无长度下限——
//     一行可以不含任何列的 key。
//   - 宽容点：cells 缺失某个已声明列的 key 是 schema 合法的（渲染层画空
//     单元格，ir-quality.ts 出 warn，指出 row index 与缺失 key）——这是
//     "内容不完整"，不是"结构错误"。
//   - 收紧点：cells 出现不在 columns 声明范围内的 key 是 hard error（下方
//     superRefine，message 含 row index 与具体 key）——这是"结构性误解"
//     （模型编了一个不存在的列），strict 哲学要响，不能悄悄忽略。
//   - 两类检查都必须在组件级 superRefine 里做，不能拆到 cells 自己的 schema
//     上——cells 是一个不知道自己"该有哪些 key"的 z.record，唯一知道合法
//     key 集合的是同一组件的 columns 字段。
const DataTableColumnSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    align: z.enum(["left", "center", "right"]).optional(),
  })
  .strict()

const DataTableRowSchema = z
  .object({
    /** `Record<colKey, string|number>`——数值不做千分位/百分比等格式化，
     * 原样 `String(value)` 上屏（作者要最终展示效果就直接给字符串）。缺失
     * 某列 key 合法（渲染空单元格 + quality warn），多出不认识的 key 是
     * 下方 superRefine 的 hard error。 */
    cells: z.record(z.string(), z.union([z.string(), z.number()])),
    /** highlight=强调单行（如"本期"）、total=汇总行（如"合计"）。两者都是
     * 纯展示态、不参与任何计算——v1 无公式。 */
    emphasis: z.enum(["highlight", "total"]).optional(),
  })
  .strict()

export const schema = z
  .object({
    type: z.literal("data_table"),
    columns: z.array(DataTableColumnSchema).min(2).max(8),
    rows: z.array(DataTableRowSchema).min(1).max(12),
    /** 表格脚注（数据来源等），渲染为表格下方一行小字——slide 级的
     * `footnote` 是全页脚注，这个是"这张表自己的"，两者独立、可以同时
     * 存在。 */
    source: z.string().optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    // columns[].key 列内唯一——重复 key 会让下面的 extra-key 检查和渲染层
    // 的按 key 查找都产生歧义（两列同 key，cells 里的这个 key 到底对应
    // 哪一列？），所以在结构上直接拒收，不留给渲染层猜。
    const keyCounts = new Map<string, number>()
    for (const col of c.columns) keyCounts.set(col.key, (keyCounts.get(col.key) ?? 0) + 1)
    const duplicateKeys = [...keyCounts].filter(([, count]) => count > 1).map(([key]) => key)
    if (duplicateKeys.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["columns"],
        message: `data_table column keys must be unique — duplicated: ${duplicateKeys.map((k) => `'${k}'`).join(", ")}`,
      })
    }

    // rows[].cells 的每个 key 必须是某个已声明列的 key——多出的 key 只可能
    // 来自模型编造了一个不存在的列（结构性误解），而不是"数据碰巧多了一
    // 项"，所以是 hard error，不是 ir-quality 的 warn。message 按契约要求
    // 同时点名 row index 与具体 key。
    const columnKeys = new Set(c.columns.map((col) => col.key))
    const availableKeys = [...columnKeys].map((k) => `'${k}'`).join(", ") || "(no columns declared)"
    c.rows.forEach((row, i) => {
      const extraKeys = Object.keys(row.cells).filter((k) => !columnKeys.has(k))
      if (extraKeys.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", i, "cells"],
          message: `data_table rows[${i}].cells has key(s) not declared in any column: ${extraKeys.map((k) => `'${k}'`).join(", ")} — declared column keys: ${availableKeys}`,
        })
      }
    })
  })

// 未设别名行：columns/rows/cells/source/key/label/align/emphasis 都是模型
// 已在别处（comparison 的 columns/rows、heatmap 的 x_labels 等）见过的常规
// 词，没有 heatmap.ts 那种"图表词汇 vs 表格词汇"式的可预测同义漂移证据可循
// ——按 field-aliases.ts 里 bullets/chart/comparison 等同类组件的先例，空表
// 是诚实默认，等真实失败样本出现再补（"按需"，不是"预先编"）。
export const aliases = {} satisfies ComponentAliasSpec

// `passthroughShell: true` is currently inert in practice (T3 review, Minor
// finding): `content-bento-panel.tsx`'s `renderCell` checks `SELF_VISUAL_TYPES`
// first (line ~650) and returns early via `SvgContent` for any type in that
// set — data_table's own `selfVisual: true` above always wins that race, so
// the code never falls through to the later `PASSTHROUGH_SHELL_TYPES` check
// (line ~684) that would actually consult this flag. Left as `true` anyway
// (matches the plan's explicit contract, and is the semantically correct
// declaration — data_table genuinely does draw its own internal chrome with
// no enclosing card, independent of which consumer happens to read it today)
// — flagged here for a future reader who traces a bento-panel render and
// finds no behavioral difference from toggling it, not fixed, since there is
// no known-wrong behavior to correct.
export const traits = {
  stretchable: false,
  selfVisual: true,
  scalable: false,
  passthroughShell: true,
  fullBody: false,
  evidence: true,
} as const satisfies ComponentTraits
