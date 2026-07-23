import type React from "react"
import type { Component } from "@/ir"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleInk } from "../ink"
import { mixHex } from "./color-mix"
import type { ComponentCtx, SvgComponent } from "./types"

type BmcComponent = Extract<Component, { type: "bmc" }>
type BlockKey =
  | "key_partners"
  | "key_activities"
  | "key_resources"
  | "value_propositions"
  | "customer_relationships"
  | "channels"
  | "customer_segments"
  | "cost_structure"
  | "revenue_streams"

/**
 * Business Model Canvas — the classic Osterwalder nine-block layout
 * (structure-components wave task 1, decision 4): a full-body component
 * (`FULL_BODY_TYPES`, `component-traits.ts`), the slide's sole component,
 * whole content rect handed straight to `render` (`checkFullBodyExclusivity`,
 * `api.ts`, enforces the "sole component" half).
 *
 * Layout is the canonical five-column canvas, not an arbitrary grid — this
 * is the one visual shape a "business model canvas" is recognized by:
 *
 * ```
 * ┌──────────┬──────────┬──────────┬──────────┬──────────┐
 * │          │  key_    │          │ customer_│          │
 * │  key_    │activities│  value_  │relation-  │ customer_│
 * │ partners │──────────│  propo-  │  ships    │ segments │
 * │          │  key_    │ sitions  │──────────│          │
 * │          │resources │          │ channels │          │
 * ├──────────┴──────────┴──────────┴──────────┴──────────┤
 * │        cost_structure       │     revenue_streams      │
 * └──────────────────────────────────────────────────────┘
 * ```
 *
 * Three of the five columns (`key_partners`/`value_propositions`/
 * `customer_segments`) are tall cells spanning the full top band; the other
 * two columns (`key_activities`+`key_resources`, `customer_relationships`+
 * `channels`) each stack two half-height cells. The bottom band is a
 * `cost_structure` / `revenue_streams` 50/50 split.
 *
 * Row-height ratios are *not* a hardcoded constant: `naturalBandHeights`
 * derives the top-band/bottom-band split from each block's own real fitted
 * content (title + item count) at the natural, unstretched width — pure
 * function of the input, deterministic. `render`'s box.h-aware stretch
 * (matrix.tsx's own idiom — see `swot.tsx`'s identical comment) then grows
 * both bands by the *same proportion* their natural heights already had, so
 * an unstretched render (`box.h` omitted, `measure`'s own return value)
 * reproduces the natural split exactly, and a stretched one keeps the same
 * visual balance scaled up. For representative content (1-2 short items in
 * most blocks, 2 in the wider ones — `bmc.test.tsx`'s own fixture) at
 * w=1088 (the 1280×720 deck's usual content width), this resolves to
 * topBandH=204 / bottomBandH=95 / GAP=14 of a 313px natural total — top-band
 * ≈65% / bottom-band ≈30% (the remaining ~5% is the one inter-band gap) —
 * measured by actually calling `naturalBandHeights` against that fixture,
 * not eyeballed, and not asserted as a hardcoded constant in this file.
 *
 * `value_propositions` — the canvas's own conceptual center — gets a tinted
 * panel (`mixHex(colors.surface, colors.accent, t)`, same primitive as
 * `swot.tsx`/`matrix.tsx`'s `toneFill`) to visually anchor it; the other 8
 * blocks are flat `colors.surface` panels (the same flat-panel convention
 * `icon-cards.tsx`/`roadmap.tsx` already use). All 9 blocks route their
 * title/item ink through `accessibleInk` against their own real panel fill
 * regardless of whether that fill is tinted or flat — uniform, and free to
 * reason about (no "8 of these are already known-safe, 1 needs a wrapper"
 * bookkeeping) — see `../audit/full-matrix-contrast.test.ts`'s dedicated
 * "bmc tinted-block contrast" 13-theme sweep for the empirical lock.
 *
 * **The inverse case — `box.h` *smaller* than the natural total (bench-
 * driven fix round, defect F)**: real, not hypothetical. `SvgContent.tsx`
 * hands a full-body component (`FULL_BODY_TYPES`) the archetype's fixed
 * content-rect height verbatim, never a box sized to this file's own
 * `measure()` return value — and schema-max content (4 items in every one
 * of the 9 blocks, the IR schema's own ceiling — a real bench-observed
 * shape, `tests/bench/questions/q07`, not a synthetic worst case) can
 * exceed even the most generous curated content rect. Pre-fix, `render`
 * floored `totalH` at the natural total and never shrank below it, so an
 * undersized box just drew taller than `box.h` — the bottom band
 * (`cost_structure`/`revenue_streams`) spilled first (and worst) because
 * it's the last band painted and sits lowest, but every one of the 9 cells
 * was equally capable of overflowing its own drawn rect given a heavy
 * enough item count. Fix: shrink every cell's font size and vertical
 * rhythm (padding/line-height/gaps — never the horizontal axis; column
 * math in `gridGeom` is untouched) by the same proportion the box itself
 * is short by — `fontScale = totalH / naturalTotal`, threaded through
 * `blockLayout`/`renderBlock` — floored at `MIN_FONT_SCALE` so text never
 * degrades past legibility. The floor is derived, not guessed: it equals
 * `ITEM_SIZE_MIN / ITEM_SIZE` (9.5/12.5 = 0.76), the same 9.5px this file
 * already accepts as its per-item *width*-axis shrink floor (`fitSvgLine`'s
 * own `minFontSize`) — the new height-axis floor never asks item text to
 * go smaller than a size this file already treats as an acceptable edge.
 * A box at or above natural size (the common case — every non-schema-max
 * fixture in this codebase's test suite) keeps `fontScale === 1` and takes
 * the exact pre-fix code path, byte-identical (verified by construction:
 * `blockLayout`/`renderBlock`'s scaled fields all reduce to the pre-fix
 * hardcoded constants at `fontScale === 1`, and `naturalBandHeights` is
 * reused rather than recomputed on that path). See the task report for the
 * concrete verified ratios (~0.92 for the schema-max 13-theme regression
 * fixture below; the plan's own literal "3 items" repro needs ~0.90) and
 * the one compound edge case (a forced 2-line heading *and* a subheading
 * *and* the narrowest curated content archetype, all at once) the floor
 * still doesn't fully absorb — out of this task's own scope (no subheading
 * or multi-line heading in the bench evidence), documented as a bounded
 * residual rather than silently left unmentioned.
 */

