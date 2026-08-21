import type React from "react"
import type { Component } from "@/ir"
import {
  fitSvgLine,
  layoutSvgText,
  truncateToUnits,
} from "../../../lib/svg-text-layout"
import { Icon } from "../../icons"
import type { FormKnobs } from "../form-assignments"
import type { ComponentBox, ComponentCtx } from "../types"

type IconCardsComponent = Extract<Component, { type: "icon_cards" }>
type IconCardItem = IconCardsComponent["items"][number]

const GAP = 16
const PAD = 18
const TITLE_FONT_SIZE = 21
const TITLE_MIN_FONT_SIZE = 14
const TITLE_LINE_HEIGHT_RATIO = 1.4
const TEXT_FONT_SIZE = 15
const TEXT_LINE_HEIGHT_RATIO = 1.4
const TEXT_MAX_LINES = 2
const GAP_ICON_TITLE = 14
const GAP_TITLE_TEXT = 8
const ICON_SIZE = 32

function colsOf(n: number): number {
  return n <= 4 ? n : 3
}

function layoutItemText(item: IconCardItem, contentW: number, ctx: ComponentCtx) {
  const title = fitSvgLine(item.title, {
    maxWidth: contentW,
    fontSize: TITLE_FONT_SIZE,
    minFontSize: TITLE_MIN_FONT_SIZE,
    bold: true,
    fontFamily: ctx.fonts.heading,
  })
  const wrapped = layoutSvgText(item.text, {
    maxWidth: contentW,
    fontSize: TEXT_FONT_SIZE,
    maxLines: TEXT_MAX_LINES,
    lineHeightRatio: TEXT_LINE_HEIGHT_RATIO,
    fontFamily: ctx.fonts.body,
  })
  const maxUnits = contentW / wrapped.fontSize
  return {
    title,
    text: {
      ...wrapped,
      lines: wrapped.lines.map((line) => truncateToUnits(line, maxUnits)),
    },
  }
}

function shellRadius(knobs: FormKnobs, ctx: ComponentCtx): number {
  if (knobs.radius === "square") return 0
  if (knobs.radius === "round") return ctx.shape?.radius ?? 16
  if (knobs.radius === "soft") return ctx.shape?.radius ?? 8
  return 0
}

function cellFill(knobs: FormKnobs, ctx: ComponentCtx): string {
  return knobs.nodeFill === "surface" ? ctx.colors.surface : "none"
}

function cellStrokeWidth(knobs: FormKnobs): number {
  return knobs.paletteStroke ? 2.5 : 1
}

function cellStroke(knobs: FormKnobs, ctx: ComponentCtx, index: number): string {
  if (knobs.paletteStroke) {
    const palette = ctx.colors.chartPalette
    if (palette.length > 0) return palette[index % palette.length]!
  }
  if (knobs.nodeStroke === "primary") return ctx.colors.primary
  if (knobs.nodeStroke === "border") return ctx.colors.border ?? ctx.colors.muted
  return ctx.colors.border ?? ctx.colors.primary
}

function iconInk(knobs: FormKnobs, ctx: ComponentCtx): string {
  if (knobs.iconInk === "accent") return ctx.colors.accent
  if (knobs.iconInk === "text") return ctx.colors.text
  return ctx.colors.primary
}

function renderGlyph(
  name: string,
  x: number,
  y: number,
  size: number,
  color: string,
): React.ReactElement {
  if (!name) {
    return (
      <circle
        cx={x + size / 2}
        cy={y + size / 2}
        r={Math.max(3, size / 6)}
        fill={color}
      />
    )
  }
  return <Icon name={name} x={x} y={y} size={size} color={color} />
}

function stackHeight(item: IconCardItem, contentW: number, ctx: ComponentCtx): number {
  const titleLineHeight = Math.round(TITLE_FONT_SIZE * TITLE_LINE_HEIGHT_RATIO)
  const { text } = layoutItemText(item, contentW, ctx)
  return (
    ICON_SIZE +
    GAP_ICON_TITLE +
    titleLineHeight +
    GAP_TITLE_TEXT +
    text.lines.length * text.lineHeight
  )
}

