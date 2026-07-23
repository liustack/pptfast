import type React from "react"
import type { Component } from "@/ir"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleInk } from "../ink"
import { mixHex } from "./color-mix"
import type { ComponentCtx, SvgComponent } from "./types"

type PestComponent = Extract<Component, { type: "pest" }>
type QuadrantKey = "political" | "economic" | "social" | "technological"

/**
 * Named 2×2 PEST macro-environment quadrant grid (structure-components wave
 * 2, task 1) — the same named-slot discipline `swot.tsx` established (four
 * independent fields, never a positional array a weak model could
 * mis-order), and in fact most of this file's geometry/render machinery is
 * a direct port of `swot.tsx`'s own (same `mixHex`-tinted self-painted
 * panels, same unboxed letter-badge idiom, same box.h-aware uncapped
 * stretch). A full-body component (`FULL_BODY_TYPES`, `component-traits.ts`)
 * — the only component `SvgContent.tsx` ever hands this to fills the whole
 * content rect, no sibling components on the same slide (enforced by
 * `checkFullBodyExclusivity`, `api.ts`).
 *
 * One deliberate schema-shape divergence from `swot`: each quadrant carries
 * its own optional `title` *inline* (`{title?, items}`, `ir/index.ts`'s
 * `PestQuadrantSchema`) instead of a sibling top-level `labels` object —
 * this task's own call (both shapes are equally weak-model-safe; inline
 * keeps a quadrant's override next to the content it overrides instead of a
 * second object a model has to keep in sync by key name).
 *
 * Reading order spells the acronym itself, row-major: Political top-left,
 * Economic top-right (internal-vs-external isn't the organizing axis here
 * the way it is for SWOT — PEST has no such convention — so acronym order
 * is the one reading order every audience already expects), Social
 * bottom-left, Technological bottom-right.
 *
 * Quadrant panels are tinted per-quadrant (`mixHex(colors.surface, <token>,
 * 0.14)`, `swot.tsx`'s own primitive) so the four read as visually distinct
 * at a glance. Every token is theme-derived (primary/accent/muted, or a
 * 50/50 primary/muted blend for the fourth — there is no 4th semantic theme
 * token to spend, same constraint `swot.tsx`'s `badgeFill` documents for its
 * own Threats case) — no hardcoded semantic color family. Title/item ink
 * and the badge letter's ink all route through `accessibleInk` against the
 * *real* panel fill they render on — see the dedicated 13-theme sweep in
 * `../audit/full-matrix-contrast.test.ts` ("pest tinted-panel contrast")
 * that locks this empirically.
 *
 * **Undersized-box shrink** (fix round, post-review: `bmc.tsx`'s bench-
 * driven fix-round defect F, the same mechanism `five-forces.tsx` ported in
 * this same task — `pest.tsx` had inherited `swot.tsx`'s original
 * `Math.max(cellH, ...)` floor byte-for-byte instead, which only ever grows
 * a row, never shrinks it below its own unstretched natural height). A
 * full-body component gets the archetype's *fixed* content-rect height
 * verbatim (`SvgContent.tsx`), never a box sized to its own `measure()`
 * value, and schema-max content (5 items in every one of the 4 quadrants)
 * combined with a heading long enough to force a 2-line wrap can shrink that
 * fixed rect below what an unshrinkable natural cell needs — an independent
 * reviewer stress matrix (13 themes × 5 heading lengths, real
 * validate→render→audit CLI pipeline) confirmed this at the same order of
 * magnitude as `swot.tsx`'s own unfixed instance, both well above
 * `five_forces`'s already-fixed rate. `render` now mirrors `bmc.tsx`/
 * `five-forces.tsx`'s exact two-stage fix: a `fontScale` (< 1 only when
 * `box.h` is short of the natural total, floored at `MIN_FONT_SCALE`)
 * shrinks every quadrant's font size/vertical rhythm uniformly before
 * geometry is derived, and the pre-existing `Math.max` grow path still
 * handles `box.h` exceeding the natural total — the two never engage at
 * once. Same one compound residual as `five-forces.tsx`'s own admission:
 * schema-max content *and* a 2-line-wrapped heading *and* the narrowest
 * curated archetype, all three at once, can still reintroduce a small
 * overflow even at the font-scale floor — out of scope to chase further,
 * documented rather than silently left unmentioned (see this file's own
 * dedicated 13-theme schema-max + long-heading sweep in
 * `../audit/full-matrix-contrast.test.ts`).
 */

const DEFAULT_TITLES: Record<QuadrantKey, string> = {
  political: "Political",
  economic: "Economic",
  social: "Social",
  technological: "Technological",
}
const LETTERS: Record<QuadrantKey, string> = {
  political: "P",
  economic: "E",
  social: "S",
  technological: "T",
}
// Row-major reading order, spelling the acronym: [Political, Economic] top
// row, [Social, Technological] bottom row.
const QUADRANTS: readonly QuadrantKey[] = ["political", "economic", "social", "technological"]

