// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { createElement } from "react"
import { render } from "@testing-library/react"
import type { PptxIR, Slide } from "@/ir"
import { STRATEGY_DEFINITIONS } from "@/narrative"
import { FullSlideSvg } from "./FullSlideSvg"
import { getLayout } from "./layouts/registry"
import { cachedDeckSeed, weightedPickBySeed } from "./variety"
import { THEME_DEFINITIONS } from "../themes/definitions"
import {
  resolveArchetypeId,
  resolveEffectiveLayoutBodyCapacity,
  resolveEffectiveLayoutId,
  resolveIrStrategy,
} from "./effective-layout"

// ── helpers ──

function makeIR(slides: Slide[], themeId: string = "consulting"): PptxIR {
  return {
    version: "4",
    filename: "test.pptx",
    theme: { id: themeId },
    meta: {},
    assets: { images: {} },
    slides,
  } as PptxIR
}

const CONTENT_ARCHETYPE_IDS = [
  "narrow-column",
  "two-column",
  "rail-numbered",
  "banner-heading",
  "stacked-poster",
  "bento-panel",
  "tone-adaptive-content",
]

// ── resolveArchetypeId (pure seed+ordinal selection, extracted from FullSlideSvg) ──

describe("resolveArchetypeId", () => {
  const consultingLayouts = THEME_DEFINITIONS.consulting.layouts

  it("an explicit pin within the allowed set is honored for every member (not just seed-consistent with one)", () => {
    for (const id of consultingLayouts.cover) {
      expect(resolveArchetypeId("cover", consultingLayouts, 999, "0", id, "briefing", null)).toBe(id)
    }
  })

  it("an explicit pin outside the allowed set is still honored when it's a registered archetype applicable to the slide type (spec §3: explicit bypasses curation)", () => {
    // "banner-heading" is luxe's one curated content exclusion (W4 design
    // decision 7's contrast adjudication — see definitions.ts) — not a
    // member of luxe's own curated set, proving an explicit pin still
    // bypasses curation even for the one archetype a theme deliberately
    // excludes (every other archetype id is now in every theme's full-set
    // curated pool, so this exclusion is the only "outside the family"
    // example left post-W4).
    expect(
      resolveArchetypeId("content", THEME_DEFINITIONS.luxe.layouts, 1, "0", "banner-heading", "briefing", null),
    ).toBe("banner-heading")
  })

  it("falls back to seed-pick when the pin is unregistered, wrong kind, or has the wrong slideTypes", () => {
    for (const bad of ["not-a-real-layout", "image-split", "banner-title"]) {
      const picked = resolveArchetypeId("content", THEME_DEFINITIONS.tech.layouts, 5, "0", bad, "briefing", null)
      expect(CONTENT_ARCHETYPE_IDS).toContain(picked)
    }
  })

  it("returns null for an empty allowed set with no pin (defensive fallback — unreachable for the 13 built-in themes)", () => {
    const empty = { cover: [], chapter: [], content: [], ending: [] }
    expect(resolveArchetypeId("content", empty, 1, "0", undefined, "briefing", null)).toBeNull()
  })

  it("is deterministic: the same (slideType, layouts, seed, pageKey, requested, mode, previous) always resolves the same id", () => {
    const a = resolveArchetypeId("content", THEME_DEFINITIONS.academic.layouts, 42, "1", undefined, "briefing", null)
    const b = resolveArchetypeId("content", THEME_DEFINITIONS.academic.layouts, 42, "1", undefined, "briefing", null)
    expect(a).toBe(b)
  })

  it("pageKey (not an incrementing ordinal) drives the salt: different pageKey values surface more than one distinct pick", () => {
    const picks = new Set(
      Array.from({ length: 20 }, (_, i) =>
        resolveArchetypeId("content", THEME_DEFINITIONS.academic.layouts, 42, String(i), undefined, "briefing", null),
      ),
    )
    expect(picks.size).toBeGreaterThan(1)
  })

  it("narrative weighting: a strategy's layoutTendencies members are picked more often than non-members (integration through resolveArchetypeId, W4 design decisions 1 + 6)", () => {
    const tendencyIds = STRATEGY_DEFINITIONS.pyramid.layoutTendencies // bento-panel/banner-heading/two-column, x3 weight
    const N = 600
    let tendencyHits = 0
    // academic (not tech): a theme with zero W4 design-decision-8 curation
    // exclusions, so its content pool is the unmodified full 7-id set and
    // the expected ratio below doesn't quietly drift if a theme's
    // exclusion list grows again later.
    for (let i = 0; i < N; i++) {
      const picked = resolveArchetypeId("content", THEME_DEFINITIONS.academic.layouts, i, String(i), undefined, "pyramid", null)!
      if (tendencyIds.includes(picked)) tendencyHits++
    }
    // 3 ids at weight 3 (=9) vs 4 ids at weight 1 (=4) over the full 7-id
    // content pool: expected tendency share = 9/13 ≈ 0.69. Wide bounds
    // (not a tight equality) — this is a distribution smoke test proving
    // the weighting is wired in, `weightedPickBySeed`'s own test owns the
    // precise ratio assertion.
    expect(tendencyHits / N).toBeGreaterThan(0.55)
    expect(tendencyHits / N).toBeLessThan(0.85)
  })

  // ── beat weighting (P1 variety wave, task 1 — "beat wired into selection") ──

  it("an omitted beat is a mathematical no-op: passing beat=undefined explicitly matches omitting the 8th argument entirely, across strategies and seeds", () => {
    for (const strategy of ["pyramid", "storytelling", "instructional", "showcase", "briefing"] as const) {
      for (let seed = 0; seed < 30; seed++) {
        const withoutArg = resolveArchetypeId(
          "content",
          THEME_DEFINITIONS.academic.layouts,
          seed,
          String(seed),
          undefined,
          strategy,
          null,
        )
        const withExplicitUndefined = resolveArchetypeId(
          "content",
          THEME_DEFINITIONS.academic.layouts,
          seed,
          String(seed),
          undefined,
          strategy,
          null,
          undefined,
        )
        expect(withExplicitUndefined).toBe(withoutArg)
      }
    }
  })

  it("beat byte-inertness (hard requirement): an omitted beat's pick equals an independently-recomputed pre-beat formula (weightedPickBySeed against the bare strategy-only weightOf, TENDENCY_WEIGHT=3/BASE_WEIGHT=1 — this file's own doc-comment constants, not imported, to make this a genuine parity check rather than a self-consistency tautology of the current implementation)", () => {
    for (const strategy of ["pyramid", "storytelling", "instructional", "showcase", "briefing"] as const) {
      const tendencyIds = STRATEGY_DEFINITIONS[strategy].layoutTendencies
      for (let seed = 0; seed < 50; seed++) {
        const pageKey = String(seed)
        const actual = resolveArchetypeId(
          "content",
          THEME_DEFINITIONS.academic.layouts,
          seed,
          pageKey,
          undefined,
          strategy,
          null,
        )
        const expected = weightedPickBySeed(seed, `content-archetype:${pageKey}`, CONTENT_ARCHETYPE_IDS, (id) =>
          tendencyIds.includes(id) ? 3 : 1,
        )
        expect(actual).toBe(expected)
      }
    }
  })

  it("beat weighting: a beat's tendency-set members are picked more often than non-members, on top of (not instead of) the strategy layer", () => {
    // instructional's own layoutTendencies (rail-numbered/two-column) share
    // zero members with beat "anchor"'s tendency set (banner-heading/
    // stacked-poster, effective-layout.ts's BEAT_TENDENCIES) — an isolated
    // pairing so this test measures the beat layer's own pull, not strategy
    // spillover onto the same ids.
    const anchorIds = ["banner-heading", "stacked-poster"]
    const N = 600
    let anchorHits = 0
    for (let i = 0; i < N; i++) {
      const picked = resolveArchetypeId(
        "content",
        THEME_DEFINITIONS.academic.layouts,
        i,
        String(i),
        undefined,
        "instructional",
        null,
        "anchor",
      )!
      if (anchorIds.includes(picked)) anchorHits++
    }
    // Weights: rail-numbered=3 (strategy only), two-column=3 (strategy
    // only), banner-heading=3 (beat only), stacked-poster=3 (beat only),
    // bento-panel/narrow-column/tone-adaptive-content=1 each — total 15,
    // anchor-tendency share = 6/15 = 0.4. Without the beat layer (see the
    // "narrative weighting" test above) the same two ids would only carry
    // strategy's ×1 floor — this bound proves the beat layer independently
    // lifts them, not just strategy's own pull. Wide bounds, same smoke-test
    // posture as the narrative-weighting test above.
    expect(anchorHits / N).toBeGreaterThan(0.25)
    expect(anchorHits / N).toBeLessThan(0.55)
  })

  it("beat weighting multiplies onto strategy weighting rather than overriding it: a strategy-tendency id that is ALSO a beat-tendency id gets pulled harder than either layer alone", () => {
    // pyramid's layoutTendencies includes "banner-heading"; beat "anchor"'s
    // tendency set also includes "banner-heading" — the one pool member both
    // layers agree on, weight 3×3=9 vs every other id's weight (1, 3, or 3).
    const N = 600
    let hits = 0
    for (let i = 0; i < N; i++) {
      const picked = resolveArchetypeId(
        "content",
        THEME_DEFINITIONS.academic.layouts,
        i,
        String(i),
        undefined,
        "pyramid",
        null,
        "anchor",
      )!
      if (picked === "banner-heading") hits++
    }
    // Weights: banner-heading=9, bento-panel=3 (strategy only), two-column=3
    // (strategy only), stacked-poster=3 (beat only), narrow-column/
    // rail-numbered/tone-adaptive-content=1 each — total 21, banner-heading
    // share = 9/21 ≈ 0.43. A single id normally caps out at 3/13 ≈ 0.23 under
    // strategy weighting alone (this file's "narrative weighting" test's own
    // per-id ceiling) — this bound is deliberately set above that ceiling to
    // prove the ×9 compound weight, not just one layer's pull.
    expect(hits / N).toBeGreaterThan(0.3)
    expect(hits / N).toBeLessThan(0.6)
  })

  it("adjacent anti-repetition: when the raw pick equals previousEffectiveLayoutId and the pool has >1 member, redraws deterministically to a different id", () => {
    // academic's content pool is the full 7-id set (never empty), so the
    // raw pick (previous=null) is always a real id — feed that same id back
    // in as previousEffectiveLayoutId and confirm W4 design decision 4's
    // redraw fires and lands on a *different* member of the same pool.
    const raw = resolveArchetypeId("content", THEME_DEFINITIONS.academic.layouts, 1, "0", undefined, "briefing", null)
    const withCollision = resolveArchetypeId(
      "content",
      THEME_DEFINITIONS.academic.layouts,
      1,
      "0",
      undefined,
      "briefing",
      raw,
    )
    expect(withCollision).not.toBe(raw)
    expect(CONTENT_ARCHETYPE_IDS).toContain(withCollision)
  })

  it("adjacent anti-repetition never fires for an explicit pin, even when it equals previousEffectiveLayoutId", () => {
    expect(
      resolveArchetypeId("content", THEME_DEFINITIONS.academic.layouts, 1, "0", "two-column", "briefing", "two-column"),
    ).toBe("two-column")
  })

  it("adjacent anti-repetition does not redraw when the pool has exactly 1 member (no alternative to redraw to)", () => {
    const single = { cover: [], chapter: [], content: ["two-column"], ending: [] }
    expect(resolveArchetypeId("content", single, 1, "0", undefined, "briefing", "two-column")).toBe("two-column")
  })
})

