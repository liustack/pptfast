import type React from "react"
import type { Component } from "@/ir"
import type { ComponentType } from "../component-traits"
import type { ComponentBox, ComponentCtx, RenderDef } from "./types"
import { renderDef as paragraphRenderDef } from "./paragraph"
import { renderDef as bulletsRenderDef } from "./bullets"
import { renderDef as quoteRenderDef } from "./quote"
import { renderDef as calloutRenderDef } from "./callout"
import { renderDef as codeRenderDef } from "./code"
import { renderDef as kpiRenderDef } from "./kpi"
import { renderDef as imageRenderDef } from "./image"
import { renderDef as imageGridRenderDef } from "./image-grid"
import { renderDef as imageCompareRenderDef } from "./image-compare"
import { renderDef as chartRenderDef } from "./chart"
import { renderDef as flowchartRenderDef } from "./flowchart"
import { renderDef as architectureRenderDef } from "./architecture"
import { renderDef as timelineRenderDef } from "./timeline"
import { renderDef as comparisonRenderDef } from "./comparison"
import { renderDef as iconCardsRenderDef } from "./icon-cards"
import { renderDef as numberedCardsRenderDef } from "./numbered-cards"
import { renderDef as ringsRenderDef } from "./rings"
import { renderDef as rowCardsRenderDef } from "./row-cards"
import { renderDef as stepsRenderDef } from "./steps"
import { renderDef as roadmapRenderDef } from "./roadmap"
import { renderDef as matrixRenderDef } from "./matrix"
import { renderDef as insightPanelRenderDef } from "./insight-panel"
import { renderDef as verdictBannerRenderDef } from "./verdict-banner"
import { renderDef as citationRenderDef } from "./citation"
import { renderDef as swotRenderDef } from "./swot"
import { renderDef as bmcRenderDef } from "./bmc"
import { renderDef as waterfallRenderDef } from "./waterfall"
import { renderDef as ganttRenderDef } from "./gantt"
import { renderDef as pestRenderDef } from "./pest"
import { renderDef as fiveForcesRenderDef } from "./five-forces"
import { renderDef as heatmapRenderDef } from "./heatmap"
import { renderDef as sankeyRenderDef } from "./sankey"

/**
 * Dispatch table (src domain reorg wave 2, spec §4.2/§4.3): replaces the
 * former 32-case `measureComponent`/`renderComponentContent` switches with a
 * lookup into this `Record<ComponentType, RenderDef>`. Each entry is the
 * matching `src/svg/components/<name>.tsx` file's own `renderDef` export
 * (`measure`/`render` referenced, never copied — the component files
 * themselves are unchanged by this table's existence). `Record<ComponentType,
 * RenderDef>` is *total* over `ComponentType` — TypeScript rejects this
 * object literal at compile time if any of the 32 `ComponentType` members is
 * missing a property, or if an unknown key is added — the same exhaustiveness
 * guarantee the old switches' `component satisfies never` default arm gave
 * (a case can't be silently forgotten), just proven by object-literal
 * completeness instead of a switch's case coverage. Consulted by direct index
 * (`RENDER_DEFS[component.type]`, no defensive `undefined` check) — this
 * repo's own established convention for a total `Record<K, V>` lookup (e.g.
 * `fonts.ts`'s `ROLE_DEFAULT[role]`), safe here for the same reason: the type
 * checker already proves every `ComponentType` key resolves to a value.
 */
const RENDER_DEFS: Record<ComponentType, RenderDef> = {
  paragraph: paragraphRenderDef,
  bullets: bulletsRenderDef,
  quote: quoteRenderDef,
  callout: calloutRenderDef,
  code: codeRenderDef,
  kpi_cards: kpiRenderDef,
  image: imageRenderDef,
  image_grid: imageGridRenderDef,
  image_compare: imageCompareRenderDef,
  chart: chartRenderDef,
  flowchart: flowchartRenderDef,
  architecture: architectureRenderDef,
  timeline: timelineRenderDef,
  comparison: comparisonRenderDef,
  icon_cards: iconCardsRenderDef,
  numbered_cards: numberedCardsRenderDef,
  rings: ringsRenderDef,
  row_cards: rowCardsRenderDef,
  steps: stepsRenderDef,
  roadmap: roadmapRenderDef,
  matrix: matrixRenderDef,
  insight_panel: insightPanelRenderDef,
  verdict_banner: verdictBannerRenderDef,
  citation: citationRenderDef,
  swot: swotRenderDef,
  bmc: bmcRenderDef,
  waterfall: waterfallRenderDef,
  gantt: ganttRenderDef,
  pest: pestRenderDef,
  five_forces: fiveForcesRenderDef,
  heatmap: heatmapRenderDef,
  sankey: sankeyRenderDef,
}

/** Height (px) a component needs at a given width. */
export function measureComponent(component: Component, w: number, ctx: ComponentCtx): number {
  return RENDER_DEFS[component.type].measure(component, w, ctx)
}

/** Render a component's own content — the `renderComponent` dispatch, unwrapped. */
function renderComponentContent(component: Component, box: ComponentBox, ctx: ComponentCtx): React.ReactElement {
  return RENDER_DEFS[component.type].render(component, box, ctx)
}

/**
 * Render a component as a positioned SVG `<g>` at `box`.
 *
 * When `ctx.blockIndex` carries this exact component reference (wave-C S3,
 * `elements === "auto"` only — see `ComponentCtx.blockIndex`'s doc comment), the
 * content is wrapped in one more `<g data-blk="{index}">` so
 * `svg2pptx/dispatch.ts` can tag every shape underneath with its source
 * component. This is the single chokepoint every template/arrangement renders a
 * component through (`SvgContent`, `BigNumber`, `AssertionEvidence`,
 * tech's own non-exploded-component cell, creative's poster slot),
 * so tagging happens here once rather than at each call site — the one
 * exception is tech's exploded `kpi-item`/`icon-card-item` cells,
 * which bypass this function entirely and tag themselves directly (see
 * `templates/tech.tsx`'s `renderCell`).
 */
export function renderComponent(component: Component, box: ComponentBox, ctx: ComponentCtx): React.ReactElement {
  const content = renderComponentContent(component, box, ctx)
  const blockIndex = ctx.blockIndex?.get(component)
  return blockIndex != null ? <g data-blk={blockIndex}>{content}</g> : content
}
