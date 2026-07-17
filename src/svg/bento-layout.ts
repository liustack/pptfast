import type { Component } from "@/ir"
import type { ContentRect } from "./layout"

/** Gap (px) between bento cards, both horizontal and vertical. */
export const BENTO_GAP = 16

type KpiCardsComponent = Extract<Component, { type: "kpi_cards" }>
/** A single `kpi_cards` item, keyed off the schema so `icon`/`delta` stay in sync. */
export type KpiItem = KpiCardsComponent["items"][number]

type IconCardsComponent = Extract<Component, { type: "icon_cards" }>
/** A single `icon_cards` item, keyed off the schema so `icon` stays in sync. */
export type IconCardItem = IconCardsComponent["items"][number]

/**
 * A single bento tile: either a whole component, or one item exploded out of a
 * `kpi_cards`/`icon_cards` component (see `explodeIntoUnits`) — each item gets
 * its own card instead of the whole component sharing a single card. The
 * exploded variants still carry their *source* component (not just the one
 * item) — `renderCell` (`templates/tech.tsx`) needs it to resolve
 * `ctx.blockIndex` and tag the cell `data-blk`, since exploded units bypass
 * `renderComponent` (the usual tagging chokepoint) entirely.
 */
export type BentoUnit =
  | { kind: "component"; component: Component }
  | { kind: "kpi-item"; item: KpiItem; component: KpiCardsComponent }
  | { kind: "icon-card-item"; item: IconCardItem; component: IconCardsComponent }

/** A unit paired with the page-coordinate card box the bento layout assigned it. */
export interface BentoCell {
  unit: BentoUnit
  box: { x: number; y: number; w: number; h: number }
}

/**
 * Explode a slide's components into bento tiles: every `kpi_cards`/`icon_cards`
 * component becomes one `kpi-item`/`icon-card-item` unit per item (so each item
 * reads as its own card instead of a card-in-a-card row squeezed into one
 * bento cell), every other component type passes through as a single `component`
 * unit unchanged. Order is preserved — a component's items land at that component's
 * position in the sequence. A `kpi_cards` component with zero items contributes
 * no units (`icon_cards` schema-enforces >=2 items, so it always contributes
 * at least 2).
 */
export function explodeIntoUnits(components: Component[]): BentoUnit[] {
  const units: BentoUnit[] = []
  for (const component of components) {
    if (component.type === "kpi_cards") {
      for (const item of component.items) units.push({ kind: "kpi-item", item, component })
    } else if (component.type === "icon_cards") {
      for (const item of component.items)
        units.push({ kind: "icon-card-item", item, component })
    } else {
      units.push({ kind: "component", component })
    }
  }
  return units
}

/**
 * Lay out up to 6 units into a "bento" card grid inside `rect`. Boxes are
 * card outer frames (no inner padding — that's the template renderer's job).
 * 7th unit and beyond are returned as `overflow` for the caller to render via
 * a full-width fallback (single-stack layout).
 */
