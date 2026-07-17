import type React from "react"
import type { Block } from "@/ir"
import { fitSvgLine, layoutSvgText, measureTextUnits } from "../../lib/svg-text-layout"
import type { BlockCtx, SvgBlock } from "./types"

type RoadmapBlock = Extract<Block, { type: "roadmap" }>
type RoadmapItem = RoadmapBlock["items"][number]

/**
 * 阶段路线图卡（2026-07-14 用户 showcase deck 借鉴，取代手绘补页）：2-4 个
 * 阶段横排圆角卡，自动编号 01..N。每卡＝顶部 accent 条（上圆角，随卡片
 * 圆角，修手绘直角戳圆角的旧缺陷）+ 圆形深色编号徽章 + 可选时段 + 粗标题
 * + 若干 `label:value` 指标行。文本全实测决定卡高。
 */
const GAP = 24
const PAD_X = 22
const PAD_BOTTOM = 18
const CARD_RADIUS = 8
const BAR_H = 8

const BADGE_R = 19
const BADGE_FONT = 15
const BASELINE_FUDGE = 0.32
const BADGE_TOP = BAR_H + 16 // 徽章顶到卡顶

const PERIOD_SIZE = 14
const TITLE_SIZE = 19
const TITLE_LH = Math.round(TITLE_SIZE * 1.4)
const GAP_BADGE_TITLE = 14
const GAP_TITLE_ROWS = 16

const LABEL_SIZE = 13
const VALUE_SIZE = 14.5
const VALUE_LH = Math.round(VALUE_SIZE * 1.4)
const ROW_GAP = 12
const LABEL_VALUE_GAP = 12

interface RowLayout {
  label: { text: string; fontSize: number }
  value: { lines: string[]; fontSize: number; lineHeight: number }
  height: number
}
interface CardLayout {
  period: { text: string; fontSize: number } | null
  title: { text: string; fontSize: number }
  rows: RowLayout[]
  labelColW: number
  contentH: number
  cardH: number
}

/** Rounded-top, square-bottom bar path — top corners follow the card radius
 * so the accent bar never overhangs the card's rounded corners (the手绘 bug).
 * svg2pptx 的 A(弧) 段已支持，导出为 custGeom 圆角。 */
function roundedTopBarPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h)
  return (
    `M ${x} ${y + rr} ` +
    `A ${rr} ${rr} 0 0 1 ${x + rr} ${y} ` +
    `L ${x + w - rr} ${y} ` +
    `A ${rr} ${rr} 0 0 1 ${x + w} ${y + rr} ` +
    `L ${x + w} ${y + h} ` +
    `L ${x} ${y + h} Z`
  )
}

function cardLayout(item: RoadmapItem, cardW: number): CardLayout {
  const contentW = cardW - PAD_X * 2
  const period = item.period
    ? fitSvgLine(item.period, {
        maxWidth: contentW - BADGE_R * 2 - 12,
        fontSize: PERIOD_SIZE,
        minFontSize: 11,
      })
    : null
  const title = fitSvgLine(item.title, {
    maxWidth: contentW,
    fontSize: TITLE_SIZE,
    minFontSize: 14,
  })
  const rowItems = item.rows ?? []
  // Label column width = widest fitted label, clamped so the value column keeps
  // a usable width.
  const labelWidths = rowItems.map((r) => measureTextUnits(r.label) * LABEL_SIZE)
  const labelColW = rowItems.length
    ? Math.min(Math.max(48, Math.max(...labelWidths) + LABEL_VALUE_GAP), Math.round(contentW * 0.42))
    : 0
  const valueW = Math.max(40, contentW - labelColW)
  const rows: RowLayout[] = rowItems.map((r) => {
    const label = fitSvgLine(r.label, { maxWidth: labelColW, fontSize: LABEL_SIZE, minFontSize: 10 })
    const value = layoutSvgText(r.value, {
      maxWidth: valueW,
      fontSize: VALUE_SIZE,
      maxLines: 2,
      lineHeightRatio: 1.4,
    })
    return { label, value, height: Math.max(VALUE_LH, value.lines.length * value.lineHeight) }
  })
  const rowsH = rows.reduce((s, r) => s + r.height, 0) + Math.max(0, rows.length - 1) * ROW_GAP
  const contentH =
    BADGE_TOP +
    BADGE_R * 2 +
    GAP_BADGE_TITLE +
    TITLE_LH +
    (rows.length ? GAP_TITLE_ROWS + rowsH : 0)
  return {
    period,
    title,
    rows,
    labelColW,
    contentH,
    cardH: contentH + PAD_BOTTOM,
  }
}

