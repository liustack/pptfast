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
 * `../audit/full-matrix-contrast.test.ts` ("pest/five_forces tinted-panel
 * contrast") that locks this empirically.
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
// this wide is ever painted.
const BADGE = 34
const BADGE_FONT = 22
const GAP_BADGE_TITLE = 12

const TITLE_SIZE = 17
const GAP_HEADER_ITEMS = 14

const ITEM_SIZE = 14
const ITEM_LH = Math.round(ITEM_SIZE * 1.4)
const ITEM_GAP = 6
const BULLET_R = 2.5
const BULLET_INDENT = 14

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
}

function quadrantLayout(items: string[], title: string, quadW: number): QuadrantLayout {
  const contentW = quadW - PAD_X * 2
  const fittedTitle = fitSvgLine(title, {
    maxWidth: contentW - BADGE - GAP_BADGE_TITLE,
    fontSize: TITLE_SIZE,
    minFontSize: 12,
  })
  const fittedItems = items.map((it) =>
    fitSvgLine(it, { maxWidth: contentW - BULLET_INDENT, fontSize: ITEM_SIZE, minFontSize: 11 }),
  )
  const itemsH = fittedItems.length * ITEM_LH + Math.max(0, fittedItems.length - 1) * ITEM_GAP
  const headerH = Math.max(BADGE, TITLE_SIZE)
  const contentH = PAD_TOP + headerH + GAP_HEADER_ITEMS + itemsH + PAD_BOTTOM
  return { title: fittedTitle, items: fittedItems, contentH }
}

function gridGeom(component: PestComponent, w: number) {
  const quadW = (w - GRID_GAP) / 2
  const layouts = QUADRANTS.map((q) =>
    quadrantLayout(component[q].items, component[q].title ?? DEFAULT_TITLES[q], quadW),
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
  const badgeInk = accessibleInk(badge, panel, BADGE_FONT)
  const titleInk = accessibleInk(ctx.colors.text, panel, TITLE_SIZE)
  const itemInk = accessibleInk(ctx.colors.text, panel, ITEM_SIZE)
  const badgeX = x + PAD_X
  const headerBaseline = y + PAD_TOP + Math.round(BADGE_FONT * 0.86)
  let itemY = y + PAD_TOP + Math.max(BADGE, TITLE_SIZE) + GAP_HEADER_ITEMS
  return (
    <g key={q}>
      <rect x={x} y={y} width={w} height={h} rx={r} fill={panel} />
      <text
        x={badgeX}
        y={headerBaseline}
        fontSize={BADGE_FONT}
        fontWeight="800"
        fill={badgeInk}
        fontFamily={ctx.fonts.heading}
        dominantBaseline="alphabetic"
      >
        {LETTERS[q]}
      </text>
      <text
        data-truncated={layout.title.truncated ? "1" : undefined}
        x={badgeX + BADGE + GAP_BADGE_TITLE}
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
        itemY += ITEM_LH + ITEM_GAP
        const dotCy = rowY + ITEM_SIZE * 0.65
        return (
          <g key={ii}>
            <circle cx={x + PAD_X + BULLET_R} cy={dotCy} r={BULLET_R} fill={itemInk} />
            <text
              data-truncated={item.truncated ? "1" : undefined}
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

export const pest: SvgComponent<PestComponent> = {
  measure(component, w) {
    const { cellH } = gridGeom(component, w)
    return cellH * 2 + GRID_GAP
  },
  render(component, box, ctx) {
    const { quadW, cellH, layouts } = gridGeom(component, box.w)
    const measuredH = cellH * 2 + GRID_GAP
    // box.h-aware uniform stretch (swot.tsx's own idiom) — no
    // STRETCH_CAP_RATIO ceiling, this component fills whatever it's handed.
    const rowH = Math.max(cellH, ((box.h ?? measuredH) - GRID_GAP) / 2)
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