const GRID_GAP = 16
const PAD_X = 20
const PAD_TOP = 18
const PAD_BOTTOM = 18
const CARD_RADIUS = 10

// `BADGE` is a horizontal reservation for the unboxed letter (see
// `swot.tsx`'s identical comment on why the badge is never boxed) — no rect
// this wide is ever painted. Its *height* footprint (`Math.max(BADGE,
// titleSize)` in `quadrantLayout`) does shrink with `fontScale` below, same
// as every other vertical measurement in this file.
const BADGE = 34
const BADGE_FONT = 22
const GAP_BADGE_TITLE = 12

const TITLE_SIZE = 17
const TITLE_SIZE_MIN = 12
const GAP_HEADER_ITEMS = 14

const ITEM_SIZE = 14
const ITEM_SIZE_MIN = 11
const ITEM_LH_RATIO = 1.4
const ITEM_GAP = 6
const BULLET_R = 2.5
const BULLET_INDENT = 14

// fix round (post-review): floor for render's box.h-undersized font-shrink
// below, ported from `five-forces.tsx`/`bmc.tsx` — see file header. Derived
// the same way: it equals the item text's own width-axis shrink floor
// (`ITEM_SIZE_MIN / ITEM_SIZE`), so the new height-axis floor never asks
// item text to go smaller than a size this file already treats as an
// acceptable edge.
const MIN_FONT_SCALE = ITEM_SIZE_MIN / ITEM_SIZE

/** Badge fill (a solid, un-blended theme token) per quadrant — the panel
 * tint below blends this same color toward `colors.surface`. */
function badgeFill(q: QuadrantKey, ctx: ComponentCtx): string {
  switch (q) {
    case "political":
      return ctx.colors.primary
    case "economic":
      return ctx.colors.accent
    case "social":
      return ctx.colors.muted
    case "technological":
      // No 4th semantic token exists — a 50/50 primary/muted blend keeps
      // Technological visually distinct from both Political (pure primary)
      // and Social (pure muted) while staying entirely theme-derived.
      return mixHex(ctx.colors.primary, ctx.colors.muted, 0.5)
  }
}

function panelFill(q: QuadrantKey, ctx: ComponentCtx): string {
  return mixHex(ctx.colors.surface, badgeFill(q, ctx), 0.14)
}

interface QuadrantLayout {
  title: { text: string; fontSize: number; truncated: boolean }
  items: { text: string; fontSize: number; truncated: boolean }[]
  contentH: number
  // fontScale-applied nominal rhythm — `renderQuadrant` positions against
  // these, not each fitted title/item's own (possibly further width-shrunk)
  // `fontSize`. Same nominal/fitted split `bmc.tsx`'s own `BlockLayout`/
  // `five-forces.tsx`'s own `PanelLayout` use.
  badgeSize: number
  badgeFont: number
  titleSize: number
  padTop: number
  padBottom: number
  gapBadgeTitle: number
  gapHeaderItems: number
  itemSize: number
  itemLH: number
  itemGap: number
  bulletR: number
}

/**
 * `fontScale` (default 1, nominal) shrinks every vertical measurement —
 * font sizes, line-height, padding, gaps, the badge's height footprint — by
 * the same proportion; `quadW`/`PAD_X`/`BULLET_INDENT` (the horizontal
 * axis) are untouched. At `fontScale === 1` every returned field reduces to
 * this file's nominal constants exactly — same as `bmc.tsx`'s
 * `blockLayout`/`five-forces.tsx`'s `panelLayout`.
 */
function quadrantLayout(items: string[], title: string, quadW: number, fontScale: number = 1): QuadrantLayout {
  const contentW = quadW - PAD_X * 2
  const badgeSize = BADGE * fontScale
  const badgeFont = BADGE_FONT * fontScale
  const titleSize = TITLE_SIZE * fontScale
  const padTop = PAD_TOP * fontScale
  const padBottom = PAD_BOTTOM * fontScale
  const gapBadgeTitle = GAP_BADGE_TITLE * fontScale
  const gapHeaderItems = GAP_HEADER_ITEMS * fontScale
  const itemSize = ITEM_SIZE * fontScale
  const itemLH = Math.round(itemSize * ITEM_LH_RATIO)
  const itemGap = ITEM_GAP * fontScale
  const bulletR = BULLET_R * fontScale

  const fittedTitle = fitSvgLine(title, {
    maxWidth: contentW - badgeSize - gapBadgeTitle,
    fontSize: titleSize,
    minFontSize: TITLE_SIZE_MIN * fontScale,
  })
  const fittedItems = items.map((it) =>
    fitSvgLine(it, {
      maxWidth: contentW - BULLET_INDENT,
      fontSize: itemSize,
      minFontSize: ITEM_SIZE_MIN * fontScale,
    }),
  )
  const itemsH = fittedItems.length * itemLH + Math.max(0, fittedItems.length - 1) * itemGap
  const headerH = Math.max(badgeSize, titleSize)
  const contentH = padTop + headerH + gapHeaderItems + itemsH + padBottom
  return {
    title: fittedTitle,
    items: fittedItems,
    contentH,
    badgeSize,
    badgeFont,
    titleSize,
    padTop,
    padBottom,
    gapBadgeTitle,
    gapHeaderItems,
    itemSize,
    itemLH,
    itemGap,
    bulletR,
  }
}

