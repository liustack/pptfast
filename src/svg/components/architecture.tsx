import type { Component } from "@/ir"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { mixHex } from "./color-mix"
import { resolveComponentForm, type FormKnobs } from "./form-assignments"
import { readableOn } from "../ink"
import type { ComponentCtx, RenderDef, SvgComponent } from "./types"

type ArchitectureComponent = Extract<Component, { type: "architecture" }>

const LAYER_H = 64
const INDEX_X = 16
const TITLE_X = 72
const TITLE_COL = 280
const TITLE_FONT_SIZE = 16
const ITEMS_FONT_SIZE = 13
const INDEX_FONT_SIZE = 11
const TITLE_BASELINE_Y = 38
const ITEMS_BASELINE_Y = 38
const INDEX_BASELINE_Y = 38
const SEPARATOR = " · "
const PAD = 16
const MIN_FONT_SIZE = 10
const HAIRLINE_W = 1

function layerFill(ctx: ComponentCtx, knobs: FormKnobs, focal: boolean): string | undefined {
  if (focal) return mixHex(ctx.colors.surface, ctx.colors.accent, 0.2)
  if (knobs.nodeFill === "none") return undefined
  return ctx.colors.panel ?? ctx.colors.surface
}

function hairlineColor(ctx: ComponentCtx, knobs: FormKnobs): string {
  if (knobs.nodeStroke === "border") return ctx.colors.border ?? ctx.colors.muted
  return ctx.colors.border ?? mixHex(ctx.colors.muted, ctx.colors.bg, 0.45)
}

export const architecture: SvgComponent<ArchitectureComponent> = {
  measure(component) {
    return component.layers.length * LAYER_H
  },
  render(rawComponent, box, ctx) {
    const assignment = resolveComponentForm("architecture", ctx.themeId)
    const knobs = assignment?.knobs ?? {}
    const bottomUp = rawComponent.direction === "bottom_up"
    const count = rawComponent.layers.length
    const titleMax = Math.max(80, Math.min(TITLE_COL, box.w * 0.34) - 8)
    const itemsX = TITLE_X + titleMax + 12
    const itemsMax = Math.max(40, box.w - itemsX - PAD)
    const rule = hairlineColor(ctx, knobs)
    const focalIndex = knobs.highlightFirst ? 0 : -1

    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {rawComponent.layers.map((layer, i) => {
          const slot = bottomUp ? count - 1 - i : i
          const layerY = slot * LAYER_H
          const focal = i === focalIndex
          const fill = layerFill(ctx, knobs, focal)
          const titleInk = focal ? readableOn(fill ?? ctx.colors.surface) : ctx.colors.primary
          const bodyInk = focal ? readableOn(fill ?? ctx.colors.surface) : ctx.colors.text
          const indexInk = focal ? titleInk : ctx.colors.muted
          const title = fitSvgLine(layer.title, {
            maxWidth: titleMax,
            fontSize: TITLE_FONT_SIZE,
            minFontSize: MIN_FONT_SIZE,
          })
          const items = fitSvgLine(layer.items.join(SEPARATOR), {
            maxWidth: itemsMax,
            fontSize: ITEMS_FONT_SIZE,
            minFontSize: MIN_FONT_SIZE,
          })
          const index = `L${i + 1}`
          return (
            <g key={i}>
              {fill ? (
                <rect
                  x={0}
                  y={layerY}
                  width={box.w}
                  height={LAYER_H}
                  rx={knobs.radius === "square" || knobs.radius === undefined ? 0 : 6}
                  fill={fill}
                />
              ) : null}
              <text
                x={INDEX_X}
                y={layerY + INDEX_BASELINE_Y}
                fontSize={INDEX_FONT_SIZE}
                fontFamily={ctx.fonts.mono}
                fill={indexInk}
                dominantBaseline="alphabetic"
              >
                {index}
              </text>
              <text
                data-truncated={title.truncated ? "1" : undefined}
                x={TITLE_X}
                y={layerY + TITLE_BASELINE_Y}
                fontSize={title.fontSize}
                fontWeight="bold"
                fontFamily={ctx.fonts.heading}
                fill={titleInk}
                dominantBaseline="alphabetic"
              >
                {title.text}
              </text>
              <text
                data-truncated={items.truncated ? "1" : undefined}
                x={itemsX}
                y={layerY + ITEMS_BASELINE_Y}
                fontSize={items.fontSize}
                fontFamily={ctx.fonts.body}
                fill={bodyInk}
                dominantBaseline="alphabetic"
              >
                {items.text}
              </text>
            </g>
          )
        })}
        {Array.from({ length: Math.max(0, count - 1) }, (_, s) => (
          <line
            key={`rule-${s}`}
            x1={0}
            y1={(s + 1) * LAYER_H}
            x2={box.w}
            y2={(s + 1) * LAYER_H}
            stroke={rule}
            strokeWidth={HAIRLINE_W}
          />
        ))}
      </g>
    )
  },
}

export const renderDef: RenderDef<ArchitectureComponent> = {
  type: "architecture",
  measure: architecture.measure,
  render: architecture.render,
}
