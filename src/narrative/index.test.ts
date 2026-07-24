import { describe, it, expect } from "vitest"
import { PptfastError } from "../errors"
import { BUILTIN_THEME_IDS } from "../ir"
import { layoutsForSlideType } from "../svg/layouts/registry"
import {
  STRATEGY_DEFINITIONS,
  PACING_BUDGETS,
  NARRATIVE_PRESETS,
  DEFAULT_NARRATIVE,
  resolveNarrative,
  normalizeNarrativeShape,
  STRATEGY_VALUES,
  PACING_VALUES,
  AUDIENCE_VALUES,
  type Strategy,
  type Pacing,
  type Audience,
  type NarrativeProfile,
} from "./index"

// ── strategy definitions (spec §5 strategy 五分类) ──────────────────────

describe("STRATEGY_DEFINITIONS", () => {
  const expectedStrategies: Strategy[] = ["pyramid", "storytelling", "instructional", "showcase", "briefing"]

  it("has exactly the 5 spec strategies, each self-keyed", () => {
    expect(Object.keys(STRATEGY_DEFINITIONS).sort()).toEqual([...expectedStrategies].sort())
    for (const strategy of expectedStrategies) {
      expect(STRATEGY_DEFINITIONS[strategy].id).toBe(strategy)
    }
  })

  it("every strategy carries a non-empty tendency set", () => {
    for (const strategy of expectedStrategies) {
      expect(STRATEGY_DEFINITIONS[strategy].tendencies.length).toBeGreaterThan(0)
    }
  })

  it("pins each strategy's beatPolicy to its spec §5 節奏缺省 mapping", () => {
    expect(STRATEGY_DEFINITIONS.pyramid.beatPolicy).toBe("anchor-open")
    expect(STRATEGY_DEFINITIONS.storytelling.beatPolicy).toBe("alternate")
    expect(STRATEGY_DEFINITIONS.instructional.beatPolicy).toBe("repetition-ok")
    expect(STRATEGY_DEFINITIONS.showcase.beatPolicy).toBe("anchor-sparse")
    expect(STRATEGY_DEFINITIONS.briefing.beatPolicy).toBe("uniform-dense")
  })

  it("pyramid tendencies match spec §5 row as-is (component types), plus the structure-components wave's decision 9 join and wave 2 task 4's own follow-on join", () => {
    expect(STRATEGY_DEFINITIONS.pyramid.tendencies).toEqual([
      "kpi_cards",
      "verdict_banner",
      "chart",
      "comparison",
      "matrix",
      "roadmap",
      "swot",
      "bmc",
      "waterfall",
      "gantt",
      "pest",
      "five_forces",
      "heatmap",
      "sankey",
    ])
  })

  it("storytelling normalizes the image family to kebab layout ids, not the underscore form", () => {
    expect(STRATEGY_DEFINITIONS.storytelling.tendencies).toContain("image-split")
    expect(STRATEGY_DEFINITIONS.storytelling.tendencies).toContain("image-top")
    expect(STRATEGY_DEFINITIONS.storytelling.tendencies).toContain("image-bottom")
    expect(STRATEGY_DEFINITIONS.storytelling.tendencies).toContain("image-annotate")
    expect(STRATEGY_DEFINITIONS.storytelling.tendencies).not.toContain("image_split")
    expect(STRATEGY_DEFINITIONS.storytelling.tendencies).toContain("quote")
    expect(STRATEGY_DEFINITIONS.storytelling.tendencies).toContain("timeline")
    expect(STRATEGY_DEFINITIONS.storytelling.tendencies).toContain("callout")
  })

  it("instructional tendencies match spec §5 row as-is, plus the structure-components wave's decision 9 gantt join", () => {
    expect(STRATEGY_DEFINITIONS.instructional.tendencies).toEqual([
      "steps",
      "numbered_cards",
      "flowchart",
      "architecture",
      "code",
      "gantt",
    ])
  })

  it("showcase carries the full image family plus image_grid (component type) and kpi_cards", () => {
    expect(STRATEGY_DEFINITIONS.showcase.tendencies).toContain("image-split")
    expect(STRATEGY_DEFINITIONS.showcase.tendencies).toContain("image-top")
    expect(STRATEGY_DEFINITIONS.showcase.tendencies).toContain("image-bottom")
    expect(STRATEGY_DEFINITIONS.showcase.tendencies).toContain("image-annotate")
    // image_grid stays a component type (underscore), not a layout id.
    expect(STRATEGY_DEFINITIONS.showcase.tendencies).toContain("image_grid")
    expect(STRATEGY_DEFINITIONS.showcase.tendencies).not.toContain("image-grid")
    // spec's "巨号 kpi" normalizes to the kpi_cards component type.
    expect(STRATEGY_DEFINITIONS.showcase.tendencies).toContain("kpi_cards")
  })

  it("briefing tendencies match spec §5 row as-is", () => {
    expect(STRATEGY_DEFINITIONS.briefing.tendencies).toEqual(["bullets", "row_cards", "timeline", "citation"])
  })

  // ── content layoutTendencies: pyramid/briefing differentiation (P1
  // variety wave, task 3 — the two used to be the exact same 3-element set) ──

  it("pyramid and briefing content layoutTendencies are no longer identical (C-diversity finding: they used to be the same 3-element set)", () => {
    const pyramidSet = [...STRATEGY_DEFINITIONS.pyramid.layoutTendencies].sort()
    const briefingSet = [...STRATEGY_DEFINITIONS.briefing.layoutTendencies].sort()
    expect(pyramidSet).not.toEqual(briefingSet)
  })

  it("pins the re-derived briefing content set: banner-heading + rail-numbered + two-column (bento-panel's dense evidence-grid swapped for rail-numbered's sequential enumeration)", () => {
    expect(STRATEGY_DEFINITIONS.briefing.layoutTendencies).toEqual(["banner-heading", "rail-numbered", "two-column"])
  })

  it("pyramid's own content set is unchanged by the briefing re-derivation", () => {
    expect(STRATEGY_DEFINITIONS.pyramid.layoutTendencies).toEqual(["bento-panel", "banner-heading", "two-column"])
  })

  // ── content layoutTendencies: content-pool expansion weight placement
  // (P1 variety wave, task 4 — storytelling/instructional/showcase each
  // gain a third member, closing the plan's "instructional/showcase have
  // only 2-3 preferred content ids" representation gap; storytelling joins
  // them for thematic parity since its own two pre-existing members are
  // already the pool's other "unhurried" archetypes) ──

  it("pins storytelling's re-derived content set: narrow-column + stacked-poster + quiet-frame (its two pre-existing atmospheric picks gain a third, equally restrained sibling)", () => {
    expect(STRATEGY_DEFINITIONS.storytelling.layoutTendencies).toEqual([
      "narrow-column",
      "stacked-poster",
      "quiet-frame",
    ])
  })

  it("pins instructional's re-derived content set: rail-numbered + two-column + asymmetric-triptych (a lead item + two secondary panels reads as main-step + sub-steps)", () => {
    expect(STRATEGY_DEFINITIONS.instructional.layoutTendencies).toEqual([
      "rail-numbered",
      "two-column",
      "asymmetric-triptych",
    ])
  })

  it("pins showcase's re-derived content set: stacked-poster + bento-panel + side-highlight (a permanent opaque highlight panel matches showcase's own glossy identity-page picks)", () => {
    expect(STRATEGY_DEFINITIONS.showcase.layoutTendencies).toEqual([
      "stacked-poster",
      "bento-panel",
      "side-highlight",
    ])
  })

  it("every strategy's content layoutTendencies set now has exactly 3 members (was an uneven 2-3 split before task 4's placement)", () => {
    for (const strategy of expectedStrategies) {
      expect(
        STRATEGY_DEFINITIONS[strategy].layoutTendencies.length,
        `${strategy}.layoutTendencies`,
      ).toBe(3)
    }
  })

  // ── identityTendencies: cover/chapter/ending strategy soft-weighting
  // (P1 variety wave, task 3) ──────────────────────────────────────────────

  describe("identityTendencies", () => {
    const strategies: Strategy[] = ["pyramid", "storytelling", "instructional", "showcase", "briefing"]
    const pageTypes = ["cover", "chapter", "ending"] as const

    it("every strategy declares a small (2-3 member) subset for each of cover/chapter/ending", () => {
      for (const strategy of strategies) {
        for (const pageType of pageTypes) {
          const set = STRATEGY_DEFINITIONS[strategy].identityTendencies[pageType]
          expect(set.length).toBeGreaterThanOrEqual(2)
          expect(set.length).toBeLessThanOrEqual(3)
        }
      }
    })

    it("every declared id is a real registered archetype applicable to its own page type", () => {
      for (const pageType of pageTypes) {
        const validIds = layoutsForSlideType(pageType).map((def) => def.id)
        for (const strategy of strategies) {
          for (const id of STRATEGY_DEFINITIONS[strategy].identityTendencies[pageType]) {
            expect(validIds, `${strategy}.identityTendencies.${pageType} has unregistered id "${id}"`).toContain(id)
          }
        }
      }
    })

    it("no two strategies declare an identical subset for the same page type (each strategy reads as its own flavor)", () => {
      for (const pageType of pageTypes) {
        const setsSeen = new Map<string, Strategy>()
        for (const strategy of strategies) {
          const key = [...STRATEGY_DEFINITIONS[strategy].identityTendencies[pageType]].sort().join(",")
          const collidesWith = setsSeen.get(key)
          expect(collidesWith, `${pageType}: "${strategy}" and "${collidesWith}" declared the identical set`).toBeUndefined()
          setsSeen.set(key, strategy)
        }
      }
    })

    it("the tone-adaptive-* neutral archetype never appears in any strategy's identity set, mirroring tone-adaptive-content's absence from every layoutTendencies list", () => {
      const neutralIds = { cover: "tone-adaptive-header", chapter: "tone-adaptive-chapter", ending: "tone-adaptive-ending" } as const
      for (const pageType of pageTypes) {
        for (const strategy of strategies) {
          expect(STRATEGY_DEFINITIONS[strategy].identityTendencies[pageType]).not.toContain(neutralIds[pageType])
        }
      }
    })
  })
})

