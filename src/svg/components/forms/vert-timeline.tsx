import type React from "react"
import type { Component } from "@/ir"
import { accessibleInk, readableOn } from "../../ink"
import type { FormKnobs } from "../form-assignments"
import type { ComponentBox, ComponentCtx } from "../types"
import {
  FORM_BODY_FLOOR,
  FORM_TITLE_FLOOR,
  fitFormLine,
  fitFormTitleLine,
  layoutFormBody,
} from "./legibility"

type TimelineComponent = Extract<Component, { type: "timeline" }>

const AXIS_X = 72
const STAMP = 56
const NODE_R = 20
const TEXT_GAP = 28
const TOP_PAD = 8
const ROW_GAP = 22
const TITLE_SIZE = FORM_TITLE_FLOOR
const DESC_SIZE = FORM_BODY_FLOOR
const DATE_SIZE = FORM_BODY_FLOOR
const BOTTOM_PAD = 12

function visibleVerticalRowCount(
  rowTops: number[],
  rows: ReadonlyArray<{ rowH: number }>,
  truncBudget: number,
): number {
  if (truncBudget === Number.POSITIVE_INFINITY) return rows.length
  let visible = 0
  for (let i = 0; i < rows.length; i++) {
    if (rowTops[i] + rows[i].rowH > truncBudget - 20) break
    visible = i + 1
  }
  return Math.max(1, visible)
}

function textX(knobs: FormKnobs): number {
  const nodeHalf = knobs.stamp ? STAMP / 2 : NODE_R
  return AXIS_X + nodeHalf + TEXT_GAP
}

function layoutRows(component: TimelineComponent, w: number, knobs: FormKnobs, ctx: ComponentCtx) {
  const tx = textX(knobs)
  const textW = Math.max(1, w - tx)
  return component.milestones.map((m) => {
    const date = m.date
      ? fitFormLine(m.date, {
          maxWidth: textW,
          fontSize: DATE_SIZE,
          floor: FORM_BODY_FLOOR,
          fontFamily: ctx.fonts.body,
        })
      : null
    const title = fitFormTitleLine(m.title, {
      maxWidth: textW,
      fontSize: TITLE_SIZE,
      fontFamily: ctx.fonts.body,
    })
    const desc = m.desc
      ? layoutFormBody(m.desc, {
          maxWidth: textW,
          fontSize: DESC_SIZE,
          maxLines: 3,
          lineHeightRatio: 1.35,
          fontFamily: ctx.fonts.body,
        })
      : null
    const dateH = date ? DATE_SIZE + 6 : 0
    const titleH = Math.round(TITLE_SIZE * 1.3)
    const descH = desc ? desc.lines.length * desc.lineHeight + 4 : 0
    const nodeH = knobs.stamp ? STAMP : NODE_R * 2
    const rowH = Math.max(nodeH, dateH + titleH + descH)
    return { m, date, title, desc, rowH, dateH, titleH }
  })
}

export function measureVertTimeline(
  component: TimelineComponent,
  w: number,
  ctx: ComponentCtx,
  knobs: FormKnobs,
): number {
  const rows = layoutRows(component, w, knobs, ctx)
  if (rows.length === 0) return BOTTOM_PAD
  const total = rows.reduce((sum, r) => sum + r.rowH + ROW_GAP, TOP_PAD)
  return total - ROW_GAP + BOTTOM_PAD
}

