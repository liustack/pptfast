import type React from "react"
import type { Block } from "@/ir"
import type { BlockBox, BlockCtx } from "./types"
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

/** Height (px) a block needs at a given width. */
export function measureBlock(block: Block, w: number, ctx: BlockCtx): number {
  switch (block.type) {
    case "paragraph":
      return paragraph.measure(block, w, ctx)
    case "bullets":
      return bullets.measure(block, w, ctx)
    case "quote":
      return quote.measure(block, w, ctx)
    case "callout":
      return callout.measure(block, w, ctx)
    case "code":
      return code.measure(block, w, ctx)
    case "kpi_cards":
      return kpi.measure(block, w, ctx)
    case "image":
      return image.measure(block, w, ctx)
    case "image_grid":
      return imageGrid.measure(block, w, ctx)
    case "image_compare":
      return imageCompare.measure(block, w, ctx)
    case "chart":
      return chart.measure(block, w, ctx)
    case "flowchart":
      return flowchart.measure(block, w, ctx)
    case "architecture":
      return architecture.measure(block, w, ctx)
    case "timeline":
      return timeline.measure(block, w, ctx)
    case "comparison":
      return comparison.measure(block, w, ctx)
    case "icon_cards":
      return iconCards.measure(block, w, ctx)
    case "numbered_cards":
      return numberedCards.measure(block, w, ctx)
    case "rings":
      return rings.measure(block, w, ctx)
    case "row_cards":
      return rowCards.measure(block, w, ctx)
    case "steps":
      return steps.measure(block, w, ctx)
    case "roadmap":
      return roadmap.measure(block, w, ctx)
    case "matrix":
      return matrix.measure(block, w, ctx)
    case "insight_panel":
      return insightPanel.measure(block, w, ctx)
    case "verdict_banner":
      return verdictBanner.measure(block, w, ctx)
    case "citation":
      return citation.measure(block, w, ctx)
    default: {
      void (block satisfies never)
      return 0
    }
  }
}

/** Render a block's own content — the `renderBlock` switch, unwrapped. */
function renderBlockContent(block: Block, box: BlockBox, ctx: BlockCtx): React.ReactElement {
  switch (block.type) {
    case "paragraph":
      return paragraph.render(block, box, ctx)
    case "bullets":
      return bullets.render(block, box, ctx)
    case "quote":
      return quote.render(block, box, ctx)
    case "callout":
      return callout.render(block, box, ctx)
    case "code":
      return code.render(block, box, ctx)
    case "kpi_cards":
      return kpi.render(block, box, ctx)
    case "image":
      return image.render(block, box, ctx)
    case "image_grid":
      return imageGrid.render(block, box, ctx)
    case "image_compare":
      return imageCompare.render(block, box, ctx)
    case "chart":
      return chart.render(block, box, ctx)
    case "flowchart":
      return flowchart.render(block, box, ctx)
    case "architecture":
      return architecture.render(block, box, ctx)
    case "timeline":
      return timeline.render(block, box, ctx)
    case "comparison":
      return comparison.render(block, box, ctx)
    case "icon_cards":
      return iconCards.render(block, box, ctx)
    case "numbered_cards":
      return numberedCards.render(block, box, ctx)
    case "rings":
      return rings.render(block, box, ctx)
    case "row_cards":
      return rowCards.render(block, box, ctx)
    case "steps":
      return steps.render(block, box, ctx)
    case "roadmap":
      return roadmap.render(block, box, ctx)
    case "matrix":
      return matrix.render(block, box, ctx)
    case "insight_panel":
      return insightPanel.render(block, box, ctx)
    case "verdict_banner":
      return verdictBanner.render(block, box, ctx)
    case "citation":
      return citation.render(block, box, ctx)
    default: {
      void (block satisfies never)
      return <g />
    }
  }
}

/**
 * Render a block as a positioned SVG `<g>` at `box`.
 *
 * When `ctx.blockIndex` carries this exact block reference (wave-C S3,
 * `elements === "auto"` only — see `BlockCtx.blockIndex`'s doc comment), the
 * content is wrapped in one more `<g data-blk="{index}">` so
 * `svg2pptx/dispatch.ts` can tag every shape underneath with its source
 * block. This is the single chokepoint every template/variant renders a
 * block through (`SvgContent`, `BigNumber`, `AssertionEvidence`,
 * tech's own non-exploded-block cell, creative's poster slot),
 * so tagging happens here once rather than at each call site — the one
 * exception is tech's exploded `kpi-item`/`icon-card-item` cells,
 * which bypass this function entirely and tag themselves directly (see
 * `templates/tech.tsx`'s `renderCell`).
 */
export function renderBlock(block: Block, box: BlockBox, ctx: BlockCtx): React.ReactElement {
  const content = renderBlockContent(block, box, ctx)
  const blockIndex = ctx.blockIndex?.get(block)
  return blockIndex != null ? <g data-blk={blockIndex}>{content}</g> : content
}
