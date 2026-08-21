// @vitest-environment jsdom
//
// Theme-structure wave, task T3 (`.issues/2026-07-26-theme-structure/plan.md`)
// — the wave's acceptance suite: measurable cross-theme layout divergence,
// determinism, the undeclared-theme byte-identity control group, the
// selection-time hard boundary, and the forced theme×layout stress audit
// that closes the coverage gap the T2 review found (10 of 18 newly-declared
// tendency ids were never auto-picked by any theme×STRESS_DECKS combination,
// the other 8 hit exactly once — "a theme's newly-favored layout
// rendering pathological content" was essentially unaudited).
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { PptxIR, Slide } from "@/ir"
import { STRATEGY_DEFINITIONS, type Strategy } from "@/narrative"
import { renderSlideSvg } from "../api"
import { auditDeck, type AuditFinding } from "../svg/audit/deck-audit"
import { CJK_LONG, MIXED_LONG, STRESS_DECKS } from "../svg/audit/stress-fixtures"
import { resolveLayoutId, resolveEffectiveLayoutId } from "../svg/layout-selection"
import { CANONICAL_THEME_IDS, type CanonicalThemeId } from "./index"
import { THEME_DEFINITIONS, type ThemeDefinition } from "./definitions"

// ── shared fixture: one deck shape reused by the divergence, determinism,
// and control-group tests below, so all three assert against exactly the
// same pages. Headings are inert to selection (`pageKey` defaults to the
// slide's own array index whenever `slide.id` is unset — see
// `layout-selection.ts`'s `resolveDeckEffectiveLayoutIds`), kept distinct
// only for readability. Content stays plain/tame on purpose — pathological
// content is the forced stress-audit block's own job, further down this
// file. ──

function fixedSlides(): Slide[] {
  return [
    { type: "cover", heading: "Q3 Strategy Review", components: [] },
    { type: "chapter", heading: "Chapter One: Market Landscape", components: [] },
    { type: "content", heading: "Key Findings", components: [{ type: "paragraph", text: "x" }] },
    {
      type: "content",
      heading: "Supporting Data",
      arrangement: "two_column",
      components: [
        { type: "bullets", items: ["a", "b"] },
        { type: "bullets", items: ["c", "d"] },
      ],
    },
    { type: "chapter", heading: "Chapter Two: Recommendations", components: [] },
    { type: "content", heading: "Next Steps", components: [{ type: "bullets", items: ["1", "2", "3"] }] },
    { type: "ending", heading: "Thank You", components: [] },
  ] as Slide[]
}

function makeFixedIr(themeId: string, seed: number): PptxIR {
  return {
    version: "4",
    filename: "theme-structure-fixture.pptx",
    theme: { id: themeId },
    meta: {},
    assets: { images: {} },
    seed,
    slides: fixedSlides(),
  } as PptxIR
}

/** The per-page effective layout id sequence this fixed deck resolves to for `themeId`/`seed`. */
function resolveSequence(themeId: string, seed: number): (string | null)[] {
  const ir = makeFixedIr(themeId, seed)
  return ir.slides.map((slide, i) => resolveEffectiveLayoutId(ir, slide, i))
}

const DECLARED_THEME_IDS = CANONICAL_THEME_IDS.filter((id) => THEME_DEFINITIONS[id].layoutTendencies !== undefined)
const UNDECLARED_THEME_IDS = CANONICAL_THEME_IDS.filter((id) => THEME_DEFINITIONS[id].layoutTendencies === undefined)

/**
 * The six themes the allocation wave took off the blind list. Everything this
 * file pins about "what moved" is scoped to these — they are the only ids
 * whose `layoutTendencies` went from absent to present.
 */
const NEWLY_DECLARED_THEME_IDS = ["enterprise", "campaign", "bloom", "classroom", "luxe", "heritage"] as const

/**
 * `bloom` shares one `layoutTendencies` object with `classroom` on purpose
 * (`definitions.ts`'s `CLASSROOM_STRUCTURE`), so the set of distinct
 * *structural* identities is 20, not 21. Every count in this file that is
 * about structure rather than about theme ids is measured over this list.
 */
const STRUCTURAL_IDENTITY_IDS = CANONICAL_THEME_IDS.filter((id) => id !== "bloom")

it("sanity: all 21 theme ids now declare layoutTendencies, and they resolve to 20 distinct structural identities (bloom mirrors classroom) — if this drifts, the numbers this file pins below must be re-measured, not silently kept", () => {
  expect(DECLARED_THEME_IDS).toHaveLength(21)
  expect(UNDECLARED_THEME_IDS).toEqual([])
  expect(STRUCTURAL_IDENTITY_IDS).toHaveLength(20)
})

// ── bloom's declared mirror (structure-map.md 会话 0 裁决 3) ──
//
// The mirror is the one place in this file where "identical" is the desired
// answer rather than the disease, so it gets pinned from both ends: the same
// object (a copied literal would let the two drift apart while still passing
// a value check), the same value, and — the part a reader can actually see —
// the same resolved layout on every page at every seed.
describe("bloom is a declared palette preset of classroom, not a missing declaration", () => {
  it("both themes point at literally the same tendencies object", () => {
    expect(THEME_DEFINITIONS.bloom.layoutTendencies).toBe(THEME_DEFINITIONS.classroom.layoutTendencies)
  })

  it("...and that object still holds the value the allocation table assigned", () => {
    expect(THEME_DEFINITIONS.bloom.layoutTendencies).toEqual({ cover: ["banner-title", "tone-adaptive-header"] })
  })

  it("bloom and classroom resolve the identical layout on every page, at every seed — the user-visible half of the mirror", () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(resolveSequence("bloom", seed), `seed=${seed}`).toEqual(resolveSequence("classroom", seed))
    }
  })

  // 2026-08-20 柔和组皮肤重设计把镜像推到了底：motif 也归并了。bloom 保留
  // 的只剩 id 和五个色值，其余（结构行、字体、圆角、motif 几何）全部同源。
  it("bloom keeps its own id and palette — everything else, motif included, is classroom's", () => {
    expect(THEME_DEFINITIONS.bloom.id).toBe("bloom")
    expect(THEME_DEFINITIONS.bloom.motif).toBe("classroom-motif")
    expect(THEME_DEFINITIONS.classroom.motif).toBe(THEME_DEFINITIONS.bloom.motif)
    expect(THEME_DEFINITIONS.bloom.style.colors).not.toEqual(THEME_DEFINITIONS.classroom.style.colors)
  })
})