// ── resolveEffectiveLayoutId (full per-slide resolution) ──

describe("resolveEffectiveLayoutId", () => {
  it("cover/chapter with an asset background bypasses archetypes entirely (returns null — ImageCoverPage has no registry entry)", () => {
    for (const type of ["cover", "chapter"] as const) {
      const slide: Slide = { type, heading: "x", background: { kind: "asset", asset_id: "bg" }, components: [] }
      const ir = makeIR([slide])
      expect(resolveEffectiveLayoutId(ir, slide, 0)).toBeNull()
    }
  })

  it("content/ending with an asset background does NOT bypass — stays on the normal archetype path (P1 frosted scrim, not a takeover)", () => {
    for (const type of ["content", "ending"] as const) {
      const slide: Slide = { type, heading: "x", background: { kind: "asset", asset_id: "bg" }, components: [] }
      const ir = makeIR([slide])
      expect(resolveEffectiveLayoutId(ir, slide, 0)).not.toBeNull()
    }
  })

  it("a pinned takeover layout with an image component present resolves to that takeover id", () => {
    const slide: Slide = {
      type: "content",
      heading: "x",
      layout: "image-annotate",
      components: [{ type: "image", asset_id: "a", fit: "cover" }],
    }
    const ir = makeIR([slide])
    expect(resolveEffectiveLayoutId(ir, slide, 0)).toBe("image-annotate")
  })

  it("a pinned takeover layout with NO image component falls through to archetype auto-pick (mirrors FullSlideSvg's splitTakeover guard)", () => {
    const slide: Slide = {
      type: "content",
      heading: "x",
      layout: "image-top",
      components: [{ type: "paragraph", text: "no image here" }],
    }
    const ir = makeIR([slide], "tech")
    expect(CONTENT_ARCHETYPE_IDS).toContain(resolveEffectiveLayoutId(ir, slide, 0))
  })

  it("an explicit archetype pin is honored even outside the theme's curated family", () => {
    const slide: Slide = {
      type: "content",
      heading: "x",
      layout: "banner-heading",
      components: [{ type: "paragraph", text: "x" }],
    }
    // luxe's own content set excludes banner-heading (W4 design decision 7's
    // contrast adjudication, definitions.ts) — the one "outside the family"
    // archetype left once every other theme×archetype content pair opened
    // to the full set.
    const ir = makeIR([slide], "luxe")
    expect(resolveEffectiveLayoutId(ir, slide, 0)).toBe("banner-heading")
  })

  it("auto-pick lands within the theme's curated content allowed set", () => {
    const slide: Slide = { type: "content", heading: "x", components: [{ type: "paragraph", text: "x" }] }
    const ir = makeIR([slide], "academic")
    expect(THEME_DEFINITIONS.academic.layouts.content).toContain(resolveEffectiveLayoutId(ir, slide, 0))
  })

  it("an unrecognized theme id falls back to consulting's allowed set (resolveThemeId's existing fallback, same posture as render)", () => {
    const slide: Slide = { type: "cover", heading: "x", components: [] }
    const irUnknown = makeIR([slide], "not-a-real-theme")
    const irConsulting = makeIR([slide], "consulting")
    expect(resolveEffectiveLayoutId(irUnknown, irUnknown.slides[0], 0)).toBe(
      resolveEffectiveLayoutId(irConsulting, irConsulting.slides[0], 0),
    )
  })

  // ── salt stability (W4 design decision 2: ordinal rotation retired in
  // favor of a stable pageKey = slide.id ?? String(index)) ──

  it("a page with an explicit id resolves the same regardless of its position in the deck (insert/reorder doesn't disturb it)", () => {
    // Revision stability (spec §6 seed ladder) needs BOTH halves: a stable
    // page id *and* an explicit `ir.seed` — the content-hash seed fallback
    // (no explicit seed) hashes every slide's heading, so inserting a page
    // changes the seed itself regardless of any one page's own id. Same
    // explicit seed on both decks isolates the one variable this test is
    // actually about: pageKey stability under reorder.
    const stable: Slide = {
      type: "content",
      id: "stable-page",
      heading: "x",
      components: [{ type: "paragraph", text: "x" }],
    }
    const irAtFront: PptxIR = { ...makeIR([stable], "academic"), seed: 777 }
    const irAfterInsert: PptxIR = {
      ...makeIR(
        [
          { type: "cover", heading: "c", components: [] },
          { type: "chapter", heading: "ch", components: [] },
          stable,
        ],
        "academic",
      ),
      seed: 777,
    }
    expect(resolveEffectiveLayoutId(irAtFront, stable, 0)).toBe(resolveEffectiveLayoutId(irAfterInsert, stable, 2))
  })

  it("a page with no id salts off its absolute index — matches resolveArchetypeId called directly with pageKey=String(index)", () => {
    const slide: Slide = { type: "content", heading: "no-id-probe", components: [{ type: "paragraph", text: "x" }] }
    const ir = makeIR([slide], "academic")
    const expected = resolveArchetypeId(
      "content",
      THEME_DEFINITIONS.academic.layouts,
      cachedDeckSeed(ir),
      "0", // String(index) for the first (and only) slide
      undefined,
      "briefing", // resolveNarrative(undefined) -> general -> briefing
      null, // first slide, no previous
    )
    expect(resolveEffectiveLayoutId(ir, slide, 0)).toBe(expected)
  })

  // ── adjacent anti-repetition (W4 design decision 4) ──

  it("adjacent content pages never render the same auto-picked archetype back to back when the pool has more than one member", () => {
    // A run of same-type auto-pick content pages, no explicit seed (content
    // hash) — every consecutive pair must differ (or the theme's own pool
    // has exactly 1 member, which none of the 13 built-ins do post-W4).
    const slides: Slide[] = Array.from({ length: 6 }, (_, i) => ({
      type: "content",
      heading: `内容页 ${i}`,
      components: [{ type: "paragraph", text: "x" }],
    }))
    const ir = makeIR(slides, "academic")
    const ids = slides.map((slide, i) => resolveEffectiveLayoutId(ir, slide, i))
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i], `slide ${i} repeated slide ${i - 1}'s pick "${ids[i - 1]}"`).not.toBe(ids[i - 1])
    }
  })

  it("an explicit layout pin on one page is never rewritten by adjacent anti-repetition, even when it matches the previous page's auto-pick", () => {
    const slides: Slide[] = [
      { type: "content", heading: "自动选型", layout: undefined, components: [{ type: "paragraph", text: "x" }] },
      { type: "content", heading: "显式钉值", layout: "two-column", components: [{ type: "paragraph", text: "x" }] },
    ]
    const ir = makeIR(slides, "consulting")
    // Whatever slide 0 auto-picks, slide 1's explicit "two-column" pin must
    // survive untouched — even in the (structurally possible) case where
    // slide 0 happened to land on "two-column" too.
    expect(resolveEffectiveLayoutId(ir, slides[1], 1)).toBe("two-column")
  })

  it("the first slide has no previous page, so anti-repetition never applies to it", () => {
    const slide: Slide = { type: "content", heading: "x", components: [{ type: "paragraph", text: "x" }] }
    const ir = makeIR([slide], "academic")
    expect(THEME_DEFINITIONS.academic.layouts.content).toContain(resolveEffectiveLayoutId(ir, slide, 0))
  })

  // ── beat integration (P1 variety wave, task 1): end-to-end through
  // resolveEffectiveLayoutId, not just the resolveArchetypeId unit above ──

  it("a slide's own beat reaches resolveArchetypeId end-to-end: forcing it to 'anchor' visibly shifts which id resolves, for at least one seed in a spread", () => {
    // Same 30-seed spread the byte-inertness test below reuses — proves the
    // wiring is live (beat isn't silently ignored by resolveEffectiveLayoutId
    // the way pacing's own PACING_BUDGETS are for selection), not just that
    // resolveArchetypeId's own weightOf accepts the parameter.
    let sawADifference = false
    for (let seed = 0; seed < 30; seed++) {
      const plain: Slide = { type: "content", heading: "x", components: [{ type: "paragraph", text: "x" }] }
      const anchored: Slide = { ...plain, beat: "anchor" }
      const irPlain: PptxIR = { ...makeIR([plain], "academic"), seed }
      const irAnchored: PptxIR = { ...makeIR([anchored], "academic"), seed }
      if (resolveEffectiveLayoutId(irPlain, plain, 0) !== resolveEffectiveLayoutId(irAnchored, anchored, 0)) {
        sawADifference = true
        break
      }
    }
    expect(sawADifference).toBe(true)
  })

  describe("beat revision-stability (P1 variety wave, task 1 — per-page independence)", () => {
    it("changing one page's beat never changes an earlier page's pick (selection walks forward-only)", () => {
      const base: Slide[] = [
        { type: "content", id: "p0", heading: "p0", components: [{ type: "paragraph", text: "x" }] },
        { type: "content", id: "p1", heading: "p1", components: [{ type: "paragraph", text: "x" }] },
      ]
      const beats = [undefined, "anchor", "dense", "breathing"] as const
      const p0Picks = new Set<string | null>()
      for (const beat of beats) {
        const slides = base.map((s) => (s.id === "p1" ? { ...s, beat } : s))
        const ir: PptxIR = { ...makeIR(slides, "academic"), seed: 100 }
        p0Picks.add(resolveEffectiveLayoutId(ir, ir.slides[0]!, 0))
      }
      expect(p0Picks.size).toBe(1)
    })

    it("changing one page's beat only ever reaches a later page through that page's OWN resolved id (the existing adjacent-anti-repetition channel) — never any other cascade", () => {
      // 3-page deck, seeds swept: group runs by what page 1 itself resolved
      // to under each beat value, and assert page 2's resolution is
      // identical within every group — proving page 2's only input that
      // could possibly vary with page 1's beat is `previousEffectiveLayoutId`
      // (page 1's own final id), never beat leaking into page 2's own
      // weighting or salt.
      const beats = [undefined, "anchor", "dense", "breathing"] as const
      for (let seed = 0; seed < 20; seed++) {
        const groups = new Map<string, Set<string | null>>()
        for (const beat of beats) {
          const slides: Slide[] = [
            { type: "content", id: "p0", heading: "p0", components: [{ type: "paragraph", text: "x" }] },
            { type: "content", id: "p1", heading: "p1", beat, components: [{ type: "paragraph", text: "x" }] },
            { type: "content", id: "p2", heading: "p2", components: [{ type: "paragraph", text: "x" }] },
          ]
          const ir: PptxIR = { ...makeIR(slides, "academic"), seed }
          const p1Pick = resolveEffectiveLayoutId(ir, ir.slides[1]!, 1)
          const p2Pick = resolveEffectiveLayoutId(ir, ir.slides[2]!, 2)
          const key = String(p1Pick)
          if (!groups.has(key)) groups.set(key, new Set())
          groups.get(key)!.add(p2Pick)
        }
        for (const [p1Pick, p2Picks] of groups) {
          expect(p2Picks.size, `seed ${seed}: page 1 resolved to "${p1Pick}" under multiple beats but page 2 diverged`).toBe(
            1,
          )
        }
      }
    })
  })
})

