import type { Component } from "@/ir"
import type { SvgComponent } from "./types"
import {
  renderBar,
  renderBarHorizontal,
  renderDonut,
  renderDumbbell,
  renderLine,
  renderPie,
  renderFunnel,
} from "./chart-svg"

type ChartComponent = Extract<Component, { type: "chart" }>

const CHART_H = 240

const renderers = {
  bar: renderBar,
  line: renderLine,
  pie: renderPie,
  funnel: renderFunnel,
  dumbbell: renderDumbbell,
} as const

/** 变体分发：bar+direction=horizontal 走横条，pie+style=donut 走环形。 */
function resolveRenderer(component: ChartComponent) {
  if (component.chart_type === "bar" && component.direction === "horizontal") {
    return renderBarHorizontal
  }
  if (component.chart_type === "pie" && component.style === "donut") {
    return renderDonut
  }
  return renderers[component.chart_type]
}

export const chart: SvgComponent<ChartComponent> = {
  measure() {
    return CHART_H
  },
  render(component, box, ctx) {
    const renderer = resolveRenderer(component)
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {renderer(
          component.series,
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
