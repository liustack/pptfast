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
const TITLE_FONT_SIZE = 22
const TITLE_MIN_FONT_SIZE = 14
const TITLE_LINE_HEIGHT_RATIO = 1.4
const TEXT_FONT_SIZE = 16
const TEXT_LINE_HEIGHT_RATIO = 1.4
const TEXT_MAX_LINES = 2
const GAP_NODE_TITLE = 18
const GAP_TITLE_TEXT = 10
const COL_INSET = 16

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

function nodeRadius(colW: number): number {
  return Math.round(Math.min(44, Math.max(28, colW * 0.16)))
}

function stackHeight(
  item: IconCardItem,
  contentW: number,
  nodeSize: number,
  ctx: ComponentCtx,
): number {
  const titleLineHeight = Math.round(TITLE_FONT_SIZE * TITLE_LINE_HEIGHT_RATIO)
  const { text } = layoutItemText(item, contentW, ctx)
  return (
    nodeSize +
    GAP_NODE_TITLE +
    titleLineHeight +
    GAP_TITLE_TEXT +
    text.lines.length * text.lineHeight
  )
}

function nodeFill(knobs: FormKnobs, ctx: ComponentCtx): string {
  return knobs.nodeFill === "none" ? "none" : ctx.colors.surface
}

function nodeStroke(knobs: FormKnobs, ctx: ComponentCtx): {
  stroke: string
  strokeWidth: number
  strokeDasharray?: string
} {
  if (knobs.nodeStroke === "dashed") {
    return { stroke: ctx.colors.muted, strokeWidth: 2, strokeDasharray: "6 6" }
  }
  if (knobs.nodeStroke === "primary") {
    return { stroke: ctx.colors.primary, strokeWidth: 1 }
  }
  return { stroke: ctx.colors.border ?? ctx.colors.muted, strokeWidth: 1 }
}

function iconInk(knobs: FormKnobs, ctx: ComponentCtx): string {
  return knobs.iconInk === "text" ? ctx.colors.text : ctx.colors.accent
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

export function measureIconColumns(
  component: IconCardsComponent,
  w: number,
  ctx: ComponentCtx,
  _knobs: FormKnobs,
): number {
  const n = component.items.length
  const cols = colsOf(n)
  const rows = Math.ceil(n / cols)
  const colW = w / cols
  const nodeSize = nodeRadius(colW) * 2
  const contentW = Math.max(24, colW - COL_INSET)
  const rowH = Math.max(
    ...component.items.map((item) => stackHeight(item, contentW, nodeSize, ctx)),
  )
  return rows * rowH + (rows - 1) * GAP
}

export function renderIconColumns(
  component: IconCardsComponent,
  box: ComponentBox,
  ctx: ComponentCtx,
  knobs: FormKnobs,
): React.ReactElement {
  const n = component.items.length
  const cols = colsOf(n)
  const rows = Math.ceil(n / cols)
  const colW = box.w / cols
  const nodeR = nodeRadius(colW)
  const nodeSize = nodeR * 2
  const contentW = Math.max(24, colW - COL_INSET)
  const naturalRowH = Math.max(
    ...component.items.map((item) => stackHeight(item, contentW, nodeSize, ctx)),
  )
  const measuredH = rows * naturalRowH + (rows - 1) * GAP
  const perRowGrow = Math.max(0, ((box.h ?? measuredH) - measuredH) / rows)
  const rowH = naturalRowH + perRowGrow
  const fill = nodeFill(knobs, ctx)
  const stroke = nodeStroke(knobs, ctx)
  const ink = iconInk(knobs, ctx)
  const square = knobs.node === "square"
  const titleLineHeight = Math.round(TITLE_FONT_SIZE * TITLE_LINE_HEIGHT_RATIO)
  const iconSize = Math.round(nodeR * 0.85)
  const strokeProps = {
    stroke: stroke.stroke,
    strokeWidth: stroke.strokeWidth,
    ...(stroke.strokeDasharray ? { strokeDasharray: stroke.strokeDasharray } : {}),
  }

  return (
    <g transform={`translate(${box.x},${box.y})`}>
      {component.items.map((item, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const cx = col * colW + colW / 2
        const rowY = row * (rowH + GAP)
        const stackH = stackHeight(item, contentW, nodeSize, ctx)
        const stackTop = rowY + (rowH - stackH) / 2
        const cy = stackTop + nodeR
        const { title, text } = layoutItemText(item, contentW, ctx)
        const titleTop = stackTop + nodeSize + GAP_NODE_TITLE
        const textTop = titleTop + titleLineHeight + GAP_TITLE_TEXT
        return (
          <g
            key={i}
            data-audit-box={`${box.x + col * colW},${box.y + rowY},${colW}`}
          >
            {square ? (
              <rect
                x={cx - nodeR}
                y={cy - nodeR}
                width={nodeSize}
                height={nodeSize}
                rx={0}
                fill={fill}
                {...strokeProps}
              />
            ) : (
              <circle cx={cx} cy={cy} r={nodeR} fill={fill} {...strokeProps} />
            )}
            {square ? (
              <circle
                cx={cx + nodeR - 4}
                cy={cy - nodeR + 4}
                r={3.5}
                fill={ctx.colors.accent}
              />
            ) : null}
            {renderGlyph(
              item.icon,
              cx - iconSize / 2,
              cy - iconSize / 2,
              iconSize,
              ink,
            )}
            <text
              data-truncated={title.truncated ? "1" : undefined}
              x={cx}
              y={titleTop + title.fontSize}
              textAnchor="middle"
              fontSize={title.fontSize}
              fontWeight="700"
              fill={ctx.colors.text}
              fontFamily={ctx.fonts.heading}
              dominantBaseline="alphabetic"
            >
              {title.text}
            </text>
            {text.lines.map((line, li) => (
              <text
                key={li}
                x={cx}
                y={textTop + li * text.lineHeight + text.fontSize}
                textAnchor="middle"
                fontSize={text.fontSize}
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