// ── pacing budgets (spec §5 pacing table, pinned) ───────────────────────

describe("PACING_BUDGETS", () => {
  it("pins dense/balanced/spacious to the spec §5 table values", () => {
    expect(PACING_BUDGETS.dense).toEqual({
      bodyBaselinePx: 20,
      maxComponentsPerSlide: 5,
      bullets: { maxItems: 6, maxUnitsPerItem: 48 },
    })
    expect(PACING_BUDGETS.balanced).toEqual({
      bodyBaselinePx: 24,
      maxComponentsPerSlide: 4,
      bullets: { maxItems: 5, maxUnitsPerItem: 40 },
    })
    expect(PACING_BUDGETS.spacious).toEqual({
      bodyBaselinePx: 32,
      maxComponentsPerSlide: 3,
      bullets: { maxItems: 4, maxUnitsPerItem: 30 },
    })
  })

  it("has exactly the 3 pacing keys", () => {
    expect(Object.keys(PACING_BUDGETS).sort()).toEqual(["balanced", "dense", "spacious"])
  })
})

// ── named presets (spec §5 具名预设) ────────────────────────────────────

describe("NARRATIVE_PRESETS", () => {
  const expectedIds = [
    "general",
    "boardroom-report",
    "pitch",
    "training",
    "product-launch",
    "weekly-brief",
    "annual-review",
  ]

  it("has exactly the 7 spec presets, each self-keyed", () => {
    expect(Object.keys(NARRATIVE_PRESETS).sort()).toEqual([...expectedIds].sort())
    for (const id of expectedIds) {
      expect(NARRATIVE_PRESETS[id].id).toBe(id)
    }
  })

  it("pins each preset's axes to the spec §5 strategy×pacing×audience triple", () => {
    expect(NARRATIVE_PRESETS.general.axes).toEqual({ strategy: "briefing", pacing: "balanced", audience: "public" })
    expect(NARRATIVE_PRESETS["boardroom-report"].axes).toEqual({
      strategy: "pyramid",
      pacing: "spacious",
      audience: "executive",
    })
    expect(NARRATIVE_PRESETS.pitch.axes).toEqual({ strategy: "pyramid", pacing: "spacious", audience: "customer" })
    expect(NARRATIVE_PRESETS.training.axes).toEqual({
      strategy: "instructional",
      pacing: "balanced",
      audience: "technical",
    })
    expect(NARRATIVE_PRESETS["product-launch"].axes).toEqual({
      strategy: "showcase",
      pacing: "spacious",
      audience: "customer",
    })
    expect(NARRATIVE_PRESETS["weekly-brief"].axes).toEqual({
      strategy: "briefing",
      pacing: "dense",
      audience: "technical",
    })
    expect(NARRATIVE_PRESETS["annual-review"].axes).toEqual({
      strategy: "storytelling",
      pacing: "balanced",
      audience: "public",
    })
  })

  it("every preset axes triple is internally valid (strategy/pacing/audience enum members)", () => {
    for (const id of expectedIds) {
      const { axes } = NARRATIVE_PRESETS[id]
      expect(STRATEGY_VALUES).toContain(axes.strategy)
      expect(PACING_VALUES).toContain(axes.pacing)
      expect(AUDIENCE_VALUES).toContain(axes.audience)
    }
  })

  it("every preset carries at least one theme recommendation, all real BUILTIN_THEME_IDS members", () => {
    for (const id of expectedIds) {
      const { themeRecommendations } = NARRATIVE_PRESETS[id]
      expect(themeRecommendations.length).toBeGreaterThan(0)
      for (const themeId of themeRecommendations) {
        expect(BUILTIN_THEME_IDS as readonly string[]).toContain(themeId)
      }
    }
  })

  it("pins the spec §5 theme recommendation table", () => {
    expect(NARRATIVE_PRESETS["boardroom-report"].themeRecommendations).toEqual(["consulting", "enterprise", "insight"])
    expect(NARRATIVE_PRESETS.pitch.themeRecommendations).toEqual(["consulting", "tech", "campaign"])
    expect(NARRATIVE_PRESETS.training.themeRecommendations).toEqual(["classroom", "academic", "tech"])
    expect(NARRATIVE_PRESETS["product-launch"].themeRecommendations).toEqual(["campaign", "runway", "tech"])
    expect(NARRATIVE_PRESETS["weekly-brief"].themeRecommendations).toEqual(["enterprise", "consulting"])
    expect(NARRATIVE_PRESETS["annual-review"].themeRecommendations).toEqual(["journal", "heritage", "insight"])
    expect(NARRATIVE_PRESETS.general.themeRecommendations).toEqual(["consulting"])
  })
})

