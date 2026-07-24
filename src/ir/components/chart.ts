import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

export const schema = z
  .object({
    type: z.literal("chart"),
    /** dumbbell（2026-07-12 借鉴）：哑铃变化图——series[0]=起点值、
     * series[1]=终点值（等长同 x 标签），每行「起点●———●终点」显变化。
     * bar 可加 direction:"horizontal" 横条排名（长标签友好）。
     * pie 可加 style:"donut" 环形+中心总值。 */
    chart_type: z.enum(["bar", "line", "pie", "funnel", "dumbbell"]),
    direction: z.enum(["horizontal", "vertical"]).optional(),
    style: z.enum(["donut"]).optional(),
    /** Renders only for `chart_type: "bar"` (either direction) and
     * `"line"` — a cartesian plot box with a real category/value axis pair
     * to title and grid against. Ignored (schema-legal, silently dropped
     * at render, warn-severity `chart_axes_ignored` validate finding) on
     * `pie`/`funnel`/`dumbbell`, which have no such plot box. */
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
          data: z.array(
            z
              .object({
                x: z.union([z.string(), z.number()]),
                y: z.number(),
              })
              .strict()
          ),
        })
        .strict()
    ),
  })
  .strict()

export const aliases = {} satisfies ComponentAliasSpec

export const traits = {
  stretchable: false,
  selfVisual: false,
  scalable: true,
  passthroughShell: false,
  fullBody: false,
  evidence: true,
} as const satisfies ComponentTraits
