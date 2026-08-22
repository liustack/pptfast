/**
 * Fixed theme-table assignment: which lead component each of a theme's
 * seven content pages draws, plus the explicit coverage list the tests
 * refuse to let rot.
 *
 * Forms are not IR. Putting `icon_cards` on `tech` draws badge_cards
 * because `resolveComponentForm` maps theme × type. Slots never set a
 * form field.
 *
 * Zero `Math.random`. The table is the whole contract.
 */

import type { Component } from "@/ir"
import { CHART_VARIANTS, COMPONENT_BUILDERS } from "./components"
import type { Lexicon } from "./lexicon"

/**
 * Surfaces the theme table must show at least once. Missing one fails the
 * test. Hand-written, not a `COMPONENT_TYPES` spread, so a new IR type
 * does not silently get absorbed without a human adding it here.
 */
export const THEME_TABLE_REQUIRED_SURFACES = [
  // 38 IR types, COMPONENT_BUILDERS key order
  "paragraph",
  "bullets",
  "quote",
  "callout",
  "code",
  "citation",
  "verdict_banner",
  "tag_row",
  "kpi_cards",
  "chart",
  "data_table",
  "waterfall",
  "heatmap",
  "gantt",
  "sankey",
  "steps",
  "numbered_cards",
  "icon_cards",
  "row_cards",
  "timeline",
  "roadmap",
  "cycle",
  "rings",
  "matrix",
  "flowchart",
  "architecture",
  "comparison",
  "insight_panel",
  "swot",
  "pest",
  "five_forces",
  "bmc",
  "people_cards",
  "logo_wall",
  "image",
  "image_grid",
  "image_compare",
  "device_mockup",
  // 9 chart subtypes + horizontal bar
  "chart:bar",
  "chart:bar-horizontal",
  "chart:line",
  "chart:area",
  "chart:pie",
  "chart:donut",
  "chart:funnel",
  "chart:dumbbell",
  "chart:scatter",
  "chart:gauge",
  // 14 forms
  "form:icon_columns",
  "form:badge_cards",
  "form:outline_grid",
  "form:cycle_loop",
  "form:hub_spoke",
  "form:petal_wheel",
  "form:numbered_pills",
  "form:hex_cluster",
  "form:donut_trio",
  "form:bubble_row",
  "form:pill_panels",
  "form:arrow_steps",
  "form:vert_timeline",
  "form:numbered_photos",
] as const

export type ThemeChartType =
  | "bar"
  | "line"
  | "area"
  | "pie"
  | "donut"
  | "funnel"
  | "dumbbell"
  | "scatter"
  | "gauge"

export interface ThemeContentSlot {
  readonly type: string
  readonly chart_type?: ThemeChartType
  readonly direction?: "horizontal"
}

const CHART_VARIANT_KEY: Record<ThemeChartType, string> = {
  bar: "chart · bar",
  line: "chart · line",
  area: "chart · area",
  pie: "chart · pie",
  donut: "chart · donut",
  funnel: "chart · funnel",
  dumbbell: "chart · dumbbell",
  scatter: "chart · scatter",
  gauge: "chart · gauge",
}

function slot(type: string): ThemeContentSlot {
  return { type }
}

function chart(chart_type: ThemeChartType, direction?: "horizontal"): ThemeContentSlot {
  return direction === "horizontal"
    ? { type: "chart", chart_type: "bar", direction: "horizontal" }
    : { type: "chart", chart_type }
}

/**
 * Per-theme content-page order (seven unique lead types). Chart subtype
 * is noted on chart slots. Forms appear because the listed (theme, type)
 * pair owns that form in `form-assignments.ts`.
 */