describe("DEFAULT_NARRATIVE", () => {
  it("equals the general preset's axes (briefing x balanced x public)", () => {
    expect(DEFAULT_NARRATIVE).toEqual({ strategy: "briefing", pacing: "balanced", audience: "public" })
    expect(DEFAULT_NARRATIVE).toEqual(NARRATIVE_PRESETS.general.axes)
  })
})

// ── resolveNarrative (spec §5 缺省链) ───────────────────────────────────

describe("resolveNarrative", () => {
  it("undefined resolves to DEFAULT_NARRATIVE", () => {
    expect(resolveNarrative(undefined)).toEqual(DEFAULT_NARRATIVE)
  })

  it("a preset id string resolves to that preset's axes", () => {
    expect(resolveNarrative("general")).toEqual(NARRATIVE_PRESETS.general.axes)
    expect(resolveNarrative("boardroom-report")).toEqual(NARRATIVE_PRESETS["boardroom-report"].axes)
    expect(resolveNarrative("annual-review")).toEqual(NARRATIVE_PRESETS["annual-review"].axes)
  })

  it("an unknown preset id throws, listing available preset ids", () => {
    expect(() => resolveNarrative("not-a-real-preset")).toThrow(PptfastError)
    expect(() => resolveNarrative("not-a-real-preset")).toThrow(/unknown narrative preset/)
    expect(() => resolveNarrative("not-a-real-preset")).toThrow(/available:.*general/)
  })

  it("a preset id shadowing an inherited Object.prototype member throws instead of silently resolving", () => {
    // Own-property guard regression probe: NARRATIVE_PRESETS is a plain
    // object literal, so a naive `NARRATIVE_PRESETS[input]` lookup resolves
    // these to truthy inherited members (the Object constructor,
    // Object.prototype) instead of undefined — silently returning
    // `preset.axes` as undefined rather than throwing. "__proto__" is doubly
    // special: assigning it in an object literal sets the prototype rather
    // than creating an own property, so
    // `Object.hasOwn(NARRATIVE_PRESETS, "__proto__")` correctly reports
    // false too.
    expect(() => resolveNarrative("constructor")).toThrow(/available/)
    expect(() => resolveNarrative("__proto__")).toThrow(/available/)
  })

  it("an empty partial-axes object defaults every axis independently", () => {
    expect(resolveNarrative({})).toEqual({ strategy: "briefing", pacing: "balanced", audience: "public" })
  })

  it("a partial axes object defaults only the omitted axes", () => {
    expect(resolveNarrative({ strategy: "pyramid" })).toEqual({
      strategy: "pyramid",
      pacing: "balanced",
      audience: "public",
    })
    expect(resolveNarrative({ pacing: "dense" })).toEqual({
      strategy: "briefing",
      pacing: "dense",
      audience: "public",
    })
    expect(resolveNarrative({ audience: "executive" })).toEqual({
      strategy: "briefing",
      pacing: "balanced",
      audience: "executive",
    })
  })

  it("a fully specified partial axes object round-trips unchanged", () => {
    const axes: NarrativeProfile = { strategy: "showcase", pacing: "spacious", audience: "customer" }
    expect(resolveNarrative({ ...axes })).toEqual(axes)
  })

  it("an unknown strategy value throws, listing valid strategy values", () => {
    expect(() => resolveNarrative({ strategy: "bogus" as Strategy })).toThrow(PptfastError)
    expect(() => resolveNarrative({ strategy: "bogus" as Strategy })).toThrow(/unknown strategy/)
    expect(() => resolveNarrative({ strategy: "bogus" as Strategy })).toThrow(/available:.*pyramid/)
  })

  it("an unknown pacing value throws, listing valid pacing values", () => {
    expect(() => resolveNarrative({ pacing: "bogus" as Pacing })).toThrow(PptfastError)
    expect(() => resolveNarrative({ pacing: "bogus" as Pacing })).toThrow(/unknown pacing/)
    expect(() => resolveNarrative({ pacing: "bogus" as Pacing })).toThrow(/available:.*dense/)
  })

  it("an unknown audience value throws, listing valid audience values", () => {
    expect(() => resolveNarrative({ audience: "bogus" as Audience })).toThrow(PptfastError)
    expect(() => resolveNarrative({ audience: "bogus" as Audience })).toThrow(/unknown audience/)
    expect(() => resolveNarrative({ audience: "bogus" as Audience })).toThrow(/available:.*executive/)
  })

  it("an unknown key on the partial axes object throws (strict — a typo is never silently dropped)", () => {
    const bad = { stratgey: "pyramid" } as unknown as Partial<NarrativeProfile>
    expect(() => resolveNarrative(bad)).toThrow(PptfastError)
    expect(() => resolveNarrative(bad)).toThrow(/unknown narrative axis "stratgey"/)
    expect(() => resolveNarrative(bad)).toThrow(/available:.*strategy.*pacing.*audience/)
  })

  it("an explicit null axis value throws instead of silently defaulting (null ≠ omission)", () => {
    const bad = { strategy: null } as unknown as Partial<NarrativeProfile>
    expect(() => resolveNarrative(bad)).toThrow(PptfastError)
    expect(() => resolveNarrative(bad)).toThrow(/unknown strategy "null" — available:.*pyramid/)
    expect(() => resolveNarrative({ pacing: null } as unknown as Partial<NarrativeProfile>)).toThrow(
      /unknown pacing "null"/,
    )
    expect(() => resolveNarrative({ audience: null } as unknown as Partial<NarrativeProfile>)).toThrow(
      /unknown audience "null"/,
    )
  })
})

