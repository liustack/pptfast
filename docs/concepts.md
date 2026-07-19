---
summary: 'v4 concept model: theme/layout/component/narrative, the capacity dual-ownership split, and the frozen v4 IR schema'
read_when:
  - first time touching the pptfast vocabulary (theme/layout/component/narrative)
  - adding a theme, layout, or component
  - unsure whether a rule belongs to pacing (editorial) or layout (geometric) capacity
---

# Concepts

Four nouns, each owned by exactly one layer. This doc is the map — `docs/selection-and-seed.md` and `docs/contrast-system.md` go deep on two of the mechanisms that sit on top of it.

## theme

`{ id, style, brand, layouts }` — the distributable, top-level unit (`ThemeDefinition`, `src/themes/definitions.ts:18-43`). `style` is pure design tokens (color/type/radius/spacing — `StyleTokens`, `src/themes/tokens.ts`), `brand` is identity chrome filled into a layout's optional slots (logo/footer/page-number — no slideMaster, a layout with no slot for a brand element just omits it), `layouts` is the curated layout set per page type. 13 built-ins (`BUILTIN_THEME_IDS`, `src/ir/index.ts:8`), all pointing every page type at the **full** registered-archetype set for that type (`FULL_LAYOUTS`, `src/themes/definitions.ts:63-68`) — none of the 13 narrows any more (the last curation exclusions were reverted once `src/svg/ink.ts`'s contrast fix made every archetype's text adapt to its actual background — see `docs/contrast-system.md`). `THEME_DEFINITIONS` (same file) is the record every consumer reads. `registerTheme` (`src/themes/registered-themes.ts`) is the SDK extension seam for a caller-defined theme, `layouts` optional there too, defaulting to the same full set per page type.

## layout

A page-level template with named slots — `LayoutDefinition` (`src/svg/layouts/registry.ts:99-123`): `id`, `kind` (`"archetype" | "takeover"`), `slideTypes`, `slots` (each a `{ name, accepts, capacity? }`), an optional `arrangements` allowlist, and an optional `scenariosOnly` strategy allowlist (the field itself keeps its pre-rename name — an internal registry detail, not part of the public narrative vocabulary). `LAYOUT_REGISTRY` (same file) holds 30 archetypes + 4 image takeovers (`image-split`/`image-top`/`image-bottom`/`image-annotate` — bespoke full-bleed layouts requiring an `image` component, dispatched outside the normal archetype pool, see `resolveOneEffectiveLayoutId` in `src/svg/effective-layout.ts:168-206`). A slot's `capacity` (present only on the `body` slot of content archetypes) is the layout's declared geometric ceiling — bento-panel's is 6, every other content archetype's is 4.

## component

The 28 typed units that fill a slot — the IR's discriminated `Component` union (`COMPONENT_TYPES`, `src/ir/index.ts`, derived from the schema itself, not hand-copied): `bullets`, `paragraph`, `quote`, `callout`, `code`, `kpi_cards`, `chart`, `flowchart`, `architecture`, `timeline`, `comparison`, `icon_cards`, `row_cards`, `steps`, `rings`, `numbered_cards`, `roadmap`, `matrix`, `insight_panel`, `verdict_banner`, `citation`, `image`, `image_grid`, `image_compare`, `swot`, `bmc`, `waterfall`, `gantt`. Each has one render component under `src/svg/components/`. `swot`/`bmc`/`waterfall`/`gantt` are *full-body* components (`FULL_BODY_TYPES`, `src/svg/component-traits.ts`) — each must be the sole component on its slide (`checkFullBodyExclusivity`, `src/api.ts`) and fills the entire content rect itself rather than stacking alongside siblings.

## narrative

Three axes — `strategy` (5-way argument style), `pacing` (3-way density/typographic tier), `audience` (tone-only, no render effect yet) — `NarrativeProfile`, `src/scenario/index.ts:63-67`. 7 named presets (`NARRATIVE_PRESETS`, same file:299, each carrying soft `themeRecommendations`) plus a per-axis default chain (`resolveNarrative`, `src/scenario/index.ts:378-412`: omission → default, typo → hard `PptfastError`). `strategy` feeds layout selection (`docs/selection-and-seed.md`), and `pacing` feeds the capacity split below.