const BLOCK_LABELS: Record<BlockKey, string> = {
  key_partners: "Key Partners",
  key_activities: "Key Activities",
  key_resources: "Key Resources",
  value_propositions: "Value Propositions",
  customer_relationships: "Customer Relationships",
  channels: "Channels",
  customer_segments: "Customer Segments",
  cost_structure: "Cost Structure",
  revenue_streams: "Revenue Streams",
}

const GAP = 14
const PAD_X = 14
const PAD_TOP = 14
const PAD_BOTTOM = 14
const CARD_RADIUS = 8

const TITLE_SIZE = 13.5
const TITLE_SIZE_MIN = 10
const TITLE_LH_RATIO = 1.3
const GAP_TITLE_ITEMS = 10

const ITEM_SIZE = 12.5
const ITEM_SIZE_MIN = 9.5
const ITEM_LH_RATIO = 1.35
const ITEM_GAP = 5
const BULLET_R = 2
const BULLET_INDENT = 11

// bench-driven fix round, defect F — floor for `render`'s box.h-undersized
// font-shrink below. See file header's "The inverse case" paragraph for the
// mechanism and why this specific ratio (not an arbitrary one).
const MIN_FONT_SCALE = ITEM_SIZE_MIN / ITEM_SIZE

interface BlockLayout {
  title: { text: string; fontSize: number; truncated: boolean }
  items: { text: string; fontSize: number; truncated: boolean }[]
  contentH: number
  /** `fontScale`-applied nominal sizes/rhythm `renderBlock` positions
   * against — nominal, not each fitted item/title's own (possibly further
   * width-shrunk) `fontSize`. Same "nominal size drives position, fitted
   * size only affects glyph width" split this file used pre-`fontScale`
   * too (the old `renderBlock` positioned off the module-level `ITEM_SIZE`
   * constant, never a fitted item's own shrunk `fontSize`). */
  titleSize: number
  titleLH: number
  padTop: number
  gapTitleItems: number
  itemSize: number
  itemLH: number
  itemGap: number
  bulletR: number
}