// ── resolveEffectiveLayoutBodyCapacity (the density gate's geometric term) ──

describe("resolveEffectiveLayoutBodyCapacity", () => {
  it("a generic content archetype (explicit pin) reports capacity 4", () => {
    const slide: Slide = { type: "content", heading: "x", layout: "two-column", components: [] }
    const ir = makeIR([slide])
    expect(resolveEffectiveLayoutBodyCapacity(ir, slide, 0)).toEqual({ layoutId: "two-column", capacity: 4 })
  })

  it("bento-panel (explicit pin) reports its own capacity 6, not the flat single-stack default", () => {
    const slide: Slide = { type: "content", heading: "x", layout: "bento-panel", components: [] }
    const ir = makeIR([slide], "tech")
    expect(resolveEffectiveLayoutBodyCapacity(ir, slide, 0)).toEqual({ layoutId: "bento-panel", capacity: 6 })
  })

  it("every content archetype's reported capacity matches its own LAYOUT_REGISTRY body-slot entry (consistency with registry.test.ts's pinned numbers)", () => {
    for (const id of CONTENT_ARCHETYPE_IDS) {
      const slide: Slide = { type: "content", heading: "x", layout: id, components: [] }
      const ir = makeIR([slide], "tech") // explicit pin bypasses curation, so any theme works for every id
      const expected = getLayout(id)?.slots.find((s) => s.name === "body")?.capacity
      expect(resolveEffectiveLayoutBodyCapacity(ir, slide, 0).capacity).toBe(expected)
    }
  })

  it("a takeover layout reports undefined capacity (no geometric term) while still naming its own id", () => {
    const slide: Slide = {
      type: "content",
      heading: "x",
      layout: "image-split",
      components: [{ type: "image", asset_id: "a", fit: "cover" }],
    }
    const ir = makeIR([slide])
    expect(resolveEffectiveLayoutBodyCapacity(ir, slide, 0)).toEqual({ layoutId: "image-split", capacity: undefined })
  })

  it("image-annotate (no body slot at all) also reports undefined capacity", () => {
    const slide: Slide = {
      type: "content",
      heading: "x",
      layout: "image-annotate",
      components: [{ type: "image", asset_id: "a", fit: "cover" }],
    }
    const ir = makeIR([slide])
    expect(resolveEffectiveLayoutBodyCapacity(ir, slide, 0)).toEqual({
      layoutId: "image-annotate",
      capacity: undefined,
    })
  })

  it("the image-cover bypass reports a null layoutId and undefined capacity", () => {
    const slide: Slide = {
      type: "cover",
      heading: "x",
      background: { kind: "asset", asset_id: "bg" },
      components: [],
    }
    const ir = makeIR([slide])
    expect(resolveEffectiveLayoutBodyCapacity(ir, slide, 0)).toEqual({ layoutId: null, capacity: undefined })
  })
})

