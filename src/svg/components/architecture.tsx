import type { Component } from "@/ir"
import { fitSvgLine } from "../../lib/svg-text-layout"
import type { SvgComponent } from "./types"

type ArchitectureComponent = Extract<Component, { type: "architecture" }>

const LAYER_H = 72
const GAP = 12
const TITLE_X = 16
const TITLE_FONT_SIZE = 18
const ITEMS_FONT_SIZE = 16
const TITLE_BASELINE_Y = 42
const ITEMS_BASELINE_Y = 44
/** Approximate width reserved for the title label before items text starts. */
const ITEMS_X = 180
const SEPARATOR = " · "
/** Right-edge padding matching the 6px padding budget used on the left. */
const PAD = 6
const MIN_FONT_SIZE = 10

export const architecture: SvgComponent<ArchitectureComponent> = {
  measure(component) {
    return component.layers.length * (LAYER_H + GAP) - GAP
  },
  render(component, box, ctx) {
    const layerFill = ctx.colors.panel ?? ctx.colors.surface
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {component.layers.map((layer, i) => {
          const layerY = i * (LAYER_H + GAP)
          const title = fitSvgLine(layer.title, {
            maxWidth: ITEMS_X - TITLE_X - PAD,
            fontSize: TITLE_FONT_SIZE,
            minFontSize: MIN_FONT_SIZE,
          })
          const items = fitSvgLine(layer.items.join(SEPARATOR), {
            maxWidth: box.w - ITEMS_X - PAD,
            fontSize: ITEMS_FONT_SIZE,
            minFontSize: MIN_FONT_SIZE,
          })
          return (
            <g key={i}>
              <rect
                x={0}
                y={layerY}
                width={box.w}
                height={LAYER_H}
                rx={ctx.shape?.radius ?? 6}
                fill={layerFill}
              />
              <text
                data-truncated={title.truncated ? "1" : undefined}
                x={TITLE_X}
                y={layerY + TITLE_BASELINE_Y}
                fontSize={title.fontSize}
                fontWeight="bold"
                fontFamily={ctx.fonts.heading}
                fill={ctx.colors.primary}
                dominantBaseline="alphabetic"
              >
                {title.text}
              </text>
              <text
                data-truncated={items.truncated ? "1" : undefined}
                x={ITEMS_X}
                y={layerY + ITEMS_BASELINE_Y}
                fontSize={items.fontSize}
                fontFamily={ctx.fonts.body}
                fill={ctx.colors.text}
                dominantBaseline="alphabetic"
              >
                {items.text}
              </text>
            </g>
          )
        })}
      </g>
    )
  },
}