/**
 * `fontScale` (default 1, the pre-fix nominal size) shrinks every vertical
 * measurement — font sizes, line-heights, padding, gaps — by the same
 * proportion; the horizontal axis (`w`/`contentW`/`PAD_X`/`BULLET_INDENT`)
 * is untouched (see file header — this is a vertical-axis fix only). At
 * `fontScale === 1` every returned field reduces to this file's pre-fix
 * hardcoded constants exactly (same `TITLE_SIZE`/`ITEM_SIZE`, same 1.3/1.35
 * ratios, same 10/9.5 width-axis floors) — byte-identical output.
 */
// `fontFamily` (bold-metrics fix, round 2, 2026-07-24): `renderBlock`'s own
// title `<text>` declares `fontWeight="700"` in `ctx.fonts.heading` -- the
// cell title (`BLOCK_LABELS[key]`, a fixed constant, not user-controllable
// via the IR) needs the same bold-aware fitting as every other bold
// heading-faced text this task's audit-baseline sweep already found and
// fixed (kpi.tsx/steps.tsx/etc, round 1). Optional and defaults to
// `undefined` (envelope fallback, `bold: true` regardless -- title is
// unconditionally bold in this component) so the measure-time callers
// below (which only ever read `.contentH`, itself derived from the fixed
// declared `titleSize`, never the fitted result) don't need it -- see this
// function's own return value: `contentH` doesn't depend on whether
// `title` actually had to shrink, so measure/render can't disagree over it
// regardless of which callers pass `fontFamily`.
function blockLayout(
  items: string[],
  key: BlockKey,
  w: number,
  fontScale: number = 1,
  fontFamily?: string,
): BlockLayout {
  const contentW = Math.max(1, w - PAD_X * 2)
  const titleSize = TITLE_SIZE * fontScale
  const itemSize = ITEM_SIZE * fontScale
  const titleLH = Math.round(titleSize * TITLE_LH_RATIO)
  const itemLH = Math.round(itemSize * ITEM_LH_RATIO)
  const padTop = PAD_TOP * fontScale
  const padBottom = PAD_BOTTOM * fontScale
  const gapTitleItems = GAP_TITLE_ITEMS * fontScale
  const itemGap = ITEM_GAP * fontScale
  const bulletR = BULLET_R * fontScale

  const title = fitSvgLine(BLOCK_LABELS[key], {
    maxWidth: contentW,
    fontSize: titleSize,
    minFontSize: TITLE_SIZE_MIN * fontScale,
    bold: true,
    fontFamily,
  })
  const fittedItems = items.map((it) =>
    fitSvgLine(it, {
      maxWidth: contentW - BULLET_INDENT,
      fontSize: itemSize,
      minFontSize: ITEM_SIZE_MIN * fontScale,
    }),
  )
  const itemsH = fittedItems.length * itemLH + Math.max(0, fittedItems.length - 1) * itemGap
  const contentH = padTop + titleLH + gapTitleItems + itemsH + padBottom
  return {
    title,
    items: fittedItems,
    contentH,
    titleSize,
    titleLH,
    padTop,
    gapTitleItems,
    itemSize,
    itemLH,
    itemGap,
    bulletR,
  }
}

