import type { Block } from "@/ir"
import type { SvgBlock } from "./types"
import {
  renderBar,
  renderBarHorizontal,
  renderDonut,
  renderDumbbell,
  renderLine,
  renderPie,
  renderFunnel,
} from "./chart-svg"

type ChartBlock = Extract<Block, { type: "chart" }>

const CHART_H = 240

const renderers = {
  bar: renderBar,
  line: renderLine,
  pie: renderPie,
  funnel: renderFunnel,
  dumbbell: renderDumbbell,
} as const

/** 变体分发：bar+direction=horizontal 走横条，pie+style=donut 走环形。 */
function resolveRenderer(block: ChartBlock) {
  if (block.chart_type === "bar" && block.direction === "horizontal") {
    return renderBarHorizontal
  }
  if (block.chart_type === "pie" && block.style === "donut") {
    return renderDonut
  }
  return renderers[block.chart_type]
}

export const chart: SvgBlock<ChartBlock> = {
  measure() {
    return CHART_H
  },
  render(block, box, ctx) {
    const renderer = resolveRenderer(block)
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {renderer(
          block.series,
          ctx.colors.chartPalette,
          0,
          0,
          box.w,
          CHART_H,
          ctx.colors.muted,
          ctx.colors.text,
          ctx.colors.accent,
        )}
      </g>
    )
  },
}
