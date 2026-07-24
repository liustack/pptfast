import type { Component } from "@/ir"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { mixHex } from "./color-mix"
import type { ComponentCtx, SvgComponent } from "./types"

type MatrixComponent = Extract<Component, { type: "matrix" }>
type MatrixItem = MatrixComponent["items"][number]

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

function toneFill(tone: MatrixItem["tone"], ctx: ComponentCtx): string {
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
  title: { text: string; fontSize: number; truncated: boolean }
  tag: { text: string; fontSize: number; truncated: boolean } | null
  contentH: number
}

// y_title's existing (pre-fix) per-char vertical rhythm — unchanged values,
// just named so measure()/render() can share one derivation instead of two
// copies of the same arithmetic drifting apart.
const Y_TITLE_START_Y = 20 // first char's baseline offset from gridTop
const Y_TITLE_CHAR_ADVANCE = AXIS_SIZE + 2 // baseline-to-baseline step, one char to the next

/**
 * Vertical extent (px, measured from gridTop) a `charCount`-long y_title's
 * stacked-character column needs: the offset to the first baseline, plus one
 * `Y_TITLE_CHAR_ADVANCE` step per remaining char to reach the last baseline,
 * plus a descent allowance for that last glyph's ink below its own baseline.
 * The 0.25em descent factor isn't a new invented margin — it's the same
 * proxy `svg-audit.ts`'s v-overflow check already uses for every other text
 * leaf (`ty + fontSize * 0.25`).
 */
function yTitleStackHeight(charCount: number): number {
  if (charCount <= 0) return 0
  return Y_TITLE_START_Y + (charCount - 1) * Y_TITLE_CHAR_ADVANCE + AXIS_SIZE * 0.25
}

/**
 * Inverse of `yTitleStackHeight`: the most characters that fit within
 * `availH` px of vertical room (the same available-height value render()'s
 * card rows stretch into — see `availGridH` below), floored at 1 so a
 * title is never rendered as zero characters even in a near-zero box.
 */
function maxYTitleChars(availH: number): number {
  return Math.max(
    1,
    Math.floor((availH - Y_TITLE_START_Y - AXIS_SIZE * 0.25) / Y_TITLE_CHAR_ADVANCE) + 1,
  )
}

/**
 * Caps y_title's character stack to what `availH` can actually hold,
 * truncating with the same `data-truncated="1"` marker convention every
 * other fitted field in this file (`cellLayout`'s title/tag, x_title) uses —
 * the last kept slot becomes "…" so the marker always lands on a real
 * rendered `<text>` node, mirroring `truncateToUnits`'s own ellipsis
 * convention (one-dimensional there, vertical here).
 */
function fitYTitleStack(text: string, availH: number): { chars: string[]; truncated: boolean } {
  const chars = Array.from(text)
  if (chars.length === 0) return { chars, truncated: false }
  const maxChars = maxYTitleChars(availH)
  if (chars.length <= maxChars) return { chars, truncated: false }
  const kept = chars.slice(0, Math.max(0, maxChars - 1))
  return { chars: [...kept, "…"], truncated: true }
}

// `fontFamily` (bold-metrics fix, round 3, 2026-07-24): optional and only
// ever passed by `render()`'s own direct call below, not `gridGeom()`'s
// internal one (used by both `measure()` and `render()` to size the grid) --
// `contentH` derives from `TITLE_LH`, a fixed constant, never from `title`'s
// own fitted `fontSize`, so `measure()`/`render()` can't disagree regardless
// of which face this fit resolves against. Same fallback-in-measure,
// real-face-in-render split 5d4c4a8 established for the other 9 structure
// components.
function cellLayout(item: MatrixItem, cardW: number, fontFamily?: string): CellLayout {
  const contentW = cardW - PAD_X * 2
  // `bold: true`: this title always renders `fontWeight="700"` below --
  // unconditional, unlike a component where boldness depends on content.
  const title = fitSvgLine(item.title, {
    maxWidth: contentW,
    fontSize: TITLE_SIZE,
    minFontSize: 12,
    bold: true,
    fontFamily,
  })
  const tag = item.tag
    ? fitSvgLine(item.tag, { maxWidth: contentW, fontSize: TAG_SIZE, minFontSize: 10 })
    : null
  const contentH = TITLE_LH + (tag ? GAP_TITLE_TAG + TAG_LH : 0)
  return { title, tag, contentH }
}

function gridGeom(component: MatrixComponent, w: number) {
  const cols = component.cols
  const rows = Math.ceil(component.items.length / cols)
  const gridX0 = component.y_title ? Y_TITLE_W : 0
  const gridW = w - gridX0
  const cardW = (gridW - CARD_GAP * (cols - 1)) / cols
  const contentH = Math.max(
    ...component.items.map((it) => cellLayout(it, cardW).contentH),
    TITLE_LH,
  )
  const cardH = PAD_TOP + contentH + PAD_BOTTOM
  const gridH = rows * cardH + (rows - 1) * CARD_GAP
  const yTitleH = component.y_title ? yTitleStackHeight(Array.from(component.y_title).length) : 0
  return { cols, rows, gridX0, cardW, cardH, gridH, yTitleH }
}

