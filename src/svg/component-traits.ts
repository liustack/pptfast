import type { Component } from "@/ir"
import type { ComponentTraits } from "@/ir/components/types"
import { traits as bulletsTraits } from "@/ir/components/bullets"
import { traits as paragraphTraits } from "@/ir/components/paragraph"
import { traits as quoteTraits } from "@/ir/components/quote"
import { traits as calloutTraits } from "@/ir/components/callout"
import { traits as codeTraits } from "@/ir/components/code"
import { traits as kpiCardsTraits } from "@/ir/components/kpi-cards"
import { traits as chartTraits } from "@/ir/components/chart"
import { traits as flowchartTraits } from "@/ir/components/flowchart"
import { traits as architectureTraits } from "@/ir/components/architecture"
import { traits as timelineTraits } from "@/ir/components/timeline"
import { traits as comparisonTraits } from "@/ir/components/comparison"
import { traits as iconCardsTraits } from "@/ir/components/icon-cards"
import { traits as rowCardsTraits } from "@/ir/components/row-cards"
import { traits as stepsTraits } from "@/ir/components/steps"
import { traits as ringsTraits } from "@/ir/components/rings"
import { traits as numberedCardsTraits } from "@/ir/components/numbered-cards"
import { traits as roadmapTraits } from "@/ir/components/roadmap"
import { traits as matrixTraits } from "@/ir/components/matrix"
import { traits as insightPanelTraits } from "@/ir/components/insight-panel"
import { traits as verdictBannerTraits } from "@/ir/components/verdict-banner"
import { traits as citationTraits } from "@/ir/components/citation"
import { traits as imageTraits } from "@/ir/components/image"
import { traits as imageGridTraits } from "@/ir/components/image-grid"
import { traits as imageCompareTraits } from "@/ir/components/image-compare"
import { traits as swotTraits } from "@/ir/components/swot"
import { traits as bmcTraits } from "@/ir/components/bmc"
import { traits as waterfallTraits } from "@/ir/components/waterfall"
import { traits as ganttTraits } from "@/ir/components/gantt"
import { traits as pestTraits } from "@/ir/components/pest"
import { traits as fiveForcesTraits } from "@/ir/components/five-forces"
import { traits as heatmapTraits } from "@/ir/components/heatmap"
import { traits as sankeyTraits } from "@/ir/components/sankey"
import { traits as dataTableTraits } from "@/ir/components/data-table"
import { traits as deviceMockupTraits } from "@/ir/components/device-mockup"
import { traits as cycleTraits } from "@/ir/components/cycle"
import { traits as peopleCardsTraits } from "@/ir/components/people-cards"
import { traits as tagRowTraits } from "@/ir/components/tag-row"