// ── runway's absent motif is a value, not a hole ──
//
// `definitions.ts:317`'s standing ruling (two proposed motifs both struck by
// the user): runway's identity *is* undecorated, and the allocation table
// writes that down as `decoration-weight: none`, the only `none` in the
// table. Pinned here so a future "fill in the missing motif" tidy-up has to
// argue with a failing test instead of a blank field.
describe("runway's motif === undefined is an identity value (definitions.ts:317's standing ruling)", () => {
  it("runway declares no motif", () => {
    expect(THEME_DEFINITIONS.runway.motif).toBeUndefined()
  })

  it("stage declares no motif — undecorated black field, the second none", () => {
    expect(THEME_DEFINITIONS.stage.motif).toBeUndefined()
  })

  it("every other theme does declare one — runway and stage are the two none identities, not a gap list", () => {
    const withMotif = CANONICAL_THEME_IDS.filter((id) => THEME_DEFINITIONS[id].motif !== undefined)
    expect(withMotif).toEqual(CANONICAL_THEME_IDS.filter((id) => id !== "runway" && id !== "stage"))
    expect(withMotif).toHaveLength(19)
  })
})

// ── 1. Divergence test ──

describe("cross-theme layout divergence (the plan's core defect)", () => {
  it("resolves NOT-all-identical layout sequences across the 21 canonical theme ids for a fixed IR + fixed seed", () => {
    const sequences = CANONICAL_THEME_IDS.map((id) => resolveSequence(id, 1))
    const distinct = new Set(sequences.map((seq) => JSON.stringify(seq)))
    // Pre-wave (commit 709605a, before T1/T2 landed): all 13 themes' `layouts`
    // pools were identical (`FULL_LAYOUTS`) and no theme declared a
    // structural tendency, so this exact fixed IR + seed resolved to the
    // byte-identical sequence on every one of the 13 themes —
    // `distinct.size` was 1. This assertion is what would have failed red
    // against that commit (verified by archiving 709605a and re-running this
    // same fixture against it — see the task report).
    expect(distinct.size).toBeGreaterThan(1)
    // Measured exact count (task T3's 6 declared themes + themes-16 wave
    // task T1's pulse + task T2's terra + task T3's ember + gov-theme wave's
    // vermilion, the 10th declaring theme): each of the 10 declared themes
    // (consulting/academic/journal/insight/tech/runway/pulse/terra/ember/
    // vermilion) resolves its own distinct sequence, and the 7 undeclared
    // themes still share the single pre-wave sequence — 10 + 1 = 11 distinct
    // sequences total (re-measured after vermilion landed — a real
    // resolveEffectiveLayoutId sweep of all 17 canonical themes, see
    // task-1-report.md). Re-measured after the theme-redesign wave made ink
    // the 11th declaring theme: 11 + 1 = 12. Re-measured again after the
    // allocation wave gave the remaining six a cover and the inert-declaration
    // fix pointed insight and vermilion at ids briefing does not already
    // favor: 11. It went *down* by one because the fix retired a group rather
    // than adding one — see the cover-weighting block below for why that is
    // the right direction. museum (2026-08-21) joins the existing
    // poster-center cluster at this fixture/seed (same hop crayon and arena
    // took), so the count stays 11. stage (same day) joins the classroom /
    // vermilion cover-weight cluster, count stays 11.
    expect(distinct.size).toBe(11)
  })

  // Superseded assertion, kept as a comment because the reason it had to go
  // is the finding: this used to read "every declared theme's sequence
  // differs from every other declared theme's", which held while only 11 of
  // 17 themes declared anything. Now that all 17 do, it cannot hold and
  // should not — the allocation table deliberately hands several themes
  // overlapping cover picks (heritage and journal both lean on
  // `editorial-masthead`, runway and luxe both on `fashion-masthead`), on the
  // ruling that a shared construction rendered through two different palettes
  // is two different covers. What the table forbids is two themes sharing all
  // four structural axes, which is a property of the table, not of a seed.
  // So the divergence claim moves to the cover axis and is measured there,
  // below.
})

// ── 1a. Cover-axis allocation measurement (theme-structure-allocation wave) ──
//
// The wave's own acceptance metric, measured the same way the theme-structure
// wave measured its own: one fixed IR, fixed seeds, resolved across the 16
// structural identities, counting how many genuinely different cover
// behaviours come out. The historical chain on the whole-sequence axis was
// 1 -> 7 (13 themes, theme-structure wave) -> 12 (today, 17 themes). This
// block measures the cover slot specifically, because that is the only slot
// this wave touches.

/** The 40-seed cover pick sequence for `themeId` — one seed is not enough to separate two weightings that happen to agree on it. */
function coverSequence(themeId: string, seedCount = 40): (string | null)[] {
  return Array.from({ length: seedCount }, (_, i) => resolveSequence(themeId, i + 1)[0])
}

/** The set of cover ids that carry the ×3 weight for `themeId` under the default `briefing` narrative — the theme's own declaration unioned with briefing's, since `weightOf` composes via `Math.max`. */
function effectiveCoverWeightSet(themeId: CanonicalThemeId): string {
  const own = THEME_DEFINITIONS[themeId].layoutTendencies?.cover ?? []
  return JSON.stringify([...new Set([...own, ...STRATEGY_DEFINITIONS.briefing.identityTendencies.cover])].sort())
}

