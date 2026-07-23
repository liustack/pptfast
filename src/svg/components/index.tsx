import type React from "react"
import type { Component } from "@/ir"
import type { ComponentBox, ComponentCtx } from "./types"
import { paragraph } from "./paragraph"
import { bullets } from "./bullets"
import { quote } from "./quote"
import { callout } from "./callout"
import { code } from "./code"
import { kpi } from "./kpi"
import { image } from "./image"
import { imageGrid } from "./image-grid"
import { imageCompare } from "./image-compare"
import { chart } from "./chart"
import { flowchart } from "./flowchart"
import { architecture } from "./architecture"
import { timeline } from "./timeline"
import { comparison } from "./comparison"
import { iconCards } from "./icon-cards"
import { numberedCards } from "./numbered-cards"
import { rings } from "./rings"
import { rowCards } from "./row-cards"
import { steps } from "./steps"
import { roadmap } from "./roadmap"
import { matrix } from "./matrix"
import { insightPanel } from "./insight_panel"
import { verdictBanner } from "./verdict-banner"
import { citation } from "./citation"
import { swot } from "./swot"
import { bmc } from "./bmc"
import { waterfall } from "./waterfall"
import { gantt } from "./gantt"
import { pest } from "./pest"

/** Height (px) a component needs at a given width. */
export function measureComponent(component: Component, w: number, ctx: ComponentCtx): number {
  switch (component.type) {
    case "paragraph":
      return paragraph.measure(component, w, ctx)
    case "bullets":
      return bullets.measure(component, w, ctx)
    case "quote":
      return quote.measure(component, w, ctx)
    case "callout":
      return callout.measure(component, w, ctx)
    case "code":
      return code.measure(component, w, ctx)
    case "kpi_cards":
      return kpi.measure(component, w, ctx)
    case "image":
      return image.measure(component, w, ctx)
    case "image_grid":
      return imageGrid.measure(component, w, ctx)
    case "image_compare":
      return imageCompare.measure(component, w, ctx)
    case "chart":
      return chart.measure(component, w, ctx)
    case "flowchart":
      return flowchart.measure(component, w, ctx)
    case "architecture":
      return architecture.measure(component, w, ctx)
    case "timeline":
      return timeline.measure(component, w, ctx)
    case "comparison":
      return comparison.measure(component, w, ctx)
    case "icon_cards":
      return iconCards.measure(component, w, ctx)
    case "numbered_cards":
      return numberedCards.measure(component, w, ctx)
    case "rings":
      return rings.measure(component, w, ctx)
    case "row_cards":
      return rowCards.measure(component, w, ctx)
    case "steps":
      return steps.measure(component, w, ctx)
    case "roadmap":
      return roadmap.measure(component, w, ctx)
    case "matrix":
      return matrix.measure(component, w, ctx)
    case "insight_panel":
      return insightPanel.measure(component, w, ctx)
    case "verdict_banner":
      return verdictBanner.measure(component, w, ctx)
    case "citation":
      return citation.measure(component, w, ctx)
    case "swot":
      return swot.measure(component, w, ctx)
    case "bmc":
      return bmc.measure(component, w, ctx)
    case "waterfall":
      return waterfall.measure(component, w, ctx)
    case "gantt":
      return gantt.measure(component, w, ctx)
    case "pest":
      return pest.measure(component, w, ctx)
    default: {
      void (component satisfies never)
      return 0
    }
  }
}

/** Render a component's own content — the `renderComponent` switch, unwrapped. */
function renderComponentContent(component: Component, box: ComponentBox, ctx: ComponentCtx): React.ReactElement {
  switch (component.type) {
    case "paragraph":
      return paragraph.render(component, box, ctx)
    case "bullets":
      return bullets.render(component, box, ctx)
    case "quote":
      return quote.render(component, box, ctx)
    case "callout":
      return callout.render(component, box, ctx)
    case "code":
      return code.render(component, box, ctx)
    case "kpi_cards":
      return kpi.render(component, box, ctx)
    case "image":
      return image.render(component, box, ctx)
    case "image_grid":
      return imageGrid.render(component, box, ctx)
    case "image_compare":
      return imageCompare.render(component, box, ctx)
    case "chart":
      return chart.render(component, box, ctx)
    case "flowchart":
      return flowchart.render(component, box, ctx)
    case "architecture":
      return architecture.render(component, box, ctx)
    case "timeline":
      return timeline.render(component, box, ctx)
    case "comparison":
      return comparison.render(component, box, ctx)
    case "icon_cards":
      return iconCards.render(component, box, ctx)
    case "numbered_cards":
      return numberedCards.render(component, box, ctx)
    case "rings":
      return rings.render(component, box, ctx)
    case "row_cards":
      return rowCards.render(component, box, ctx)
    case "steps":
      return steps.render(component, box, ctx)
    case "roadmap":
      return roadmap.render(component, box, ctx)
    case "matrix":
      return matrix.render(component, box, ctx)
    case "insight_panel":
      return insightPanel.render(component, box, ctx)
    case "verdict_banner":
      return verdictBanner.render(component, box, ctx)
    case "citation":
      return citation.render(component, box, ctx)
    case "swot":
      return swot.render(component, box, ctx)
    case "bmc":
      return bmc.render(component, box, ctx)
    case "waterfall":
      return waterfall.render(component, box, ctx)
    case "gantt":
      return gantt.render(component, box, ctx)
    case "pest":
      return pest.render(component, box, ctx)
    default: {
      void (component satisfies never)
      return <g />
    }
  }
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
