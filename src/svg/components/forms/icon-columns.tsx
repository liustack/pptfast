import type React from "react"
import type { Component } from "@/ir"
import { Icon } from "../../icons"
import type { FormKnobs } from "../form-assignments"
import type { ComponentBox, ComponentCtx } from "../types"
import {
  boardTypeScale,
  fillCardType,
  formIconColumnCols,
  formLineHeight,
  layoutFormBody,
  layoutFormTitle,
  linesThatFit,
} from "./legibility"

type IconCardsComponent = Extract<Component, { type: "icon_cards" }>
type IconCardItem = IconCardsComponent["items"][number]

const GAP = 16
const TITLE_LINE_HEIGHT_RATIO = 1.4
const TEXT_LINE_HEIGHT_RATIO = 1.4
const GAP_NODE_TITLE = 18
const GAP_TITLE_TEXT = 10
const COL_INSET = 16

function layoutItemText(
  item: IconCardItem,
  contentW: number,
  ctx: ComponentCtx,
  titleSize: number,
  bodySize: number,
  titleMaxLines: number,
  bodyMaxLines: number,
) {
  const title = layoutFormTitle(item.title, {
    maxWidth: contentW,
    fontSize: titleSize,
    fontFamily: ctx.fonts.heading,
    maxLines: Math.max(1, titleMaxLines),
  })
  const text =
    bodyMaxLines > 0
      ? layoutFormBody(item.text, {
          maxWidth: contentW,
          fontSize: bodySize,
          titleSize,
          maxLines: bodyMaxLines,
          lineHeightRatio: TEXT_LINE_HEIGHT_RATIO,
          fontFamily: ctx.fonts.body,
        })
      : { lines: [] as string[], fontSize: bodySize, lineHeight: 0, truncated: false }
  return { title, text }
}

function nodeRadius(colW: number): number {
  return Math.round(Math.min(44, Math.max(28, colW * 0.16)))
}

function stackHeight(layout: ReturnType<typeof layoutItemText>, nodeSize: number): number {
  return (
    nodeSize +
    GAP_NODE_TITLE +
    layout.title.lines.length * layout.title.lineHeight +
    GAP_TITLE_TEXT +
    layout.text.lines.length * layout.text.lineHeight
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

function geometry(
  component: IconCardsComponent,
  w: number,
  ctx: ComponentCtx,
  boxH?: number,
) {
  const n = component.items.length
  const cols = formIconColumnCols(n, w, COL_INSET)
  const rows = Math.ceil(n / cols)
  const colW = w / cols
  const nodeR = nodeRadius(colW)
  const nodeSize = nodeR * 2
  const contentW = Math.max(24, colW - COL_INSET)
  const slotH = boxH != null ? Math.max(1, (boxH - GAP * (rows - 1)) / rows) : undefined
  const start = boardTypeScale(colW, slotH)
  const extraAbove = nodeSize + GAP_NODE_TITLE
  const naturalInner =
    extraAbove +
    formLineHeight(start.title) +
    GAP_TITLE_TEXT +
    2 * formLineHeight(start.body)
  const naturalMeasured = rows * naturalInner + (rows - 1) * GAP
  const rowH =
    boxH === undefined
      ? naturalInner
      : Math.max(1, (boxH - GAP * (rows - 1)) / rows)
  const innerH = Math.max(1, rowH)
  const filled = fillCardType({
    innerH: Math.max(1, innerH - extraAbove),
    contentW,
    titleSize: start.title,
    bodySize: start.body,
    gap: GAP_TITLE_TEXT,
    longestBody: component.items.map((it) => it.text).sort((a, b) => b.length - a.length)[0],
    titles: component.items.map((it) => it.title),
    fonts: { heading: ctx.fonts.heading, body: ctx.fonts.body },
    titleLhRatio: TITLE_LINE_HEIGHT_RATIO,
    bodyLhRatio: TEXT_LINE_HEIGHT_RATIO,
  })
  const fit = linesThatFit({
    innerH,
    titleSize: filled.titleSize,
    bodySize: filled.bodySize,
    gap: GAP_TITLE_TEXT,
    extraAbove,
    titleMax: 2,
    bodyMax: Math.max(2, filled.bodyMaxLines),
  })
  const layouts = component.items.map((item) =>
    layoutItemText(
      item,
      contentW,
      ctx,
      filled.titleSize,
      filled.bodySize,
      fit.titleMaxLines,
      fit.bodyMaxLines,
    ),
  )
  const measuredH = boxH === undefined ? naturalMeasured : Math.min(boxH, rows * rowH + (rows - 1) * GAP)
  return { cols, rows, colW, nodeR, nodeSize, contentW, layouts, rowH, measuredH }
}

export function measureIconColumns(
  component: IconCardsComponent,
  w: number,
  ctx: ComponentCtx,
  _knobs: FormKnobs,
): number {
  return geometry(component, w, ctx).measuredH
}

export function renderIconColumns(
  component: IconCardsComponent,
  box: ComponentBox,
  ctx: ComponentCtx,
  knobs: FormKnobs,
): React.ReactElement {
  const g = geometry(component, box.w, ctx, box.h)
  const fill = nodeFill(knobs, ctx)
  const stroke = nodeStroke(knobs, ctx)
  const ink = iconInk(knobs, ctx)
  const square = knobs.node === "square"
  const iconSize = Math.round(g.nodeR * 0.85)
  const strokeProps = {
    stroke: stroke.stroke,
    strokeWidth: stroke.strokeWidth,
    ...(stroke.strokeDasharray ? { strokeDasharray: stroke.strokeDasharray } : {}),
  }

  return (
    <g transform={`translate(${box.x},${box.y})`}>
      {component.items.map((item, i) => {
        const col = i % g.cols
        const row = Math.floor(i / g.cols)
        const cx = col * g.colW + g.colW / 2
        const rowY = row * (g.rowH + GAP)
        const layout = g.layouts[i]!
        const stackH = stackHeight(layout, g.nodeSize)
        const stackTop = rowY + (g.rowH - stackH) / 2
        const cy = stackTop + g.nodeR
        const titleTop = stackTop + g.nodeSize + GAP_NODE_TITLE
        const textTop =
          titleTop + layout.title.lines.length * layout.title.lineHeight + GAP_TITLE_TEXT
        return (
          <g
            key={i}
            data-audit-box={`${box.x + col * g.colW},${box.y + rowY},${g.colW}`}
          >
            {square ? (
              <rect
                x={cx - g.nodeR}
                y={cy - g.nodeR}
                width={g.nodeSize}
                height={g.nodeSize}
                rx={0}
                fill={fill}
                {...strokeProps}
              />
            ) : (
              <circle cx={cx} cy={cy} r={g.nodeR} fill={fill} {...strokeProps} />
            )}
            {square ? (
              <circle
                cx={cx + g.nodeR - 4}
                cy={cy - g.nodeR + 4}
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
            {layout.title.lines.map((line, li) => (
              <text
                key={`t-${li}`}
                data-truncated={layout.title.truncated && li === layout.title.lines.length - 1 ? "1" : undefined}
                x={cx}
                y={titleTop + li * layout.title.lineHeight + layout.title.fontSize}
                textAnchor="middle"
                fontSize={layout.title.fontSize}
                fontWeight="700"
                fill={ctx.colors.text}
                fontFamily={ctx.fonts.heading}
                dominantBaseline="alphabetic"
              >
                {line}
              </text>
            ))}
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
