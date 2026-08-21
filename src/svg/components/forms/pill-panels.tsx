import type React from "react"
import type { Component } from "@/ir"
import { wrapClip } from "./clip-text"
import { accessibleInk, readableOn } from "../../ink"
import type { FormKnobs } from "../form-assignments"
import type { ComponentBox, ComponentCtx } from "../types"
import { FORM_BODY_FLOOR, FORM_TITLE_FLOOR, fitFormLine, fitFormTitleLine } from "./legibility"

type ComparisonComponent = Extract<Component, { type: "comparison" }>

const PILL_H = 48
const GAP = 24
const PAD = 18
const MARKER_RESERVE = 20
const LABEL_SIZE = FORM_BODY_FLOOR
const CELL_SIZE = 16

function pillRx(knobs: FormKnobs, pillH: number, ctx: ComponentCtx): number {
  if (knobs.radius === "square") return 0
  if (knobs.radius === "round") return pillH / 2
  return ctx.shape?.radius ?? 8
}

function pillFillAt(index: number, knobs: FormKnobs, ctx: ComponentCtx): string {
  if (knobs.pillFill === "accent-all") return ctx.colors.accent
  return index === 0 ? ctx.colors.accent : ctx.colors.primary
}

function panelGeometry(n: number, w: number) {
  const count = Math.max(1, n)
  const panelW = (w - GAP * (count - 1)) / count
  return { count, panelW }
}

function cellLayout(text: string, maxWidth: number, fontFamily: string) {
  return wrapClip(text, {
    maxWidth,
    fontSize: CELL_SIZE,
    minPt: FORM_BODY_FLOOR,
    maxLines: 3,
    lineHeightRatio: 1.3,
    fontFamily,
  })
}

function rowHeight(row: ComparisonComponent["rows"][number], bodyW: number, fontFamily: string): number {
  const labelH = row.label.trim() ? LABEL_SIZE + 4 : 0
  const cellH = Math.max(
    CELL_SIZE,
    ...row.cells.map((cell) => {
      const laid = cellLayout(cell, bodyW, fontFamily)
      return laid.lines.length * laid.lineHeight
    }),
    cellLayout("", bodyW, fontFamily).lineHeight,
  )
  return labelH + cellH + 12
}

function visibleRowCount(
  rows: ComparisonComponent["rows"],
  bodyW: number,
  fontFamily: string,
  truncBudget: number,
): number {
  if (truncBudget === Number.POSITIVE_INFINITY) return rows.length
  const frameTop = PILL_H / 2
  let cursor = frameTop + PAD
  let visible = 0
  for (let i = 0; i < rows.length; i++) {
    const h = rowHeight(rows[i], bodyW, fontFamily)
    if (cursor + h > truncBudget - MARKER_RESERVE && visible >= 1) break
    cursor += h
    visible = i + 1
  }
  return rows.length === 0 ? 0 : Math.max(1, visible)
}

export function measurePillPanels(
  component: ComparisonComponent,
  w: number,
  ctx: ComponentCtx,
  _knobs: FormKnobs,
): number {
  const n = Math.max(1, component.columns.length)
  const { panelW } = panelGeometry(n, w)
  const bodyW = Math.max(1, panelW - PAD * 2)
  const bodyH = component.rows.reduce((sum, row) => sum + rowHeight(row, bodyW, ctx.fonts.body), 0)
  return PILL_H / 2 + PAD + bodyH + PAD
}

