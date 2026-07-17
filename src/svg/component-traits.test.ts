import { describe, expect, it } from "vitest"
import {
  EVIDENCE_TYPES,
  PASSTHROUGH_SHELL_TYPES,
  SCALABLE_TYPES,
  SELF_VISUAL_TYPES,
  STRETCHABLE_TYPES,
} from "./component-traits"

/**
 * Equivalence lock (W2 task 5): `component-traits.ts` unifies 5 component-
 * classification sets that used to live scattered across `layout.ts`,
 * `bento-layout.ts`, two archetype files (a duplicate pair), and
 * `AssertionEvidence.tsx` (inventory §"容量双系统"). Unifying them doesn't
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

describe("EVIDENCE_TYPES equivalence (was AssertionEvidence.tsx:8-13) — order is load-bearing", () => {
  it("matches the pre-refactor priority order exactly, not just membership", () => {
    // AssertionEvidence.tsx:8-13 (pre-refactor):
    // ["chart", "image", "comparison", "kpi_cards"] as const satisfies readonly Component["type"][]
    expect(EVIDENCE_TYPES).toEqual(["chart", "image", "comparison", "kpi_cards"])
  })

  it("is a tuple (ordered array), not a Set — priority dispatch depends on iteration order", () => {
    expect(Array.isArray(EVIDENCE_TYPES)).toBe(true)
  })
})