describe("cover-axis divergence across the 20 structural identities", () => {
  it("distinct cover sequences: 9 across the 20 identities (measured, seeds 1-40)", () => {
    const distinct = new Set(STRUCTURAL_IDENTITY_IDS.map((id) => JSON.stringify(coverSequence(id))))
    // The measured chain on this exact fixture: 8 before the allocation wave,
    // 10 after it, 9 after the inert-declaration fix. Each number is a
    // literal, not a re-derivation, so reverting either edit fails here
    // instead of quietly adopting its own new baseline.
    //
    // **The drop from 10 to 9 is the fix working, not a regression**, and the
    // reason is worth reading before anyone "restores" it. One of those 10
    // groups was insight and vermilion, and what those two had in common was
    // that neither declaration did anything: both named only ids the default
    // narrative already favors, so `Math.max(3, 3) = 3` and they resolved
    // covers identically to a theme declaring nothing at all. It counted as a
    // distinct sequence while being the absence of one. Pointing the two at
    // real ids merges them into journal's and classroom's groups — a shared
    // construction rendered through a different palette, which this codebase
    // has always treated as two covers rather than one (heritage and journal
    // already share `editorial-masthead`, runway and luxe `fashion-masthead`).
    // Nine groups that all mean something beats ten where one means nothing.
    expect(distinct.size).toBe(9)
  })

  it("the blind cluster is gone: 8 of 16 identities used to pick their cover exactly the way an undeclared theme does, now none do", () => {
    // "Blind" has a precise meaning here: a theme whose *effective* cover
    // weighting is briefing's own set and nothing more, so the declaration
    // (or its absence) changes nothing a default-narrative deck can see.
    const blind = STRUCTURAL_IDENTITY_IDS.filter(
      (id) => effectiveCoverWeightSet(id) === JSON.stringify([...STRATEGY_DEFINITIONS.briefing.identityTendencies.cover].sort()),
    )
    // Before the allocation wave this list was enterprise, insight, campaign,
    // classroom, luxe, heritage, ember and vermilion — half the set, all
    // picking covers identically. The wave took it to two (insight and
    // vermilion, whose assigned pairs came entirely from briefing's own ids),
    // and the inert-declaration fix took it to zero.
    expect(blind).toEqual([])
  })

  it("distinct cover weightings across the 20 identities: 9, every one of them a real preference", () => {
    const groups = new Map<string, string[]>()
    for (const id of STRUCTURAL_IDENTITY_IDS) {
      const key = effectiveCoverWeightSet(id)
      groups.set(key, [...(groups.get(key) ?? []), id])
    }
    expect(groups.size).toBe(9)
    // The largest remaining cluster, named rather than counted, so shrinking
    // it later is a visible edit to this test and not a silent improvement.
    // All five lean on `split-diagonal` over briefing's pair: enterprise's
    // Swiss cut, campaign's brush stroke, pulse's ECG spike, ember's rising
    // slash and arena's HUD wedge are five readings of the same diagonal,
    // which is a legitimate shared construction — it is the four-axis table,
    // not the cover pool, that keeps them apart.
    const largest = [...groups.values()].sort((a, b) => b.length - a.length)[0]!
    expect(largest).toEqual(["enterprise", "campaign", "pulse", "ember", "arena"])
  })

  // ── The structural guard ──
  //
  // A cover declaration is only worth the line it takes if a default deck can
  // see it. Because the strategy, beat and theme layers compose via
  // `Math.max` rather than multiplying, a theme that names only ids the active
  // strategy already favors adds nothing at all under that strategy —
  // `max(3, 3) = 3`, the same weight an undeclared theme gets. That is not a
  // weak declaration, it is an absent one wearing a declaration's clothes.
  //
  // The allocation table shipped with two of these (insight and vermilion,
  // both assigned exactly `briefing.identityTendencies.cover`), and nothing
  // caught it — the table was drawn on structural grounds without checking it
  // against the composition rule. This test is that check, applied to the
  // whole set rather than to the two ids that happened to trip it: every
  // structural identity must name at least one cover id the *default*
  // narrative does not already favor.
  //
  // Scoped to briefing on purpose. Briefing is what a deck with no `narrative`
  // resolves to, so it is the only strategy where an inert declaration is
  // invisible to the person who never opted into anything. Under the other
  // four, a deck author has made a choice and a partial overlap is a
  // legitimate way to agree with it.
  it("every structural identity names at least one cover id the default narrative does not already favor", () => {
    const briefingCovers = STRATEGY_DEFINITIONS.briefing.identityTendencies.cover
    // Read from the strategy table, never inlined: hardcoding the pair here
    // would let this test keep passing if briefing's own set were retuned,
    // which is exactly the drift it exists to catch.
    expect(briefingCovers.length, "briefing must actually favor something for this guard to mean anything").toBeGreaterThan(0)

    const inert = STRUCTURAL_IDENTITY_IDS.filter((id) => {
      const own = THEME_DEFINITIONS[id].layoutTendencies?.cover ?? []
      return own.length > 0 && own.every((coverId) => briefingCovers.includes(coverId))
    })
    expect(
      inert,
      `these themes declare a cover preference that Math.max flattens to nothing under the default narrative — ` +
        `add an id outside ${JSON.stringify(briefingCovers)} or drop the declaration`,
    ).toEqual([])
  })

  // The same claim from the output side, so the guard cannot pass on a
  // technicality about which ids appear in which array. The reference is a
  // real resolver run with `themeTendencies` left off entirely — literally
  // what this renderer draws for a theme that declares no cover preference —
  // and no structural identity may reproduce it.
  //
  // Deliberately not anchored to some theme that "acts blind": that is how
  // the original defect stayed invisible for a whole wave. insight and
  // vermilion *were* the blind reference, so comparing them against each
  // other proved nothing.
  it("no structural identity resolves the cover sequence a theme with no declaration at all would", () => {
    const blindCovers = Array.from({ length: 40 }, (_, i) =>
      resolveLayoutId(
        "cover",
        THEME_DEFINITIONS.consulting.layouts,
        i + 1,
        "0", // `fixedSlides()`'s cover carries no `slide.id`, so its page key is its index
        undefined,
        "briefing", // what a deck naming no narrative resolves to
        null, // first page, so adjacent anti-repetition has nothing to compare against
        undefined,
        undefined, // ← the whole point: no theme tendency
      ),
    )
    const blindLike = STRUCTURAL_IDENTITY_IDS.filter(
      (id) => JSON.stringify(coverSequence(id)) === JSON.stringify(blindCovers),
    )
    expect(
      blindLike,
      "these themes' covers are indistinguishable from declaring nothing at all",
    ).toEqual([])
  })

  it("every cover id a theme declares is one this renderer can actually draw", () => {
    for (const id of CANONICAL_THEME_IDS) {
      for (const coverId of THEME_DEFINITIONS[id].layoutTendencies?.cover ?? []) {
        expect(THEME_DEFINITIONS[id].layouts.cover, `${id} -> ${coverId}`).toContain(coverId)
      }
    }
  })
})

