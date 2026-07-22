import { Fragment } from "react"
import type { Component } from "@/ir"
import { layoutSvgText, measureTextUnits } from "../../lib/svg-text-layout"
import {
  parseEmphasis,
  renderEmphasisTspans,
  sliceEmphasisForLines,
  stripEmphasis,
  truncateEmphasisSegments,
  type EmphasisSegment,
} from "../emphasis"
import type { SvgComponent } from "./types"

type BulletsComponent = Extract<Component, { type: "bullets" }>

const MIN_FONT = 14
const ITEM_GAP = 8
const TEXT_INDENT = 26

interface LaidItem {
  lines: string[]
  lineSegments: EmphasisSegment[][]
  /** Per-line: did `truncateEmphasisSegments` actually cut this line (bench-
   *  driven fix round, defect E)? Parallel to `lineSegments` — read by
   *  `render` to mark the rendered `<text>` with `data-truncated="1"`. */
  lineTruncated: boolean[]
  firstLineY: number
  /** y (group-relative, px) of this item's own text bottom — last line's
   * baseline plus a 0.2em descent allowance, same proxy `svg-audit.ts`'s
   * v-overflow check and matrix.tsx's y_title fit use for "how far down did
   * this text actually reach." Read by `render`'s box.h-aware cap (P0
   * hardening, robustness deep-review D1) to decide how many items fit —
   * `layoutItems` itself stays unbounded/unaware of any box, same division
   * of responsibility `measure`/`render` already split (this field is what
   * lets `render` answer "does item i fit" without recomputing layout). */
  contentBottom: number
}