const TOP_ROW_KEYS: readonly BlockKey[] = ["key_activities", "customer_relationships"]
const BOTTOM_ROW_KEYS: readonly BlockKey[] = ["key_resources", "channels"]
const SPAN_KEYS: readonly BlockKey[] = ["key_partners", "value_propositions", "customer_segments"]
const BOTTOM_BAND_KEYS: readonly BlockKey[] = ["cost_structure", "revenue_streams"]

/** Natural (unstretched, `fontScale`-adjusted) top-band/bottom-band
 * heights, pure function of `component`'s real content at width `w` and
 * `fontScale` — see file header. `fontScale` defaults to 1 (nominal size);
 * `render`'s undersized-box shrink path is the only caller that ever
 * passes a smaller value. */
function naturalBandHeights(
  component: BmcComponent,
  w: number,
  fontScale: number = 1,
): { topBandH: number; bottomBandH: number } {
  const colW = (w - GAP * 4) / 5
  const bottomColW = (w - GAP) / 2
  const halfRowH = Math.max(
    ...[...TOP_ROW_KEYS, ...BOTTOM_ROW_KEYS].map((k) => blockLayout(component[k], k, colW, fontScale).contentH),
  )
  const spanH = Math.max(...SPAN_KEYS.map((k) => blockLayout(component[k], k, colW, fontScale).contentH))
  const topBandH = Math.max(halfRowH * 2 + GAP, spanH)
  const bottomBandH = Math.max(
    ...BOTTOM_BAND_KEYS.map((k) => blockLayout(component[k], k, bottomColW, fontScale).contentH),
  )
  return { topBandH, bottomBandH }
}

interface CellGeom {
  key: BlockKey
  x: number
  y: number
  w: number
  h: number
  tinted: boolean
}

/**
 * Cell geometry for one render pass — `natTop`/`natBottom` (the natural,
 * unstretched band heights `measure()` itself derived) are passed in rather
 * than recomputed here, so a stretched render only walks every block's
 * `blockLayout` once (in `naturalBandHeights`, by the caller) instead of
 * twice.
 */
function gridGeom(w: number, totalH: number, natTop: number, natBottom: number) {
  const natTotal = natTop + GAP + natBottom
  // Grow both bands by the same proportion their natural heights already
  // had — `totalH === natTotal` (the unstretched `measure()` case)
  // reproduces the natural split exactly; a taller `totalH` scales both
  // bands up together instead of only one ballooning.
  const scale = natTotal > 0 ? Math.max(1, totalH / natTotal) : 1
  const topBandH = natTop * scale
  const bottomBandH = totalH - GAP - topBandH

  const colW = (w - GAP * 4) / 5
  const rowH = (topBandH - GAP) / 2
  const bottomColW = (w - GAP) / 2

  const col = (i: number) => i * (colW + GAP)
  const cells: CellGeom[] = [
    { key: "key_partners", x: col(0), y: 0, w: colW, h: topBandH, tinted: false },
    { key: "key_activities", x: col(1), y: 0, w: colW, h: rowH, tinted: false },
    { key: "key_resources", x: col(1), y: rowH + GAP, w: colW, h: rowH, tinted: false },
    { key: "value_propositions", x: col(2), y: 0, w: colW, h: topBandH, tinted: true },
    { key: "customer_relationships", x: col(3), y: 0, w: colW, h: rowH, tinted: false },
    { key: "channels", x: col(3), y: rowH + GAP, w: colW, h: rowH, tinted: false },
    { key: "customer_segments", x: col(4), y: 0, w: colW, h: topBandH, tinted: false },
    { key: "cost_structure", x: 0, y: topBandH + GAP, w: bottomColW, h: bottomBandH, tinted: false },
    {
      key: "revenue_streams",
      x: bottomColW + GAP,
      y: topBandH + GAP,
      w: bottomColW,
      h: bottomBandH,
      tinted: false,
    },
  ]
  return { cells, topBandH, bottomBandH, colW, bottomColW }
}