// ── 1b. Declaration-rebalance wave acceptance evidence
// (`.issues/2026-08-03-declaration-rebalance/plan.md`) ──
//
// The theme-structure wave's own changelog admitted a known limitation:
// consulting (cover + ending) and journal (chapter + ending) each had 2 of
// their 3 declared axes silently dead under the default `briefing` strategy
// — `briefing.identityTendencies` already names their native id on those
// axes, so `Math.max(strategyWeight, themeWeight)` never exceeded the
// strategy-only weight (max(3,3)=3) and the axis read identically to an
// undeclared theme. This wave appends a second, honest id to each dead axis
// (native id kept, per the plan's 裁定 1) — see consulting's and journal's
// own `layoutTendencies` comments (`./definitions.ts`) for the per-id
// character rationale and the real `resolveLayoutId` sweep that picked
// each combination.

/** `briefing`'s own soft-weight id set for `slideType` — the set a theme's own tendency must add *something new* to, to have any real (non-dead) pull under the deck's default narrative. */
function briefingIdentityIds(slideType: "cover" | "chapter" | "ending"): readonly string[] {
  return STRATEGY_DEFINITIONS.briefing.identityTendencies[slideType]
}

/** Whether `themeId`'s own declared tendency for `slideType` names at least one id `briefing.identityTendencies` doesn't already name — i.e. this axis has genuine additional pull under the default strategy, not just a `Math.max` no-op agreeing with what briefing already favors. */
function hasEffectivePull(themeId: CanonicalThemeId, slideType: "cover" | "chapter" | "ending"): boolean {
  const themeIds = THEME_DEFINITIONS[themeId].layoutTendencies?.[slideType] ?? []
  const briefingIds = briefingIdentityIds(slideType)
  return themeIds.some((id) => !briefingIds.includes(id))
}

describe("declaration-rebalance wave: consulting/journal both clear >=2 effective-pull axes under briefing", () => {
  it("consulting: cover, chapter, and ending all have real pull beyond briefing's own identityTendencies (>=2 required, all 3 achieved)", () => {
    const axes = (["cover", "chapter", "ending"] as const).filter((st) => hasEffectivePull("consulting", st))
    expect(axes).toEqual(["cover", "chapter", "ending"])
  })

  it("journal: cover, chapter, and ending all have real pull beyond briefing's own identityTendencies (>=2 required, all 3 achieved)", () => {
    const axes = (["cover", "chapter", "ending"] as const).filter((st) => hasEffectivePull("journal", st))
    expect(axes).toEqual(["cover", "chapter", "ending"])
  })

  // Recorded once, from a real `resolveSequence` run against this exact
  // fixture at seed=1 *before* this wave's `definitions.ts` edit landed (the
  // plan's required before/after comparison anchor) — not re-derived here,
  // so a future accidental revert of the `layoutTendencies` edit would still
  // fail this test even if it byte-matched some other old state.
  const PRE_REBALANCE_CONSULTING = [
    "banner-title",
    "fashion-chapter",
    "tone-adaptive-content",
    "split-band",
    "rail-chapter",
    "banner-heading",
    "masthead-ending",
  ]
  const PRE_REBALANCE_JOURNAL = [
    "poster-center",
    "masthead-chapter",
    "tone-adaptive-content",
    "split-band",
    "rail-chapter",
    "banner-heading",
    "masthead-ending",
  ]

  it("consulting's post-rebalance sequence differs from its own pre-rebalance sequence (the append actually moved something)", () => {
    expect(resolveSequence("consulting", 1)).not.toEqual(PRE_REBALANCE_CONSULTING)
  })

  it("journal's post-rebalance sequence differs from its own pre-rebalance sequence (the append actually moved something)", () => {
    expect(resolveSequence("journal", 1)).not.toEqual(PRE_REBALANCE_JOURNAL)
  })
})

// ── 2. Determinism test ──

describe("determinism", () => {
  it("same theme + same fixed IR + same seed, resolved repeatedly, is always identical", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const first = resolveSequence(themeId, 7)
      for (let n = 0; n < 20; n++) {
        expect(resolveSequence(themeId, 7), `${themeId} run ${n}`).toEqual(first)
      }
    }
  })

  // Double-render byte equality, scoped to the 6 declared themes (the ones
  // this wave's weighting layer actually touches) — a general double-render
  // determinism net already exists elsewhere (`full-slide-svg.test.tsx`'s
  // own "double-render determinism" blocks, decor markup + chart wedge
  // colors) but neither of those renders through a theme's own declared
  // `layoutTendencies`, so this is a distinct code path, not a duplicate.
  it("full rendered SVG markup for every page of a declared theme's fixture deck is byte-identical across repeated renders", () => {
    for (const themeId of DECLARED_THEME_IDS) {
      const ir = makeFixedIr(themeId, 11)
      for (let i = 0; i < ir.slides.length; i++) {
        const first = renderSlideSvg(ir, i)
        const second = renderSlideSvg(ir, i)
        expect(second, `${themeId} page ${i}`).toBe(first)
      }
    }
  })
})