function geometry(
  component: IconCardsComponent,
  w: number,
  ctx: ComponentCtx,
  boxH?: number,
) {
  const n = component.items.length
  const cols = colsOf(n)
  const rows = Math.ceil(n / cols)
  const cellW = (w - GAP * (cols - 1)) / cols
  const contentW = Math.max(24, cellW - PAD * 2)
  const layouts = component.items.map((item) => layoutItemText(item, contentW, ctx))
  const titleLineHeight = Math.round(TITLE_FONT_SIZE * TITLE_LINE_HEIGHT_RATIO)
  const naturalCellH =
    PAD * 2 +
    Math.max(...component.items.map((item) => stackHeight(item, contentW, ctx)))
  const measuredH = rows * naturalCellH + (rows - 1) * GAP
  const grow = boxH === undefined ? 0 : Math.max(0, (boxH - measuredH) / rows)
  return {
    cols,
    rows,
    cellW,
    contentW,
    layouts,
    titleLineHeight,
    cellH: naturalCellH + grow,
    measuredH,
  }
}

export function measureOutlineGrid(
  component: IconCardsComponent,
  w: number,
  ctx: ComponentCtx,
  _knobs: FormKnobs,
): number {
  return geometry(component, w, ctx).measuredH
}

export function renderOutlineGrid(
  component: IconCardsComponent,
  box: ComponentBox,
  ctx: ComponentCtx,
  knobs: FormKnobs,
): React.ReactElement {
  const g = geometry(component, box.w, ctx, box.h)
  const rx = shellRadius(knobs, ctx)
  const fill = cellFill(knobs, ctx)
  const sw = cellStrokeWidth(knobs)
  const ink = iconInk(knobs, ctx)
  const rowPitch = g.cellH + GAP

  return (
    <g transform={`translate(${box.x},${box.y})`}>
      {component.items.map((item, i) => {
        const col = i % g.cols
        const row = Math.floor(i / g.cols)
        const cellX = col * (g.cellW + GAP)
        const cellY = row * rowPitch
        const cx = cellX + g.cellW / 2
        const layout = g.layouts[i]!
        const blockH =
          ICON_SIZE +
          GAP_ICON_TITLE +
          g.titleLineHeight +
          GAP_TITLE_TEXT +
          layout.text.lines.length * layout.text.lineHeight
        const blockTop = cellY + (g.cellH - blockH) / 2
        const titleTop = blockTop + ICON_SIZE + GAP_ICON_TITLE
        const textTop = titleTop + g.titleLineHeight + GAP_TITLE_TEXT
        return (
          <g
            key={i}
            data-audit-box={`${box.x + cellX},${box.y + cellY},${g.cellW}`}
          >
            <rect
              x={cellX + sw / 2}
              y={cellY + sw / 2}
              width={g.cellW - sw}
              height={g.cellH - sw}
              rx={rx}
              fill={fill}
              stroke={cellStroke(knobs, ctx, i)}
              strokeWidth={sw}
            />
            {renderGlyph(
              item.icon,
              cx - ICON_SIZE / 2,
              blockTop,
              ICON_SIZE,
              ink,
            )}
            <text
              data-truncated={layout.title.truncated ? "1" : undefined}
              x={cx}
              y={titleTop + layout.title.fontSize}
              textAnchor="middle"
              fontSize={layout.title.fontSize}
              fontWeight="700"
              fill={ctx.colors.text}
              fontFamily={ctx.fonts.heading}
              dominantBaseline="alphabetic"
            >
              {layout.title.text}
            </text>
            {layout.text.lines.map((line, li) => (
              <text
                key={li}
                x={cx}
                y={textTop + li * layout.text.lineHeight + layout.text.fontSize}
                textAnchor="middle"
                fontSize={layout.text.fontSize}
                fill={ctx.colors.muted}
                fontFamily={ctx.fonts.body}
                dominantBaseline="alphabetic"
              >
                {line}
              </text>
            ))}
          </g>
        )
      })}
    </g>
  )
}
