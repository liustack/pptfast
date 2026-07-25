import { describe, expect, it } from "vitest"
import { COMPONENT_TYPES } from "@/ir"
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
import {
  EVIDENCE_TYPES,
  FULL_BODY_TYPES,
  PASSTHROUGH_SHELL_TYPES,
  SCALABLE_TYPES,
  SELF_VISUAL_TYPES,
  STRETCHABLE_TYPES,
} from "./component-traits"

/**
 * Every domain file's own `[type, traits]` pair, gathered independently of
 * `component-traits.ts`'s own internal `ALL_TRAITS` aggregation (deliberately
 * not imported from there) — this file's "EVIDENCE_TYPES consistency" check
 * below needs a second, separate computation to be a meaningful drift check
 * rather than component-traits.ts trivially agreeing with itself.
 */
const DOMAIN_FILE_TRAITS: readonly (readonly [string, { readonly evidence: boolean }])[] = [
  ["bullets", bulletsTraits],
  ["paragraph", paragraphTraits],
  ["quote", quoteTraits],
  ["callout", calloutTraits],
  ["code", codeTraits],
  ["kpi_cards", kpiCardsTraits],
  ["chart", chartTraits],
  ["flowchart", flowchartTraits],
  ["architecture", architectureTraits],
  ["timeline", timelineTraits],
  ["comparison", comparisonTraits],
  ["icon_cards", iconCardsTraits],
  ["row_cards", rowCardsTraits],
  ["steps", stepsTraits],
  ["rings", ringsTraits],
  ["numbered_cards", numberedCardsTraits],
  ["roadmap", roadmapTraits],
  ["matrix", matrixTraits],
  ["insight_panel", insightPanelTraits],
  ["verdict_banner", verdictBannerTraits],
  ["citation", citationTraits],
  ["image", imageTraits],
  ["image_grid", imageGridTraits],
  ["image_compare", imageCompareTraits],
  ["swot", swotTraits],
  ["bmc", bmcTraits],
  ["waterfall", waterfallTraits],
  ["gantt", ganttTraits],
  ["pest", pestTraits],
  ["five_forces", fiveForcesTraits],
  ["heatmap", heatmapTraits],
  ["sankey", sankeyTraits],
  ["data_table", dataTableTraits],
]

/**
 * Equivalence lock (W2 task 5): `component-traits.ts` unifies 5 component-
 * classification sets that used to live scattered across `layout.ts`,
 * `bento-layout.ts`, two archetype files (a duplicate pair), and
 * `assertion-evidence.tsx` (inventory §"容量双系统"). Unifying them doesn't
 * change what any of them classify — every export below is pinned against
 * the exact members transcribed from its pre-refactor definition (file:line
 * cited per block, read straight from source before the merge). This is a
 * byte-identical lock, not a re-derivation: any accidental drift while
 * collapsing the 5 sites into 1 fails loudly here instead of silently
 * changing render behavior.
 */

describe("STRETCHABLE_TYPES equivalence (was layout.ts:137)", () => {
  it("matches the pre-refactor members exactly", () => {
    // layout.ts:137 (pre-refactor):
    // `new Set<Component["type"]>(["kpi_cards", "icon_cards", "row_cards"])`
    const preRefactor = ["kpi_cards", "icon_cards", "row_cards"]
    expect(new Set(STRETCHABLE_TYPES)).toEqual(new Set(preRefactor))
    expect(STRETCHABLE_TYPES.size).toBe(preRefactor.length)
  })
})

describe("SELF_VISUAL_TYPES equivalence (was bento-layout.ts:210-216, plus R1's data_table addition)", () => {
  it("matches the pre-refactor members plus data_table (R1 evidence wave, Task T3 — first new selfVisual:true declaration since the W2 task 5 refactor)", () => {
    // bento-layout.ts:210-216 (pre-refactor):
    // new Set(["callout", "code", "comparison", "quote", "verdict_banner"])
    const preRefactor = ["callout", "code", "comparison", "quote", "verdict_banner"]
    // R1 evidence wave, Task T3 (plan's explicit traits contract): data_table
    // declares selfVisual: true too — it draws its own rule-line table shell
    // (header rule + row separators + emphasis-row tint), so painting bento's
    // own outline shell behind it would be a redundant "卡中卡", the same
    // reasoning every pre-refactor member above already documents. A real,
    // intentional addition to this set's membership, not drift — the
    // pre-refactor array above stays as the historical baseline this lock
    // originally pinned.
    const current = [...preRefactor, "data_table"]
    expect(new Set(SELF_VISUAL_TYPES)).toEqual(new Set(current))
    expect(SELF_VISUAL_TYPES.size).toBe(current.length)
  })
})

