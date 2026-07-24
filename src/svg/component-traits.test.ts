import { describe, expect, it } from "vitest"
import { COMPONENT_TYPES } from "@/ir"
import {
  EVIDENCE_TYPES,
  FULL_BODY_TYPES,
  PASSTHROUGH_SHELL_TYPES,
  SCALABLE_TYPES,
  SELF_VISUAL_TYPES,
  STRETCHABLE_TYPES,
} from "./component-traits"

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

describe("SELF_VISUAL_TYPES equivalence (was bento-layout.ts:210-216)", () => {
  it("matches the pre-refactor members exactly", () => {
    // bento-layout.ts:210-216 (pre-refactor):
    // new Set(["callout", "code", "comparison", "quote", "verdict_banner"])
    const preRefactor = ["callout", "code", "comparison", "quote", "verdict_banner"]
    expect(new Set(SELF_VISUAL_TYPES)).toEqual(new Set(preRefactor))
    expect(SELF_VISUAL_TYPES.size).toBe(preRefactor.length)
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

describe("PASSTHROUGH_SHELL_TYPES equivalence (was content-bento-panel.tsx:134-143)", () => {
  it("matches the pre-refactor members exactly", () => {
    // content-bento-panel.tsx:134-143 (pre-refactor):
    // new Set(["steps", "flowchart", "architecture", "timeline", "paragraph", "quote"])
    const preRefactor = ["steps", "flowchart", "architecture", "timeline", "paragraph", "quote"]
    expect(new Set(PASSTHROUGH_SHELL_TYPES)).toEqual(new Set(preRefactor))
    expect(PASSTHROUGH_SHELL_TYPES.size).toBe(preRefactor.length)
  })
})

describe("EVIDENCE_TYPES equivalence (was assertion-evidence.tsx:8-13) — order is load-bearing", () => {
  it("matches the pre-refactor priority order exactly, not just membership", () => {
    // assertion-evidence.tsx:8-13 (pre-refactor):
    // ["chart", "image", "comparison", "kpi_cards"] as const satisfies readonly Component["type"][]
    expect(EVIDENCE_TYPES).toEqual(["chart", "image", "comparison", "kpi_cards"])
  })

  it("is a tuple (ordered array), not a Set — priority dispatch depends on iteration order", () => {
    expect(Array.isArray(EVIDENCE_TYPES)).toBe(true)
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