function renderCard(
  layout: CardLayout,
  index: number,
  x: number,
  y: number,
  cardW: number,
  cardH: number,
  ctx: BlockCtx,
): React.ReactElement {
  const r = ctx.shape?.radius ?? CARD_RADIUS
  const cx = x + PAD_X + BADGE_R
  const cy = y + BADGE_TOP + BADGE_R
  const num = String(index + 1).padStart(2, "0")
  const titleBaseline = y + BADGE_TOP + BADGE_R * 2 + GAP_BADGE_TITLE + TITLE_SIZE
  let rowY = titleBaseline + GAP_TITLE_ROWS
  return (
    <g key={index}>
      <rect
        x={x}
        y={y}
        width={cardW}
        height={cardH}
        rx={r}
        fill={ctx.colors.surface}
        {...(ctx.colors.cardStroke ? { stroke: ctx.colors.cardStroke, strokeWidth: 1 } : {})}
      />
      <path d={roundedTopBarPath(x, y, cardW, BAR_H, r)} fill={ctx.colors.accent} />
      <circle cx={cx} cy={cy} r={BADGE_R} fill={ctx.colors.primary} />
      <text
        x={cx}
        y={cy + Math.round(BADGE_FONT * BASELINE_FUDGE)}
        textAnchor="middle"
        fontSize={BADGE_FONT}
        fontWeight="700"
        fill="#FFFFFF"
        fontFamily={ctx.fonts.body}
        dominantBaseline="alphabetic"
      >
        {num}
      </text>
      {layout.period ? (
        <text
          x={x + PAD_X + BADGE_R * 2 + 12}
          y={cy + Math.round(layout.period.fontSize * BASELINE_FUDGE)}
          fontSize={layout.period.fontSize}
          fontWeight="600"
          fill={ctx.colors.accent}
          fontFamily={ctx.fonts.body}
          dominantBaseline="alphabetic"
        >
          {layout.period.text}
        </text>
      ) : null}
      <text
        x={x + PAD_X}
        y={titleBaseline}
        fontSize={layout.title.fontSize}
        fontWeight="700"
        fill={ctx.colors.text}
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
              x={x + PAD_X}
              y={rowTop + LABEL_SIZE}
              fontSize={row.label.fontSize}
              fill={ctx.colors.muted}
              fontFamily={ctx.fonts.body}
              dominantBaseline="alphabetic"
            >
              {row.label.text}
            </text>
            {row.value.lines.map((line, li) => (
              <text
                key={li}
                x={x + PAD_X + layout.labelColW}
                y={rowTop + VALUE_SIZE + li * row.value.lineHeight}
                fontSize={row.value.fontSize}
                fontWeight="600"
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
}

export const roadmap: SvgBlock<RoadmapBlock> = {
  measure(block, w) {
    const n = block.items.length
    const cardW = (w - GAP * (n - 1)) / n
    return Math.max(...block.items.map((it) => cardLayout(it, cardW).cardH))
  },
  render(block, box, ctx) {
    const n = block.items.length
    const cardW = (box.w - GAP * (n - 1)) / n
    const layouts = block.items.map((it) => cardLayout(it, cardW))
    const measuredH = Math.max(...layouts.map((l) => l.cardH))
    // 均分密度拉伸：box.h 由布局分配时，卡高吃满（内容顶对齐，底部留白）。
    const cardH = Math.max(measuredH, box.h ?? measuredH)
    return (
      <g>
        {layouts.map((layout, i) =>
          renderCard(layout, i, box.x + i * (cardW + GAP), box.y, cardW, cardH, ctx),
        )}
      </g>
    )
  },
}
