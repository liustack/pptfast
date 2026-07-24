---
summary: 'How an omitted slide layout gets picked (the four-step weighted seed stack) and how seed revision-stability works'
read_when:
  - debugging why a slide resolved to an unexpected layout
  - touching layout selection, seed derivation, or the validate/render parity path
  - adding a strategy's layoutTendencies/identityTendencies, a beat's BEAT_TENDENCIES, or a narrativesOnly-restricted layout
---

# Selection and seed

## The single source of truth

`resolveArchetypeId` (`src/svg/layout-selection.ts:240`) is the *only* place the selection mechanics live. `full-slide-svg.tsx`'s render path and `ir-quality.ts`'s validate-time density gate both call it — never a second copy. The module's own header states the invariant this exists to protect: "what validate approved is what render draws." Do not duplicate this function's body — extend or call it. An explicit `slide.layout` short-circuits every step below unconditionally (bypasses curation, `narrativesOnly`, and weighting — it is a pin, not a preference).

## Four deterministic steps

1. **Full pool**: every registered archetype for the slide's page type (`LAYOUT_REGISTRY`, filtered to `kind: "archetype"`).
2. **theme.layouts boundary**: narrowed to the theme's curated set for that page type — the caller's job before calling `resolveArchetypeId` (full set for all 13 built-ins today, see `docs/concepts.md`).
3. **`narrativesOnly` hard filter** (`filterByNarrativesOnly`, `src/svg/layouts/registry.ts:132-137` — renamed from `scenariosOnly`/`filterByScenariosOnly` in the vocabulary-v4 rename's internal-name sweep, spec §16, an internal registry detail): drops any candidate whose allowlist excludes the resolved `strategy`. Rare — no built-in layout sets it today.
4. **Narrative soft weight combined with beat soft weight + seeded pick** (one combined step): the strategy weight source is picked per slide type (`tendencyIdsFor`, `layout-selection.ts`) — content reads `STRATEGY_DEFINITIONS[strategy].layoutTendencies` (`src/narrative/index.ts`), cover/chapter/ending each read their own slot of `STRATEGY_DEFINITIONS[strategy].identityTendencies` (P1 variety wave, task 3 — before this, no strategy's `layoutTendencies` ever named a non-content id, so cover/chapter/ending were structurally unweighted, uniform sampling — identity pages now get the same soft-weight treatment content pages have had since W4, via their own disjoint id namespace). Either source's tendency-set members get `TENDENCY_WEIGHT` (×3), everything else `BASE_WEIGHT` (×1) — both constants in `layout-selection.ts`, explicitly *not yet tuned* against a real corpus. A slide's optional `beat` (P1 variety wave, task 1 — `Slide.beat`, `src/ir/index.ts`) contributes a second, independent ×3/×1 weight via `BEAT_TENDENCIES`/`BEAT_TENDENCY_WEIGHT`/`BEAT_BASE_WEIGHT` (`layout-selection.ts`), combined with the strategy weight via **`Math.max`, not multiplication** (P1 fix round: a product measurably compounded whenever a strategy's own tendency set and a beat's tendency set agreed on the same archetype — storytelling × beat "breathing" both already favor `narrow-column`, which squared into ~53% realized share for that one archetype, N=5000 — the exact monotony this mechanism exists to prevent. `max` lets agreement corroborate without squaring, while disagreement still gives either layer's own weight through unreduced). An omitted `beat` contributes an implicit weight of 1 for every candidate, which `max` never lets exceed the strategy-only weight, so a deck that never declares `beat` selects and renders byte-identically to before this layer existed. `weightedPickBySeed` (`src/svg/variety.ts:69-90`) samples against the salt `` `${slideType}-archetype:${pageKey}` ``. `BEAT_TENDENCIES` only ever names content-archetype ids, so `beat` stays a structural no-op for cover/chapter/ending regardless of slide type — beat never weights identity pages, only strategy does now. Note `general`'s default axes resolve to strategy `briefing`, and `briefing` carries a real (non-empty) `identityTendencies` set like every other strategy — an omitted-narrative deck's identity-page picks are *not* uniform/tendency-free either, mirroring how `briefing`'s content `layoutTendencies` has never been tendency-free since W4.

**Adjacent anti-repetition** runs after: if the pick equals the immediately preceding slide's own resolved layout id and the pool has >1 member, redraw once against the same salt with that id removed (deterministic runner-up, local — it never touches any other page). This replaced an earlier same-type-ordinal rotation scheme (`pickBySeedRotating`, since deleted) that reshuffled non-adjacent pages on insert/reorder.

Note the collapse from an original 5-step design: content-fit filtering (candidate must physically fit the content) is **not** a selection-pool filter. Capacity is a `validate`-time `min(editorial budget, geometric capacity)` gate (`docs/concepts.md`'s capacity section) — selection never reads slide content, so editing a page's components can never flip its layout. Deliberate, not an oversight — see `layout-selection.ts`'s header comment.

## Seed: a three-tier ladder for revision stability

Deterministic selection alone (same input → same output) isn't enough for a *revision* workflow — editing one page's heading must not reshuffle every other page's auto-pick. `deckSeed`/`cachedDeckSeed` (`src/svg/variety.ts:22-50`) resolve, in order:

1. **Explicit `ir.seed`** — wins outright, stable across any edit.
2. **Deck-project-derived**: `assembleDeck` (`src/plan/assemble.ts:115-140`, `generateSeed`/`stableHash`) djb2-hashes `filename + the spec's ordered page-id sequence` — deliberately *not* heading/component content — when the spec omits `seed`. Written into `ir.seed` and returned as `generatedSeed` — the CLI shell surfaces it for the caller to copy back into `deck.spec.json`.
3. **Bare-IR fallback**: a content hash of `filename` + every slide's `heading` — legacy-compatible, but editing any heading reshuffles the whole deck's auto-picks. Documented cost of skipping steps 1-2, not a bug.

Each page's own salt uses its stable `page id` (`slide.id ?? String(index)`), not a same-type ordinal — insert/reorder no longer perturbs unrelated pages' sampling.

## Materialization

`assembleDeck`'s `materializeEffectiveLayouts` (`src/plan/assemble.ts:347`) runs `resolveEffectiveLayoutId` once per omitted-`layout` slide after the IR is fully schema-defaulted, writing the auto-pick straight into `deck.json`'s `layout` field — a page file's explicit pin is left untouched. This is why re-assembling with a stable seed reproduces the same picks: the deck-wide fold (`resolveDeckEffectiveLayoutIds`, `layout-selection.ts:390`) is memoized per `ir` object identity and walks the deck exactly once, in order, so adjacent anti-repetition sees each slide's *final* resolved id, not a partially-materialized one.
