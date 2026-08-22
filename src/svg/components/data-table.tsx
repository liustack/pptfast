import type { Component } from "@/ir"
import { fitSvgLine, measureTextUnits } from "../../lib/svg-text-layout"
import { mixHex } from "./color-mix"
import { accessibleInk } from "../ink"
import type { ComponentCtx, RenderDef, SvgComponent } from "./types"

type DataTableComponent = Extract<Component, { type: "data_table" }>
type DataTableRow = DataTableComponent["rows"][number]
type DataTableColumn = DataTableComponent["columns"][number]

/**
 * data_table（R1 证据表达波 Task T3 —— 组件 33，wave-2 域文件自持流程首次
 * 真实演练）：结构化行记录表格。几何与配色两条主线都直接复用既有先例，
 * 不新造机制：
 *
 *  - **列宽推导**：header + 每列全部 cell 内容做 `measureTextUnits` 按比例
 *    分配（`comparison.tsx` 的 `computeColumns` 同款算法——比例权重、
 *    `MIN_COL_W` 下限、超额收缩再分配），推出的列宽再喂给每格自己的
 *    `fitSvgLine` 调用做实际拟合/截断——`bold`/`fontFamily` 从第一天穿线
 *    （bold-width lesson，`matrix.tsx` 的 `cellLayout` 是同一模式：任何会
 *    加粗渲染的文字必须把 bold 状态一起交给测量函数，否则量出来的宽度
 *    比真实渲染窄）。表头与 total 强调行都会加粗，因此这两类文字的
 *    `fitSvgLine` 调用都带 `bold: true`。
 *  - **强调行底色**：`highlight`/`total` 复用 `matrix.tsx` `toneFill` 的
 *    两个已验证混色比例（accent 0.16 / muted 0.08），不新造色阶
 *    （heatmap.tsx 头注引用的既有裁定："禁止自造脱离主题的色系"）。落在
 *    这两种底色上的文字用 `accessibleInk` 现测（自绘底色的对比度纪律，
 *    见 docs/contrast-system.md「Ink selection」一节）——普通行文字没有
 *    自绘底色（表体本身不填色，booktabs 惯例，见 `comparison.tsx` 头
 *    注），直接用 `colors.text`，不套 accessibleInk。
 *  - **溢出兜底**：`box.h` 小于自然高度时按行截断 + 画「+N …」，
 *    `data-dropped` 标记——`comparison.tsx` 的 `render()` 同一套预算-截断
 *    算法，字段名换成 key 化的 columns/cells 而已。`stretchable: false`
 *    （traits），所以 `box.h` 只会来自 `layout.ts` 的兜底分支（"保留第一个
 *    溢出块"），从不会被 `growStretchables` 主动拉高——measure() 是行数的
 *    纯函数，`box.h` 大于自然高度时不做任何拉伸（"capped" = 零增长，最严格
 *    的上限）。
 *
 * 缺失 cell key（渲染空单元格）与多余 cell key（schema 级 hard error，见
 * `ir/components/data-table.ts` 的 superRefine）的契约边界完全在 IR 层解决
 * ——渲染层只管按 `column.key` 查 `row.cells[key]`，查不到就是空字符串，
 * 从不读 `Object.keys(row.cells)`，所以即便某个未经校验的实例携带多余 key
 * 也不会被这里意外拾取或渲染。
 */

const ROW = 44
const MIN_COL_W = 64
const PAD_X = 12
const HEADER_FONT_SIZE = 18
const CELL_FONT_SIZE = 16
const MIN_FONT_SIZE = 12
const SOURCE_FONT_SIZE = 12
const SOURCE_MIN_FONT_SIZE = 10
const SOURCE_GAP = 10
const SOURCE_LH = 16
/** measure()/render() 都用这个常量预留脚注带高度——两处必须读同一个值，
 * 否则会重演 matrix.tsx 头注记录的 measure()/render() 高度对不上的事故。 */
const SOURCE_BAND = SOURCE_GAP + SOURCE_LH