// ── 3. Control-group byte identity ──
//
// Migration-period guard — deletable once the wave is trusted (the repo's
// established convention, see `../svg/layouts/registry.migration-guard.test.ts`'s
// own header). `__fixtures__/pre-wave-undeclared-layout-sequences.json` is a
// one-time capture: `git archive 709605a` (the commit immediately before
// task T1 landed) into a scratch checkout, then running this exact file's
// `fixedSlides`/`makeFixedIr`/`resolveSequence` helpers against that
// snapshot's own `resolveEffectiveLayoutId`, for the 7 themes this wave
// leaves undeclared, across 5 seeds. Re-running the identical capture at
// HEAD today reproduces byte-identical output (verified — see the task
// report) — this test locks that invariant going forward.
//
// Deliberately `fileURLToPath(import.meta.url)` + `path.join`, not the
// `new URL("./__fixtures__/...", import.meta.url)` idiom
// `registry.migration-guard.test.ts` uses: that file pins `@vitest-environment
// node`, where the literal-`new URL(str, import.meta.url)` pattern resolves
// to a real `file://` URL. This file's other blocks need `jsdom` (theme
// rendering/audit), and under `jsdom` that exact literal pattern gets
// rewritten by Vite's static asset-URL analysis into an `http://localhost`
// dev-server URL instead — `fs.readFileSync` then rejects it ("The URL must
// be of scheme file"), confirmed empirically. Splitting the two calls avoids
// the textual pattern the rewrite matches on.
const __fixtureDir = path.dirname(fileURLToPath(import.meta.url))
const preWaveFixture = JSON.parse(
  readFileSync(path.join(__fixtureDir, "__fixtures__/pre-wave-undeclared-layout-sequences.json"), "utf-8"),
) as Record<string, Record<string, (string | null)[]>>

/**
 * The second capture in this chain, and the one the allocation wave is
 * measured against: every one of the 17 themes' full 7-page sequence at seeds
 * 1-5, taken from a real `resolveEffectiveLayoutId` run immediately *before*
 * this wave's `definitions.ts` edit landed — that is, with ink v3 already in
 * and the other six blind themes still blind.
 *
 * Same discipline as the 709605a fixture above: this file is a record of a
 * past state, so it is never re-captured. When a later wave moves a pick, the
 * move gets written down beside it, the way `ALLOCATION_COVER_MOVES` writes
 * this wave's down. Overwriting the file would keep the suite green and
 * delete the only thing it proves.
 */
const preAllocationFixture = JSON.parse(
  readFileSync(path.join(__fixtureDir, "__fixtures__/pre-allocation-layout-sequences.json"), "utf-8"),
) as Record<string, Record<string, (string | null)[]>>

const FIXTURE_SEEDS = [1, 2, 3, 4, 5]

/**
 * Cover-slot drift introduced by the theme-redesign wave (2026-08-18), pinned
 * here as a table rather than folded into a re-captured fixture.
 *
 * **The fixture file is deliberately NOT re-captured.** Its whole meaning is
 * "this is what commit 709605a produced"; overwriting it with today's output
 * would keep the test green and destroy the only thing it proves. So the
 * pre-wave bytes stay, and the part of the guarantee that still holds is
 * asserted directly against them (every page except the cover), while the
 * part that broke is written out in full below.
 *
 * What broke and why: registering a 9th cover layout (`colophon`) grows the
 * cover pool's weighted-sampling denominator, and `weightedPickBySeed` picks
 * by `target = hash % totalWeight` — so a *fixed* seed lands on a different
 * candidate even though nothing about the existing 8 layouts changed. This is
 * structural to the sampler, not a property of this particular layout: every
 * previous pool growth in this repo did the same thing on its own axis (see
 * `migrate-equivalence.test.ts`'s recapture chain for image-lead-split /
 * split-band). It is the first one to hit the cover axis, and covers are the
 * page people look at, which is why it is written down here instead of
 * absorbed.
 *
 * Measured scope beyond this fixture (17 themes × 40 seeds, that wave's own
 * sweep): 505 of 640 non-ink cover picks move; nothing outside the cover slot
 * moves for any theme other than ink, which moved on purpose.
 *
 * Seeds 1 and 4 are absent because those two seeds' covers did not move.
 */
const REDESIGN_WAVE_COVER_DRIFT: Record<number, { from: string; to: string }> = {
  2: { from: "banner-title", to: "fashion-masthead" },
  3: { from: "fashion-masthead", to: "banner-title" },
  5: { from: "banner-title", to: "editorial-masthead" },
}

/**
 * Cover-slot drift introduced by *this* wave, the second reshuffle in the
 * same release. Where the redesign wave's drift was one shared row (every
 * blind theme moved identically, because pool arithmetic does not care which
 * theme it is), this one is per theme: the whole point of the wave is that
 * these eight now weight the cover pool differently from each other.
 *
 * Read as "theme -> its cover pick at seeds 1..5, after this wave". Anything
 * absent from this table is asserted to be untouched, which is the other half
 * of the claim and the half a table alone cannot make.
 *
 * terra and ember were already declaring themselves on other axes, so they
 * are here for the cover picks the allocation added, not for a first
 * declaration. vermilion and insight are deliberately absent: their assigned
 * cover pairs are drawn entirely from briefing's own set, so nothing moves
 * under the default narrative (measured, see the cover-axis block above).
 */
const ALLOCATION_COVER_MOVES: Partial<Record<CanonicalThemeId, string[]>> = {
  enterprise: ["poster-center", "split-diagonal", "constellation", "split-diagonal", "poster-center"],
  campaign: ["poster-center", "split-diagonal", "constellation", "split-diagonal", "poster-center"],
  bloom: ["poster-center", "fashion-masthead", "constellation", "split-diagonal", "poster-center"],
  classroom: ["poster-center", "fashion-masthead", "constellation", "split-diagonal", "poster-center"],
  luxe: ["poster-center", "fashion-masthead", "constellation", "split-diagonal", "poster-center"],
  heritage: ["split-diagonal", "constellation", "split-diagonal", "split-diagonal", "colophon"],
  terra: ["split-diagonal", "constellation", "split-diagonal", "split-diagonal", "colophon"],
  ember: ["poster-center", "split-diagonal", "constellation", "split-diagonal", "poster-center"],
  // The third reshuffle, and the last in this release: the inert-declaration
  // fix (2026-08-19) repointed these two at cover ids the default narrative
  // does not already favor, so for the first time their declarations reach the
  // picker at all. Measured blast radius, 17 themes × 40 seeds: 70 cover picks
  // move, every one of them on these two, and nothing outside the cover slot
  // moves for anyone.
  insight: ["poster-center", "fashion-masthead", "constellation", "split-diagonal", "poster-center"],
  vermilion: ["poster-center", "fashion-masthead", "constellation", "split-diagonal", "poster-center"],
}