describe("SCALABLE_TYPES duplication verdict (content-bento-panel.tsx:105 vs content-stacked-poster.tsx:121)", () => {
  // Exact pre-refactor transcriptions, read independently from each file
  // before either was touched.
  const bentoPanelPreRefactor = ["chart", "image"] // content-bento-panel.tsx:105
  const stackedPosterPreRefactor = ["chart", "image"] // content-stacked-poster.tsx:121

  it("the two pre-refactor definitions are member-equal (proving the duplication is safe to collapse)", () => {
    expect(new Set(bentoPanelPreRefactor)).toEqual(new Set(stackedPosterPreRefactor))
  })

  it("the unified export matches both pre-refactor definitions", () => {
    expect(new Set(SCALABLE_TYPES)).toEqual(new Set(bentoPanelPreRefactor))
    expect(new Set(SCALABLE_TYPES)).toEqual(new Set(stackedPosterPreRefactor))
    expect(SCALABLE_TYPES.size).toBe(2)
  })
})

describe("PASSTHROUGH_SHELL_TYPES equivalence (was content-bento-panel.tsx:134-143, plus R1's data_table addition)", () => {
  it("matches the pre-refactor members plus data_table (R1 evidence wave, Task T3 — first new passthroughShell:true declaration since the W2 task 5 refactor)", () => {
    // content-bento-panel.tsx:134-143 (pre-refactor):
    // new Set(["steps", "flowchart", "architecture", "timeline", "paragraph", "quote"])
    const preRefactor = ["steps", "flowchart", "architecture", "timeline", "paragraph", "quote"]
    // R1 evidence wave, Task T3 (plan's explicit traits contract): data_table
    // declares passthroughShell: true too — same reasoning as
    // flowchart/architecture/timeline above (draws its own internal chrome,
    // no enclosing card), so the bento shell paint should be skipped for it
    // as well. A real, intentional addition, not drift — the pre-refactor
    // array above stays as the historical baseline this lock originally
    // pinned.
    const current = [...preRefactor, "data_table"]
    expect(new Set(PASSTHROUGH_SHELL_TYPES)).toEqual(new Set(current))
    expect(PASSTHROUGH_SHELL_TYPES.size).toBe(current.length)
  })
})

describe("EVIDENCE_TYPES equivalence (was assertion-evidence.tsx:8-13) — order is load-bearing", () => {
  it("matches the current priority order (R1 evidence wave, Task T3 inserted data_table after chart, before image)", () => {
    // assertion-evidence.tsx:8-13 (pre-refactor):
    // ["chart", "image", "comparison", "kpi_cards"] as const satisfies readonly Component["type"][]
    // R1 evidence wave, Task T3 (plan's explicit ordering call): "data_table"
    // inserted right after "chart" — see EVIDENCE_TYPES' own doc comment
    // (component-traits.ts) for the rationale. A deliberate, intentional
    // change to this array's content, not a drift — the pre-refactor value
    // above is kept in the comment as the historical baseline this lock
    // originally pinned.
    expect(EVIDENCE_TYPES).toEqual(["chart", "data_table", "image", "comparison", "kpi_cards"])
  })

  it("is a tuple (ordered array), not a Set — priority dispatch depends on iteration order", () => {
    expect(Array.isArray(EVIDENCE_TYPES)).toBe(true)
  })
})

// ── EVIDENCE_TYPES consistency (src domain reorg wave 2, spec §4.1's named
// exception) ─────────────────────────────────────────────────────────────
//
// EVIDENCE_TYPES itself is not derived from the per-component domain files (order is
// cross-component comparative knowledge no single domain file can declare
// about itself — component-traits.ts's own EVIDENCE_TYPES doc comment has
// the full rationale) — but its *membership* must still agree with which
// domain files declare `traits.evidence: true`. Two independent sources of
// truth (this hand-written order vs. every domain file's own boolean); a
// component's `evidence` flag flipped without updating this array, or vice
// versa, would silently diverge without this check.
describe("EVIDENCE_TYPES consistency: membership matches every domain file's own evidence:true declaration", () => {
  it("the set of types declaring traits.evidence:true equals EVIDENCE_TYPES' membership (order aside)", () => {
    const declaredEvidence = new Set(
      DOMAIN_FILE_TRAITS.filter(([, traits]) => traits.evidence).map(([type]) => type),
    )
    expect(declaredEvidence).toEqual(new Set(EVIDENCE_TYPES))
  })
})