/** Non-emphasized prefix prepended ahead of an item's (stripped) text. */
function itemPrefix(style: NonNullable<BulletsComponent["style"]>, index: number): string {
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
 *
 * `baseFontSize` is `ctx.bodyFontPx` (W4 task 3, design decision 9) — the
 * pacing-tier body baseline items shrink *from*, not a fixed ceiling: the
 * shrink-to-`MIN_FONT` machinery below is unchanged and applies the same way
 * whether it starts at 20, 24, or 32.
 */
function layoutItems(component: BulletsComponent, w: number, baseFontSize: number): ItemsLayout {
  const style = component.style ?? "plain"
  const indent = style === "default" ? TEXT_INDENT : 0
  const maxWidth = Math.max(60, w - indent)
  const prefixes = component.items.map((_, i) => itemPrefix(style, i))
  // `measureTextUnits` is a proportional (per-em) measure, independent of
  // font size, so each prefix's unit cost can be computed once up front and
  // scaled by whatever font size is active at each layout pass below.
  const prefixUnits = prefixes.map((p) => measureTextUnits(p))
  const strippedTexts = component.items.map((item) => stripEmphasis(item))

  // Truncation-visibility fix (2026-07-22): numbered ("1. ") and checklist
  // ("☐ ") prefixes each carry exactly one space. Folding that space into
  // the same string previously handed to `layoutSvgText` flipped
  // `tokenize()` (svg-text-layout.ts) into word-wrap mode for the *whole*
  // item: a pure-CJK item has no other space, so `${prefix}${content}`
  // tokenized into exactly two "words" — the short prefix and one giant
  // unspaced blob holding all the content. `wrapWithUnits`'s greedy fit then
  // stranded the prefix alone on line 1 (the packed content chunk plus the
  // prefix always overflowed the shared per-line budget by the prefix's own
  // width) and spilled the *entire* rest of the content onto line 2 via the
  // maxLines merge fallback — wasting a full line's budget on 1-3 characters.
  // Measured effect: numbered/checklist items truncated at ~30/~23 CJK
  // units at MIN_FONT+424px-width, versus plain/default/divided's ~56-60 at
  // the same box (see capacity.ts's bullets derivation for the full probe).
  //
  // Root fix, at this composition seam rather than in the shared wrap
  // engine: never hand the prefix to `layoutSvgText`/`tokenize` at all. Wrap
  // each item's own content alone — a pure-CJK item then stays in the
  // tokenizer's per-character mode exactly like plain/default/divided
  // already do, and a genuinely space-delimited item still word-wraps
  // correctly on its *own* spaces, undisturbed by the prefix — inside a
  // width reduced by the prefix's rendered width (`contentMaxWidth` below).
  // The reservation is uniform across both lines: the prefix only visually
  // sits on line 1 (bullets never hanging-indents a wrapped continuation —
  // every line renders at the same `x`), so reserving its ~1-2 units on
  // line 2 too is a deliberately conservative no-op there, never a source of
  // overflow on line 1. The prefix itself is spliced back onto line 1's
  // *segments* only after wrapping and truncation are done, purely for
  // rendering — it never touches the wrap or truncate math again, so it can
  // no longer perturb `tokenize`'s word/char decision.
  //
  // Scoped to this composition seam (not svg-text-layout.ts's `tokenize`)
  // because `bullets.tsx` is the only call site in the codebase that
  // composes a short, space-bearing literal prefix ahead of arbitrary
  // (possibly space-free CJK) caller content before a `layoutSvgText` call —
  // fixing the space-delimited heuristic in `tokenize` itself would instead
  // touch the shared wrap engine that headings, paragraphs, kpi, citation,
  // icon-cards, steps, and verdict-banner all depend on too, for a defect
  // only this one composition pattern actually triggers.
  const contentMaxWidth = (fontSize: number, i: number) =>
    Math.max(1, maxWidth - prefixUnits[i] * fontSize)

  const layouts = strippedTexts.map((t, i) =>
    layoutSvgText(t, { maxWidth: contentMaxWidth(baseFontSize, i), fontSize: baseFontSize, maxLines: 2 }),
  )
  const fontSize = Math.max(MIN_FONT, Math.min(...layouts.map((l) => l.fontSize), baseFontSize))
  const lineHeight = Math.round(fontSize * 1.4)

  // Re-layout once at the unified font size so every item shares the same size.
  const relaid = strippedTexts.map((t, i) =>
    layoutSvgText(t, { maxWidth: contentMaxWidth(fontSize, i), fontSize, maxLines: 2 }),
  )

  let y = Math.round(fontSize * 1.1)
  const dividers: number[] = []
  const items: LaidItem[] = relaid.map((l, i) => {
    // The prefix (numbering/checklist marker) is never emphasized and, as of
    // this fix, never enters the wrap/truncate math either — it's spliced
    // onto line 1 below, after both are done. `segments` here is exactly the
    // original item text's emphasis parse, matching what `strippedTexts[i]`
    // (fed to `layoutSvgText` above) and `l.lines` represent.
    const segments: EmphasisSegment[] = parseEmphasis(component.items[i])
    // Map emphasis onto the pre-truncation wrapped lines (a gap-free
    // partition of `segments`) before truncating, so truncating one line
    // can't desync the emphasis cursor for a later line.
    const wrappedLineSegments = sliceEmphasisForLines(segments, l.lines)
    // At the clamped floor, layoutSvgText's own shrink may not have been able
    // to bring the longest line under maxWidth. Truncate any such line — same
    // conservative reservation (`contentMaxWidth`) as the wrap step above, so
    // a truncated line 1 still leaves room for the prefix spliced on next.
    const maxUnits = contentMaxWidth(fontSize, i) / fontSize
    const lineSegments = wrappedLineSegments.map((segs) => truncateEmphasisSegments(segs, maxUnits))
    // A line actually lost characters iff its post-truncation text differs
    // from its pre-truncation text — `truncateEmphasisSegments` returns
    // `segs` unchanged (same content) whenever nothing needed cutting, so a
    // plain text-equality check is exact here, no `maxUnits` re-derivation
    // needed (bench-driven fix round, defect E).
    const lineTruncated = wrappedLineSegments.map(
      (before, li) => before.map((s) => s.text).join("") !== lineSegments[li].map((s) => s.text).join(""),
    )
    // Splice the prefix onto line 1 now that wrap/truncate math is done with
    // content alone — from here it's purely a rendering concern. An
    // all-whitespace/empty item wraps to zero lines (`layoutSvgText`'s own
    // empty-content guard), so there's no line 1 to splice onto yet — a
    // numbered/checklist item with empty content should still show its
    // marker, so synthesize a one-line item holding just the prefix instead
    // of indexing into an empty array.
    if (prefixes[i]) {
      lineSegments[0] =
        lineSegments.length > 0
          ? [{ text: prefixes[i], emphasized: false }, ...lineSegments[0]]
          : [{ text: prefixes[i], emphasized: false }]
    }
    const lines = lineSegments.map((segs) => segs.map((s) => s.text).join(""))
    // divided 需要更大项间距容纳分隔线（设计感留白）；分隔线 y 取上一项
    // 文字底（末行 baseline+descent≈0.2em）与下一项文字顶（首行
    // baseline-ascent≈0.8em）的几何中点——贴边不居中是 v1 被用户裁
    // 「粗糙」的原因（2026-07-10）。
    const gapAfter = style === "divided" ? Math.round(fontSize * 1.9) : ITEM_GAP
    const lastBaseline = y + (lines.length - 1) * lineHeight
    const contentBottom = lastBaseline + fontSize * 0.2
    const item: LaidItem = { lines, lineSegments, lineTruncated, firstLineY: y, contentBottom }
    y += lines.length * lineHeight + gapAfter
    if (style === "divided" && i < relaid.length - 1) {
      const nextTextTop = y - fontSize * 0.8
      dividers.push(Math.round((contentBottom + nextTextTop) / 2))
    }
    return item
  })

  return { items, fontSize, lineHeight, height: y - (style === "divided" ? Math.round(fontSize * 1.9) : ITEM_GAP), dividers }
}

/**
 * How many leading items of `items` fit within `truncBudget` px (group-
 * relative, same space `item.contentBottom` is measured in) — at least 1,
 * matching `row-cards.tsx`'s own "never render zero visible units, even in
 * a near-zero box" precedent for this exact `box.h`-undersized situation
 * (`layoutContentFit`'s last-resort "keep the first placed component"
 * branch is the only caller that ever sets a `box.h` smaller than this
 * component's own unbounded `measure()` height).
 */
function visibleItemCount(items: LaidItem[], truncBudget: number): number {
  let visible = 0
  for (const item of items) {
    if (item.contentBottom > truncBudget) break
    visible++
  }
  return Math.max(1, visible)
}

export const bullets: SvgComponent<BulletsComponent> = {
  measure(component, w, ctx) {
    return layoutItems(component, w, ctx.bodyFontPx).height
  },
  render(component, box, ctx) {
    const style = component.style ?? "plain"
    const { items: allItems, fontSize, lineHeight, dividers } = layoutItems(component, box.w, ctx.bodyFontPx)
    const indent = style === "default" ? TEXT_INDENT : 0
    // Vertical graceful landing (P0 hardening, robustness deep-review D1):
    // `component.items` carries no schema ceiling, and pre-fix this loop
    // rendered every item's `<text>` regardless of how far past `box.h` its
    // `y` landed — an extreme item count (500+) pushed `y` far enough off
    // the 1280×720 canvas to cross pptxgenjs's undocumented
    // `getSmartParseNumber()` ≥100in heuristic (see `chart-svg.tsx`'s
    // `MAX_CHART_GEOMETRY_PX` for the same trap on the chart side),
    // producing a non-integer EMU that `package-audit`'s
    // `invalid-shape-transform` rule then rejected — loud, but with an
    // unusable error message (see `formatViolations`' own fix, same task).
    // `box.h` is only ever set on this non-stretchable component type by
    // `layoutContentFit`'s overflow-defense branch, so its presence always
    // means "cap to this budget," never "stretch" (`row-cards.tsx` is the
    // precedent for both this convention and the "+N more"/`data-dropped`
    // marker below).
    const truncBudget = box.h ?? Number.POSITIVE_INFINITY
    const visible = truncBudget === Number.POSITIVE_INFINITY ? allItems.length : visibleItemCount(allItems, truncBudget)
    const items = allItems.slice(0, visible)
    const hidden = allItems.length - visible
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
                data-truncated={item.lineTruncated[li] ? "1" : undefined}
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
        {hidden > 0 && (
          <text
            data-dropped={hidden}
            x={box.w}
            y={items[items.length - 1].contentBottom + Math.round(fontSize * 0.9)}
            textAnchor="end"
            fontSize={Math.max(11, Math.round(fontSize * 0.65))}
            fill={ctx.colors.muted}
            fontFamily={ctx.fonts.body}
            dominantBaseline="alphabetic"
          >
            {`+${hidden} more`}
          </text>
        )}
      </g>
    )
  },
}
