import type { Block } from "@/ir"
import { fitSvgLine } from "../../lib/svg-text-layout"
import type { BlockCtx, SvgBlock } from "./types"

type MatrixBlock = Extract<Block, { type: "matrix" }>
type MatrixItem = MatrixBlock["items"][number]

/**
 * 二维定位矩阵（2026-07-14 用户 showcase deck 借鉴，取代手绘补页）：可选
 * XY 轴标签 + 色格网格。items 按行优先填格，`tone` 决定象限底色（中性/
 * accent 金调/info 冷调，从主题 token 派生实底色，Chrome 103 安全）。每格
 * 标题 + 可选 tag，文本实测。
 */
const CARD_GAP = 16
const PAD_X = 18
const PAD_TOP = 16
const CARD_RADIUS = 8
const X_TITLE_H = 30
const Y_TITLE_W = 34
const TITLE_SIZE = 17
const TITLE_LH = Math.round(TITLE_SIZE * 1.35)
const TAG_SIZE = 13
const TAG_LH = Math.round(TAG_SIZE * 1.35)
const AXIS_SIZE = 13
const GAP_TITLE_TAG = 6
const PAD_BOTTOM = 16

/** Blend hex `a` toward hex `b` by t∈[0,1] → solid #RRGGBB (no alpha, exports
 * cleanly + Chrome 103 safe). */
function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a)
  const pb = parseHex(b)
  if (!pa || !pb) return a
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t)
  const hex = (n: number) => n.toString(16).padStart(2, "0")
  return `#${hex(ch(pa[0], pb[0]))}${hex(ch(pa[1], pb[1]))}${hex(ch(pa[2], pb[2]))}`
}
function parseHex(h: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(h.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toneFill(tone: MatrixItem["tone"], ctx: BlockCtx): string {
  switch (tone) {
    case "accent":
      return mixHex(ctx.colors.surface, ctx.colors.accent, 0.16)
    case "info":
      return mixHex(ctx.colors.surface, ctx.colors.primary, 0.08)
    default:
      return mixHex(ctx.colors.surface, ctx.colors.muted, 0.08)
  }
}

interface CellLayout {
  title: { text: string; fontSize: number }
  tag: { text: string; fontSize: number } | null
  contentH: number
}

function cellLayout(item: MatrixItem, cardW: number): CellLayout {
  const contentW = cardW - PAD_X * 2
  const title = fitSvgLine(item.title, { maxWidth: contentW, fontSize: TITLE_SIZE, minFontSize: 12 })
  const tag = item.tag
    ? fitSvgLine(item.tag, { maxWidth: contentW, fontSize: TAG_SIZE, minFontSize: 10 })
    : null
  const contentH = TITLE_LH + (tag ? GAP_TITLE_TAG + TAG_LH : 0)
  return { title, tag, contentH }
}

function gridGeom(block: MatrixBlock, w: number) {
  const cols = block.cols
  const rows = Math.ceil(block.items.length / cols)
  const gridX0 = block.y_title ? Y_TITLE_W : 0
  const gridW = w - gridX0
  const cardW = (gridW - CARD_GAP * (cols - 1)) / cols
  const contentH = Math.max(
    ...block.items.map((it) => cellLayout(it, cardW).contentH),
    TITLE_LH,
  )
  const cardH = PAD_TOP + contentH + PAD_BOTTOM
  return { cols, rows, gridX0, cardW, cardH }
}

export const matrix: SvgBlock<MatrixBlock> = {
  measure(block, w) {
    const { rows, cardH } = gridGeom(block, w)
    return (
      (block.x_title ? X_TITLE_H : 0) + rows * cardH + (rows - 1) * CARD_GAP
    )
  },
  render(block, box, ctx) {
    const { cols, rows, gridX0, cardW, cardH } = gridGeom(block, box.w)
    const gridTop = box.y + (block.x_title ? X_TITLE_H : 0)
    // 按 box.h 把每行卡等分拉伸（内容顶对齐），铺满可用高。
    const measuredGridH = rows * cardH + (rows - 1) * CARD_GAP
    const availGridH = (box.h ?? measuredGridH) - (block.x_title ? X_TITLE_H : 0)
    const rowH = Math.max(cardH, (availGridH - (rows - 1) * CARD_GAP) / rows)
    const r = ctx.shape?.radius ?? CARD_RADIUS
    return (
      <g>
        {block.x_title ? (
          <text
            x={box.x + gridX0}
            y={box.y + AXIS_SIZE + 4}
            fontSize={AXIS_SIZE}
            fill={ctx.colors.muted}
            fontFamily={ctx.fonts.body}
            dominantBaseline="alphabetic"
          >
            {`${block.x_title}  →`}
          </text>
        ) : null}
        {block.y_title
          ? block.y_title.split("").map((chr, i) => (
              <text
                key={i}
                x={box.x + Y_TITLE_W / 2}
                y={gridTop + 20 + i * (AXIS_SIZE + 2)}
                textAnchor="middle"
                fontSize={AXIS_SIZE}
                fill={ctx.colors.muted}
                fontFamily={ctx.fonts.body}
                dominantBaseline="alphabetic"
              >
                {chr}
              </text>
            ))
          : null}
        {block.items.map((item, i) => {
          const col = i % cols
          const row = Math.floor(i / cols)
          const x = box.x + gridX0 + col * (cardW + CARD_GAP)
          const y = gridTop + row * (rowH + CARD_GAP)
          const cell = cellLayout(item, cardW)
          const titleBaseline = y + PAD_TOP + TITLE_SIZE
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={cardW}
                height={rowH}
                rx={r}
                fill={toneFill(item.tone, ctx)}
                {...(ctx.colors.cardStroke
                  ? { stroke: ctx.colors.cardStroke, strokeWidth: 1 }
                  : {})}
              />
              <text
                x={x + PAD_X}
                y={titleBaseline}
                fontSize={cell.title.fontSize}
                fontWeight="700"
                fill={ctx.colors.text}
                fontFamily={ctx.fonts.heading}
                dominantBaseline="alphabetic"
              >
                {cell.title.text}
              </text>
              {cell.tag ? (
                <text
                  x={x + PAD_X}
                  y={titleBaseline + GAP_TITLE_TAG + TAG_SIZE}
                  fontSize={cell.tag.fontSize}
                  fill={ctx.colors.muted}
                  fontFamily={ctx.fonts.body}
                  dominantBaseline="alphabetic"
                >
                  {cell.tag.text}
                </text>
              ) : null}
            </g>
          )
        })}
      </g>
    )
  },
}