/**
 * Component trait registry (W2 task 5, spec §3/§6/§8 — re-derived as a pure
 * aggregator in src domain reorg wave 2, spec §4.3). Single home for the
 * render-time layout/degrade machinery's component classifications
 * `ReadonlySet`s (`STRETCHABLE_TYPES`/`SELF_VISUAL_TYPES`/`SCALABLE_TYPES`/
 * `PASSTHROUGH_SHELL_TYPES`/`FULL_BODY_TYPES`/`COLUMN_SPANNING_TYPES`) plus the ordered
 * `EVIDENCE_TYPES` tuple.
 *
 * **Aggregator, not author (src domain reorg wave 2).** Every component's
 * boolean trait flags used to live here as a hand-written literal Set
 * membership (W2 task 5's own unification of 5 previously-scattered
 * definitions). They now live beside each component's own IR schema instead —
 * a `traits: ComponentTraits` export at the bottom of the matching
 * `src/ir/components/<name>.ts` domain file (`ComponentTraits`'s own doc
 * comment there is the authority on what each trait means) — so
 * "take one component away whole" carries its render-time classification with
 * it instead of leaving a trailing edit in a sixth file. This file's own job
 * is now purely computational: import every domain file's `traits`, pair each
 * with its own `type` literal in `ALL_TRAITS` below, and derive the Sets by
 * filtering on the matching boolean — never a re-export relay, never a
 * hand-maintained literal member list. Exported names and `Set` semantics are
 * unchanged from W2 task 5 (every consumer of `STRETCHABLE_TYPES` etc. reads
 * this file exactly as before); only *how* each Set's membership is produced
 * moved, same as T1d's `layouts/registry.ts` precedent for layout
 * `layoutDef`s.
 *
 * `EVIDENCE_TYPES` is the one export this aggregator does not derive
 * mechanically (spec §4.1's named exception, see its own doc comment below)
 * — it carries cross-component *priority order*, comparative knowledge no
 * single domain file can declare about itself, so it stays a hand-written
 * ordered tuple here. `component-traits.test.ts` pins the consistency
 * invariant between this hand-written order and the domain files' own
 * `evidence: true` declarations (two independent sources of truth, drift
 * between them fails a test — spec §4.1's own closing sentence).
 *
 * This registry is still the *dynamic/render-time* half of the inventory's
 * "容量双系统" (2026-07-18 decision #5): it still runs on every render to
 * decide stretch/self-visual/scalable/passthrough-shell/evidence-priority
 * behavior — nothing here is new metadata. The *static/authoring-time* half —
 * `layouts/registry.ts`'s slot `capacity` numbers and `audit/capacity.ts`'s
 * `CAPACITY` table — is a separate, declarative concern; this file has no
 * capacity numbers in it.
 *
 * Not merged into one tagged enum: each set classifies a different
 * *behavior axis*, not the same axis at different thresholds — a component
 * can be simultaneously stretchable (layout.ts's density-fill) and
 * evidence-priority-ranked (AssertionEvidence's dispatch), so collapsing
 * them would force every consumer to reason about axes it doesn't care
 * about. `ComponentTraits` (the per-component declaration shape, `src/ir/
 * components/types.ts`) mirrors this same "independent axes, not one enum"
 * posture at the declaration site. `columnSpanning` is opt-in. Its absence
 * means false, avoiding mechanical churn in ordinary column components.
 */

/** The IR's component discriminant union (`ComponentSchema`'s `type`
 * literals), aliased so the sets below don't each re-spell
 * `Component["type"]`. Not a redefinition — always structurally identical to
 * the IR's own type, per this task's requirement that the string-literal
 * union come from the IR rather than being hand-copied here. */
export type ComponentType = Component["type"]

/**
 * Every component's own traits declaration, keyed by type in
 * `COMPONENT_TYPES` union order (order is a readability convenience for
 * cross-checking against `src/ir/index.ts`'s own import block, not
 * load-bearing — `typesWith` below collects into a `Set`, so key order never
 * affects any exported value). The one place a new component's traits
 * trait flags become Set memberships — adding a 33rd component means adding
 * one entry here (plus, as ever, the domain file itself), not touching 5 Set
 * literals by hand. Typed as a total `Record<ComponentType, ...>` (the same
 * exhaustiveness pattern `RENDER_DEFS` in `components/index.tsx` uses) so a
 * missing entry is a COMPILE error, not a silent all-false degradation —
 * the wave-2 final review's mutation probe showed the previous array shape
 * let a dropped row pass typecheck, lint, and the full suite unnoticed.
 */
const ALL_TRAITS: Record<ComponentType, ComponentTraits> = {
  bullets: bulletsTraits,
  paragraph: paragraphTraits,
  quote: quoteTraits,
  callout: calloutTraits,
  code: codeTraits,
  kpi_cards: kpiCardsTraits,
  chart: chartTraits,
  flowchart: flowchartTraits,
  architecture: architectureTraits,
  timeline: timelineTraits,
  comparison: comparisonTraits,
  icon_cards: iconCardsTraits,
  row_cards: rowCardsTraits,
  steps: stepsTraits,
  rings: ringsTraits,
  numbered_cards: numberedCardsTraits,
  roadmap: roadmapTraits,
  matrix: matrixTraits,
  insight_panel: insightPanelTraits,
  verdict_banner: verdictBannerTraits,
  citation: citationTraits,
  image: imageTraits,
  image_grid: imageGridTraits,
  image_compare: imageCompareTraits,
  swot: swotTraits,
  bmc: bmcTraits,
  waterfall: waterfallTraits,
  gantt: ganttTraits,
  pest: pestTraits,
  five_forces: fiveForcesTraits,
  heatmap: heatmapTraits,
  sankey: sankeyTraits,
  data_table: dataTableTraits,
  device_mockup: deviceMockupTraits,
  cycle: cycleTraits,
  people_cards: peopleCardsTraits,
  tag_row: tagRowTraits,
}