function gridGeom(component: PestComponent, w: number, fontScale: number = 1) {
  const quadW = (w - GRID_GAP) / 2
  const layouts = QUADRANTS.map((q) =>
    quadrantLayout(component[q].items, component[q].title ?? DEFAULT_TITLES[q], quadW, fontScale),
  )
  const cellH = Math.max(...layouts.map((l) => l.contentH))
  return { quadW, cellH, layouts }
}

function renderQuadrant(
  q: QuadrantKey,
  layout: QuadrantLayout,
  x: number,
  y: number,
  w: number,
  h: number,
  ctx: ComponentCtx,
  r: number,
): React.ReactElement {
  const panel = panelFill(q, ctx)
  const badge = badgeFill(q, ctx)
  const badgeInk = accessibleInk(badge, panel, layout.badgeFont)
  const titleInk = accessibleInk(ctx.colors.text, panel, layout.titleSize)
  const itemInk = accessibleInk(ctx.colors.text, panel, layout.itemSize)
  const badgeX = x + PAD_X
  const headerBaseline = y + layout.padTop + Math.round(layout.badgeFont * 0.86)
  let itemY = y + layout.padTop + Math.max(layout.badgeSize, layout.titleSize) + layout.gapHeaderItems
  return (
    <g key={q}>
      <rect x={x} y={y} width={w} height={h} rx={r} fill={panel} />
      <text
        x={badgeX}
        y={headerBaseline}
        fontSize={layout.badgeFont}
        fontWeight="800"
        fill={badgeInk}
        fontFamily={ctx.fonts.heading}
        dominantBaseline="alphabetic"
      >
        {LETTERS[q]}
      </text>
      <text
        data-truncated={layout.title.truncated ? "1" : undefined}
        x={badgeX + layout.badgeSize + layout.gapBadgeTitle}
        y={headerBaseline}
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
        const dotCy = rowY + layout.itemSize * 0.65
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

export const pest: SvgComponent<PestComponent> = {
  measure(component, w) {
    const { cellH } = gridGeom(component, w)
    return cellH * 2 + GRID_GAP
  },
  render(component, box, ctx) {
    const natural = gridGeom(component, box.w)
    const naturalTotal = natural.cellH * 2 + GRID_GAP
    const totalH = box.h ?? naturalTotal

    // fix round (post-review), ported from bmc.tsx/five-forces.tsx — see
    // file header. A box shorter than the natural total shrinks every
    // quadrant's font size/vertical rhythm by the same proportion the box
    // is short by, floored at MIN_FONT_SCALE, instead of silently drawing
    // past box.h (this file's pre-fix `Math.max(cellH, ...)` floor). A box
    // at or above natural size keeps fontScale === 1 and reuses `natural`
    // as-is rather than recomputing.
    const fontScale = naturalTotal > 0 && totalH < naturalTotal ? Math.max(MIN_FONT_SCALE, totalH / naturalTotal) : 1
    const scaled = fontScale === 1 ? natural : gridGeom(component, box.w, fontScale)
    const scaledNaturalTotal = scaled.cellH * 2 + GRID_GAP
    const finalTotalH = Math.max(scaledNaturalTotal, totalH)

    const { quadW, layouts } = scaled
    // Growth-only stretch (this file's own pre-existing idiom, kept
    // byte-identical at fontScale===1/no-grow): both rows are always equal
    // height by construction, so an exact `(finalTotalH - GAP) / 2` split
    // both reproduces `scaled.cellH` exactly when finalTotalH ===
    // scaledNaturalTotal (the undersized-box case, nothing left to grow)
    // and grows evenly when box.h exceeds the natural total.
    const rowH = (finalTotalH - GRID_GAP) / 2
    const r = ctx.shape?.radius ?? CARD_RADIUS
    return (
      <g>
        {QUADRANTS.map((q, i) => {
          const col = i % 2
          const row = Math.floor(i / 2)
          const x = box.x + col * (quadW + GRID_GAP)
          const y = box.y + row * (rowH + GRID_GAP)
          return renderQuadrant(q, layouts[i], x, y, quadW, rowH, ctx, r)
        })}
      </g>
    )
  },
}
