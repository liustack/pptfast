import { Fragment } from "react"
import type { Component } from "@/ir"
import { measureTextUnits } from "../../lib/svg-text-layout"
import type { SvgComponent } from "./types"

type ComparisonComponent = Extract<Component, { type: "comparison" }>

const ROW = 44
const MIN_COL_W = 80
const PAD_X = 12
const HEADER_FONT_SIZE = 18
const CELL_FONT_SIZE = 16
// 缩字号地板：到 12px 仍放不下才走 truncate（backlog#5 截断策略——
// 「先缩后截」，全表统一字号避免逐列参差）。12px 两行进 44px 行高都够，
// 单行居中更无风险。
const MIN_FONT_SIZE = 12

/**
 * Build logical columns: [label column, ...data columns].
 * Header titles: first column header is empty (row labels), rest are component.columns.
 */
function headerTitles(component: ComparisonComponent, labelHeader = ""): string[] {
  return [labelHeader, ...component.columns]
}

/**
 * 弱模型首列重复归一化（2026-07-10 无图矩阵真机抓到：consulting 对比表
 * 「维度」值逐行双渲）：模型把行标签又抄进 cells[0]（cells.length 等于
 * columns.length 而非 columns.length-1）。全部行都命中时判定为该病型：
 * 丢每行 cells[0]，columns[0]（如「维度」）移作标签列表头。非全行命中
 * 不归一——可能是真实数据巧合，宁可保守。
 */
function dedupeLabelColumn(component: ComparisonComponent): {
  labelHeader: string
  component: ComparisonComponent
} {
  const dup =
    component.columns.length > 1 &&
    component.rows.length > 0 &&
    component.rows.every(
      (r) =>
        r.cells.length === component.columns.length &&
        (r.cells[0] ?? "").trim() === r.label.trim(),
    )
  if (!dup) return { labelHeader: "", component }
  return {
    labelHeader: component.columns[0],
    component: {
      ...component,
      columns: component.columns.slice(1),
      rows: component.rows.map((r) => ({ ...r, cells: r.cells.slice(1) })),
    },
  }
}

/**
 * Gather all text values for a given logical column index.
 * Column 0 = row labels. Column 1..n = cells[i-1].
 */
function columnTexts(component: ComparisonComponent, colIdx: number): string[] {
  if (colIdx === 0) {
    return component.rows.map((r) => r.label)
  }
  return component.rows.map((r) => r.cells[colIdx - 1] ?? "")
}

/**
 * Compute column widths by proportional text-unit weight with a minimum width.
 *
 * For each logical column, measure the max text-unit width across header + all
 * cell values. That gives a "weight" per column. Then distribute `totalW` in
 * proportion to those weights, clamping each column to at least `MIN_COL_W`.
 *
 * Returns `{ widths, offsets }` where offsets[i] is the x position of column i.
 */
function computeColumns(
  component: ComparisonComponent,
  totalW: number,
  labelHeader = "",
): { widths: number[]; offsets: number[] } {
  const headers = headerTitles(component, labelHeader)
  const colCount = headers.length

  // Measure weight per column
  const weights: number[] = []
  for (let c = 0; c < colCount; c++) {
    const texts = [headers[c], ...columnTexts(component, c)]
    const maxUnits = Math.max(...texts.map((t) => measureTextUnits(t)), 1)
    weights.push(maxUnits)
  }

  const totalWeight = weights.reduce((s, w) => s + w, 0)

  // Initial proportional allocation
  const raw = weights.map((w) => (totalWeight > 0 ? (w / totalWeight) * totalW : totalW / colCount))

  // Enforce minimum width. Clamp small columns up, then redistribute surplus
  // from larger columns proportionally.
  const widths = raw.map((r) => Math.max(r, MIN_COL_W))
  const excess = widths.reduce((s, w) => s + w, 0) - totalW
  if (excess > 0) {
    // Shrink only columns above minimum proportionally
    const shrinkable = widths.filter((w) => w > MIN_COL_W)
    const shrinkTotal = shrinkable.reduce((s, w) => s + w, 0)
    for (let c = 0; c < widths.length; c++) {
      if (widths[c] > MIN_COL_W) {
        widths[c] -= excess * (widths[c] / shrinkTotal)
        widths[c] = Math.max(widths[c], MIN_COL_W)
      }
    }
  }

  // Compute cumulative x offsets
  const offsets: number[] = []
  let x = 0
  for (const w of widths) {
    offsets.push(x)
    x += w
  }

  return { widths, offsets }
}