export function renderVertTimeline(
  component: TimelineComponent,
  box: ComponentBox,
  ctx: ComponentCtx,
  knobs: FormKnobs,
): React.ReactElement {
  const allRows = layoutRows(component, box.w, knobs, ctx)
  const allRowTops: number[] = []
  let cursor = TOP_PAD
  for (const r of allRows) {
    allRowTops.push(cursor)
    cursor += r.rowH + ROW_GAP
  }
  const truncBudget = box.h ?? Number.POSITIVE_INFINITY
  const vis = visibleVerticalRowCount(allRowTops, allRows, truncBudget)
  const hidden = allRows.length - vis
  const rows = allRows.slice(0, vis)
  const rowTops = allRowTops.slice(0, vis)
  const axisTop = rowTops[0] ?? TOP_PAD
  const last = rows[rows.length - 1]
  const axisBottom = rowTops.length ? rowTops[rowTops.length - 1] + (last?.rowH ?? 0) * 0.55 : axisTop
  const pageBg = ctx.defaultBg ?? ctx.colors.bg
  const axisColor = ctx.colors.border ?? ctx.colors.muted
  const tx = textX(knobs)
  const dash = knobs.axis === "dashed" ? (knobs.stamp ? "2 6" : "8 7") : undefined
  const hairline = knobs.axis === "hairline"

  return (
    <g transform={`translate(${box.x},${box.y})`}>
      {rows.length > 0 && (
        <line
          x1={AXIS_X}
          y1={axisTop}
          x2={AXIS_X}
          y2={axisBottom}
          stroke={axisColor}
          strokeWidth={hairline ? 1 : 1.5}
          strokeDasharray={dash}
        />
      )}
      {rows.map((row, i) => {
        const top = rowTops[i]
        const cy = top + row.rowH / 2
        const hl = Boolean(row.m.highlight)
        const titleFill = hl
          ? accessibleInk(ctx.colors.accent, pageBg, row.title.fontSize)
          : ctx.colors.text
        let textCursor = top + (row.rowH - (row.dateH + row.titleH + (row.desc ? row.desc.lines.length * row.desc.lineHeight : 0))) / 2
        if (textCursor < top) textCursor = top
        return (
          <g key={i}>
            {knobs.stamp ? (
              <>
                <rect
                  x={AXIS_X - STAMP / 2}
                  y={cy - STAMP / 2}
                  width={STAMP}
                  height={STAMP}
                  fill="none"
                  stroke={ctx.colors.accent}
                  strokeWidth={2.5}
                />
                <text
                  x={AXIS_X}
                  y={cy - 6}
                  textAnchor="middle"
                  fontSize={12}
                  letterSpacing={2}
                  fill={ctx.colors.accent}
                  fontFamily={ctx.fonts.mono}
                  dominantBaseline="alphabetic"
                >
                  STEP
                </text>
                <text
                  x={AXIS_X}
                  y={cy + 16}
                  textAnchor="middle"
                  fontSize={22}
                  fontWeight="700"
                  fill={ctx.colors.accent}
                  fontFamily={ctx.fonts.mono}
                  dominantBaseline="alphabetic"
                >
                  {String(i + 1)}
                </text>
              </>
            ) : knobs.badge === "circle-solid" ? (
              <>
                <circle
                  cx={AXIS_X}
                  cy={cy}
                  r={NODE_R}
                  fill={hl ? ctx.colors.accent : ctx.colors.primary}
                />
                <text
                  x={AXIS_X}
                  y={cy + 7}
                  textAnchor="middle"
                  fontSize={16}
                  fontWeight="700"
                  fill={readableOn(hl ? ctx.colors.accent : ctx.colors.primary)}
                  fontFamily={ctx.fonts.body}
                  dominantBaseline="alphabetic"
                >
                  {String(i + 1)}
                </text>
              </>
            ) : (
              <>
                <circle
                  cx={AXIS_X}
                  cy={cy}
                  r={NODE_R}
                  fill={ctx.colors.bg}
                  stroke={ctx.colors.accent}
                  strokeWidth={2}
                />
                <text
                  x={AXIS_X}
                  y={cy + 6}
                  textAnchor="middle"
                  fontSize={14}
                  fontWeight="700"
                  fill={ctx.colors.text}
                  fontFamily={ctx.fonts.body}
                  dominantBaseline="alphabetic"
                >
                  {String(i + 1)}
                </text>
              </>
            )}
            {row.date ? (
              <text
                data-truncated={row.date.truncated ? "1" : undefined}
                x={tx}
                y={textCursor + DATE_SIZE}
                fontSize={row.date.fontSize}
                fill={accessibleInk(ctx.colors.muted, pageBg, row.date.fontSize)}
                fontFamily={ctx.fonts.body}
                dominantBaseline="alphabetic"
              >
                {row.date.text}
              </text>
            ) : null}
            <text
              data-truncated={row.title.truncated ? "1" : undefined}
              x={tx}
              y={textCursor + row.dateH + TITLE_SIZE}
              fontSize={row.title.fontSize}
              fontWeight="bold"
              fill={titleFill}
              fontFamily={ctx.fonts.body}
              dominantBaseline="alphabetic"
            >
              {row.title.text}
            </text>
            {i === 0 && knobs.waveFirst ? (
              <path
                d={`M ${tx} ${textCursor + row.dateH + TITLE_SIZE + 8} Q ${tx + 52} ${textCursor + row.dateH + TITLE_SIZE + 18} ${tx + 112} ${textCursor + row.dateH + TITLE_SIZE + 11}`}
                fill="none"
                stroke={ctx.colors.accent}
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            ) : null}
            {row.desc
              ? row.desc.lines.map((line, li) => (
                  <text
                    key={li}
                    x={tx}
                    y={textCursor + row.dateH + row.titleH + (li + 1) * row.desc!.lineHeight}
                    fontSize={row.desc!.fontSize}
                    fill={ctx.colors.muted}
                    fontFamily={ctx.fonts.body}
                    dominantBaseline="alphabetic"
                  >
                    {line}
                  </text>
                ))
              : null}
          </g>
        )
      })}
      {hidden > 0 && last && (
        <text
          data-dropped={hidden}
          x={box.w}
          y={Math.min(
            (box.h ?? Number.POSITIVE_INFINITY) - 4,
            rowTops[rowTops.length - 1] + last.rowH + 16,
          )}
          textAnchor="end"
          fontSize={13}
          fill={ctx.colors.muted}
          fontFamily={ctx.fonts.body}
          dominantBaseline="alphabetic"
        >
          {`+${hidden} …`}
        </text>
      )}
    </g>
  )
}