describe("control-group byte identity (migration-period guard — deletable once the wave is trusted)", () => {
  it("the 709605a fixture covers exactly the six themes this wave took off the blind list, plus ink — which the theme-redesign wave moved to the declared side first", () => {
    expect(Object.keys(preWaveFixture).sort()).toEqual([...NEWLY_DECLARED_THEME_IDS, "ink"].sort())
  })

  it("every non-cover page of the six formerly-blind themes still resolves exactly as it did pre-wave (commit 709605a), two reshuffles later", () => {
    for (const themeId of NEWLY_DECLARED_THEME_IDS) {
      for (const seed of FIXTURE_SEEDS) {
        const pre = preWaveFixture[themeId]?.[String(seed)]
        expect(resolveSequence(themeId, seed).slice(1), `${themeId} seed=${seed}`).toEqual(pre?.slice(1))
      }
    }
  })

  it("ink left the control group: its own declaration, not the pool growth, is what moves it now", () => {
    // ink is the redesign wave's subject — it gained `layoutTendencies` for
    // cover and content, so its sequence is expected to diverge from the
    // pre-wave capture on those two page types. Chapter and ending stay
    // undeclared, and stay put. Pinned as a differential so "ink changed"
    // doesn't become an unexamined blanket excuse.
    const CHAPTER_PAGES = [1, 4] // the two chapter slots in `fixedSlides()`
    const ENDING_PAGE = 6
    for (const seed of FIXTURE_SEEDS) {
      const pre = preWaveFixture.ink?.[String(seed)]
      const now = resolveSequence("ink", seed)
      for (const i of [...CHAPTER_PAGES, ENDING_PAGE]) {
        expect(now[i], `ink seed=${seed} page ${i} (undeclared page type)`).toBe(pre?.[i])
      }
    }
    // …and the cover really does land on the new construction for at least
    // some seeds, which is the whole point of declaring it.
    expect(FIXTURE_SEEDS.map((seed) => resolveSequence("ink", seed)[0])).toContain("colophon")
  })
})

// ── 3b. What this wave itself moved (theme-structure-allocation) ──
//
// Attribution, not reassurance. Three claims, each of which fails on its own
// if the wave overreached: nothing outside the cover slot moved for anyone,
// the nine themes the allocation left alone kept their covers exactly, and
// the eight it re-weighted landed on exactly the recorded picks.
/**
 * Themes added after the allocation-wave fixture was captured. Historical
 * control-group tests skip these rather than recapturing the fixture file
 * (its whole meaning is a record of a past state).
 */
const POST_ALLOCATION_THEME_IDS: readonly CanonicalThemeId[] = ["crayon", "arena", "museum", "stage"]
const ALLOCATION_ERA_THEME_IDS = CANONICAL_THEME_IDS.filter(
  (id) => !POST_ALLOCATION_THEME_IDS.includes(id),
)

describe("allocation wave drift: the cover slot moved for eight themes and nothing else moved for anyone", () => {
  it("the pre-allocation fixture covers the 17 themes that existed when it was captured, at 5 seeds", () => {
    expect(Object.keys(preAllocationFixture).sort()).toEqual([...ALLOCATION_ERA_THEME_IDS].sort())
    for (const themeId of ALLOCATION_ERA_THEME_IDS) {
      expect(Object.keys(preAllocationFixture[themeId]!).sort(), themeId).toEqual(["1", "2", "3", "4", "5"])
    }
  })

  it("no page other than the cover moved, for any of the 17 themes then in the roster — zero content displaced outside the slot this wave declares", () => {
    for (const themeId of ALLOCATION_ERA_THEME_IDS) {
      for (const seed of FIXTURE_SEEDS) {
        expect(resolveSequence(themeId, seed).slice(1), `${themeId} seed=${seed}`).toEqual(
          preAllocationFixture[themeId]?.[String(seed)]?.slice(1),
        )
      }
    }
  })

  it("the seven themes neither edit re-weighted keep their exact pre-wave cover picks", () => {
    const untouched = ALLOCATION_ERA_THEME_IDS.filter((id) => ALLOCATION_COVER_MOVES[id] === undefined)
    // Named explicitly so shrinking the move table can't silently shrink this
    // control group too — the two halves must add up to the 17 themes this
    // fixture captured (crayon, arena, and museum landed later, out of this
    // wave's scope. stage joined the same list in 2026-08-21.).
    expect(untouched).toEqual(["consulting", "academic", "ink", "tech", "runway", "journal", "pulse"])
    for (const themeId of untouched) {
      for (const seed of FIXTURE_SEEDS) {
        expect(resolveSequence(themeId, seed)[0], `${themeId} seed=${seed}`).toBe(
          preAllocationFixture[themeId]?.[String(seed)]?.[0],
        )
      }
    }
  })

  // The release ships two cover reshuffles at once, so the chain is asserted
  // end to end in one place rather than as two disconnected tables: what
  // 709605a drew, where the ninth-layout pool growth moved it, and where this
  // wave's declarations moved it again. The middle hop is what
  // `REDESIGN_WAVE_COVER_DRIFT` recorded, and the pre-allocation fixture is a
  // real capture of that same post-ink state — so this also cross-checks that
  // the redesign wave's own table described what actually happened.
  it("both reshuffles in this release are accounted for, hop by hop, on the six formerly-blind themes", () => {
    for (const themeId of NEWLY_DECLARED_THEME_IDS) {
      for (const seed of FIXTURE_SEEDS) {
        const at709605a = preWaveFixture[themeId]?.[String(seed)]?.[0]
        const afterInk = preAllocationFixture[themeId]?.[String(seed)]?.[0]
        const drift = REDESIGN_WAVE_COVER_DRIFT[seed]
        // Hop 1, pool 8 -> 9: a shared row, because pool arithmetic does not
        // know which theme it is looking at.
        if (drift) {
          expect(at709605a, `${themeId} seed=${seed} at 709605a`).toBe(drift.from)
          expect(afterInk, `${themeId} seed=${seed} after the ink wave`).toBe(drift.to)
        } else {
          expect(afterInk, `${themeId} seed=${seed} was undisturbed by the ink wave`).toBe(at709605a)
        }
        // Hop 2, blind -> declared: per theme, because that is the point.
        const now = resolveSequence(themeId, seed)[0]
        expect(now, `${themeId} seed=${seed} after the allocation wave`).toBe(
          ALLOCATION_COVER_MOVES[themeId]?.[FIXTURE_SEEDS.indexOf(seed)],
        )
      }
    }
  })

  it("the eight it did re-weight moved to exactly the recorded covers, and every one of them really is a move", () => {
    for (const [themeId, expected] of Object.entries(ALLOCATION_COVER_MOVES) as [CanonicalThemeId, string[]][]) {
      FIXTURE_SEEDS.forEach((seed, i) => {
        const before = preAllocationFixture[themeId]?.[String(seed)]?.[0]
        const now = resolveSequence(themeId, seed)[0]
        expect(now, `${themeId} seed=${seed}`).toBe(expected[i])
        // Both halves, so the table cannot quietly describe a no-op: at least
        // one seed per theme has to differ from the captured pre-wave pick.
        expect(typeof before).toBe("string")
      })
      const moved = FIXTURE_SEEDS.filter(
        (seed, i) => preAllocationFixture[themeId]?.[String(seed)]?.[0] !== expected[i],
      )
      expect(moved.length, `${themeId} moved on no seed at all`).toBeGreaterThan(0)
    }
  })
})