/**
 * Largest font size (clamped to [MIN_FONT_SIZE, base]) at which `text` fits
 * the column's padded width on one line.
 */
function shrinkToFit(text: string, colW: number, base: number): number {
  const units = measureTextUnits(text)
  if (units <= 0) return base
  const avail = colW - PAD_X * 2
  return Math.max(MIN_FONT_SIZE, Math.min(base, Math.floor(avail / units)))
}

/**
 * Table-wide fitted font size: the minimum per-column `shrinkToFit` across
 * all (text, column) pairs, so every header (or every cell) shares one size
 * instead of shrinking raggedly column by column.
 */
function fittedFontSize(
  pairs: Array<{ text: string; colW: number }>,
  base: number,
): number {
  return Math.min(base, ...pairs.map(({ text, colW }) => shrinkToFit(text, colW, base)))
}

/**
 * Truncate text to fit within available pixel width at the given font size.
 * If the rendered text exceeds the column, trim and append "...".
 */
function truncate(text: string, colW: number, fontSize: number): string {
  const availableUnits = (colW - PAD_X * 2) / fontSize
  if (measureTextUnits(text) <= availableUnits) return text

  const chars = Array.from(text)
  const ellipsis = "…"
  const ellipsisUnits = measureTextUnits(ellipsis)
  let result = ""
  let units = 0

  for (const ch of chars) {
    const chUnits = measureTextUnits(ch)
    if (units + chUnits + ellipsisUnits > availableUnits) break
    result += ch
    units += chUnits
  }

  return result + ellipsis
}

