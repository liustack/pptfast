import type React from "react"
import type { Component } from "@/ir"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import type { ComponentBox, ComponentCtx, SvgComponent } from "./types"

type TimelineComponent = Extract<Component, { type: "timeline" }>

const AXIS_Y = 100
const PAD = 20
/** Reserved gap on each side of a milestone label before it would collide
 * with its neighbor's label. */
const LABEL_GAP = 12
const MIN_FONT_SIZE = 10
const TITLE_SIZE = 16
const DESC_SIZE = 13
const TITLE_TOP = AXIS_Y + 28
const BOTTOM_PAD = 18

type Anchor = "start" | "middle" | "end"

/**
 * Per-milestone label 布局（度量与渲染共用）。首/尾节点贴 box 边缘，居中
 * 排布会把宽度压到 2×PAD≈40px（2026-07-09 真机实测首尾 label 竖条化）——
 * 改为首节点左对齐、尾节点右对齐，宽度按邻距算。
 */
function labelPlacement(
  i: number,
  x: number,
  n: number,
  w: number,
  step: number,
): { maxWidth: number; anchor: Anchor; tx: number } {
  const distToNeighbor = n > 1 ? step - LABEL_GAP : w - 2 * PAD
  if (n > 1 && i === 0) {
    return { maxWidth: Math.max(1, Math.min(distToNeighbor, w - x - PAD)), anchor: "start", tx: x - 8 }
  }
  if (n > 1 && i === n - 1) {
    return { maxWidth: Math.max(1, Math.min(distToNeighbor, x - PAD)), anchor: "end", tx: x + 8 }
  }
  const distToBoxEdge = 2 * Math.min(x, w - x)
  return { maxWidth: Math.max(1, Math.min(distToBoxEdge, distToNeighbor)), anchor: "middle", tx: x }
}

/**
 * title 2 行 / desc 3 行换行排布（2026-07-09 用户反馈：版面宽却单行截断
 * 加省略号——所有主题共用本块，一处修复全主题生效）。
 */
function milestoneLayout(component: TimelineComponent, w: number) {
  const n = component.milestones.length
  const span = w - 2 * PAD
  const step = n > 1 ? span / (n - 1) : 0
  return component.milestones.map((m, i) => {
    const x = n === 1 ? w / 2 : PAD + i * step
    const { maxWidth, anchor, tx } = labelPlacement(i, x, n, w, step)
    const title = layoutSvgText(m.title, {
      maxWidth,
      fontSize: TITLE_SIZE,
      maxLines: 2,
      lineHeightRatio: 1.25,
    })
    const desc = m.desc
      ? layoutSvgText(m.desc, {
          maxWidth,
          fontSize: DESC_SIZE,
          maxLines: 3,
          lineHeightRatio: 1.3,
        })
      : null
    const titleH = title.lines.length * title.lineHeight
    const descH = desc ? desc.lines.length * desc.lineHeight + 6 : 0
    return { m, x, maxWidth, anchor, tx, title, desc, belowH: 28 + titleH + descH }
  })
}

// ── 竖排版式（2026-07-11 用户借鉴编辑部竖排时间线）：左 date 右对齐、
// 中轴竖线圆点、右 title/desc，highlight 节点 accent 色 + 大圆点。──
const V_DATE_COL_W = 118
const V_AXIS_GAP = 26
const V_AXIS_X = V_DATE_COL_W + V_AXIS_GAP
const V_TEXT_GAP = 30
const V_TEXT_X = V_AXIS_X + V_TEXT_GAP
const V_TITLE_SIZE = 18
const V_DESC_SIZE = 14
const V_ROW_GAP = 26
const V_TOP_PAD = 8

function verticalLayout(component: TimelineComponent, w: number) {
  const textW = Math.max(1, w - V_TEXT_X)
  return component.milestones.map((m) => {
    const title = fitSvgLine(m.title, {
      maxWidth: textW,
      fontSize: V_TITLE_SIZE,
      minFontSize: 13,
    })
    const desc = m.desc
      ? layoutSvgText(m.desc, {
          maxWidth: textW,
          fontSize: V_DESC_SIZE,
          maxLines: 2,
          lineHeightRatio: 1.35,
        })
      : null
    const rowH =
      Math.round(V_TITLE_SIZE * 1.3) +
      (desc ? desc.lines.length * desc.lineHeight + 4 : 0)
    return { m, title, desc, rowH }
  })
}

/**
 * How many leading rows of `rows` fit within `truncBudget` px (group-
 * relative, same space `rowTops[i] + rows[i].rowH` is measured in), leaving
 * ~20px of headroom for the "+N more" marker line — at least 1, matching
 * row-cards.tsx's "never render zero visible units" precedent.
 */
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

