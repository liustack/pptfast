---
summary: 'How an omitted slide layout gets picked (the four-step weighted seed stack) and how seed revision-stability works'
read_when:
  - debugging why a slide resolved to an unexpected layout
  - touching layout selection, seed derivation, or the validate/render parity path
  - adding a mode's layoutTendencies or a scenariosOnly-restricted layout
---

# Selection and seed

## The single source of truth

`resolveArchetypeId` (`src/svg/effective-layout.ts:85-118`) is the *only* place the selection mechanics live. `FullSlideSvg.tsx`'s render path and `ir-quality.ts`'s validate-time density gate both call it — never a second copy. The module's own header states the invariant this exists to protect: "what validate approved is what render draws." Do not duplicate this function's body — extend or call it. An explicit `slide.layout` short-circuits every step below unconditionally (bypasses curation, `scenariosOnly`, and weighting — it is a pin, not a preference).

## Four deterministic steps

1. **Full pool**: every registered archetype for the slide's page type (`LAYOUT_REGISTRY`, filtered to `kind: "archetype"`).
2. **theme.layouts boundary**: narrowed to the theme's curated set for that page type — the caller's job before calling `resolveArchetypeId` (full set for all 13 built-ins today, see `docs/concepts.md`).
3. **`scenariosOnly` hard filter** (`filterByScenariosOnly`, `src/svg/layouts/registry.ts:130-135`): drops any candidate whose allowlist excludes the resolved `mode`. Rare — no built-in layout sets it today.
4. **Scenario soft weight + seeded pick** (one combined step): `MODE_DEFINITIONS[mode].layoutTendencies` (`src/scenario/index.ts:98`) gets `TENDENCY_WEIGHT` (×3), everything else `BASE_WEIGHT` (×1) — both constants in `effective-layout.ts:39-40`, explicitly *not yet tuned* against a real corpus. `weightedPickBySeed` (`src/svg/variety.ts:69-90`) samples against the salt `` `${slideType}-archetype:${pageKey}` ``. `layoutTendencies` only ever names content-archetype ids — cover/chapter/ending are structurally unweighted (uniform sampling), not slide-type-special-cased.

**Adjacent anti-repetition** runs after: if the pick equals the immediately preceding slide's own resolved layout id and the pool has >1 member, redraw once against the same salt with that id removed (deterministic runner-up, local — it never touches any other page). This replaced an earlier same-type-ordinal rotation scheme (`pickBySeedRotating`, since deleted) that reshuffled non-adjacent pages on insert/reorder.

Note the collapse from an original 5-step design: content-fit filtering (candidate must physically fit the content) is **not** a selection-pool filter. Capacity is a `validate`-time `min(editorial budget, geometric capacity)` gate (`docs/concepts.md`'s capacity section) — selection never reads slide content, so editing a page's components can never flip its layout. Deliberate, not an oversight — see `effective-layout.ts`'s header comment.

## Seed: a three-tier ladder for revision stability

Deterministic selection alone (same input → same output) isn't enough for a *revision* workflow — editing one page's heading must not reshuffle every other page's auto-pick. `deckSeed`/`cachedDeckSeed` (`src/svg/variety.ts:22-53`) resolve, in order:

1. **Explicit `ir.seed`** — wins outright, stable across any edit.
2. **Deck-project-derived**: `assembleDeck` (`src/plan/assemble.ts:108-134`, `generateSeed`/`stableHash`) djb2-hashes `filename + the plan's ordered page-id sequence` — deliberately *not* heading/component content — when the plan omits `seed`. Written into `ir.seed` and returned as `generatedSeed` — the CLI shell surfaces it for the caller to copy back into `deck.plan.json`.
3. **Bare-IR fallback**: a content hash of `filename` + every slide's `heading` — legacy-compatible, but editing any heading reshuffles the whole deck's auto-picks. Documented cost of skipping steps 1-2, not a bug.

Each page's own salt uses its stable `page id` (`slide.id ?? String(index)`), not a same-type ordinal — insert/reorder no longer perturbs unrelated pages' sampling.

## Materialization

`assembleDeck`'s `materializeEffectiveLayouts` (`src/plan/assemble.ts:334-344`) runs `resolveEffectiveLayoutId` once per omitted-`layout` slide after the IR is fully schema-defaulted, writing the auto-pick straight into `deck.json`'s `layout` field — a page file's explicit pin is left untouched. This is why re-assembling with a stable seed reproduces the same picks: the deck-wide fold (`resolveDeckEffectiveLayoutIds`, `effective-layout.ts:210-224`) is memoized per `ir` object identity and walks the deck exactly once, in order, so adjacent anti-repetition sees each slide's *final* resolved id, not a partially-materialized one.
