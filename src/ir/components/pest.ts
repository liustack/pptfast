import { z } from "zod"
import type { ComponentAliasSpec, ComponentTraits } from "./types"

// PEST macro-environment scan (structure-components wave task 1, second
// component of this task — same "named-slot family" discipline as
// swot/bmc above: four independent named fields, never a positional array a
// weak model could mis-order). Each quadrant carries its own optional
// `title` inline (`{title?, items}`) instead of a sibling `labels` object
// the way swot does — this task's own schema-shape call, not a swot-copy
// oversight (see pest.tsx's own file header for the render-side rationale).
const PestQuadrantSchema = z
  .object({
    title: z.string().optional(),
    items: z.array(z.string()).min(1).max(5),
  })
  .strict()

export const schema = z
  .object({
    type: z.literal("pest"),
    /** 政治/经济/社会/技术——经典 2×2 PEST 宏观环境扫描。每槽 1-5 条，各槽
     * 自带可选 `title` 覆写（缺省用固定英文全称，见 pest.tsx）。 */
    political: PestQuadrantSchema,
    economic: PestQuadrantSchema,
    social: PestQuadrantSchema,
    technological: PestQuadrantSchema,
  })
  .strict()

export const aliases = {
  block: {
    politics: "political",
    economy: "economic",
    society: "social",
    technology: "technological",
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