export function layoutBento(
  units: BentoUnit[],
  rect: ContentRect
): { cells: BentoCell[]; overflow: BentoUnit[] } {
  const { x, y, w, h } = rect

  if (units.length === 0) return { cells: [], overflow: [] }

  if (units.length === 1) {
    return { cells: [{ unit: units[0], box: { x, y, w, h } }], overflow: [] }
  }

  if (units.length === 2) {
    const usableW = w - BENTO_GAP
    const leftW = usableW * 0.58
    const rightW = usableW * 0.42
    return {
      cells: [
        { unit: units[0], box: { x, y, w: leftW, h } },
        { unit: units[1], box: { x: x + leftW + BENTO_GAP, y, w: rightW, h } },
      ],
      overflow: [],
    }
  }

  if (units.length === 3) {
    const usableW = w - BENTO_GAP
    const leftW = usableW * 0.6
    const rightW = usableW * 0.4
    const rightX = x + leftW + BENTO_GAP
    const rightH = (h - BENTO_GAP) / 2
    return {
      cells: [
        { unit: units[0], box: { x, y, w: leftW, h } },
        { unit: units[1], box: { x: rightX, y, w: rightW, h: rightH } },
        {
          unit: units[2],
          box: { x: rightX, y: y + rightH + BENTO_GAP, w: rightW, h: rightH },
        },
      ],
      overflow: [],
    }
  }

  if (units.length === 4) {
    // 2x2 grid (top row 60/40, bottom row 40/60 — unequal, offset).
    const usableW = w - BENTO_GAP
    const rowH = (h - BENTO_GAP) / 2
    const topLeftW = usableW * 0.6
    const topRightW = usableW * 0.4
    const bottomLeftW = usableW * 0.4
    const bottomRightW = usableW * 0.6
    const bottomY = y + rowH + BENTO_GAP

    return {
      cells: [
        { unit: units[0], box: { x, y, w: topLeftW, h: rowH } },
        {
          unit: units[1],
          box: { x: x + topLeftW + BENTO_GAP, y, w: topRightW, h: rowH },
        },
        { unit: units[2], box: { x, y: bottomY, w: bottomLeftW, h: rowH } },
        {
          unit: units[3],
          box: {
            x: x + bottomLeftW + BENTO_GAP,
            y: bottomY,
            w: bottomRightW,
            h: rowH,
          },
        },
      ],
      overflow: [],
    }
  }

  if (units.length === 5) {
    // Upper row of 3 equal-width cards, lower row of 2 equal-width cards —
    // both rows independently fill the full rect width (the 2-card row
    // isn't just the 3-card row's columns merged pairwise).
    const rowH = (h - BENTO_GAP) / 2
    const topW = (w - 2 * BENTO_GAP) / 3
    const bottomW = (w - BENTO_GAP) / 2
    const bottomY = y + rowH + BENTO_GAP

    return {
      cells: [
        { unit: units[0], box: { x, y, w: topW, h: rowH } },
        {
          unit: units[1],
          box: { x: x + topW + BENTO_GAP, y, w: topW, h: rowH },
        },
        {
          unit: units[2],
          box: { x: x + 2 * (topW + BENTO_GAP), y, w: topW, h: rowH },
        },
        { unit: units[3], box: { x, y: bottomY, w: bottomW, h: rowH } },
        {
          unit: units[4],
          box: { x: x + bottomW + BENTO_GAP, y: bottomY, w: bottomW, h: rowH },
        },
      ],
      overflow: [],
    }
  }

  if (units.length === 6) {
    // Equal-width 3x2 grid — no unequal-column bento asymmetry once every
    // slot is full, since there's no "hero" cell left to emphasize.
    const rowH = (h - BENTO_GAP) / 2
    const colW = (w - 2 * BENTO_GAP) / 3
    const bottomY = y + rowH + BENTO_GAP
    const colX = (i: number) => x + i * (colW + BENTO_GAP)

    return {
      cells: [
        { unit: units[0], box: { x: colX(0), y, w: colW, h: rowH } },
        { unit: units[1], box: { x: colX(1), y, w: colW, h: rowH } },
        { unit: units[2], box: { x: colX(2), y, w: colW, h: rowH } },
        { unit: units[3], box: { x: colX(0), y: bottomY, w: colW, h: rowH } },
        { unit: units[4], box: { x: colX(1), y: bottomY, w: colW, h: rowH } },
        { unit: units[5], box: { x: colX(2), y: bottomY, w: colW, h: rowH } },
      ],
      overflow: [],
    }
  }

  // 7+ units: the bento grid only ever has 6 cells — lay out the first 6 per
  // the 6-unit tier above and report the rest as overflow for the caller's
  // full-width fallback.
  const { cells } = layoutBento(units.slice(0, 6), rect)
  return { cells, overflow: units.slice(6) }
}

/**
 * Component types that already paint their own card/frame — callout's
 * left-bar-and-fill, code's dark panel, comparison's header row + rule
 * lines, quote's decorative mark/attribution treatment, verdict_banner's own
 * bordered/tinted conclusion strip. Lives here (not only in
 * `templates/tech.tsx`, which also renders against this exact set)
 * because `heroWeight` below needs the identical classification to rank a
 * self-visual component's hero weight — a single shared source of truth so the
 * "which components are self-visual" list can't drift between the two files.
 */
export const SELF_VISUAL_TYPES = new Set([
  "callout",
  "code",
  "comparison",
  "quote",
  "verdict_banner",
])

/**
 * "Visual weight" tiers consumed by `sortUnitsByHeroWeight`. `chart` and
 * `kpi-item` are *tied* at the top (the brief's "chart ≥ kpi-item" — both
 * are hero-worthy; when a slide has both, original IR order breaks the tie,
 * not a hard chart-over-kpi rule). `icon-card-item` ranks next, a
 * self-visual component (already carries its own chrome/tone — see
 * `SELF_VISUAL_TYPES`) above a plain component, which ranks lowest.
 */
const HERO_WEIGHT = {
  chartOrKpi: 3,
  iconCard: 2,
  selfVisual: 1,
  component: 0,
} as const

function heroWeight(unit: BentoUnit): number {
  if (unit.kind === "kpi-item") return HERO_WEIGHT.chartOrKpi
  if (unit.kind === "icon-card-item") return HERO_WEIGHT.iconCard
  if (unit.component.type === "chart") return HERO_WEIGHT.chartOrKpi
  if (SELF_VISUAL_TYPES.has(unit.component.type)) return HERO_WEIGHT.selfVisual
  return HERO_WEIGHT.component
}