/** Every component type whose own domain-file `traits` declares `trait: true`, collected as a `ReadonlySet`. */
function typesWith(trait: keyof ComponentTraits): ReadonlySet<ComponentType> {
  return new Set(
    (Object.entries(ALL_TRAITS) as [ComponentType, ComponentTraits][])
      .filter(([, traits]) => traits[trait])
      .map(([type]) => type),
  )
}

/**
 * "卡壳类" component: `layoutContentFit`'s density-stretch pass
 * (`layout.ts`'s `growStretchables`) may grow these to fill a column's
 * leftover height instead of leaving it dead ("密度铺满"), capped at
 * `STRETCH_CAP_RATIO`×. Declared per-component via `traits.stretchable`
 * (`src/ir/components/*.ts`), aggregated here.
 */
export const STRETCHABLE_TYPES: ReadonlySet<ComponentType> = typesWith("stretchable")

/**
 * Page-level components that own the full row inside a multi-column
 * arrangement. Ordinary components are laid out in column runs around these
 * entries, so authored order is preserved without demoting a page verdict to
 * a narrow sidebar cell.
 */
export const COLUMN_SPANNING_TYPES: ReadonlySet<ComponentType> = typesWith("columnSpanning")

/**
 * Component types that already paint their own card/frame — callout's
 * left-bar-and-fill, code's dark panel, comparison's header row + rule
 * lines, quote's decorative mark/attribution treatment, verdict_banner's own
 * editorial rule and typography. Consulted by `bento-layout.ts`'s
 * `sortUnitsByHeroWeight` (hero-weight ranking) and
 * `content-bento-panel.tsx`'s `renderCell`/`cellOverBudget` (these render
 * bare — stacking bento's own outline shell underneath one of them would be
 * a redundant "卡中卡", card-in-a-card). Declared per-component via
 * `traits.selfVisual`, aggregated here.
 */
export const SELF_VISUAL_TYPES: ReadonlySet<ComponentType> = typesWith("selfVisual")

/**
 * Component types whose content is a rendered graphic (no text-fit/
 * truncation semantics of its own) rather than reflowable text — safe to
 * scale uniformly to fit a slot instead of forcing a text-degrade path.
 * Two independent consumers scale it differently: `content-bento-panel.tsx`
 * only ever shrinks (`scale = budgetH/measured` when over budget), while
 * `content-stacked-poster.tsx` also scales *up* to fill a hero/strip slot
 * (capped at that file's own `HERO_SCALE_MAX`) since a poster hero is meant
 * to read as a dominant image. Declared per-component via `traits.scalable`,
 * aggregated here — `component-traits.test.ts` pins `{"chart", "image",
 * "flowchart"}` (flowchart added so a lone diagram can use leftover body
 * height: `svg-content.tsx` skips `capTopAir` for scalable types).
 */
export const SCALABLE_TYPES: ReadonlySet<ComponentType> = typesWith("scalable")

/**
 * Component types that already draw their own internal frame per node —
 * steps' numbered-badge cards, flowchart's bordered node boxes,
 * architecture's filled layer bands, timeline's axis/dots — plus paragraph
 * (bare text reads better unframed in a bento grid, 2026-07-09 redesign) and
 * quote (its own decorative mark/attribution treatment).
 * `content-bento-panel.tsx`'s `renderCell` skips painting the bento outline
 * shell (no fill/stroke) for these — "双壳治理" (double-shell governance): a
 * panel+stroke shell painted behind an already-carded diagram/bare paragraph
 * is a redundant second shell. Unlike `SELF_VISUAL_TYPES`, these still
 * render through the ordinary-component grid-cell path (same box, same
 * padding, same audit annotations) — only the shell paint is skipped.
 * Declared per-component via `traits.passthroughShell`, aggregated here.
 */
export const PASSTHROUGH_SHELL_TYPES: ReadonlySet<ComponentType> = typesWith("passthroughShell")

