// @vitest-environment jsdom
//
// Theme-structure wave, task T3 (`.issues/2026-07-26-theme-structure/plan.md`)
// — the wave's acceptance suite: measurable cross-theme layout divergence,
// determinism, the undeclared-theme byte-identity control group, the
// selection-time hard boundary, and the forced theme×archetype stress audit
// that closes the coverage gap the T2 review found (10 of 18 newly-declared
// tendency ids were never auto-picked by any theme×STRESS_DECKS combination,
// the other 8 hit exactly once — "a theme's newly-favored archetype
// rendering pathological content" was essentially unaudited).
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { PptxIR, Slide } from "@/ir"
import type { Strategy } from "@/narrative"
import { renderSlideSvg } from "../api"
import { auditDeck, type AuditFinding } from "../svg/audit/deck-audit"
import { CJK_LONG, MIXED_LONG, STRESS_DECKS } from "../svg/audit/stress-fixtures"
import { resolveArchetypeId, resolveEffectiveLayoutId } from "../svg/layout-selection"
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

it("sanity: 8 themes declare layoutTendencies, 7 don't (task T2's 6 + themes-16 wave task T1's pulse + task T2's terra — if this drifts, the numbers this file pins below must be re-measured, not silently kept)", () => {
  expect(DECLARED_THEME_IDS).toHaveLength(8)
  expect(UNDECLARED_THEME_IDS).toHaveLength(7)
})

// ── 1. Divergence test ──

describe("cross-theme layout divergence (the plan's core defect)", () => {
  it("resolves NOT-all-identical layout sequences across the 15 canonical themes for a fixed IR + fixed seed", () => {
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
    // task T1's pulse + task T2's terra, the 8th declaring theme): each of
    // the 8 declared themes (consulting/academic/journal/insight/tech/
    // runway/pulse/terra) resolves its own distinct sequence, and the 7
    // undeclared themes still share the single pre-wave sequence — 8 + 1 = 9
    // distinct sequences total (re-measured after terra landed — `pnpm exec
    // tsx` against a real resolve of all 15 canonical themes, see
    // task-2-report.md).
    expect(distinct.size).toBe(9)
  })

  it("every declared theme's sequence differs from every other declared theme's (none of the 8 are accidentally colliding with each other)", () => {
    const sequences = DECLARED_THEME_IDS.map((id) => JSON.stringify(resolveSequence(id, 1)))
    expect(new Set(sequences).size).toBe(DECLARED_THEME_IDS.length)
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

const FIXTURE_SEEDS = [1, 2, 3, 4, 5]

describe("control-group byte identity (migration-period guard — deletable once the wave is trusted)", () => {
  it("the fixture covers exactly the 7 undeclared themes, nothing more or less", () => {
    expect(Object.keys(preWaveFixture).sort()).toEqual([...UNDECLARED_THEME_IDS].sort())
  })

  it("the 7 undeclared themes resolve exactly as they did pre-wave (commit 709605a), across multiple seeds", () => {
    for (const themeId of UNDECLARED_THEME_IDS) {
      for (const seed of FIXTURE_SEEDS) {
        expect(resolveSequence(themeId, seed), `${themeId} seed=${seed}`).toEqual(preWaveFixture[themeId]?.[String(seed)])
      }
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
// today curates the full archetype set for all four page types —
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
            const picked = resolveArchetypeId(
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

// ── 5. Closing the T2 review's coverage gap: forced theme×archetype stress audit ──
//
// The T2 review instrumented the audit sweeps and found: 10 of the 18
// newly-declared tendency ids are never auto-picked by any theme×
// STRESS_DECKS combination, and the other 8 are hit exactly once —
// `full-matrix-contrast.test.ts` pins every theme×archetype pair but only
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

  it("sanity: exactly 23 declared theme×archetype combinations exist to force-audit (T2's original 6 themes × 3 declared ids + themes-16 wave task T1's pulse × 3 + task T2's terra × 2 — terra curates cover/ending only, no chapter id)", () => {
    expect(combos).toHaveLength(23)
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
//   archetype's own `COPYRIGHT_FAINT` — a hardcoded, pre-existing decorative
//   constant (see `ending-banner-ending.tsx`/`ending-rail-ending.tsx`'s own
//   "孤儿色处理" header comment, migrated verbatim from the original
//   `templates/*.tsx` sources, predating this wave) deliberately fainter
//   than `colors.muted` by design. Confirmed theme-wide-independent: the
//   same theme's `tone-adaptive-ending`/`masthead-ending` render the
//   identical copyright text with zero low-contrast finding — the gap is
//   specific to these two archetypes' own long-standing color choice, not
//   something task T1/T2 introduced, and it was simply never exercised with
//   real contact/copyright content before (`full-matrix-contrast.test.ts`'s
//   own file header: deliberately meta-free; `audit-baseline.test.ts`
//   auto-picks a layout, unlikely to land on this exact pairing). Out of
//   this task's contract (which scopes the forced audit to overflow/
//   out-of-bounds/overlap) and orthogonal to the theme-structure wave's own
//   change — flagged here for whoever next owns contrast-policy cleanup,
//   not fixed or allowlisted by this task.
// - `low-contrast` on `runway/fashion-chapter`'s org label (4.06:1, needs
//   4.5:1): a near-miss of the same shape `full-matrix-contrast.test.ts`'s
//   own `ALLOWLIST` already adjudicates for `tech/fashion-masthead`
//   (~4.16:1, "a rounding distance under the floor, deferred to a future
//   theme-polish pass") — same disposition applies here, not a new class of
//   defect this wave caused.
