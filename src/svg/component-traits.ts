import type { Component } from "@/ir"

/**
 * Component trait registry (W2 task 5, spec §3/§6/§8): a single home for the
 * 5 component-classification sets the render-time layout/degrade machinery
 * consulted from 5 different files before this task (inventory
 * §"容量双系统" named this scatter directly: `STRETCHABLE_TYPES`/
 * `SELF_VISUAL_TYPES`/`SCALABLE_TYPES` ×2 duplicate definitions/
 * `PASSTHROUGH_SHELL_TYPES`/`EVIDENCE_TYPES`). Unifying them here doesn't
 * change what any of them classify — every member below is byte-identical to
 * its pre-refactor source (locked by `component-traits.test.ts`); only their
 * storage location moves, so a future reclassification has one place to
 * change instead of five.
 *
 * This registry is the *dynamic/render-time* half of the inventory's
 * "容量双系统" (2026-07-18 decision #5): it still runs on every render to
 * decide stretch/self-visual/scalable/passthrough-shell/evidence-priority
 * behavior — nothing here is new metadata. The *static/authoring-time* half —
 * `layouts/registry.ts`'s slot `capacity` numbers (filled alongside this
 * file, same task) and `audit/capacity.ts`'s `CAPACITY` table (W3) — is a
 * separate, declarative concern; this file has no capacity numbers in it.
 *
 * Not merged into one tagged enum: each set classifies a different
 * *behavior axis*, not the same axis at different thresholds — a component
 * can be simultaneously stretchable (layout.ts's density-fill) and
 * evidence-priority-ranked (AssertionEvidence's dispatch), so collapsing
 * them would force every consumer to reason about axes it doesn't care
 * about.
 */

/** The IR's component discriminant union (`ComponentSchema`'s 24 `type`
 * literals), aliased so the 5 sets below don't each re-spell
 * `Component["type"]`. Not a redefinition — always structurally identical to
 * the IR's own type, per this task's requirement that the string-literal
 * union come from the IR rather than being hand-copied here. */
export type ComponentType = Component["type"]

/**
 * "卡壳类" component: `layoutContentFit`'s density-stretch pass
 * (`layout.ts`'s `growStretchables`) may grow these to fill a column's
 * leftover height instead of leaving it dead ("密度铺满"), capped at
 * `STRETCH_CAP_RATIO`×. Moved from `layout.ts:137`, members unchanged.
 */
export const STRETCHABLE_TYPES: ReadonlySet<ComponentType> = new Set([
  "kpi_cards",
  "icon_cards",
  "row_cards",
])

/**
 * Component types that already paint their own card/frame — callout's
 * left-bar-and-fill, code's dark panel, comparison's header row + rule
 * lines, quote's decorative mark/attribution treatment, verdict_banner's own
 * bordered/tinted conclusion strip. Consulted by `bento-layout.ts`'s
 * `sortUnitsByHeroWeight` (hero-weight ranking) and
 * `content-bento-panel.tsx`'s `renderCell`/`cellOverBudget` (these render
 * bare — stacking bento's own outline shell underneath one of them would be
 * a redundant "卡中卡", card-in-a-card). Moved from
 * `bento-layout.ts:210-216`, members unchanged.
 */
export const SELF_VISUAL_TYPES: ReadonlySet<ComponentType> = new Set([
  "callout",
  "code",
  "comparison",
  "quote",
  "verdict_banner",
])

/**
 * Component types whose content is a rendered graphic (no text-fit/
 * truncation semantics of its own) rather than reflowable text — safe to
 * scale uniformly to fit a slot instead of forcing a text-degrade path.
 * Two independent consumers scale it differently: `content-bento-panel.tsx`
 * only ever shrinks (`scale = budgetH/measured` when over budget), while
 * `content-stacked-poster.tsx` also scales *up* to fill a hero/strip slot
 * (capped at that file's own `HERO_SCALE_MAX`) since a poster hero is meant
 * to read as a dominant image. Both files independently defined this exact
 * `{"chart", "image"}` set before this task —
 * `component-traits.test.ts` pins the pre-merge equivalence proof. Moved
 * from `content-bento-panel.tsx:105` / `content-stacked-poster.tsx:121`,
 * members unchanged.
 */
export const SCALABLE_TYPES: ReadonlySet<ComponentType> = new Set(["chart", "image"])

/**
 * Component types that already draw their own internal chrome per node —
 * steps' numbered-badge cards, flowchart's bordered node boxes,
 * architecture's filled layer bands, timeline's axis/dots — plus paragraph
 * (bare text reads better unframed in a bento grid, 2026-07-09 redesign) and
 * quote (its own decorative mark/attribution treatment).
 * `content-bento-panel.tsx`'s `renderCell` skips painting the bento outline
 * shell (no fill/stroke) for these — "双壳治理" (double-shell governance): a
 * panel+stroke shell painted behind an already-carded diagram/bare paragraph
 * is a redundant second shell. Unlike `SELF_VISUAL_TYPES`, these still
 * render through the ordinary-component grid-cell path (same box, same
 * padding, same audit annotations) — only the shell paint is skipped. Moved
 * from `content-bento-panel.tsx:134-143`, members unchanged.
 */
export const PASSTHROUGH_SHELL_TYPES: ReadonlySet<ComponentType> = new Set([
  "steps",
  "flowchart",
  "architecture",
  "timeline",
  "paragraph",
  "quote",
])

/**
 * Component types considered "evidence" for the `assertion_evidence`
 * arrangement (`AssertionEvidence.tsx`), in priority order — order is
 * load-bearing: the *first* type in this list found among a slide's
 * components is the one enlarged/centered as the slide's single strongest
 * evidence. An unordered set can't express "chart beats image beats
 * comparison beats kpi_cards", so unlike the 4 sets above this stays an
 * ordered tuple, not a `Set`. Moved from `AssertionEvidence.tsx:8-13`,
 * members and order unchanged.
 */
export const EVIDENCE_TYPES = [
  "chart",
  "image",
  "comparison",
  "kpi_cards",
] as const satisfies readonly ComponentType[]