// ── 4. Hard boundary ──
//
// `ThemeDefinition.layoutTendencies`'s own doc comment and task T1's
// `registerTheme` guard already establish this at *declaration* time (a
// tendency naming an id outside the theme's own `layouts[slideType]` set
// throws at registration). This block is the *selection-time* complement:
// given a real, deliberately narrowed `layouts` set (every builtin theme
// today curates the full layout set for all four page types —
// `definitions.test.ts`'s own "全集放开基线" pin — so this narrowing is
// synthetic, exercising the boundary itself rather than a real theme), no
// combination of strategy/beat/theme weighting — even a themeTendencies
// entry that maximally favors one member — ever produces a pick outside
// that narrowed pool, across a wide seed/strategy/beat sweep.
describe("hard boundary: a narrowed layouts set still gates every pick, regardless of tendency weighting", () => {
  const NARROWED_LAYOUTS: ThemeDefinition["layouts"] = {
    cover: ["banner-title", "poster-center"],
    chapter: ["banner-chapter", "poster-chapter"],
    content: ["narrow-column", "two-column"],
    ending: ["banner-ending", "poster-ending"],
  }

  const STRATEGIES: Strategy[] = ["pyramid", "storytelling", "instructional", "showcase", "briefing"]
  const BEATS = [undefined, "anchor", "dense", "breathing"] as const

  const CASES: { slideType: Slide["type"]; pool: readonly string[]; tendency: readonly string[] }[] = [
    { slideType: "cover", pool: NARROWED_LAYOUTS.cover, tendency: ["banner-title"] },
    { slideType: "chapter", pool: NARROWED_LAYOUTS.chapter, tendency: ["poster-chapter"] },
    { slideType: "content", pool: NARROWED_LAYOUTS.content, tendency: ["narrow-column"] },
    { slideType: "ending", pool: NARROWED_LAYOUTS.ending, tendency: ["banner-ending"] },
  ]

  it("no seed, under any strategy × beat combination, ever picks an id outside the narrowed pool", () => {
    for (const { slideType, pool, tendency } of CASES) {
      for (const strategy of STRATEGIES) {
        for (const beat of BEATS) {
          for (let seed = 0; seed < 60; seed++) {
            const picked = resolveLayoutId(
              slideType,
              NARROWED_LAYOUTS,
              seed,
              `p${seed}`,
              undefined,
              strategy,
              null,
              beat,
              tendency,
            )
            expect(pool, `${slideType} strategy=${strategy} beat=${beat} seed=${seed} picked "${picked}"`).toContain(
              picked,
            )
          }
        }
      }
    }
  })
})

// ── 5. Closing the T2 review's coverage gap: forced theme×layout stress audit ──
//
// The T2 review instrumented the audit sweeps and found: 10 of the 18
// newly-declared tendency ids are never auto-picked by any theme×
// STRESS_DECKS combination, and the other 8 are hit exactly once —
// `full-matrix-contrast.test.ts` pins every theme×layout pair but only
// with tame content, and `audit-baseline.test.ts` uses pathological content
// but never pins `layout`. This block forces the combination explicitly
// instead of hoping auto-pick lands there: for each of the 6 declared
// themes × its 3 declared ids (18 combinations), a pathological-content page
// (reusing `STRESS_DECKS`'s own `CJK_LONG`/`MIXED_LONG` stress constants and
// its `heading` deck's own `meta` — not a parallel stress corpus) with
// `layout` pinned to that id, audited for zero overflow/out-of-bounds/
// overlap findings.
function forcedStressIr(themeId: CanonicalThemeId, slideType: "cover" | "chapter" | "ending", layoutId: string): PptxIR {
  const slide: Slide = {
    type: slideType,
    heading: CJK_LONG,
    subheading: MIXED_LONG,
    layout: layoutId,
    components: [],
  } as Slide
  return {
    version: "4",
    filename: "theme-structure-forced-stress.pptx",
    theme: { id: themeId },
    // Reuses the "heading" stress deck's own meta (organization + contact +
    // website + copyright) verbatim — the ending stress case's own worst-case
    // contact/copyright chain, not a hand-rolled duplicate.
    meta: STRESS_DECKS.heading.meta,
    assets: { images: {} },
    slides: [slide],
  }
}

const GEOMETRY_CODES = new Set(["overflow", "out-of-bounds", "overlap"])

function geometryFindings(ir: PptxIR): AuditFinding[] {
  return auditDeck(ir).findings.filter((f) => GEOMETRY_CODES.has(f.code))
}

