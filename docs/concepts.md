---
summary: 'v0.3 concept model: theme/layout/component/scenario, the capacity dual-ownership split, and the frozen v3 IR schema'
read_when:
  - first time touching the v0.3 vocabulary (theme/layout/component/scenario)
  - adding a theme, layout, or component
  - unsure whether a rule belongs to delivery (editorial) or layout (geometric) capacity
---

# Concepts

Four nouns, each owned by exactly one layer. This doc is the map — `docs/selection-and-seed.md` and `docs/contrast-system.md` go deep on two of the mechanisms that sit on top of it.

## theme

`{ id, style, brand, layouts }` — the distributable, top-level unit (`ThemeDefinition`, `src/themes/definitions.ts:18-43`). `style` is pure design tokens (color/type/radius/spacing — `StyleTokens`, `src/themes/tokens.ts`), `brand` is identity chrome filled into a layout's optional slots (logo/footer/page-number — no slideMaster, a layout with no slot for a brand element just omits it), `layouts` is the curated layout set per page type. 13 built-ins (`BUILTIN_THEME_IDS`, `src/ir/index.ts:8`), all pointing every page type at the **full** registered-archetype set for that type (`FULL_LAYOUTS`, `src/themes/definitions.ts:63-68`) — none of the 13 narrows any more (the last curation exclusions were reverted once `src/svg/ink.ts`'s contrast fix made every archetype's text adapt to its actual background — see `docs/contrast-system.md`). `THEME_DEFINITIONS` (same file) is the record every consumer reads. `registerTheme` (`src/themes/registered-themes.ts`) is the SDK extension seam for a caller-defined theme, `layouts` optional there too, defaulting to the same full set per page type.

## layout

A page-level template with named slots — `LayoutDefinition` (`src/svg/layouts/registry.ts:97-121`): `id`, `kind` (`"archetype" | "takeover"`), `slideTypes`, `slots` (each a `{ name, accepts, capacity? }`), an optional `arrangements` allowlist, and an optional `scenariosOnly` mode allowlist. `LAYOUT_REGISTRY` (same file) holds 30 archetypes + 4 image takeovers (`image-split`/`image-top`/`image-bottom`/`image-annotate` — bespoke full-bleed layouts requiring an `image` component, dispatched outside the normal archetype pool, see `resolveOneEffectiveLayoutId` in `src/svg/effective-layout.ts:166-196`). A slot's `capacity` (present only on the `body` slot of content archetypes) is the layout's declared geometric ceiling — bento-panel's is 6, every other content archetype's is 4.

## component

The 24 typed units that fill a slot — the IR's discriminated `Component` union (`COMPONENT_TYPES`, `src/ir/index.ts:567`, derived from the schema itself, not hand-copied): `bullets`, `paragraph`, `quote`, `callout`, `code`, `kpi_cards`, `chart`, `flowchart`, `architecture`, `timeline`, `comparison`, `icon_cards`, `row_cards`, `steps`, `rings`, `numbered_cards`, `roadmap`, `matrix`, `insight_panel`, `verdict_banner`, `citation`, `image`, `image_grid`, `image_compare`. Each has one render component under `src/svg/components/`.

## scenario

Three narrative axes — `mode` (5-way argument style), `delivery` (3-way density/typographic tier), `audience` (tone-only, no render effect yet) — `ScenarioAxes`, `src/scenario/index.ts:43-47`. 7 named presets (`SCENARIO_PRESETS`, same file, each carrying soft `themeRecommendations`) plus a per-axis default chain (`resolveScenario`, `src/scenario/index.ts:319-353`: omission → default, typo → hard `PptfastError`). `mode` feeds layout selection (`docs/selection-and-seed.md`), and `delivery` feeds the capacity split below.

## Capacity: dual ownership

Two independently-owned ceilings, `min()`'d together at validate time — never one table:

- **Editorial budget** (delivery, content discipline — "how many things belong here"): `DELIVERY_BUDGETS[delivery]` (`src/scenario/index.ts:218-222`) — `maxComponentsPerSlide` and the bullets item/length caps, plus `bodyBaselinePx` (the paragraph/bullets/callout trio's sole font-size input, nothing else): `text`=20px/5 components/6×48-char bullets, `balanced`=24px/4/5×40 (the scenario default), `presentation`=32px/3/4×30.
- **Geometric capacity** (layout, physical fact — "how many things fit"): the resolved layout's `body` slot `capacity` (`resolveEffectiveLayoutBodyCapacity`, `src/svg/effective-layout.ts:278-286`).

`ir-quality.ts`'s density gate takes `min(editorial, geometric)`. This is why validate must resolve the same layout selection render will use — the parity discipline `docs/selection-and-seed.md` documents.

A slide's optional `notes` (speaker notes, `src/ir/index.ts`) sits outside this split entirely — content layer, not geometry: it never reaches the canvas SVG, so it carries nothing for either ceiling to measure.

## v3 schema freeze

`PptxIRSchema` (`src/ir/index.ts:670-699`) is frozen as of the 0.3.0 npm release — future evolution is additive only (new optional fields, new enum members). Any breaking change ships under a new top-level `version` value with the same hard-reject-and-migration treatment v2 got. `version`/`filename`/`scenario`/`theme` are all optional with schema-level defaults (`"3"`/`"presentation"`/general preset/`consulting`) — see `src/ir/index.ts` for the full defaulting chain and README's "The IR" section for the user-facing field list.

## Settled decisions — do not relitigate

Foundational v0.3 adjudications. Proposals that contradict these need an explicit product decision, not a wave plan:

- **No slideMaster, ever (Keynote-style).** Brand chrome is drawn flat into each slide's SVG through a layout's optional slots. The real `.pptx` slideMaster is intentionally near-empty. Enterprise or brand adaptation means `theme.brand` + style tokens + `registerTheme` — never PPTX template import or master adaptation, which belong to a different product category.
- **Every revision flows through the deck project's gates.** The single source of truth is `deck.plan.json` + `pages/*.json`, and every edit passes `validate`/`audit`. Preview stays read-only by design — shipped: `preview.html` overlays `audit` findings and offers in-page annotations that export as a `revision-request.json`, but that file is only ever a set of requests for an agent to route into `pages/*.json`, never a write path of its own (`docs/deck-projects.md`'s six-phase workflow). A full in-preview editor is deliberately deferred, and this layered design is exactly what made the annotation loop a natural extension rather than a rewrite.
- **The model owns semantics, the engine owns geometry.** No workflow may ask a model to emit coordinates, pixel sizes, or free-form SVG. Weak-model stability is the product's first invariant — capability additions that reintroduce render variance (e.g. native PowerPoint chart internals the audit cannot measure) ship as explicit opt-ins, never defaults.