/**
 * `layoutBento`'s cell **array positions**, per unit count, ordered from
 * largest box area to smallest (ties keep their natural index order). This
 * is *not* always `[0, 1, 2, ...]` — it is derived straight from the box
 * math in `layoutBento`'s own per-count branches above, not a stylistic
 * guess:
 *
 * - 2/3-unit tiers: index 0 (the wide-left / full-height-left card) is
 *   unambiguously the single biggest cell.
 * - **4-unit tier**: indices 0 and 3 are the *diagonal* pair of "big" 0.6w
 *   cells (top-left, bottom-right) — tied with each other, both bigger than
 *   1/2. Index 3 is not "the last, least important" slot; it's a second
 *   hero-sized cell.
 * - **5-unit tier**: the bottom row (indices 3, 4 — `bottomW=(w-GAP)/2`) is
 *   *wider*, and thus larger-area, than the top row (indices 0, 1, 2 —
 *   `topW=(w-2*GAP)/3`) at the same row height — the top row is not the
 *   "hero" row despite coming first.
 * - 6-unit tier: every cell is equal-area — no cell is a "hero" cell, order
 *   is arbitrary (kept as identity).
 *
 * Verified numerically against `layoutBento`'s actual box formulas (not just
 * read off the source) before being hard-coded here — see bento-layout.test.ts.
 */
const CELL_AREA_RANK: Record<number, number[]> = {
  0: [],
  1: [0],
  2: [0, 1],
  3: [0, 1, 2],
  4: [0, 3, 1, 2],
  5: [3, 4, 0, 1, 2],
  6: [0, 1, 2, 3, 4, 5],
}

/**
 * Reorder units so units with a *strictly higher* hero-weight than the rest
 * land in `layoutBento`'s largest-area cell(s) for that unit count (per
 * `CELL_AREA_RANK`). Units tied at the same weight are never redistributed
 * against each other — two branches handle this:
 *
 * - If every unit shares the same weight, there's nothing to promote: return
 *   the array unchanged (identity cell mapping). This isn't just a
 *   performance short-circuit — `CELL_AREA_RANK` is *not* the identity
 *   permutation for the 4- and 5-unit tiers (see that table's own comment),
 *   so without this branch a same-weight set would still get scattered
 *   across cells for no reason (e.g. 4 equal-weight units would come out
 *   reordered even though none of them outrank another).
 * - Otherwise, only units *above* the minimum weight present ("promoted"
 *   units) claim `rank`'s largest-area cells — each weight tier, in
 *   descending order, taking the next-biggest still-unclaimed cell(s) in
 *   `rank`'s own order. The *lowest*-weight tier (everything left over)
 *   isn't being promoted past anything, so instead of handing it whatever
 *   `rank` entries remain in `rank`'s own (tie-agnostic) order, those
 *   leftover cell indices are sorted back into ascending order first — this
 *   keeps that tier's units in the same relative left-to-right/
 *   top-to-bottom order they started in, rather than being scattered by
 *   `rank`'s ordering. (Worked example: 1 chart among 3 equal-weight components
 *   must promote only the chart into the biggest cell, leaving the 3 components
 *   in their original relative order in the remaining cells — see this
 *   file's tests.)
 *
 * `layoutBento` itself is untouched: it only ever fills `cells[i]` from
 * `units[i]`, so permuting its *input* is the entire mechanism — the grid
 * math needs no unit-kind awareness at all.
 *
 * Stable: units of equal weight keep their original relative order among
 * themselves (an explicit index tiebreaker, not a reliance on
 * `Array.prototype.sort`'s post-ES2019 stability guarantee) — deterministic,
 * reproducible output for the same input, per the SVG single-source
 * requirement (a render must not depend on sort-implementation happenstance).
 *
 * Unit counts outside 0-6 (the `explodeIntoUnits` caller's >6-unit case)
 * fall through unchanged — `BentoTechContent` always abandons the bento grid
 * for >6 units (see that file's degrade gate), so their order is never
 * actually turned into cell geometry; returning them as-is rather than
 * guessing a ranking avoids inventing behavior for an input shape this
 * function was never designed to place.
 */
export function sortUnitsByHeroWeight(units: BentoUnit[]): BentoUnit[] {
  const rank = CELL_AREA_RANK[units.length]
  if (!rank) return units.slice()

  const weights = units.map(heroWeight)
  if (weights.every((weight) => weight === weights[0])) return units.slice()

  const byWeightDesc = units
    .map((unit, index) => ({ unit, index }))
    .sort((a, b) => {
      const byWeight = weights[b.index] - weights[a.index]
      return byWeight !== 0 ? byWeight : a.index - b.index
    })
    .map((entry) => entry.unit)

  // `byWeightDesc` is sorted descending, so the lowest-weight tier is a
  // contiguous run at its tail. Everything strictly above `minWeight` is
  // "promoted" and gets a `rank`-ordered (biggest-remaining-cell-first)
  // slot; the tail inherits whatever cells are left, sorted back into
  // ascending cell-index order (see the doc comment above for why).
  const minWeight = Math.min(...weights)
  const promotedCount = weights.filter((weight) => weight > minWeight).length
  const leftoverCells = rank.slice(promotedCount).sort((a, b) => a - b)

  const result = new Array<BentoUnit>(units.length)
  byWeightDesc.forEach((unit, weightRank) => {
    const cellIndex =
      weightRank < promotedCount
        ? rank[weightRank]
        : leftoverCells[weightRank - promotedCount]
    result[cellIndex] = unit
  })
  return result
}