// ── normalizeNarrativeShape (T0b fix 2, bench-evidence `{id}` shape rescue) ──
//
// A weak model that just wrote `theme: {id: "consulting"}` a few lines above
// pattern-matches the same "object wrapping an id" shape onto `narrative`.
// Real bench-failing inputs (.issues/notes/2026-07-24-bench-rerun.md item 2,
// 3 real failures — 60% of flash's total): `{"id":"training"}`,
// `{"id":"boardroom-report"}`.

describe("normalizeNarrativeShape", () => {
  it("leaves a non-object input untouched (no narrative field at all)", () => {
    const input = { version: "4", slides: [] }
    const result = normalizeNarrativeShape(input)
    expect(result.value).toBe(input) // same reference — no rewrite
    expect(result.normalized).toEqual([])
  })

  it("leaves a plain preset-string narrative untouched", () => {
    const input = { narrative: "training" }
    const result = normalizeNarrativeShape(input)
    expect(result.value).toBe(input)
    expect(result.normalized).toEqual([])
  })

  it("leaves a proper partial-axes object untouched", () => {
    const input = { narrative: { strategy: "pyramid" } }
    const result = normalizeNarrativeShape(input)
    expect(result.value).toBe(input)
    expect(result.normalized).toEqual([])
  })

  it("rescues the exact bench-failing shape {id: \"training\"} to the bare preset string", () => {
    const input = { version: "4", narrative: { id: "training" }, slides: [] }
    const result = normalizeNarrativeShape(input)
    expect(result.value).toEqual({ version: "4", narrative: "training", slides: [] })
    expect(result.value).not.toBe(input) // never mutates the original
    expect(input.narrative).toEqual({ id: "training" }) // original untouched
    expect(result.normalized).toHaveLength(1)
    expect(result.normalized[0]).toContain("narrative")
    expect(result.normalized[0]).toContain("training")
  })

  it("rescues {id: \"boardroom-report\"} too — not a single-preset special case", () => {
    const result = normalizeNarrativeShape({ narrative: { id: "boardroom-report" } })
    expect(result.value).toEqual({ narrative: "boardroom-report" })
  })

  it("does not itself validate the preset id — resolveNarrative's own error is still the honest outcome downstream", () => {
    // normalizeNarrativeShape only rewrites shape, never validates the id
    // against NARRATIVE_PRESETS — that stays resolveNarrative's job.
    const result = normalizeNarrativeShape({ narrative: { id: "not-a-real-preset" } })
    expect(result.value).toEqual({ narrative: "not-a-real-preset" })
    const rewritten = (result.value as { narrative: string }).narrative
    expect(() => resolveNarrative(rewritten)).toThrow(/unknown narrative preset/)
  })

  it("does NOT rescue a mixed shape {id, strategy} — genuinely ambiguous, left untouched", () => {
    const input = { narrative: { id: "training", strategy: "pyramid" } }
    const result = normalizeNarrativeShape(input)
    expect(result.value).toBe(input)
    expect(result.normalized).toEqual([])
  })

  it("does NOT rescue {id, pacing} or {id, audience} either — any axis key alongside id blocks the rescue", () => {
    expect(normalizeNarrativeShape({ narrative: { id: "training", pacing: "dense" } }).normalized).toEqual([])
    expect(normalizeNarrativeShape({ narrative: { id: "training", audience: "public" } }).normalized).toEqual([])
  })

  it("does not rescue when id is not a string", () => {
    const input = { narrative: { id: 42 } }
    const result = normalizeNarrativeShape(input)
    expect(result.value).toBe(input)
    expect(result.normalized).toEqual([])
  })

  it("leaves a non-object narrative value (e.g. an array) untouched", () => {
    const input = { narrative: ["not", "an", "object"] }
    const result = normalizeNarrativeShape(input)
    expect(result.value).toBe(input)
    expect(result.normalized).toEqual([])
  })
})