export const THEME_CONTENT_SLOTS: Record<string, readonly ThemeContentSlot[]> = {
  academic: [slot("icon_cards"), slot("paragraph"), slot("bullets"), slot("quote"), slot("callout"), slot("code"), slot("citation")],
  arena: [chart("scatter"), slot("verdict_banner"), slot("tag_row"), slot("data_table"), slot("waterfall"), slot("heatmap"), slot("gantt")],
  bloom: [chart("gauge"), slot("sankey"), slot("row_cards"), slot("roadmap"), slot("rings"), slot("matrix"), slot("flowchart")],
  campaign: [chart("dumbbell"), slot("architecture"), slot("insight_panel"), slot("swot"), slot("pest"), slot("five_forces"), slot("bmc")],
  classroom: [chart("funnel"), slot("people_cards"), slot("logo_wall"), slot("image"), slot("image_compare"), slot("device_mockup"), slot("data_table")],
  consulting: [chart("bar"), slot("bullets"), slot("kpi_cards"), slot("people_cards"), slot("heatmap"), slot("quote"), slot("architecture")],
  crayon: [slot("kpi_cards"), slot("bullets"), slot("swot"), slot("gantt"), slot("quote"), slot("logo_wall"), slot("code")],
  ember: [slot("numbered_cards"), slot("data_table"), slot("flowchart"), slot("callout"), slot("image"), slot("pest"), slot("rings")],
  enterprise: [slot("waterfall"), slot("bullets"), slot("icon_cards"), slot("bmc"), slot("timeline"), slot("citation"), slot("device_mockup")],
  heritage: [slot("cycle"), slot("data_table"), slot("people_cards"), slot("tag_row"), slot("image_compare"), slot("five_forces"), slot("paragraph")],
  ink: [chart("bar", "horizontal"), slot("row_cards"), slot("insight_panel"), slot("steps"), slot("quote"), slot("heatmap"), slot("logo_wall")],
  insight: [slot("cycle"), slot("data_table"), slot("bullets"), slot("image"), slot("sankey"), slot("verdict_banner"), slot("architecture")],
  journal: [chart("line"), slot("numbered_cards"), slot("comparison"), slot("code"), slot("roadmap"), slot("callout"), slot("people_cards")],
  lecture: [chart("area"), slot("timeline"), slot("bmc"), slot("bullets"), slot("image_grid"), slot("matrix"), slot("citation")],
  luxe: [slot("kpi_cards"), slot("swot"), slot("gantt"), slot("quote"), slot("device_mockup"), slot("flowchart"), slot("tag_row")],
  memo: [chart("donut"), slot("paragraph"), slot("icon_cards"), slot("pest"), slot("image"), slot("rings"), slot("waterfall")],
  museum: [slot("cycle"), slot("kpi_cards"), slot("bullets"), slot("heatmap"), slot("people_cards"), slot("callout"), slot("architecture")],
  playbill: [slot("image_grid"), slot("data_table"), slot("quote"), slot("steps"), slot("five_forces"), slot("code"), slot("row_cards")],
  pulse: [slot("numbered_cards"), slot("comparison"), slot("sankey"), slot("verdict_banner"), slot("image_compare"), slot("insight_panel"), slot("bullets")],
  runway: [slot("steps"), slot("data_table"), slot("quote"), slot("logo_wall"), slot("matrix"), slot("callout"), slot("gantt")],
  stage: [slot("timeline"), slot("kpi_cards"), slot("bullets"), slot("bmc"), slot("image"), slot("code"), slot("architecture")],
  swiss: [chart("pie"), slot("numbered_cards"), slot("comparison"), slot("people_cards"), slot("heatmap"), slot("quote"), slot("flowchart")],
  tech: [slot("icon_cards"), slot("data_table"), slot("waterfall"), slot("citation"), slot("device_mockup"), slot("swot"), slot("roadmap")],
  terra: [slot("icon_cards"), slot("bullets"), slot("timeline"), slot("pest"), slot("image_compare"), slot("rings"), slot("people_cards")],
  vermilion: [slot("comparison"), slot("kpi_cards"), slot("gantt"), slot("quote"), slot("logo_wall"), slot("code"), slot("architecture")],
}

/** Build the lead component for one theme-table content slot. */
export function buildThemeSlot(spec: ThemeContentSlot, lex: Lexicon): Component {
  if (spec.type === "chart") {
    const key =
      spec.direction === "horizontal" ? "chart · bar horizontal" : CHART_VARIANT_KEY[spec.chart_type ?? "bar"]
    const build = CHART_VARIANTS[key]
    if (!build) throw new Error(`theme table has no chart variant for ${key}`)
    return build(lex)
  }
  const build = COMPONENT_BUILDERS[spec.type]
  if (!build) throw new Error(`theme table has no builder for ${spec.type}`)
  return build(lex)
}
