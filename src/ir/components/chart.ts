import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

/** One plotted datum. `x` is a category label (string) or a numeric
 * coordinate (number); `y` is always numeric. `size` is scatter-only (see
 * the chart_type `.describe()` below): an optional per-point magnitude that
 * turns a scatter dot into a bubble whose radius scales with it. Every other
 * chart_type ignores `size`. */
const ChartPointSchema = z
  .object({
    x: z.union([z.string(), z.number()]),
    y: z.number(),
    size: z.number().nonnegative().optional(),
  })
  .strict()

export const schema = z
  .object({
    type: z.literal("chart"),
    /** dumbbell（2026-07-12 借鉴）：哑铃变化图——series[0]=起点值、
     * series[1]=终点值（等长同 x 标签），每行「起点●———●终点」显变化。
     * bar 可加 direction:"horizontal" 横条排名（长标签友好）。
     * pie 可加 style:"donut" 环形+中心总值。
     * scatter：数值 x/y 点集，点可选 size（即 bubble）。
     * area：line 的基线闭合填充变体。donut：pie 的环形子型（可选中心总值）。
     * gauge：单值对目标的完成度半环。 */
    chart_type: z
      .enum(["bar", "line", "pie", "funnel", "dumbbell", "scatter", "area", "donut", "gauge"])
      .describe(
        "How to plot the series. bar/line: a category axis of trends or comparisons. " +
          "scatter: a numeric x-y point cloud — use when BOTH axes are quantities (add an optional per-point `size` to make it a bubble chart); if x is a category label, use line/bar instead. " +
          "area: a line with the region under it filled to the baseline, for volume/cumulative emphasis. " +
          "pie: part-to-whole share. donut: the ring form of pie (set `center_total: true` to print the summed total big in the middle). " +
          "funnel: one value narrowing across ordered stages. dumbbell: a from→to change per row. " +
          "gauge: ONE value's progress toward a target, drawn as a filled half-ring with the number centered — reach for it for a single completion metric (e.g. 62% of goal). For several independent headline metrics side by side use `kpi_cards`, never a row of gauges.",
      ),
    direction: z.enum(["horizontal", "vertical"]).optional(),
    style: z.enum(["donut"]).optional(),
    /** `chart_type: "donut"` only: print the summed total as a big number in
     * the ring's hollow center (default: empty center). The legacy
     * `chart_type: "pie"` + `style: "donut"` form always shows that center
     * total; this flag is the opt-in switch for the dedicated `donut`
     * chart_type. Ignored by every other chart_type. */
    center_total: z.boolean().optional(),
    /** `chart_type: "gauge"` only: the numeric range the filled arc spans.
     * `min` defaults to 0 and `max` to 100, so a bare gauge reads its single
     * value as a percentage of 100. Provide both to score against a custom
     * target (e.g. `{ min: 0, max: 200 }` with a value of 150 fills 75%).
     * Ignored by every other chart_type. */
    gauge: z
      .object({
        min: z.number().optional(),
        max: z.number().optional(),
      })
      .strict()
      .optional(),
    /** Renders only for `chart_type: "bar"` (either direction), `"line"`,
     * `"scatter"`, and `"area"` — a cartesian plot box with a real
     * category/value axis pair to title and grid against. Ignored
     * (schema-legal, silently dropped at render, warn-severity
     * `chart_axes_ignored` validate finding) on `pie`/`donut`/`funnel`/
     * `dumbbell`/`gauge`, which have no such plot box. */
    axes: z
      .object({
        x_title: z.string().optional(),
        y_title: z.string().optional(),
        show_grid: z.boolean().optional(),
      })
      .strict()
      .optional(),
    series: z.array(
      z
        .object({
          name: z.string(),
          data: z.array(ChartPointSchema),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((c, ctx) => {
    // scatter needs genuine numeric coordinates on both axes — a string `x`
    // is the model reaching for `line`/`bar` (category axis) by the wrong
    // name. Point the message at the exact offending point so the fix is
    // mechanical, same "name the row and key" discipline data-table's own
    // superRefine uses.
    if (c.chart_type === "scatter") {
      c.series.forEach((s, si) =>
        s.data.forEach((d, di) => {
          if (typeof d.x !== "number") {
            ctx.addIssue({
              code: "custom",
              path: ["series", si, "data", di, "x"],
              message:
                `scatter charts plot numeric x-y pairs, but series[${si}].data[${di}].x is the string "${d.x}". ` +
                "Give each point a numeric x (add an optional `size` for a bubble). " +
                'For a category x-axis use chart_type "line" or "bar" instead.',
            })
          }
        }),
      )
    }
    // gauge is a single value's completion, not a series — exactly one series
    // with exactly one point. The redirect to kpi_cards is the same
    // gauge-vs-kpi boundary the chart_type `.describe()` draws.
    if (c.chart_type === "gauge") {
      const points = c.series.reduce((n, s) => n + s.data.length, 0)
      if (c.series.length !== 1 || points !== 1) {
        ctx.addIssue({
          code: "custom",
          path: ["series"],
          message:
            `gauge shows one value's progress toward a target: provide exactly one series with exactly one data point ` +
            `({ x: <label>, y: <value> }), got ${c.series.length} series / ${points} point(s). ` +
            "For several independent metrics side by side use kpi_cards, not a gauge each.",
        })
      }
      const min = c.gauge?.min ?? 0
      const max = c.gauge?.max ?? 100
      if (max <= min) {
        ctx.addIssue({
          code: "custom",
          path: ["gauge", "max"],
          message: `gauge max (${max}) must be greater than min (${min}).`,
        })
      }
    }
  })

export const aliases = {} satisfies ComponentAliasSpec

export const traits = {
  stretchable: false,
  selfVisual: false,
  scalable: true,
  passthroughShell: false,
  fullBody: false,
  evidence: true,
} as const satisfies ComponentTraits
