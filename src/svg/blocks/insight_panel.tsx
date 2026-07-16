import type { Block } from "@/ir"
import { fitSvgLine, layoutSvgText, measureTextUnits } from "../../lib/svg-text-layout"
import type { SvgBlock } from "./types"

type InsightPanelBlock = Extract<Block, { type: "insight_panel" }>

/**
 * 带标题的策略/观点面板（2026-07-14 用户 showcase deck 借鉴，取代手绘补
 * 页）：圆角面板 + 标题压 accent 条 + 若干 `label / 描述` 行 + 可选贴底脚
 * 注。常作 aside 侧栏块与数据并置。**全文实测**决定面板高度，脚注恒在卡
 * 内（修手绘脚本假设固定行数导致的溢出）。
 */
const PAD_X = 22
const PAD_TOP = 20
const PAD_BOTTOM = 18
const CARD_RADIUS = 10
const BAR_H = 6

const TITLE_SIZE = 17
const TITLE_LH = Math.round(TITLE_SIZE * 1.4)
const GAP_TITLE_ROWS = 18

const LABEL_SIZE = 14
const TEXT_SIZE = 13.5
const TEXT_LH = Math.round(TEXT_SIZE * 1.45)
const ROW_GAP = 16
const LABEL_COL_MIN = 56

const FOOT_SIZE = 12
const GAP_ROWS_FOOT = 16

/** Rounded-top, square-bottom bar path (top corners follow the panel radius). */
function roundedTopBarPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h)
  return (
    `M ${x} ${y + rr} A ${rr} ${rr} 0 0 1 ${x + rr} ${y} ` +
    `L ${x + w - rr} ${y} A ${rr} ${rr} 0 0 1 ${x + w} ${y + rr} ` +
    `L ${x + w} ${y + h} L ${x} ${y + h} Z`
  )
}

interface RowLayout {
  label: { text: string; fontSize: number }
  text: { lines: string[]; fontSize: number; lineHeight: number }
  height: number
}
interface PanelLayout {
  title: { text: string; fontSize: number }
  rows: RowLayout[]
  labelColW: number
  foot: { lines: string[]; fontSize: number; lineHeight: number } | null
  contentH: number
}

function panelLayout(block: InsightPanelBlock, w: number): PanelLayout {
  const contentW = w - PAD_X * 2
  const title = fitSvgLine(block.title, {
    maxWidth: contentW,
    fontSize: TITLE_SIZE,
    minFontSize: 13,
  })
  const labelColW = Math.min(
    Math.max(LABEL_COL_MIN, Math.max(...block.rows.map((r) => measureTextUnits(r.label) * LABEL_SIZE)) + 14),
    Math.round(contentW * 0.4),
  )
  const textW = Math.max(60, contentW - labelColW)
  const rows: RowLayout[] = block.rows.map((r) => {
    const label = fitSvgLine(r.label, { maxWidth: labelColW, fontSize: LABEL_SIZE, minFontSize: 11 })
    const text = layoutSvgText(r.text, {
      maxWidth: textW,
      fontSize: TEXT_SIZE,
      maxLines: 3,
      lineHeightRatio: 1.45,
    })
    return { label, text, height: Math.max(TEXT_LH, text.lines.length * text.lineHeight) }
  })
  const foot = block.footnote
    ? layoutSvgText(block.footnote, {
        maxWidth: contentW,
        fontSize: FOOT_SIZE,
        maxLines: 2,
        lineHeightRatio: 1.4,
      })
    : null
  const rowsH = rows.reduce((s, r) => s + r.height, 0) + Math.max(0, rows.length - 1) * ROW_GAP
  const contentH =
    PAD_TOP +
    TITLE_LH +
    GAP_TITLE_ROWS +
    rowsH +
    (foot ? GAP_ROWS_FOOT + foot.lines.length * foot.lineHeight : 0) +
    PAD_BOTTOM
  return { title, rows, labelColW, foot, contentH }
}

export const insightPanel: SvgBlock<InsightPanelBlock> = {
  measure(block, w) {
    return panelLayout(block, w).contentH
  },
  render(block, box, ctx) {
    const layout = panelLayout(block, box.w)
    const r = ctx.shape?.radius ?? CARD_RADIUS
    // 面板高度取实测与分配的较大者——脚注按内容实测底定位，恒在卡内。
    const panelH = Math.max(layout.contentH, box.h ?? layout.contentH)
    const titleBaseline = box.y + PAD_TOP + TITLE_SIZE
    let rowY = titleBaseline + GAP_TITLE_ROWS
    return (
      <g>
        <rect
          x={box.x}
          y={box.y}
          width={box.w}
          height={panelH}
          rx={r}
          fill={ctx.colors.surface}
          {...(ctx.colors.cardStroke ? { stroke: ctx.colors.cardStroke, strokeWidth: 1 } : {})}
        />
        <path d={roundedTopBarPath(box.x, box.y, box.w, BAR_H, r)} fill={ctx.colors.accent} />
        <text
          x={box.x + PAD_X}
          y={titleBaseline}
          fontSize={layout.title.fontSize}
          fontWeight="700"
          fill={ctx.colors.accent}
          fontFamily={ctx.fonts.heading}
          dominantBaseline="alphabetic"
        >
          {layout.title.text}
        </text>
        {layout.rows.map((row, ri) => {
          const rowTop = rowY
          rowY += row.height + ROW_GAP
          return (
            <g key={ri}>
              <text
                x={box.x + PAD_X}
                y={rowTop + LABEL_SIZE}
                fontSize={row.label.fontSize}
                fontWeight="700"
                fill={ctx.colors.text}
                fontFamily={ctx.fonts.body}
                dominantBaseline="alphabetic"
              >
                {row.label.text}
              </text>
              {row.text.lines.map((line, li) => (
                <text
                  key={li}
                  x={box.x + PAD_X + layout.labelColW}
                  y={rowTop + TEXT_SIZE + li * row.text.lineHeight}
                  fontSize={row.text.fontSize}
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
        {layout.foot
          ? layout.foot.lines.map((line, li) => (
              <text
                key={`f${li}`}
                x={box.x + PAD_X}
                y={box.y + panelH - PAD_BOTTOM - (layout.foot!.lines.length - 1 - li) * layout.foot!.lineHeight - 2}
                fontSize={FOOT_SIZE}
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
  },
}