export const matrix: SvgComponent<MatrixComponent> = {
  measure(component, w) {
    const { gridH, yTitleH } = gridGeom(component, w)
    // y_title's real vertical extent enters the reported footprint (not just
    // the card grid's own height) so upstream layout allocates room for it
    // and the audit's data-audit-box actually covers it — previously this
    // returned `rows * cardH + ...` alone, blind to y_title entirely, which
    // is how a long y_title could stack ~300px past the grid's own bottom
    // edge with neither layout nor the audit ever noticing. A no-op
    // (`Math.max` picks `gridH`) whenever y_title is short enough to fit
    // inside the grid's own height already, which is the common case.
    return (component.x_title ? X_TITLE_H : 0) + Math.max(gridH, yTitleH)
  },
  render(component, box, ctx) {
    const { cols, rows, gridX0, cardW, cardH, gridH, yTitleH } = gridGeom(component, box.w)
    const gridTop = box.y + (component.x_title ? X_TITLE_H : 0)
    // 按 box.h 把每行卡等分拉伸（内容顶对齐），铺满可用高。Two different
    // "total height" semantics meet here, and X_TITLE_H must come off
    // exactly once — off whichever one of them actually includes it:
    //  - `box.h`, when a caller sets it (layout.ts's last-resort "keep the
    //    first overflowing component" branch is the one real production
    //    source: `avail = rect bottom - box.y`), is the TOTAL remaining
    //    height from box.y downward — inclusive of the x_title band, same
    //    convention `measure()` returns. It needs the subtraction.
    //  - `measuredFallbackH` mirrors `measure()`'s *second* term only
    //    (`Math.max(gridH, yTitleH)`, gridGeom's grid-only/X_TITLE_H-
    //    exclusive portion) so it lines up with `gridTop`, which has
    //    already moved past the x_title band above. Subtracting X_TITLE_H
    //    from it too would double-count that band and silently starve
    //    y_title's fit budget by X_TITLE_H px whenever box.h is left
    //    undefined — which is every real production path except that one
    //    last-resort branch (matrix isn't in `STRETCHABLE_TYPES`, and
    //    `content-bento-panel.tsx`'s `renderCell` never sets a child's
    //    `box.h` either). Bug found by review, confirmed live via a
    //    tech-theme bento-panel repro (x_title="Customer Demand",
    //    y_title="Investment Level", 16 chars): measure() correctly
    //    allocated enough room, but this same subtraction applied a second
    //    time to the fallback spuriously truncated it to "Investment Le…".
    const measuredFallbackH = Math.max(gridH, yTitleH)
    const availGridH =
      box.h !== undefined
        ? box.h - (component.x_title ? X_TITLE_H : 0)
        : measuredFallbackH
    const rowH = Math.max(cardH, (availGridH - (rows - 1) * CARD_GAP) / rows)
    const r = ctx.shape?.radius ?? CARD_RADIUS
    // x_title free-text fit (borrow-wave Task 4 follow-up, docs/contrast-
    // system.md's "Overlap detection boundary"): same fitSvgLine idiom
    // gantt's row/axis labels and waterfall/chart-svg's category labels use
    // — item.title/item.tag (cellLayout above) already went through this,
    // x_title didn't. The "  →" suffix is fit as part of the one displayed
    // string rather than measured separately, so an egregious title
    // truncates (losing the decorative arrow first, same as any other
    // trailing content) before anything can render past gridX0's right edge.
    const xTitleFit = component.x_title
      ? fitSvgLine(`${component.x_title}  →`, {
          maxWidth: box.w - gridX0,
          fontSize: AXIS_SIZE,
          minFontSize: 10,
        })
      : null
    // y_title vertical fit: cap the stacked-character column to availGridH —
    // the exact same available-height value the card rows above stretch
    // into — so a long y_title can never stack past the grid's own bottom
    // edge the way it used to (uncapped, ~300px overrun on a 24-char title
    // in the fixture that first surfaced this). measure() growing to cover
    // yTitleH (above) keeps this a no-op for the common case where box.h is
    // left undefined by upstream layout; this cap is the safety net for
    // when box.h is explicitly smaller than the full stack needs (e.g.
    // layout.ts's last-resort "keep the first overflowing component" path,
    // which sets box.h below the component's own measured height on
    // purpose).
    const yTitleFit = component.y_title ? fitYTitleStack(component.y_title, availGridH) : null
    return (
      <g>
        {xTitleFit ? (
          <text
            data-truncated={xTitleFit.truncated ? "1" : undefined}
            x={box.x + gridX0}
            y={box.y + AXIS_SIZE + 4}
            fontSize={xTitleFit.fontSize}
            fill={ctx.colors.muted}
            fontFamily={ctx.fonts.body}
            dominantBaseline="alphabetic"
          >
            {xTitleFit.text}
          </text>
        ) : null}
        {yTitleFit
          ? yTitleFit.chars.map((chr, i) => (
              <text
                key={i}
                data-truncated={
                  yTitleFit.truncated && i === yTitleFit.chars.length - 1 ? "1" : undefined
                }
                x={box.x + Y_TITLE_W / 2}
                y={gridTop + Y_TITLE_START_Y + i * Y_TITLE_CHAR_ADVANCE}
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
        {component.items.map((item, i) => {
          const col = i % cols
          const row = Math.floor(i / cols)
          const x = box.x + gridX0 + col * (cardW + CARD_GAP)
          const y = gridTop + row * (rowH + CARD_GAP)
          const cell = cellLayout(item, cardW, ctx.fonts.heading)
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
                data-truncated={cell.title.truncated ? "1" : undefined}
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
                  data-truncated={cell.tag.truncated ? "1" : undefined}
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