describe("forced theme-tendency × stress-content geometry audit (closes the T2 review's coverage gap)", () => {
  const combos: { themeId: CanonicalThemeId; slideType: "cover" | "chapter" | "ending"; layoutId: string }[] = []
  for (const themeId of DECLARED_THEME_IDS) {
    const tendencies = THEME_DEFINITIONS[themeId].layoutTendencies
    for (const slideType of ["cover", "chapter", "ending"] as const) {
      for (const layoutId of tendencies?.[slideType] ?? []) {
        combos.push({ themeId, slideType, layoutId })
      }
    }
  }

  it("sanity: 60 declared theme×layout combinations exist to force-audit — every id every theme leans toward on cover/chapter/ending, rendered with pathological content", () => {
    // Was 36 before the allocation wave. The +17 are the cover ids the wave
    // added: enterprise/campaign/classroom/bloom/luxe/heritage 2 apiece (12,
    // all first declarations), plus terra +1, ember +2 and vermilion +2. The
    // inert-declaration fix added one more: insight's cover grew from one id
    // to two, while vermilion's stayed at two with one swapped. The sixth
    // wave (2026-08-21) adds two cover ids for crayon (tone-adaptive-header /
    // banner-title) and two for arena (split-diagonal / poster-center),
    // 54 → 58. museum (same day, parrot-station theme) adds two cover ids
    // (poster-center / editorial-masthead), 58 → 60. stage (same day, keynote
    // black field) adds two cover ids (poster-center / tone-adaptive-header),
    // 60 → 62. The number is a tripwire, not a target — if it drifts,
    // re-derive it from `definitions.ts` rather than editing it to match.
    expect(combos).toHaveLength(62)
  })

  for (const { themeId, slideType, layoutId } of combos) {
    it(`${themeId} / ${slideType} / ${layoutId}: zero overflow/out-of-bounds/overlap findings under pathological content, explicitly pinned`, () => {
      const findings = geometryFindings(forcedStressIr(themeId, slideType, layoutId))
      expect(findings.map((f) => `${f.code}: ${f.message}`)).toEqual([])
    })
  }
})

// All 18 combinations above pass clean on the three geometry codes this task
// scopes them to. Running the full (unfiltered) `auditDeck` report over the
// same 18 fixtures during this task's own investigation surfaced three
// `low-contrast`/`content-truncated` findings outside that scope — recorded
// here rather than silently dropped, same "understood, not fixed" posture
// `deck-audit.test.ts`/`full-matrix-contrast.test.ts` already use for their
// own adjudicated exceptions:
//
// - `content-truncated` on several covers/endings (the pinned `MIXED_LONG`
//   subheading outgrows its one-line budget): this is the shrink-then-
//   truncate pipeline working as designed (`fitHeadingLines`/`fitSvgLine`'s
//   own floor-then-ellipsis contract) — the mechanism that keeps this exact
//   content class out of `overflow` in the first place, not a defect.
// - `low-contrast` on `consulting/banner-ending` (3.22:1) and
//   `academic/rail-ending` (2.93:1)'s copyright line, both against the
//   real `contact`/`copyright` meta this fixture populates: traced to each
//   layout's own `COPYRIGHT_FAINT` — a hardcoded, pre-existing decorative
//   constant (see `ending-banner-ending.tsx`/`ending-rail-ending.tsx`'s own
//   "孤儿色处理" header comment, migrated verbatim from the original
//   `templates/*.tsx` sources, predating this wave) deliberately fainter
//   than `colors.muted` by design. Confirmed theme-wide-independent: the
//   same theme's `tone-adaptive-ending`/`masthead-ending` render the
//   identical copyright text with zero low-contrast finding — the gap is
//   specific to these two layouts' own long-standing color choice, not
//   something task T1/T2 introduced, and it was simply never exercised with
//   real contact/copyright content before (`full-matrix-contrast.test.ts`'s
//   own file header: deliberately meta-free; `audit-baseline.test.ts`
//   auto-picks a layout, unlikely to land on this exact pairing). Out of
//   this task's contract (which scopes the forced audit to overflow/
//   out-of-bounds/overlap) and orthogonal to the theme-structure wave's own
//   change — flagged here for whoever next owns contrast-policy cleanup,
//   not fixed or allowlisted by this task.
//   **Resolved (contrast-policy wave, Task T1):** both `COPYRIGHT_FAINT`
//   orphan constants are gone, replaced by `metaInk(colors.muted, bg)`
//   (`../svg/ink.ts`) tagged `data-contrast-tier="meta"` — see
//   `ending-banner-ending.tsx`/`ending-rail-ending.tsx`'s own rewritten
//   header comments for the new ruling (docs/contrast-system.md's B-tier
//   meta-information-text policy) and `deck-audit.test.ts`'s "meta" tests
//   for the audit-side mechanism. This exact fixture (consulting/
//   banner-ending, academic/rail-ending, real contact/copyright meta) no
//   longer produces a low-contrast finding. Left in place, not deleted —
//   git archaeology for why this bullet used to matter.
//   Note also: this comment's own numbers were transposed at authoring time
//   — real measurement (`findContrastIssues` against the actual rendered
//   markup) puts `consulting/banner-ending` at 3.22:1 and
//   `academic/rail-ending` at 2.93:1, the reverse of the labels above. The
//   ratios themselves were never wrong, only which theme/layout pair
//   they were filed under — carried into `.issues/roadmap.md` and
//   `.issues/2026-07-28-contrast-policy/plan.md` unchecked. See
//   task-1-report.md for the correction.
// - `low-contrast` on `runway/fashion-chapter`'s org label (4.06:1, needs
//   4.5:1): the same shape a former `tech/fashion-masthead` ALLOWLIST entry
//   used to adjudicate (~4.16:1, "a rounding distance under the floor,
//   deferred to a future theme-polish pass"). That entry is gone now
//   (fashion-masthead metaInk migration,
//   `.issues/2026-08-04-fashion-masthead-metaink/task-1-report.md`) — its
//   own layout migrated to B-tier `metaInk`, measured 3:1 instead of the
//   old 4.5:1 body line. `fashion-chapter`'s org label is a separate code
//   path (different file, different background token) that migration
//   deliberately left untouched: it already clears the real B-tier 3:1
//   floor (4.056:1, the worst case across all 16 themes), so it's not a
//   current defect, just still deferred theme-polish scope.