describe("FULL_BODY_TYPES (structure-components wave 1 task 1 decision 1, extended by wave 1 task 2 and wave 2 tasks 1-3 — new, not a refactor equivalence lock)", () => {
  it("contains exactly the eight full-body components across both waves (named-slot family + numeric-axis family + value-grid family + flow-graph family)", () => {
    expect(new Set(FULL_BODY_TYPES)).toEqual(
      new Set(["swot", "bmc", "waterfall", "gantt", "pest", "five_forces", "heatmap", "sankey"]),
    )
    expect(FULL_BODY_TYPES.size).toBe(8)
  })

  it("is disjoint from STRETCHABLE_TYPES — full-body components fill box.h directly, never through growStretchables' capped path", () => {
    for (const type of FULL_BODY_TYPES) {
      expect(STRETCHABLE_TYPES.has(type)).toBe(false)
    }
  })
})

// ── traits reverse-generation feasibility (src domain reorg wave 2, W2a
// task 4) ────────────────────────────────────────────────────────────────
//
// Not a migration guard (nothing here is deletable post-migration — this is
// a permanent data-integrity check, same spirit as the "covers every row
// exactly once" completeness guards in field-aliases.test.ts). Wave-2 W2c
// plans to reverse-generate one `traits: ComponentTraits` declaration per
// `src/ir/components/<name>.ts` domain file by reading these 6 collections
// (`ComponentTraits`'s own doc comment, `src/ir/components/types.ts`) — that
// is only sound if every member of every collection below is a real,
// current `COMPONENT_TYPES` entry. To be precise about what this test does
// and doesn't add: TypeScript's structural typing already catches a
// component renamed or removed in `ir/index.ts` without a matching
// `component-traits.ts` update *today* — each collection below is typed
// `ReadonlySet<ComponentType>` / `readonly ComponentType[]`
// (`ComponentType = Component["type"]`, `./component-traits.ts`'s own top
// doc comment), so a stale literal fails `tsc` loudly, typically cascading
// into many more errors across every file still referencing the old type
// string (review round for this task measured 144 cascading errors from a
// single rename) — not a silent gap `pnpm check` would miss. This test's
// real value is narrower: a fast, explicit, human-readable check that
// doesn't need a full compiler run, and — more importantly — a runtime
// backstop for W2c's planned traits reverse-generation, once these
// collections' ir-side successors (one `ComponentTraits` declaration per
// `src/ir/components/*.ts` domain file) are assembled by a codegen/
// aggregation step that reads them as plain data rather than as
// compile-time-checked literals the way today's 6 `Set`s are. The describe
// blocks above already pin every collection's exact membership against a
// hardcoded pre-refactor twin, but neither that nor the type system cross-
// checks against the *live* `COMPONENT_TYPES` export (`@/ir`, derived from
// `ComponentSchema.options`) — this adds that one specific cross-check
// explicitly, rather than leaving it an implicit side effect of the type
// annotations above.
describe("every classified member is a live COMPONENT_TYPES entry (traits reverse-generation feasibility, W2a task 4)", () => {
  it("STRETCHABLE_TYPES ∪ SELF_VISUAL_TYPES ∪ SCALABLE_TYPES ∪ PASSTHROUGH_SHELL_TYPES ∪ FULL_BODY_TYPES ∪ EVIDENCE_TYPES ⊆ COMPONENT_TYPES", () => {
    const allClassified = new Set<string>([
      ...STRETCHABLE_TYPES,
      ...SELF_VISUAL_TYPES,
      ...SCALABLE_TYPES,
      ...PASSTHROUGH_SHELL_TYPES,
      ...FULL_BODY_TYPES,
      ...EVIDENCE_TYPES,
    ])
    for (const type of allClassified) {
      expect(COMPONENT_TYPES).toContain(type)
    }
  })
})
