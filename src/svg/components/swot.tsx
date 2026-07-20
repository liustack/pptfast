import type React from "react"
import type { Component } from "@/ir"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleInk } from "../ink"
import { mixHex } from "./color-mix"
import type { ComponentCtx, SvgComponent } from "./types"

type SwotComponent = Extract<Component, { type: "swot" }>
type QuadrantKey = "strengths" | "weaknesses" | "opportunities" | "threats"

/**
 * Named 2×2 SWOT quadrant grid (structure-components wave task 1, decision
 * 3): a full-body component (`FULL_BODY_TYPES`, `component-traits.ts`) — the
 * only component `SvgContent.tsx` ever hands this to fills the whole content
 * rect, no sibling components on the same slide (enforced by
 * `checkFullBodyExclusivity`, `api.ts`).
 *
 * Reading order is the classic SWOT convention — internal factors on top
 * (Strengths left, Weaknesses right), external factors on the bottom
 * (Opportunities left, Threats right). Each quadrant is a letter badge (S/W/
 * O/T) + title (fixed English full word, or `component.labels`' override)
 * + a bulleted item list, `fitSvgLine`-fit per item (single line,
 * shrink-then-truncate — matches `matrix.tsx`/`roadmap.tsx`'s own item-text
 * convention, deliberately not a multi-line wrap: a SWOT quadrant reads as a
 * short-phrase list, not paragraphs).
 *
 * Quadrant panels are tinted per-quadrant (`mixHex(colors.surface,
 * <token>, t)`, the same primitive `matrix.tsx`'s `toneFill` already uses)
 * so the four quadrants read as visually distinct at a glance — the whole
 * point of a SWOT chart. Every token used is a theme color (accent/primary/
 * muted, or a 50/50 blend of the latter two for Threats — there is no 4th
 * semantic theme token to spend, and this repo's convention is theme-token-
 * derived color only, never a hardcoded semantic red/green), so the four
 * quadrants automatically stay in each theme's own palette. The badge letter
 * renders unboxed, directly on the panel (see `renderQuadrant`'s own comment
 * for why — a boxed badge would be too small for `deck-audit.ts` to ever
 * attribute it its own background). Title/item ink and the badge letter's
 * ink all route through `accessibleInk` against the *real* panel fill they
 * render on (self-healing on every theme by construction) rather than
 * assuming `colors.text`/a strong token always clears contrast on a
 * mixed-in tint — see the dedicated 13-theme sweep in
 * `../audit/full-matrix-contrast.test.ts` ("swot/bmc tinted-panel contrast")
 * that locks this empirically, not just by construction.
 */

const DEFAULT_LABELS: Record<QuadrantKey, string> = {
  strengths: "Strengths",
  weaknesses: "Weaknesses",
  opportunities: "Opportunities",
  threats: "Threats",
}
const LETTERS: Record<QuadrantKey, string> = {
  strengths: "S",
  weaknesses: "W",
  opportunities: "O",
  threats: "T",
}
// Row-major reading order: [Strengths, Weaknesses] top row, [Opportunities, Threats] bottom row.
const QUADRANTS: readonly QuadrantKey[] = ["strengths", "weaknesses", "opportunities", "threats"]

const GRID_GAP = 16
const PAD_X = 20
const PAD_TOP = 18
const PAD_BOTTOM = 18
const CARD_RADIUS = 10

// `BADGE` is a horizontal reservation for the unboxed letter (see
// `renderQuadrant`'s comment) — no rect this wide is ever painted.
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

/** Badge fill (a solid, un-blended theme token) per quadrant — the panel tint
 * below blends this same color toward `colors.surface`, so the badge always
 * reads as the panel's own tint intensified. */
function badgeFill(q: QuadrantKey, ctx: ComponentCtx): string {
  switch (q) {
    case "strengths":
      return ctx.colors.accent
    case "opportunities":
      return ctx.colors.primary
    case "weaknesses":
      return ctx.colors.muted
    case "threats":
      // No 4th semantic token exists — a 50/50 primary/muted blend keeps
      // Threats visually distinct from both Weaknesses (pure muted) and
      // Opportunities (pure primary) while staying entirely theme-derived.
      return mixHex(ctx.colors.primary, ctx.colors.muted, 0.5)
  }
}

function panelFill(q: QuadrantKey, ctx: ComponentCtx): string {
  const t = q === "opportunities" ? 0.1 : 0.14
  return mixHex(ctx.colors.surface, badgeFill(q, ctx), t)
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

function gridGeom(component: SwotComponent, w: number) {
  const quadW = (w - GRID_GAP) / 2
  const layouts = QUADRANTS.map((q) =>
    quadrantLayout(component[q], component.labels?.[q] ?? DEFAULT_LABELS[q], quadW),
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
  // No boxed badge shell: the letter renders straight on the panel, so its
  // ink is computed against `panel`, the background it actually, verifiably
  // sits on — no possible mismatch between what's audited and what's
  // rendered. (Pre-bench-driven-fix-round, defect A, a boxed BADGE×BADGE,
  // 34×34 = 1,156px², rect would have sat below `deck-audit.ts`'s
  // MIN_BG_REGION_AREA and never been attributed its own text — that
  // limitation is gone for text-background *attribution* now, see
  // `PaintedShape`'s own doc comment; MIN_BG_REGION_AREA still gates only
  // the separate, page-level `regions` table.) Locked empirically, not just
  // by construction: this file's own dedicated 13-theme probe
  // (`../audit/full-matrix-contrast.test.ts`'s "swot/bmc tinted-panel
  // contrast") verifies it directly.
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

export const swot: SvgComponent<SwotComponent> = {
  measure(component, w) {
    const { cellH } = gridGeom(component, w)
    return cellH * 2 + GRID_GAP
  },
  render(component, box, ctx) {
    const { quadW, cellH, layouts } = gridGeom(component, box.w)
    const measuredH = cellH * 2 + GRID_GAP
    // box.h-aware uniform stretch (matrix.tsx's own idiom) — no
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