Renamed from `scenario` (`mode`/`delivery`) in the vocabulary-v4 rewrite (spec: `.issues/specs/2026-07-19-pptfast-narrative-spec-vocabulary.md`) — `mode` was too generic a name for what it actually controls (argument structure), and `delivery` conflated density, tier, and mode of address into one axis. `audience` keeps its original name and values unchanged. A v4-labeled document that still writes the pre-rename field names or enum values (`scenario`, `mode`, `delivery`, `mode: "narrative"`, `delivery: "text"`/`"presentation"`) is not rejected — `normalizeNarrativeAliases` (`src/ir/field-aliases.ts:342-359`) rescues it the same way component field-name typos already get rescued, printing a `path: alias → canonical` note (spec §15.4). A v3-versioned document is unaffected by this rescue and still hard-rejects at `validateIr` with a migration pointer, before the alias rescue ever runs — the rename rescue only ever fires for a document already on the v4 track.

## Capacity: dual ownership

Two independently-owned ceilings, `min()`'d together at validate time — never one table:

- **Editorial budget** (pacing, content discipline — "how many things belong here"): `PACING_BUDGETS[pacing]` (`src/scenario/index.ts:262-266`) — `maxComponentsPerSlide` and the bullets item/length caps, plus `bodyBaselinePx` (the paragraph/bullets/callout trio's sole font-size input, nothing else): `dense`=20px/5 components/6×48-char bullets, `balanced`=24px/4/5×40 (the narrative default), `spacious`=32px/3/4×30.
- **Geometric capacity** (layout, physical fact — "how many things fit"): the resolved layout's `body` slot `capacity` (`resolveEffectiveLayoutBodyCapacity`, `src/svg/effective-layout.ts`).

`ir-quality.ts`'s density gate takes `min(editorial, geometric)`. This is why validate must resolve the same layout selection render will use — the parity discipline `docs/selection-and-seed.md` documents.

A slide's optional `notes` (speaker notes, `src/ir/index.ts`) sits outside this split entirely — content layer, not geometry: it never reaches the canvas SVG, so it carries nothing for either ceiling to measure.

## v4 schema freeze

`PptxIRSchema` (`src/ir/index.ts:811-855`) is frozen as of the 0.4.0 npm release — future evolution is additive only (new optional fields, new enum members). Any breaking change ships under a new top-level `version` value with the same hard-reject-and-migration treatment v3 got. `version` now defaults to `"4"` (an omitted version is v4, not v3), `filename`/`narrative`/`theme` are all optional with schema-level defaults (`"presentation"`/general preset/`consulting`) — see `src/ir/index.ts` for the full defaulting chain and README's "The IR" section for the user-facing field list.

## Settled decisions — do not relitigate

Foundational adjudications, carried forward unchanged by the vocabulary-v4 rename. Proposals that contradict these need an explicit product decision, not a wave plan:

- **No slideMaster, ever (Keynote-style).** Brand chrome is drawn flat into each slide's SVG through a layout's optional slots. The real `.pptx` slideMaster is intentionally near-empty. Enterprise or brand adaptation means `theme.brand` + style tokens + `registerTheme` — never PPTX template import or master adaptation, which belong to a different product category.
- **Every revision flows through the deck project's gates.** The single source of truth is `deck.spec.json` + `pages/*.json`, and every edit passes `validate`/`audit`. Preview stays read-only by design — shipped: `preview.html` overlays `audit` findings and offers in-page annotations that export as a `revision-request.json`, but that file is only ever a set of requests for an agent to route into `pages/*.json`, never a write path of its own (`docs/deck-projects.md`'s six-phase workflow). A full in-preview editor is deliberately deferred, and this layered design is exactly what made the annotation loop a natural extension rather than a rewrite.
- **The model owns semantics, the engine owns geometry.** No workflow may ask a model to emit coordinates, pixel sizes, or free-form SVG. Weak-model stability is the product's first invariant — capability additions that reintroduce render variance (e.g. native PowerPoint chart internals the audit cannot measure) ship as explicit opt-ins, never defaults.