/**
 * Component types considered "evidence" for the `assertion_evidence`
 * arrangement (`assertion-evidence.tsx`), in priority order — order is
 * load-bearing: the *first* type in this list found among a slide's
 * components is the one enlarged/centered as the slide's single strongest
 * evidence. An unordered set can't express "chart beats image beats
 * comparison beats kpi_cards", so unlike the 4 sets above this stays an
 * ordered tuple, not a `Set` — spec §4.1's named exception to the
 * aggregation-from-domain-files rule above: order is cross-component
 * comparative knowledge no single `src/ir/components/<name>.ts` file could
 * declare about itself, so it stays hand-written here rather than derived
 * from `ALL_TRAITS`. Each listed component's own domain file still declares
 * `traits.evidence: true` (the membership half); this array supplies only
 * the order the membership half can't express.
 * `component-traits.test.ts`'s "EVIDENCE_TYPES consistency" check asserts
 * this array's *membership* (not order) equals the set of domain files that
 * declare `evidence: true` — two independent sources of truth (this
 * hand-written order vs. every domain file's own boolean), drift between
 * them fails that test rather than silently diverging.
 *
 * `data_table` inserted right after `chart` (R1 evidence wave, Task T3,
 * plan's explicit ordering call): a chart is still the single strongest
 * evidence type when both appear, but a structured data table outranks a
 * bare photo/comparison-table/kpi callout as the next-strongest evidence —
 * it carries the same "reviewable structured numbers" quality a chart does,
 * just without the visual plot.
 *
 * `device_mockup` inserted right after `data_table`, ranked above `image`
 * (device_mockup wave, `.issues/2026-08-05-component-waves/
 * plan-device-mockup.md`): both types render the same underlying asset (a
 * screenshot), but a screenshot framed as a real device — the whole point
 * of this component, closing the exact probe evidence gap named in its own
 * domain file's header comment — reads as stronger "this is real, running
 * software" proof than the identical pixels in a bare bordered rect. When a
 * slide carries both (an unusual but legal case — an author illustrating
 * "before/after" framing, say), the framed one is the more convincing
 * single piece of evidence to enlarge.
 */
export const EVIDENCE_TYPES = [
  "chart",
  "data_table",
  "device_mockup",
  "image",
  "comparison",
  "kpi_cards",
] as const satisfies readonly ComponentType[]

/**
 * First evidence component in `EVIDENCE_TYPES` priority order, or
 * `undefined` when the slide has none of those types. Shared by the
 * `assertion_evidence` arrangement and the pin-only `one-evidence` layout
 * so the two cannot drift.
 */
export function pickEvidence(components: readonly Component[]): Component | undefined {
  for (const t of EVIDENCE_TYPES) {
    const found = components.find((b) => b.type === t)
    if (found) return found
  }
  return undefined
}

/**
 * "满幅" (full-body) component: a type meant to own an entire content rect by
 * itself rather than stack alongside sibling components — `swot`'s 2×2
 * quadrant grid, `bmc`'s nine-block canvas, `pest`'s 2×2 macro-environment
 * grid, `five_forces`'s hub-and-spoke panel set, `waterfall`'s bridge chart,
 * `gantt`'s shared-axis time bars, `heatmap`'s value-driven color grid,
 * `sankey`'s layered flow diagram. `svg-content.tsx` special-cases a slide
 * whose sole component is one of these (checked *before* the `big_number`/
 * `assertion_evidence` arrangement branches, so a full-body component wins
 * regardless of what `arrangement` happens to be set to): the whole content
 * rect is handed straight to the component's own `render`, bypassing
 * `layoutContentFit`'s column stacking and the lone-block 38% golden
 * placement. The component then fills `box.h` itself using the box.h-aware
 * uniform-stretch idiom `matrix.tsx`'s `render` already
 * established (no `STRETCH_CAP_RATIO` ceiling — that cap exists for
 * `growStretchables`' card-density heuristic, which a full-body component
 * never goes through).
 *
 * A full-body type sharing a slide with any other component would have
 * nowhere left to put that sibling (the whole rect is already spoken for) —
 * `api.ts`'s `checkFullBodyExclusivity` is the hard validation gate for
 * that, rejecting the deck with a named `ValidationIssue` rather than
 * silently dropping the extra component(s). Declared per-component via
 * `traits.fullBody`, aggregated here.
 */
export const FULL_BODY_TYPES: ReadonlySet<ComponentType> = typesWith("fullBody")