function renderVertical(
  component: TimelineComponent,
  box: ComponentBox,
  ctx: ComponentCtx,
): React.ReactElement {
  const allRows = verticalLayout(component, box.w)
  const allRowTops: number[] = []
  let cursor = V_TOP_PAD
  for (const r of allRows) {
    allRowTops.push(cursor)
    cursor += r.rowH + V_ROW_GAP
  }
  // Vertical graceful landing (P0 hardening, robustness deep-review D1,
  // family-sweep sibling of bullets.tsx): `milestones` has no schema
  // ceiling, and this layout mode stacks one row per milestone with no cap
  // of its own. `box.h` is only ever set on this non-stretchable component
  // by `layoutContentFit`'s overflow-defense branch (`layout.ts`), so its
  // presence always means "cap to this budget" (row-cards.tsx's own
  // precedent for the convention below).
  const truncBudget = box.h ?? Number.POSITIVE_INFINITY
  const visibleCount = visibleVerticalRowCount(allRowTops, allRows, truncBudget)
  const hiddenCount = allRows.length - visibleCount
  const rows = allRows.slice(0, visibleCount)
  const rowTops = allRowTops.slice(0, visibleCount)
  const axisTop = rowTops[0] + 8
  const axisBottom = rowTops[rowTops.length - 1] + 8
  return (
    <g transform={`translate(${box.x},${box.y})`}>
      {rows.length > 1 && (
        <line
          x1={V_AXIS_X}
          y1={axisTop}
          x2={V_AXIS_X}
          y2={axisBottom}
          stroke={ctx.colors.border ?? ctx.colors.muted}
          strokeWidth={2}
        />
      )}
      {rows.map(({ m, title, desc }, i) => {
        const top = rowTops[i]
        const nodeCy = top + 8
        const hl = Boolean(m.highlight)
        const keyColor = hl ? ctx.colors.accent : ctx.colors.text
        const date = fitSvgLine(m.date, {
          maxWidth: V_DATE_COL_W,
          fontSize: 20,
          minFontSize: MIN_FONT_SIZE,
        })
        return (
          <g key={i}>
            <text
              data-truncated={date.truncated ? "1" : undefined}
              x={V_DATE_COL_W}
              y={nodeCy + 7}
              textAnchor="end"
              fontSize={date.fontSize}
              fontWeight="bold"
              fill={hl ? ctx.colors.accent : ctx.colors.muted}
              fontFamily={ctx.fonts.heading}
              dominantBaseline="alphabetic"
            >
              {date.text}
            </text>
            <circle
              cx={V_AXIS_X}
              cy={nodeCy}
              r={hl ? 10 : 7}
              fill={hl ? ctx.colors.accent : ctx.colors.primary}
            />
            <text
              data-truncated={title.truncated ? "1" : undefined}
              x={V_TEXT_X}
              y={nodeCy + 7}
              fontSize={title.fontSize}
              fontWeight="bold"
              fill={keyColor}
              fontFamily={ctx.fonts.body}
              dominantBaseline="alphabetic"
            >
              {title.text}
            </text>
            {desc
              ? desc.lines.map((line, li) => (
                  <text
                    key={li}
                    x={V_TEXT_X}
                    y={nodeCy + 7 + Math.round(V_TITLE_SIZE * 1.3) + li * desc.lineHeight}
                    fontSize={desc.fontSize}
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
      {hiddenCount > 0 && (
        <text
          data-dropped={hiddenCount}
          x={box.w}
          y={rowTops[rowTops.length - 1] + rows[rows.length - 1].rowH + 20}
          textAnchor="end"
          fontSize={13}
          fill={ctx.colors.muted}
          fontFamily={ctx.fonts.body}
          dominantBaseline="alphabetic"
        >
          {`+${hiddenCount} more`}
        </text>
      )}
    </g>
  )
}

export const timeline: SvgComponent<TimelineComponent> = {
  measure(component, w, _ctx: ComponentCtx) {
    if (component.layout === "vertical") {
      const rows = verticalLayout(component, w)
      const total = rows.reduce((sum, r) => sum + r.rowH + V_ROW_GAP, V_TOP_PAD)
      return total - V_ROW_GAP + BOTTOM_PAD
    }
    const rows = milestoneLayout(component, w)
    const maxBelow = rows.reduce((mx, r) => Math.max(mx, r.belowH), 48)
    return AXIS_Y + maxBelow + BOTTOM_PAD
  },
  render(component, box, ctx) {
    if (component.layout === "vertical") return renderVertical(component, box, ctx)
    const rows = milestoneLayout(component, box.w)
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        <line
          x1={PAD}
          y1={AXIS_Y}
          x2={box.w - PAD}
          y2={AXIS_Y}
          stroke={ctx.colors.border ?? ctx.colors.muted}
          strokeWidth={2}
        />
        {rows.map(({ m, x, maxWidth, anchor, tx, title, desc }, i) => {
          const date = fitSvgLine(m.date, {
            maxWidth,
            fontSize: 16,
            minFontSize: MIN_FONT_SIZE,
          })
          const descTop = TITLE_TOP + title.lines.length * title.lineHeight + 2
          return (
            <g key={i}>
              <circle cx={x} cy={AXIS_Y} r={8} fill={ctx.colors.primary} />
              <text
                data-truncated={date.truncated ? "1" : undefined}
                x={tx}
                y={AXIS_Y - 24}
                textAnchor={anchor}
                fill={ctx.colors.accent}
                fontSize={date.fontSize}
                fontFamily={ctx.fonts.body}
                dominantBaseline="alphabetic"
              >
                {date.text}
              </text>
              {title.lines.map((line, li) => (
                <text
                  key={li}
                  x={tx}
                  y={TITLE_TOP + li * title.lineHeight}
                  textAnchor={anchor}
                  fill={ctx.colors.text}
                  fontSize={title.fontSize}
                  fontWeight="bold"
                  fontFamily={ctx.fonts.body}
                  dominantBaseline="alphabetic"
                >
                  {line}
                </text>
              ))}
              {desc
                ? desc.lines.map((line, li) => (
                    <text
                      key={li}
                      x={tx}
                      y={descTop + li * desc.lineHeight}
                      textAnchor={anchor}
                      fill={ctx.colors.muted}
                      fontSize={desc.fontSize}
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
      </g>
    )
  },
}