function renderBlock(
  cell: CellGeom,
  layout: BlockLayout,
  ctx: ComponentCtx,
  ox: number,
  oy: number,
  r: number,
): React.ReactElement {
  const panel = cell.tinted ? mixHex(ctx.colors.surface, ctx.colors.accent, 0.14) : ctx.colors.surface
  const titleInk = accessibleInk(ctx.colors.text, panel, layout.titleSize)
  const itemInk = accessibleInk(ctx.colors.text, panel, layout.itemSize)
  const x = ox + cell.x
  const y = oy + cell.y
  const titleBaseline = y + layout.padTop + layout.titleSize
  let itemY = y + layout.padTop + layout.titleLH + layout.gapTitleItems
  return (
    <g key={cell.key}>
      <rect
        x={x}
        y={y}
        width={cell.w}
        height={cell.h}
        rx={r}
        fill={panel}
        {...(ctx.colors.cardStroke && !cell.tinted
          ? { stroke: ctx.colors.cardStroke, strokeWidth: 1 }
          : {})}
      />
      <text
        data-truncated={layout.title.truncated ? "1" : undefined}
        x={x + PAD_X}
        y={titleBaseline}
        fontSize={layout.title.fontSize}
        fontWeight="700"
        fill={titleInk}
        fontFamily={ctx.fonts.heading}
        dominantBaseline="alphabetic"
      >
        {layout.title.text}
      </text>
      {layout.items.map((item, ii) => {
        const rowY = itemY
        itemY += layout.itemLH + layout.itemGap
        const dotCy = rowY + layout.itemSize * 0.6
        return (
          <g key={ii}>
            <circle cx={x + PAD_X + layout.bulletR} cy={dotCy} r={layout.bulletR} fill={itemInk} />
            <text
              data-truncated={item.truncated ? "1" : undefined}
              x={x + PAD_X + BULLET_INDENT}
              y={rowY + layout.itemSize}
              fontSize={item.fontSize}
              fill={itemInk}
              fontFamily={ctx.fonts.body}
              dominantBaseline="alphabetic"
            >
              {item.text}
            </text>
          </g>
        )
      })}
    </g>
  )
}

export const bmc: SvgComponent<BmcComponent> = {
  measure(component, w) {
    const { topBandH, bottomBandH } = naturalBandHeights(component, w)
    return topBandH + GAP + bottomBandH
  },
  render(component, box, ctx) {
    const { topBandH: natTop, bottomBandH: natBottom } = naturalBandHeights(component, box.w)
    const naturalTotal = natTop + GAP + natBottom
    const totalH = box.h ?? naturalTotal

    // bench-driven fix round, defect F: a box shorter than the natural
    // total is real (full-body components get the archetype's fixed
    // content-rect height verbatim, never their own `measure()` value —
    // `SvgContent.tsx`), so this shrinks every cell's font size/vertical
    // rhythm by the same proportion the box is short by instead of
    // silently drawing taller than `box.h` (see file header). A box at or
    // above natural size keeps `fontScale === 1` — the exact pre-fix path,
    // byte-identical (`natTop`/`natBottom` above are reused as-is rather
    // than recomputed).
    const fontScale =
      naturalTotal > 0 && totalH < naturalTotal ? Math.max(MIN_FONT_SCALE, totalH / naturalTotal) : 1
    const { topBandH: scaledTop, bottomBandH: scaledBottom } =
      fontScale === 1
        ? { topBandH: natTop, bottomBandH: natBottom }
        : naturalBandHeights(component, box.w, fontScale)
    const scaledNaturalTotal = scaledTop + GAP + scaledBottom
    const finalTotalH = Math.max(scaledNaturalTotal, totalH)

    const { cells } = gridGeom(box.w, finalTotalH, scaledTop, scaledBottom)
    const r = ctx.shape?.radius ?? CARD_RADIUS
    return (
      <g>
        {cells.map((cell) => {
          const layout = blockLayout(component[cell.key], cell.key, cell.w, fontScale, ctx.fonts.heading)
          return renderBlock(cell, layout, ctx, box.x, box.y, r)
        })}
      </g>
    )
  },
}
