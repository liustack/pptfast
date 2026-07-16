import { Fragment } from "react"
import type { Block } from "@/ir"
import { layoutSvgText } from "../../lib/svg-text-layout"
import {
  parseEmphasis,
  renderEmphasisTspans,
  sliceEmphasisForLines,
  stripEmphasis,
  truncateEmphasisSegments,
  type EmphasisSegment,
} from "../emphasis"
import type { SvgBlock } from "./types"

type BulletsBlock = Extract<Block, { type: "bullets" }>

const FONT_SIZE = 20
const MIN_FONT = 14
const ITEM_GAP = 8
const TEXT_INDENT = 26

interface LaidItem {
  lines: string[]
  lineSegments: EmphasisSegment[][]
  firstLineY: number
}

/** Non-emphasized prefix prepended ahead of an item's (stripped) text. */
function itemPrefix(style: NonNullable<BulletsBlock["style"]>, index: number): string {
  if (style === "numbered") return `${index + 1}. `
  if (style === "checklist") return "☐ "
  return ""
}

interface ItemsLayout {
  items: LaidItem[]
  fontSize: number
  lineHeight: number
  height: number
  /** divided 样式的项间分隔线 y（严格位于上一项文字底与下一项文字顶的中点）。 */
  dividers: number[]
}

/**
 * Wraps every bullet item to at most 2 lines within `w`, then unifies all items
 * onto a single fitted font size (floored at `MIN_FONT`) so items don't render
 * with visually inconsistent sizes. Any line still too wide at the clamped
 * size is truncated with an ellipsis. `measure` and `render` both call this so
 * the reported height always matches what's actually drawn.
 */
function layoutItems(block: BulletsBlock, w: number): ItemsLayout {
  const style = block.style ?? "plain"
  const indent = style === "default" ? TEXT_INDENT : 0
  const maxWidth = Math.max(60, w - indent)
  const prefixes = block.items.map((_, i) => itemPrefix(style, i))
  const texts = block.items.map((item, i) => `${prefixes[i]}${stripEmphasis(item)}`)
  const layouts = texts.map((t) => layoutSvgText(t, { maxWidth, fontSize: FONT_SIZE, maxLines: 2 }))
  const fontSize = Math.max(MIN_FONT, Math.min(...layouts.map((l) => l.fontSize), FONT_SIZE))
  const lineHeight = Math.round(fontSize * 1.4)

  // Re-layout once at the unified font size so every item shares the same size.
  const relaid = texts.map((t) => layoutSvgText(t, { maxWidth, fontSize, maxLines: 2 }))
  const maxUnits = maxWidth / fontSize

  let y = Math.round(fontSize * 1.1)
  const dividers: number[] = []
  const items: LaidItem[] = relaid.map((l, i) => {
    // The prefix (numbering/checklist marker) is never emphasized; only the
    // original item text can carry `**marks**`.
    const segments: EmphasisSegment[] = prefixes[i]
      ? [{ text: prefixes[i], emphasized: false }, ...parseEmphasis(block.items[i])]
      : parseEmphasis(block.items[i])
    // Map emphasis onto the pre-truncation wrapped lines (a gap-free
    // partition of `segments`) before truncating, so truncating one line
    // can't desync the emphasis cursor for a later line.
    const wrappedLineSegments = sliceEmphasisForLines(segments, l.lines)
    // At the clamped floor, layoutSvgText's own shrink may not have been able
    // to bring the longest line under maxWidth. Truncate any such line.
    const lineSegments = wrappedLineSegments.map((segs) => truncateEmphasisSegments(segs, maxUnits))
    const lines = lineSegments.map((segs) => segs.map((s) => s.text).join(""))
    const item: LaidItem = { lines, lineSegments, firstLineY: y }
    // divided 需要更大项间距容纳分隔线（设计感留白）；分隔线 y 取上一项
    // 文字底（末行 baseline+descent≈0.2em）与下一项文字顶（首行
    // baseline-ascent≈0.8em）的几何中点——贴边不居中是 v1 被用户裁
    // 「粗糙」的原因（2026-07-10）。
    const gapAfter = style === "divided" ? Math.round(fontSize * 1.9) : ITEM_GAP
    const lastBaseline = y + (lines.length - 1) * lineHeight
    y += lines.length * lineHeight + gapAfter
    if (style === "divided" && i < relaid.length - 1) {
      const textBottom = lastBaseline + fontSize * 0.2
      const nextTextTop = y - fontSize * 0.8
      dividers.push(Math.round((textBottom + nextTextTop) / 2))
    }
    return item
  })

  return { items, fontSize, lineHeight, height: y - (style === "divided" ? Math.round(fontSize * 1.9) : ITEM_GAP), dividers }
}

export const bullets: SvgBlock<BulletsBlock> = {
  measure(block, w) {
    return layoutItems(block, w).height
  },
  render(block, box, ctx) {
    const style = block.style ?? "plain"
    const { items, fontSize, lineHeight, dividers } = layoutItems(block, box.w)
    const indent = style === "default" ? TEXT_INDENT : 0
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {items.map((item, i) => (
          <Fragment key={i}>
            {style === "default" && (
              <circle cx={5} cy={item.firstLineY - fontSize * 0.3} r={3} fill={ctx.colors.primary} />
            )}
            {style === "divided" && i < items.length - 1 && (
              <line
                x1={0}
                y1={dividers[i]}
                x2={box.w}
                y2={dividers[i]}
                stroke={ctx.colors.border ?? ctx.colors.muted}
                strokeWidth={1}
              />
            )}
            {item.lineSegments.map((segments, li) => (
              <text
                key={li}
                x={indent}
                y={item.firstLineY + li * lineHeight}
                fontFamily={ctx.fonts.body}
                fontSize={fontSize}
                fill={ctx.colors.text}
                dominantBaseline="alphabetic"
              >
                {renderEmphasisTspans(segments, { accent: ctx.colors.accent, baseFill: ctx.colors.text })}
              </text>
            ))}
          </Fragment>
        ))}
      </g>
    )
  },
}
