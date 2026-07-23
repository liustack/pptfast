import type { Component } from "@/ir"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { accessibleInk, accessibleOpacity } from "../ink"
import type { ComponentCtx, SvgComponent } from "./types"

type NumberedCardsComponent = Extract<Component, { type: "numbered_cards" }>

/**
 * 编号网格列表（2026-07-11 用户借鉴编辑部大数字目录页）：自动编号
 * 01..N，无卡壳设计——每格左缘细竖线 + accent 大编号 + title 粗体 +
 * text/sub 两级描述。≤4 项单行 n 列，5-8 项两行 ceil(n/2) 列。
 */
const COL_GAP = 28
const ROW_GAP = 36
const INDENT = 22
const NUM_SIZE = 34
const TITLE_SIZE = 18
const TEXT_SIZE = 14
const SUB_SIZE = 12.5
const NUM_BLOCK_H = 48
const TITLE_BLOCK_H = 30
const CELL_PAD_BOTTOM = 8

function grid(component: NumberedCardsComponent, w: number) {
  const n = component.items.length
  const cols = n <= 4 ? n : Math.ceil(n / 2)
  const rows = n <= 4 ? 1 : 2
  const cellW = (w - COL_GAP * (cols - 1)) / cols
  const contentW = cellW - INDENT
  return { n, cols, rows, cellW, contentW }
}

// `fontFamily` (bold-metrics fix, round 2, 2026-07-24): `title` renders
// `fontWeight="bold"` in `ctx.fonts.heading` below -- bold-aware fitting
// needed, same as every other bold heading-faced text this task's
// audit-baseline sweep found and fixed. Optional/defaults `undefined`
// (envelope fallback) -- `h` (this function's height contribution) is
// derived from the fixed `TITLE_BLOCK_H` constant, never `title.fontSize`,
// so measure/render can't disagree regardless of which callers pass a
// real value.
function cellLayout(
  item: NumberedCardsComponent["items"][number],
  contentW: number,
  fontFamily?: string,
) {
  const title = fitSvgLine(item.title, {
    maxWidth: contentW,
    fontSize: TITLE_SIZE,
    minFontSize: 13,
    bold: true,
    fontFamily,
  })
  const text = item.text
    ? layoutSvgText(item.text, {
        maxWidth: contentW,
        fontSize: TEXT_SIZE,
        maxLines: 2,
        lineHeightRatio: 1.35,
      })
    : null
  const sub = item.sub
    ? fitSvgLine(item.sub, { maxWidth: contentW, fontSize: SUB_SIZE, minFontSize: 10 })
    : null
  const h =
    NUM_BLOCK_H +
    TITLE_BLOCK_H +
    (text ? text.lines.length * text.lineHeight + 4 : 0) +
    (sub ? Math.round(SUB_SIZE * 1.5) : 0) +
    CELL_PAD_BOTTOM
  return { title, text, sub, h }
}

function rowHeights(component: NumberedCardsComponent, w: number, _ctx: ComponentCtx) {
  const { cols, rows, contentW } = grid(component, w)
  const heights: number[] = []
  for (let r = 0; r < rows; r++) {
    const rowItems = component.items.slice(r * cols, (r + 1) * cols)
    heights.push(Math.max(...rowItems.map((it) => cellLayout(it, contentW).h)))
  }
  return heights
}