function cellText(row: DataTableRow, key: string): string {
  const v = row.cells[key]
  return v === undefined ? "" : String(v)
}

/** 按比例文本权重分配列宽（`comparison.tsx` `computeColumns` 同款算法），
 * 权重只取自 `rows`（调用方已经做完溢出截断的可见行子集，不是完整
 * `component.rows`）——与 comparison.tsx 先算截断、再算列宽的顺序一致。
 *
 * Bold-blind by design, not by oversight (T3 review, Minor finding):
 * `measureTextUnits(t)` below is called with no `{bold, fontFamily}` weight
 * hint, even though header/total-row text renders bold — same posture
 * `comparison.tsx`'s own `computeColumns` already takes (its weight pass
 * doesn't thread bold either). This is safe because this pass only decides
 * each column's *proportional share* of `totalW`, never the final rendered
 * text — the actual bold-aware, truncation-correct fit happens downstream
 * per cell via `fitSvgLine` (which *does* thread `bold`/`fontFamily`, the
 * mandatory "bold-width lesson" this file's own header comment names).
 * Under-weighting a bold column's width by ignoring its true (wider) bold
 * extent here can only ever make that column *relatively* narrower than an
 * idealized bold-aware allocation would — never wider than what
 * `fitSvgLine` then safely shrinks/truncates to fit, so it can never
 * overflow, only shrink a bold header/total-cell's font size slightly more
 * eagerly than a perfectly weighted pass would. */
function computeColumnWidths(
  columns: readonly DataTableColumn[],
  rows: readonly DataTableRow[],
  totalW: number,
): { widths: number[]; offsets: number[] } {
  const weights = columns.map((col) => {
    const texts = [col.label, ...rows.map((r) => cellText(r, col.key))]
    return Math.max(...texts.map((t) => measureTextUnits(t)), 1)
  })
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  const raw = weights.map((w) => (totalWeight > 0 ? (w / totalWeight) * totalW : totalW / columns.length))
  const widths = raw.map((r) => Math.max(r, MIN_COL_W))
  const excess = widths.reduce((s, w) => s + w, 0) - totalW
  if (excess > 0) {
    const shrinkable = widths.filter((w) => w > MIN_COL_W)
    const shrinkTotal = shrinkable.reduce((s, w) => s + w, 0)
    for (let c = 0; c < widths.length; c++) {
      if (widths[c] > MIN_COL_W && shrinkTotal > 0) {
        widths[c] -= excess * (widths[c] / shrinkTotal)
        widths[c] = Math.max(widths[c], MIN_COL_W)
      }
    }
  }
  // Last-resort uniform clamp (content-layout expansion wave, task T1 —
  // found via `audit-baseline.test.ts`'s `structure_bold_headings` fixture
  // once a content layout narrow enough to expose it entered the pool):
  // the shrink loop above never lets a column go below `MIN_COL_W`, so when
  // `totalW` itself is narrower than `columns.length * MIN_COL_W` (schema
  // max is 8 columns — 8*64=512px, wider than this file's own author ever
  // stress-tested against before this fixture), the widths still sum to
  // more than `totalW` after that loop and every downstream `<line>`/`<rect
  // width={box.w}>` call draws past the component's own box — a real
  // horizontal overflow, not a cosmetic one. `MIN_COL_W` is a *readability*
  // target, not a correctness invariant this component may violate the box
  // to defend — scaling every column down proportionally (breaking below
  // `MIN_COL_W` only when structurally unavoidable) keeps the table inside
  // `totalW` unconditionally; `fitSvgLine`'s own shrink/truncate fallback
  // (already threaded per cell, this file's own header comment) absorbs the
  // narrower result the same way it absorbs any other narrow column.
  const totalAfterShrink = widths.reduce((s, w) => s + w, 0)
  if (totalAfterShrink > totalW && totalAfterShrink > 0) {
    const scale = totalW / totalAfterShrink
    for (let c = 0; c < widths.length; c++) widths[c] *= scale
  }
  const offsets: number[] = []
  let x = 0
  for (const w of widths) {
    offsets.push(x)
    x += w
  }
  return { widths, offsets }
}