export function renderPillPanels(
  component: ComparisonComponent,
  box: ComponentBox,
  ctx: ComponentCtx,
  knobs: FormKnobs,
): React.ReactElement {
  const n = Math.max(component.columns.length, 1)
  const { panelW } = panelGeometry(n, box.w)
  const bodyW = Math.max(1, panelW - PAD * 2)
  const natural = measurePillPanels(component, box.w, ctx, knobs)
  const totalH = box.h ?? natural
  const visible = visibleRowCount(component.rows, bodyW, ctx.fonts.body, box.h ?? Number.POSITIVE_INFINITY)
  const hidden = component.rows.length - visible
  const rows = component.rows.slice(0, visible)
  const frameY = PILL_H / 2
  const frameH = Math.max(PILL_H / 2 + PAD, totalH - frameY)
  const border = ctx.colors.border ?? ctx.colors.muted
  const pageBg = ctx.defaultBg ?? ctx.colors.bg

  return (
    <g transform={`translate(${box.x},${box.y})`}>
      {component.columns.map((title, i) => {
        const x = i * (panelW + GAP)
        const fill = pillFillAt(i, knobs, ctx)
        const pillW = Math.min(panelW * 0.72, panelW - 24)
        const pillX = x + (panelW - pillW) / 2
        const rx = pillRx(knobs, PILL_H, ctx)
        const titleFit = fitFormTitleLine(title, {
          maxWidth: Math.max(1, pillW - 20),
          fontSize: FORM_TITLE_FLOOR,
          fontFamily: ctx.fonts.body,
        })
        let cursor = frameY + PILL_H / 2 + 10
        return (
          <g key={i}>
            {knobs.frame === "none" ? (
              <rect x={x} y={frameY} width={panelW} height={frameH} fill={ctx.colors.surface} />
            ) : knobs.frame === "solid" ? (
              <rect
                x={x}
                y={frameY}
                width={panelW}
                height={frameH}
                fill={ctx.colors.surface}
                stroke={border}
                strokeWidth={1.5}
              />
            ) : (
              <rect
                x={x}
                y={frameY}
                width={panelW}
                height={frameH}
                fill="none"
                stroke={border}
                strokeWidth={1.5}
                strokeDasharray="6 6"
              />
            )}
            {knobs.cornerMarks ? (
              <path
                d={`M ${x} ${frameY + 18} L ${x} ${frameY} L ${x + 18} ${frameY} M ${x + panelW} ${frameY + frameH - 18} L ${x + panelW} ${frameY + frameH} L ${x + panelW - 18} ${frameY + frameH}`}
                fill="none"
                stroke={ctx.colors.accent}
                strokeWidth={2.5}
              />
            ) : null}
            <rect x={pillX} y={0} width={pillW} height={PILL_H} rx={rx} fill={fill} />
            <text
              data-truncated={titleFit.truncated ? "1" : undefined}
              x={pillX + pillW / 2}
              y={PILL_H / 2 + Math.round(titleFit.fontSize * 0.35)}
              textAnchor="middle"
              fontSize={titleFit.fontSize}
              fontWeight="bold"
              fill={readableOn(fill)}
              fontFamily={ctx.fonts.body}
              dominantBaseline="alphabetic"
            >
              {titleFit.text}
            </text>
            {rows.map((row, ri) => {
              const label = row.label.trim()
              const cell = row.cells[i] ?? ""
              const laid = cellLayout(cell, bodyW, ctx.fonts.body)
              const blockY = cursor
              const labelH = label ? LABEL_SIZE + 4 : 0
              cursor += labelH + laid.lines.length * laid.lineHeight + 12
              return (
                <g key={ri}>
                  {label ? (
                    (() => {
                      const fitted = fitFormLine(label, {
                        maxWidth: bodyW,
                        fontSize: LABEL_SIZE,
                        floor: FORM_BODY_FLOOR,
                        bold: true,
                        fontFamily: ctx.fonts.body,
                      })
                      return (
                    <text
                      data-truncated={fitted.truncated ? "1" : undefined}
                      x={x + PAD}
                      y={blockY + LABEL_SIZE}
                      fontSize={fitted.fontSize}
                      fill={accessibleInk(ctx.colors.muted, pageBg, fitted.fontSize)}
                      fontFamily={ctx.fonts.body}
                      fontWeight="bold"
                      dominantBaseline="alphabetic"
                    >
                      {fitted.text}
                    </text>
                      )
                    })()
                  ) : null}
                  {laid.lines.map((line, li) => (
                    <text
                      key={li}
                      data-truncated={laid.truncated && li === laid.lines.length - 1 ? "1" : undefined}
                      x={x + PAD}
                      y={blockY + labelH + (li + 1) * laid.lineHeight}
                      fontSize={laid.fontSize}
                      fill={ctx.colors.text}
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
      })}
      {hidden > 0 && (
        <text
          data-dropped={hidden}
          x={box.w}
          y={Math.min(totalH - 4, frameY + frameH - 6)}
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
