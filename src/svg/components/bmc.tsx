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
const TITLE_LH = Math.round(TITLE_SIZE * 1.3)
const GAP_TITLE_ITEMS = 10

const ITEM_SIZE = 12.5
const ITEM_LH = Math.round(ITEM_SIZE * 1.35)
const ITEM_GAP = 5
const BULLET_R = 2
const BULLET_INDENT = 11

interface BlockLayout {
  title: { text: string; fontSize: number }
  items: { text: string; fontSize: number }[]
  contentH: number
}

function blockLayout(items: string[], key: BlockKey, w: number): BlockLayout {
  const contentW = Math.max(1, w - PAD_X * 2)
  const title = fitSvgLine(BLOCK_LABELS[key], {
    maxWidth: contentW,
    fontSize: TITLE_SIZE,
    minFontSize: 10,
  })
  const fittedItems = items.map((it) =>
    fitSvgLine(it, { maxWidth: contentW - BULLET_INDENT, fontSize: ITEM_SIZE, minFontSize: 9.5 }),
  )
  const itemsH = fittedItems.length * ITEM_LH + Math.max(0, fittedItems.length - 1) * ITEM_GAP
  const contentH = PAD_TOP + TITLE_LH + GAP_TITLE_ITEMS + itemsH + PAD_BOTTOM
  return { title, items: fittedItems, contentH }
}

const TOP_ROW_KEYS: readonly BlockKey[] = ["key_activities", "customer_relationships"]
const BOTTOM_ROW_KEYS: readonly BlockKey[] = ["key_resources", "channels"]
const SPAN_KEYS: readonly BlockKey[] = ["key_partners", "value_propositions", "customer_segments"]
const BOTTOM_BAND_KEYS: readonly BlockKey[] = ["cost_structure", "revenue_streams"]

/** Natural (unstretched) top-band/bottom-band heights, pure function of
 * `component`'s real content at width `w` — see file header. */
function naturalBandHeights(component: BmcComponent, w: number): { topBandH: number; bottomBandH: number } {
  const colW = (w - GAP * 4) / 5
  const bottomColW = (w - GAP) / 2
  const halfRowH = Math.max(
    ...[...TOP_ROW_KEYS, ...BOTTOM_ROW_KEYS].map((k) => blockLayout(component[k], k, colW).contentH),
  )
  const spanH = Math.max(...SPAN_KEYS.map((k) => blockLayout(component[k], k, colW).contentH))
  const topBandH = Math.max(halfRowH * 2 + GAP, spanH)
  const bottomBandH = Math.max(...BOTTOM_BAND_KEYS.map((k) => blockLayout(component[k], k, bottomColW).contentH))
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
  const titleInk = accessibleInk(ctx.colors.text, panel, TITLE_SIZE)
  const itemInk = accessibleInk(ctx.colors.text, panel, ITEM_SIZE)
  const x = ox + cell.x
  const y = oy + cell.y
  const titleBaseline = y + PAD_TOP + TITLE_SIZE
  let itemY = y + PAD_TOP + TITLE_LH + GAP_TITLE_ITEMS
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
        itemY += ITEM_LH + ITEM_GAP
        const dotCy = rowY + ITEM_SIZE * 0.6
        return (
          <g key={ii}>
            <circle cx={x + PAD_X + BULLET_R} cy={dotCy} r={BULLET_R} fill={itemInk} />
            <text
              x={x + PAD_X + BULLET_INDENT}
              y={rowY + ITEM_SIZE}
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
    const totalH = Math.max(naturalTotal, box.h ?? naturalTotal)
    const { cells } = gridGeom(box.w, totalH, natTop, natBottom)
    const r = ctx.shape?.radius ?? CARD_RADIUS
    return (
      <g>
        {cells.map((cell) => {
          const layout = blockLayout(component[cell.key], cell.key, cell.w)
          return renderBlock(cell, layout, ctx, box.x, box.y, r)
        })}
      </g>
    )
  },
}
