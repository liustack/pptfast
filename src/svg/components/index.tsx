import type React from "react"
import type { Component } from "@/ir"
import { PptfastError } from "../../errors"
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
import { renderDef as dataTableRenderDef } from "./data-table"

/**
 * Dispatch table (src domain reorg wave 2, spec §4.2/§4.3): replaces the
 * former per-component-type `measureComponent`/`renderComponentContent` switches with a
 * lookup into this `Record<ComponentType, RenderDef>`. Each entry is the
 * matching `src/svg/components/<name>.tsx` file's own `renderDef` export
 * (`measure`/`render` referenced, never copied — the component files
 * themselves are unchanged by this table's existence). `Record<ComponentType,
 * RenderDef>` is *total* over `ComponentType` — TypeScript rejects this
 * object literal at compile time if any `ComponentType` member is
 * missing a property, or if an unknown key is added — the same exhaustiveness
 * guarantee the old switches' `component satisfies never` default arm gave
 * (a case can't be silently forgotten), just proven by object-literal
 * completeness instead of a switch's case coverage. Consulted through
 * `getRenderDef` below rather than a direct `RENDER_DEFS[component.type]`
 * index — the type checker proves every *statically-typed* `ComponentType`
 * key resolves to a value, but a `component.type` that reached this file via
 * a type assertion (`as Component`) rather than `validateIr` can carry an
 * arbitrary runtime string the checker never saw (wave-2 sweep, T3 — see
 * `getRenderDef`'s own comment).
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
  data_table: dataTableRenderDef,
}

/**
 * Shared guard for both dispatch call sites below (wave-2 sweep, T3 — final
 * review Minor 2): a bare `RENDER_DEFS[component.type]` index on a component
 * whose `type` isn't actually a `ComponentType` member — reachable only by
 * bypassing `validateIr` (a hand-built IR, a type assertion, a bug upstream
 * of the schema gate) — silently returns `undefined`, so the `.measure`/
 * `.render` call right after it threw a bare "Cannot read properties of
 * undefined" TypeError with no indication of which component or why. This
 * throws a named `PptfastError` instead, identifying the offending type and
 * pointing at `validateIr` as the fix. Every *legal* input — anything that
 * already passed `validateIr` — hits the same value it always did; the
 * `Record<ComponentType, RenderDef>` totality guarantee (see `RENDER_DEFS`'s
 * own comment) still means this branch never fires for a real render.
 */
function getRenderDef(type: ComponentType): RenderDef {
  const def = RENDER_DEFS[type]
  if (!def) {
    throw new PptfastError(
      `no renderer registered for component type "${type}" — this IR was not accepted by validateIr; run validateIr on the deck to catch an invalid component type before rendering`,
    )
  }
  return def
}

/** Height (px) a component needs at a given width. */
export function measureComponent(component: Component, w: number, ctx: ComponentCtx): number {
  return getRenderDef(component.type).measure(component, w, ctx)
}

/** Render a component's own content — the `renderComponent` dispatch, unwrapped. */
function renderComponentContent(component: Component, box: ComponentBox, ctx: ComponentCtx): React.ReactElement {
  return getRenderDef(component.type).render(component, box, ctx)
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