export const numberedCards: SvgComponent<NumberedCardsComponent> = {
  measure(component, w, ctx) {
    const heights = rowHeights(component, w, ctx)
    return heights.reduce((sum, h) => sum + h, 0) + (heights.length - 1) * ROW_GAP
  },
  render(component, box, ctx) {
    const { cols, contentW, cellW } = grid(component, box.w)
    const heights = rowHeights(component, box.w, ctx)
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {component.items.map((item, i) => {
          const row = Math.floor(i / cols)
          const col = i % cols
          const cellX = col * (cellW + COL_GAP)
          const cellY = heights.slice(0, row).reduce((s, h) => s + h + ROW_GAP, 0)
          const cellH = heights[row]
          const { title, text, sub } = cellLayout(item, contentW, ctx.fonts.heading)
          const num = String(i + 1).padStart(2, "0")
          const numBaseline = cellY + NUM_SIZE
          const titleBaseline = cellY + NUM_BLOCK_H + TITLE_SIZE
          const textTop = cellY + NUM_BLOCK_H + TITLE_BLOCK_H
          return (
            <g key={i}>
              {/* 左缘细竖线（贯穿格高） */}
              <line
                x1={cellX + 1}
                y1={cellY + 4}
                x2={cellX + 1}
                y2={cellY + cellH - CELL_PAD_BOTTOM}
                stroke={ctx.colors.accent}
                strokeWidth={2}
                opacity={0.65}
              />
              {/* Bench-driven fix round, defect B: this component paints no
                  card/panel of its own (only the thin accent left-edge
                  rule), so the big digit sits directly on the page's
                  ambient default background — `ctx.defaultBg ?? colors.bg`,
                  same fallback every other card-less component in this
                  codebase uses. `colors.accent` unwrapped measured <3:1 on
                  classroom (2.09:1) and academic (2.92:1, a near-miss) once
                  actually re-measured against a real render (not assumed) —
                  `accessibleInk` keeps `colors.accent` on every other theme,
                  byte-identical. */}
              <text
                x={cellX + INDENT}
                y={numBaseline}
                fontSize={NUM_SIZE}
                fontWeight="bold"
                fontStyle="italic"
                fill={accessibleInk(ctx.colors.accent, ctx.defaultBg ?? ctx.colors.bg, NUM_SIZE)}
                fontFamily={ctx.fonts.heading}
                dominantBaseline="alphabetic"
              >
                {num}
              </text>
              <text
                data-truncated={title.truncated ? "1" : undefined}
                x={cellX + INDENT}
                y={titleBaseline}
                fontSize={title.fontSize}
                fontWeight="bold"
                fill={ctx.colors.text}
                fontFamily={ctx.fonts.heading}
                dominantBaseline="alphabetic"
              >
                {title.text}
              </text>
              {text
                ? text.lines.map((line, li) => (
                    <text
                      key={li}
                      x={cellX + INDENT}
                      y={textTop + (li + 1) * text.lineHeight}
                      fontSize={text.fontSize}
                      fill={ctx.colors.muted}
                      fontFamily={ctx.fonts.body}
                      dominantBaseline="alphabetic"
                    >
                      {line}
                    </text>
                  ))
                : null}
              {sub ? (
                <text
                  data-truncated={sub.truncated ? "1" : undefined}
                  x={cellX + INDENT}
                  y={
                    textTop +
                    (text ? text.lines.length * text.lineHeight + 4 : 0) +
                    Math.round(SUB_SIZE * 1.4)
                  }
                  fontSize={sub.fontSize}
                  fill={ctx.colors.muted}
                  // Post-v0.3 W8 fix round (backlog item "D", task-2 review
                  // routed — pinned as a known gap in
                  // `full-matrix-contrast.test.ts` by commit c523994 before
                  // this fix landed): this cell paints no background of its
                  // own (only the accent left-edge rule above), so `sub`
                  // sits directly on the page background like `text` above
                  // it — `ctx.defaultBg ?? ctx.colors.bg`, the same fallback
                  // `chapter-rail-chapter.tsx`/`chapter-banner-chapter.tsx`
                  // already use. A flat 0.75 opacity blended colors.muted
                  // toward that background close enough to fail 4.5:1 on
                  // 12/13 themes (the pinned measurement — campaign's own
                  // 0.75-blended ratio already cleared it). accessibleOpacity
                  // falls back to full opacity wherever the blend doesn't
                  // clear the floor, `preferredOpacity` unchanged otherwise.
                  opacity={accessibleOpacity(ctx.colors.muted, ctx.defaultBg ?? ctx.colors.bg, sub.fontSize, 0.75)}
                  fontFamily={ctx.fonts.body}
                  dominantBaseline="alphabetic"
                >
                  {sub.text}
                </text>
              ) : null}
            </g>
          )
        })}
      </g>
    )
  },
}