/** 列声明的 `align`（缺省 left，禁止按内容类型猜测——plan 明确排除"数字自动
 * 右对齐"这类启发式）决定该列每个单元格（含表头）的锚点与文本朝向。 */
function alignedX(
  align: DataTableColumn["align"],
  offset: number,
  width: number,
): { x: number; textAnchor: "start" | "middle" | "end" } {
  if (align === "center") return { x: offset + width / 2, textAnchor: "middle" }
  if (align === "right") return { x: offset + width - PAD_X, textAnchor: "end" }
  return { x: offset + PAD_X, textAnchor: "start" }
}

/** `highlight`/`total` 强调行的自绘底色——复用 `matrix.tsx` `toneFill` 的
 * "accent"/"neutral" 两档混色比例，不新造色阶。普通行返回 null（表体本身
 * 不填色，booktabs 惯例）。 */
function rowFill(emphasis: DataTableRow["emphasis"], ctx: ComponentCtx): string | null {
  if (emphasis === "highlight") return mixHex(ctx.colors.surface, ctx.colors.accent, 0.16)
  if (emphasis === "total") return mixHex(ctx.colors.surface, ctx.colors.muted, 0.08)
  return null
}

export const dataTable: SvgComponent<DataTableComponent> = {
  measure(component) {
    return (component.rows.length + 1) * ROW + (component.source ? SOURCE_BAND : 0)
  },

  render(component, box, ctx) {
    const sourceBand = component.source ? SOURCE_BAND : 0
    // box.h 截断预算（comparison.tsx render() 同款「优雅落地」算法）：
    // `stretchable: false`（traits），所以这里收到的 box.h 要么是
    // undefined（自然渲染），要么是 layout.ts 兜底分支给的、小于自然高度
    // 的预算——从未见过比自然高度更大的 box.h，但即便出现也只是让
    // truncBudget 更宽松，不会触发任何拉伸（这个函数从不主动把行拉高）。
    const truncBudget = (box.h ?? Number.POSITIVE_INFINITY) - sourceBand
    const fullRowCount = component.rows.length
    const naturalRowsH = (fullRowCount + 1) * ROW
    let visibleRowCount = fullRowCount
    if (naturalRowsH > truncBudget) {
      // 预留 1 个 ROW 给表头、1 个 ROW 给「+N …」标记行本身——与
      // comparison.tsx 的 `-2` 预留同一账法。下限钳到 1（"宁可只留一行也不
      // 要整页只剩一行 marker"，comparison.tsx/row-cards.tsx 共同先例）。
      visibleRowCount = Math.max(1, Math.min(fullRowCount, Math.floor(truncBudget / ROW) - 1))
    }
    const hiddenRowCount = fullRowCount - visibleRowCount
    const rows = hiddenRowCount > 0 ? component.rows.slice(0, visibleRowCount) : component.rows
    const totalRows = rows.length + 1 // header + 可见数据行

    const { widths, offsets } = computeColumnWidths(component.columns, rows, box.w)
    const borderColor = ctx.colors.border ?? ctx.colors.muted

    const headerFits = component.columns.map((col, c) =>
      fitSvgLine(col.label, {
        maxWidth: widths[c] - PAD_X * 2,
        fontSize: HEADER_FONT_SIZE,
        minFontSize: MIN_FONT_SIZE,
        bold: true,
        fontFamily: ctx.fonts.body,
      }),
    )

    const tableBottomY = totalRows * ROW
    const sourceFit = component.source
      ? fitSvgLine(component.source, {
          maxWidth: box.w,
          fontSize: SOURCE_FONT_SIZE,
          minFontSize: SOURCE_MIN_FONT_SIZE,
          fontFamily: ctx.fonts.body,
        })
      : null

    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {/* 强调行底色——先画，落在规则线与文字下方（自然绘制顺序）。表头
            与普通行不填色（booktabs 惯例，`comparison.tsx` 头注同一取舍）。 */}
        {rows.map((row, r) => {
          const fill = rowFill(row.emphasis, ctx)
          if (!fill) return null
          const rowY = (r + 1) * ROW
          return <rect key={`bg-${r}`} x={0} y={rowY} width={box.w} height={ROW} fill={fill} />
        })}

        {/* 表头文字——不加底色填充，加粗 + 下方一条正文色重规则线表达层级
            （booktabs 惯例，`comparison.tsx` 头注同一模式）。 */}
        {headerFits.map((fit, c) => {
          if (!component.columns[c].label) return null
          const { x, textAnchor } = alignedX(component.columns[c].align, offsets[c], widths[c])
          return (
            <text
              key={`h-${c}`}
              data-truncated={fit.truncated ? "1" : undefined}
              x={x}
              y={ROW / 2 + Math.round(fit.fontSize * 0.35)}
              textAnchor={textAnchor}
              fill={ctx.colors.text}
              fontFamily={ctx.fonts.body}
              fontSize={fit.fontSize}
              fontWeight="bold"
              dominantBaseline="alphabetic"
            >
              {fit.text}
            </text>
          )
        })}

        {/* 规则线：表头下重线（2px 正文色）、数据行间细线（1px border）、
            收尾底线（1px border）——`comparison.tsx` 同一三级规则线。 */}
        <line x1={0} y1={ROW} x2={box.w} y2={ROW} stroke={ctx.colors.text} strokeWidth={2} />
        {Array.from({ length: rows.length - 1 }, (_, k) => (
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
        <line x1={0} y1={totalRows * ROW} x2={box.w} y2={totalRows * ROW} stroke={borderColor} strokeWidth={1} />

        {/* 数据行文字——强调行落在自绘底色上，用 accessibleInk 现测；普通行
            直接 colors.text（表体不填色，对比度已由「clears 4.5:1 against
            every real page background」这条既有安全网覆盖）。 */}
        {rows.map((row, r) => {
          const fill = rowFill(row.emphasis, ctx)
          const bold = row.emphasis === "total"
          const rowY = (r + 1) * ROW
          return (
            <g key={`r-${r}`}>
              {component.columns.map((col, c) => {
                const text = cellText(row, col.key)
                if (!text) return null
                const fit = fitSvgLine(text, {
                  maxWidth: widths[c] - PAD_X * 2,
                  fontSize: CELL_FONT_SIZE,
                  minFontSize: MIN_FONT_SIZE,
                  bold,
                  fontFamily: ctx.fonts.body,
                })
                const { x, textAnchor } = alignedX(col.align, offsets[c], widths[c])
                return (
                  <text
                    key={`c-${r}-${c}`}
                    data-truncated={fit.truncated ? "1" : undefined}
                    x={x}
                    y={rowY + ROW / 2 + Math.round(fit.fontSize * 0.35)}
                    textAnchor={textAnchor}
                    fill={fill ? accessibleInk(ctx.colors.text, fill, fit.fontSize) : ctx.colors.text}
                    fontFamily={ctx.fonts.body}
                    fontSize={fit.fontSize}
                    fontWeight={bold ? "bold" : "normal"}
                    dominantBaseline="alphabetic"
                  >
                    {fit.text}
                  </text>
                )
              })}
            </g>
          )
        })}

        {hiddenRowCount > 0 && <g data-dropped={hiddenRowCount} />}

        {sourceFit ? (
          <text
            data-truncated={sourceFit.truncated ? "1" : undefined}
            x={0}
            y={tableBottomY + SOURCE_GAP + Math.round(SOURCE_FONT_SIZE * 0.8)}
            fill={ctx.colors.muted}
            fontFamily={ctx.fonts.body}
            fontSize={sourceFit.fontSize}
            dominantBaseline="alphabetic"
          >
            {sourceFit.text}
          </text>
        ) : null}
      </g>
    )
  },
}

export const renderDef: RenderDef<DataTableComponent> = {
  type: "data_table",
  measure: dataTable.measure,
  render: dataTable.render,
}