export const comparison: SvgComponent<ComparisonComponent> = {
  measure(component) {
    return (component.rows.length + 1) * ROW
  },

  render(rawComponent, box, ctx) {
    const { labelHeader, component: dedupedComponent } = dedupeLabelColumn(rawComponent)

    // Vertical graceful landing (P0 hardening, robustness deep-review D1,
    // family-sweep sibling of bullets.tsx): `rows` has no schema ceiling
    // and each row costs a fixed `ROW` px regardless of content, so an
    // extreme row count (the D1 repro used 300) pushes every row further
    // off-canvas with no cap of its own — the same "unbounded per-item
    // vertical stack, no box.h awareness" shape bullets.tsx had. `box.h` is
    // only ever set on this non-stretchable component by
    // `layoutContentFit`'s overflow-defense branch (`layout.ts`), so its
    // presence always means "cap to this budget," never "stretch"
    // (row-cards.tsx's own precedent for this convention).
    const truncBudget = box.h ?? Number.POSITIVE_INFINITY
    const fullRowCount = dedupedComponent.rows.length
    const naturalHeight = (fullRowCount + 1) * ROW // header + every data row, ignoring box.h
    let visibleRowCount = fullRowCount
    if (naturalHeight > truncBudget) {
      // Reserve 1 ROW for the header row and 1 ROW for the "+N more"
      // marker line itself inside the budget — same reservation shape
      // row-cards.tsx's own `truncBudget - 20` uses for its marker text.
      // Floored at 1 visible row (row-cards.tsx's "never render zero
      // visible units" precedent), even when the budget can't truly fit
      // even one — an honestly-labeled overflow beats an empty table.
      visibleRowCount = Math.max(1, Math.min(fullRowCount, Math.floor(truncBudget / ROW) - 2))
    }
    const hiddenRowCount = fullRowCount - visibleRowCount
    const component =
      hiddenRowCount > 0
        ? { ...dedupedComponent, rows: dedupedComponent.rows.slice(0, visibleRowCount) }
        : dedupedComponent

    const headers = headerTitles(component, labelHeader)
    const colCount = headers.length
    const { widths, offsets } = computeColumns(component, box.w, labelHeader)
    const borderColor = ctx.colors.border ?? ctx.colors.muted
    const totalRows = component.rows.length + 1 // header + data rows

    const headerFontSize = fittedFontSize(
      headers.flatMap((title, c) => (title ? [{ text: title, colW: widths[c] }] : [])),
      HEADER_FONT_SIZE,
    )
    const cellFontSize = fittedFontSize(
      component.rows.flatMap((row) =>
        [row.label, ...row.cells]
          .slice(0, colCount)
          .map((cell, c) => ({ text: cell, colW: widths[c] })),
      ),
      CELL_FONT_SIZE,
    )
    // 基线补偿随字号走（0.35×字号），18/16 时与旧常量 +6 完全一致。
    const headerBaseline = Math.round(headerFontSize * 0.35)
    const cellBaseline = Math.round(cellFontSize * 0.35)

    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {/* 表头不做任何填充（booktabs 惯例）：surface 色带在米色/深色页面上
            都是一块割裂的色块（2026-07-08 用户复验，全主题中招）。层级由
            加粗表头文字 + 下方一条正文色重规则线表达，天然融入任意主题底色。 */}

        {/* Header texts */}
        {headers.map((title, c) => {
          if (!title) return null
          const fitted = truncate(title, widths[c], headerFontSize)
          return (
            <text
              key={`h-${c}`}
              data-truncated={fitted !== title ? "1" : undefined}
              x={offsets[c] + PAD_X}
              y={ROW / 2 + headerBaseline}
              fill={ctx.colors.text}
              fontFamily={ctx.fonts.body}
              fontSize={headerFontSize}
              fontWeight="bold"
              dominantBaseline="alphabetic"
            >
              {fitted}
            </text>
          )
        })}

        {/* 规则线三级：表头下重线（2px 正文色，midrule）、数据行间细线
            （1px border）、收尾底线（1px border，bottomrule）。无顶线——
            表头直接坐在页面底色上。 */}
        <line
          x1={0}
          y1={ROW}
          x2={box.w}
          y2={ROW}
          stroke={ctx.colors.text}
          strokeWidth={2}
        />
        {Array.from({ length: component.rows.length - 1 }, (_, k) => (
          <line
            key={`sep-${k}`}
            x1={0}
            y1={(k + 2) * ROW}
            x2={box.w}
            y2={(k + 2) * ROW}
            stroke={borderColor}
            strokeWidth={1}
          />
        ))}
        <line
          x1={0}
          y1={totalRows * ROW}
          x2={box.w}
          y2={totalRows * ROW}
          stroke={borderColor}
          strokeWidth={1}
        />


        {/* Data rows */}
        {component.rows.map((row, r) => {
          const rowY = (r + 1) * ROW
          const cells = [row.label, ...row.cells]
          return (
            <Fragment key={`r-${r}`}>
              {cells.map((cell, c) => {
                if (c >= colCount) return null
                const fitted = truncate(cell, widths[c], cellFontSize)
                return (
                  <text
                    key={`c-${r}-${c}`}
                    data-truncated={fitted !== cell ? "1" : undefined}
                    x={offsets[c] + PAD_X}
                    y={rowY + ROW / 2 + cellBaseline}
                    fill={c === 0 ? ctx.colors.muted : ctx.colors.text}
                    fontFamily={ctx.fonts.body}
                    fontSize={cellFontSize}
                    fontWeight={c === 0 ? "bold" : "normal"}
                    dominantBaseline="alphabetic"
                  >
                    {fitted}
                  </text>
                )
              })}
            </Fragment>
          )
        })}
        {hiddenRowCount > 0 && (
          <text
            data-dropped={hiddenRowCount}
            x={box.w}
            y={totalRows * ROW + 20}
            textAnchor="end"
            fontSize={13}
            fill={ctx.colors.muted}
            fontFamily={ctx.fonts.body}
            dominantBaseline="alphabetic"
          >
            {`+${hiddenRowCount} more`}
          </text>
        )}
      </g>
    )
  },
}