// ── render parity: the "validate sees what render uses" promise, proven by actually rendering ──

describe("render parity with FullSlideSvg", () => {
  function renderedArchetypeId(ir: PptxIR, slide: Slide, index: number): string | null {
    const { container } = render(createElement(FullSlideSvg, { ir, slide, index }))
    return container.querySelector("[data-archetype]")?.getAttribute("data-archetype") ?? null
  }

  const archetypePathCases: { label: string; themeId: string; slide: Slide }[] = [
    { label: "tech cover, auto-pick", themeId: "tech", slide: { type: "cover", heading: "x", components: [] } },
    {
      // Backlog item 7c (`.issues/notes/2026-07-18-post-v03-backlog.md` #7c):
      // this sweep previously covered cover/content/ending only — chapter
      // had zero render-parity coverage even though it resolves through the
      // exact same archetype path (image-cover takeover aside, already
      // covered by the bypass case below).
      label: "classroom chapter, auto-pick",
      themeId: "classroom",
      slide: { type: "chapter", heading: "x", components: [] },
    },
    {
      label: "academic content, auto-pick",
      themeId: "academic",
      slide: { type: "content", heading: "x", components: [{ type: "paragraph", text: "x" }] },
    },
    {
      label: "consulting content, explicit banner-heading pin",
      themeId: "consulting",
      slide: { type: "content", heading: "x", layout: "banner-heading", components: [{ type: "paragraph", text: "x" }] },
    },
    {
      label: "tech content, explicit bento-panel pin",
      themeId: "tech",
      slide: { type: "content", heading: "x", layout: "bento-panel", components: [{ type: "paragraph", text: "x" }] },
    },
    {
      label: "journal ending, auto-pick",
      themeId: "journal",
      slide: { type: "ending", heading: "x", components: [] },
    },
    {
      // P1 variety wave, task 1: proves FullSlideSvg's own local
      // `resolveArchetype` wrapper (`FullSlideSvg.tsx`) threads `slide.beat`
      // through to `resolveArchetypeId` the same way this module's
      // `resolveOneEffectiveLayoutId` does — a render-time drift here (one
      // side reading beat, the other silently dropping it) would break the
      // "validate sees what render draws" promise for beat specifically.
      label: "academic content with a declared beat, auto-pick",
      themeId: "academic",
      slide: { type: "content", heading: "x", beat: "dense", components: [{ type: "paragraph", text: "x" }] },
    },
  ]

  for (const c of archetypePathCases) {
    it(`${c.label}: resolveEffectiveLayoutId matches the actual rendered data-archetype`, () => {
      const ir = makeIR([c.slide], c.themeId)
      expect(resolveEffectiveLayoutId(ir, c.slide, 0)).toBe(renderedArchetypeId(ir, c.slide, 0))
    })
  }

  // Backlog item 3 (`.issues/notes/2026-07-18-post-v03-backlog.md` #3): every
  // case above is a single-page deck at index 0, where
  // `previousEffectiveLayoutId` is always `null` — the adjacent
  // anti-repetition redraw (W4 design decision 4) never fires in any
  // render-parity case. The dedicated anti-repetition unit tests (this
  // file's `resolveArchetypeId` describe block, and
  // `FullSlideSvg.test.tsx`'s own "content 页相邻防重复") cover the
  // mechanism itself, but never through an actual `FullSlideSvg` render at
  // the page where the swap lands. This fixture closes that gap: a genuine
  // multi-page collision, at index>0, run through the same render-parity
  // check as every case above.
  it("multi-page deck, index>0 anti-repetition swap-to-runner-up: resolveEffectiveLayoutId still matches the actual rendered data-archetype", () => {
    // Seed 12 (found by brute-force search over this exact 2-page academic
    // fixture, same method as plan/revision-stability.test.ts's own seed=3
    // comment) is the smallest seed where the deck-wide fold naturally
    // collides: page 0 auto-picks "two-column" (pageKey "0", no previous),
    // and page 1's own raw weighted pick (pageKey "1", before
    // anti-repetition) is *also* "two-column" — so W4 design decision 4's
    // redraw fires and lands on "narrow-column", the deterministic
    // runner-up (academic's content pool has 7 members, never empty).
    const slides: Slide[] = [
      { type: "content", heading: "Page 0", components: [{ type: "paragraph", text: "x" }] },
      { type: "content", heading: "Page 1", components: [{ type: "paragraph", text: "x" }] },
    ]
    const ir: PptxIR = { ...makeIR(slides, "academic"), seed: 12 }

    // Page 0: no previous page, ordinary auto-pick — sanity baseline for
    // what page 1 would collide with.
    expect(resolveEffectiveLayoutId(ir, slides[0], 0)).toBe("two-column")

    // Page 1: the actual point of this test. Render parity on the one page
    // where the swap-to-runner-up branch is live.
    const resolved = resolveEffectiveLayoutId(ir, slides[1], 1)
    expect(resolved).toBe(renderedArchetypeId(ir, slides[1], 1))

    // Non-vacuity: prove the swap actually fired, not merely that render
    // agrees with whatever validate happened to compute (which would also
    // be true if the pool had collapsed to a single member, or if this
    // seed simply never collided at all). `resolveArchetypeId` is called
    // directly with `previousEffectiveLayoutId` forced to `null` — same
    // seed/pageKey/pool/mode as the real page-1 resolution above, the only
    // difference being that the anti-repetition redraw never runs — which
    // recomputes page 1's *raw*, pre-redraw pick.
    const unswappedRawPick = resolveArchetypeId(
      "content",
      THEME_DEFINITIONS.academic.layouts,
      12,
      "1",
      undefined,
      resolveIrStrategy(ir),
      null,
    )
    // The raw pick collides with page 0's own resolved id — this is the
    // actual collision the redraw exists to break.
    expect(unswappedRawPick).toBe("two-column")
    // The real (redrawn) resolution differs from that raw pick — the redraw
    // branch, not some other code path, is what produced "narrow-column".
    expect(resolved).not.toBe(unswappedRawPick)
    expect(resolved).toBe("narrow-column")
  })

  it("a takeover or image-cover bypass never renders [data-archetype] (the archetype branch is correctly skipped both sides)", () => {
    const bypassCases: { themeId: string; slide: Slide }[] = [
      {
        themeId: "consulting",
        slide: { type: "cover", heading: "x", background: { kind: "asset", asset_id: "bg" }, components: [] },
      },
      {
        themeId: "consulting",
        slide: {
          type: "content",
          heading: "x",
          layout: "image-split",
          components: [{ type: "image", asset_id: "a", fit: "cover" }],
        },
      },
    ]
    for (const { themeId, slide } of bypassCases) {
      const ir: PptxIR = {
        ...makeIR([slide], themeId),
        assets: { images: { bg: { src: "data:image/png;base64,AAAA" }, a: { src: "data:image/png;base64,AAAA" } } },
      }
      expect(renderedArchetypeId(ir, slide, 0)).toBeNull()
    }
  })
})
