---
summary: 'Architecture: five-dimension model, single-source SVG render chain, platform seam, domain-file conventions'
read_when:
  - first time in this repo
  - adding themes/components/layouts
  - touching the export pipeline
---

# Architecture

A PPT deck is, at bottom, five orthogonal concerns: a **content model**, a **2D
layout**, a **visual style**, **time-based interaction** (transitions/animation),
and a **narrative** that sequences slides. pptfast gives each one exactly one
owning layer, so a change in one dimension (say, a new style) never leaks into
another (layout code stays style-agnostic).

| Dimension | Owning layer | Location |
|---|---|---|
| Content model | IR (zod schema, semantic components) | `src/ir/` |
| 2D layout | layout registry (archetypes + image takeovers) + components + capacity tables + seeded variety | `src/svg/` |
| Visual style | style tokens + theme definitions (curated layout sets + motif + optional per-page-type layout tendencies, 17 built-in themes) | `src/themes/` |
| Time-based interaction | `meta.animation` in the IR → slide transition / element entrance patches | `src/pptx/` |
| Narrative | narrative axes (strategy × pacing × audience, named presets) resolving editorial discipline, plus a first-class spec artifact (`deck.spec.json` — locked page order/type/heading, strategy-aware hard gates via `spec validate`) that `assembleDeck`/`disassembleDeck` materialize to and from IR, driving a six-phase spec→fill skill methodology for slide sequencing | `src/spec/`, `src/narrative/`, `skills/` |

The core insight, carried over from the production system pptfast was extracted
from: **visual variety comes from tokens × archetype library × seed — not
freeform drawing.** Swapping only color tokens (the shadcn-style reskin) still
converges on sameness. The archetype library is what raises the ceiling — and,
as of the theme-structure wave, the theme axis is no longer a constant term in
that product: a theme's optional `layoutTendencies` (`docs/concepts.md`'s theme
section) softly steers *which* archetype the seeded pick favors, per page type,
so swapping only the theme (same IR, same seed) can now itself change the
realized layout sequence, not just the palette — see `docs/selection-and-seed.md`
for the mechanics.

## Render chain

Every slide renders through exactly one path, so preview and export can never
drift apart:

```
IR (validated) → FullSlideSvg (React → one flat 1280×720 SVG)
  → svg2pptx (per-element DrawingML ops)
  → pptxgenjs + JSZip patches (animations, gradients, ea font slots, media dedupe)
  → .pptx bytes
```

`renderSlideSvg` and `generatePptx` both start from the same `FullSlideSvg`
component — the SDK has no second, cheaper rendering path to fall out of sync.

### Fidelity ledger

`svg2pptx`'s dispatch (`svg2pptx/dispatch.ts`'s `leafToOp` → `svg2pptx/render.ts`'s
`renderOp`) is a closed table — every SVG leaf tag it recognizes lands on
exactly one native DrawingML shape, and any tag it doesn't recognize is
simply skipped (not drawn), never rasterized as a fallback:

| SVG leaf | Op kind | pptxgenjs call | PPTX result |
|---|---|---|---|
| `<rect>` | `shape` | `addShape("rect"\|"roundRect")` | native shape (editable) |
| `<circle>`/`<ellipse>` | `shape` | `addShape("ellipse")` | native shape (editable) |
| `<line>` | `line` | `addShape("line")` | native connector (editable) |
| `<polygon>`/`<polyline>`/`<path>` | `path` | `addShape("custGeom")` | native custom geometry (editable) |
| `<text>` | `text` | `addText` | native text box/run (editable) |
| `<image>` | `image` | `addImage` | `<p:pic>` — the only picture path |

Icons (`src/svg/icons.tsx`'s lucide path/circle/ellipse/rect/line/polyline/polygon
primitives) flow through this same table like any other vector markup and
land as custGeom or native shapes — never a picture.

**Invariant: the only rasterization exit in the export chain is `<image>`
backed by a real, resolved asset.** Every `<image>`-emitting call site — the
`image`/`image_grid`/`image_compare` components, `Background`'s asset
background, `BrandChrome`'s logo, and the 4 `image-*` takeover layouts
(`image-pages.tsx`) — resolves a real asset first. When one is missing it
degrades to a placeholder (a `<rect>` for a content image slot, or the logo
simply omitting itself) and never degrades to an `<image>`. Separately,
`rasterizeSvg` (next section) — the one function in this codebase that turns
SVG into pixels — is reachable only from the optional `--pixels` audit path
(`src/svg/audit/pixel-audit.ts`) — `generatePptxBlob`/`svg2pptx` never call
it. Rasterization and export are two disjoint subsystems by construction.
Regression-guarded by `src/pptx/generate-fidelity-export.test.ts`: a deck
covering every registered component type with zero real assets exports with
`ppt/media/` empty and zero `<p:pic>` anywhere. Adding one real image asset
moves the count by exactly +1, landing on exactly that slide.

## Platform seam

`src/index.ts` and everything it imports must stay usable in a browser: no
`commander`, no `linkedom`, no `sharp`. Three seams in `src/platform/registry.ts`
(`domParser`, `recodeImageToPng`, `rasterizeSvg`) are `undefined` until
something calls `installPlatform()`. `src/platform/node.ts` supplies the Node
implementation (linkedom for DOM parsing, sharp for image re-encoding and SVG
rasterization) via `installNodePlatform()` — the CLI calls it on startup. SDK
consumers running in Node must call it themselves before rendering.
`rasterizeSvg` (audit-v2 phase B, `docs/contrast-system.md`'s own pixel-layer
section) is the one seam with a real browser default too:
`src/platform/browser.ts`'s `rasterizeSvgInBrowser` (native `Image` +
`OffscreenCanvas`/`<canvas>`) is applied as a plain `?? fallback` at its one
call site (`src/svg/audit/pixel-audit.ts`), the same pattern `domParser`'s
own `?? globalThis.DOMParser` fallback already uses — not through
`installPlatform()`, since nothing calls that automatically in a browser.

### Distribution: the seam being real vs. the package being loadable

"`src/index.ts`'s closure is browser-safe" and "the published package loads
in a browser" are two different claims — the P2 browser-distribution wave
closed the gap between them. The seam above has always been true (verified
against a real Chrome tab, not just jsdom), but the default build
(`tsup.config.ts`'s `index`/`node`/`cli` entries) externalizes every
`dependencies` entry (`react`, `react-dom`, `zod`, `jszip`, `dagre`,
`pptxgenjs`) as bare ESM specifiers — correct for a bundler consumer
(Vite/webpack resolve them from `node_modules`, deduped against the rest of
the app), fatal for a bare `<script type="module">` (`Failed to resolve
module specifier "zod"` before a single line of the module runs — no
partial availability, a top-level `import` failure takes the whole module
down). `package.json`'s `exports` map now offers two additional, fully
self-contained subpaths built from the same `src/index.ts` closure, wired
through two more `tsup.config.ts` array entries (`platform: "browser"`,
`noExternal: [/.*/]`, `splitting: false`, so each is one file with zero
relative-chunk fetches and zero bare specifiers left to resolve):

- **`./browser`** (`dist/browser.js`) — the full engine, every dependency
  inlined (react + react-dom/server + zod + jszip + dagre + pptxgenjs, ~1.7 MB
  raw / ~455 KB gzip). `platform: "browser"` makes esbuild honor each
  dependency's own package.json `browser` field (pptxgenjs and jszip both
  ship one, remapping their Node-only `fs`/`https` code paths away) instead
  of resolving their Node/CJS main — real-Chrome-verified against
  `dist/index.js`'s underlying render/export/audit chain in an earlier
  investigation (`generatePptx`, `auditDeck`, `auditDeck({ pixels: true })`
  all functionally correct, byte-identical output to the Node CLI).
- **`./validate`** (`dist/validate.js`) — `validateIr` and nothing else
  reachable from the render/export chain, for an "embed a validator" page
  that has no reason to carry `react`/`pptxgenjs`/`jszip`/`dagre` at all
  (~730 KB raw / ~155 KB gzip, a fraction of `/browser`'s size). Its source,
  `src/validate.ts`, imports from `src/validate-core.ts` — a module carved
  out of what used to be all of `src/api.ts` — directly, not through
  `src/api.ts` itself (which also defines `renderSlideSvg`/`generatePptx`
  and statically imports `src/svg/render-slide.ts`/`src/pptx/generate.ts`).
  A first attempt re-exported the light subset through `src/api.ts` and
  relied on the bundler to tree-shake the unused `generatePptx`/
  `renderSlideSvg` bindings away — it didn't: esbuild's CJS-interop wrapper
  for jszip/react-dom's `require()`-based code kept their init closures in
  the output even though the two functions' own bodies were correctly
  eliminated. Importing `src/validate-core.ts` directly makes the exclusion
  a physical file-graph fact instead of a tree-shaking bet — `src/validate.ts`'s
  build never sees `src/api.ts`, `src/pptx/generate.ts`, or
  `src/svg/render-slide.ts` as input files at all, whether or not a future
  esbuild version's tree-shaking gets more aggressive about CJS interop.

The default `"."`/`"./node"` entries are unchanged — `dependencies` stay
external there, same as before this wave. `scripts/e2e.mts` (which already
runs after `pnpm build`) parses both new bundles post-build and asserts zero
surviving bare top-level import/export specifiers, generous size-budget
smoke bounds, and tree separation (`dist/validate.js` must not contain
`PptxGenJS`/`renderToStaticMarkup`/`JSZip`/`graphlib` — real bundled-code
markers, not the npm package-name substring, since minification drops the
latter but keeps distinctive API surface intact) — the regression guard for
the exact failure class a bare `<script type="module">` hits. See the
README's own Browser section for the consumer-facing quickstart and honest
caveats (assets must be `data:` URIs or CORS-readable `http(s)` URLs,
`--pixels`-equivalent auditing needs `OffscreenCanvas`).

## Domain files

Layouts and components are organized by domain — each one's own definition
lives beside (or across a matched pair of) files named for it — not
collected into one big literal table. Two registries/aggregators consume
these domain files by importing and combining them, never by holding the
content themselves:

- **A layout definition lives with its implementation.** Each of the 33
  single-layout archetypes exports `layoutDef: LayoutDefinition` at the
  bottom of its own `src/svg/archetypes/<name>.tsx` file, beside the JSX
  that draws it (`src/svg/image-pages.tsx` — one level above `archetypes/` — exports 4 uniquely-named ones instead,
  since one file implements all 4 image takeovers and they can't share the
  bare `layoutDef` name the 33 single-layout files use). `src/svg/layouts/registry.ts`
  imports every one and assembles `LAYOUT_REGISTRY` from them — "take one
  layout away whole" is a single-file operation, not a two-file
  archaeology dig.
- **A component is two same-named domain files, one per side of the
  IR/SVG boundary.** `src/ir/components/<name>.ts` exports `schema` (the
  zod shape), `aliases` (a `ComponentAliasSpec` — `{}` if the component
  declares no synonym-rescue rows) and `traits` (the render-trait
  declaration `component-traits.ts` aggregates). `src/svg/components/<name>.tsx`
  exports `renderDef` (`{ measure, render }`). Nothing about a component's
  shape, field aliasing, traits, or rendering lives anywhere but this pair.
- **Aggregator discipline.** Every table that spans domain files —
  `src/ir/index.ts`'s `ComponentSchema` discriminated union,
  `src/svg/layouts/registry.ts`'s `LAYOUT_REGISTRY`,
  `src/svg/components/index.tsx`'s `RENDER_DEFS`,
  `src/svg/component-traits.ts`'s `ALL_TRAITS`, `src/ir/field-aliases.ts`'s
  two alias tables — does only computed construction over the imported
  domain values (unions, `Record`/`Set` building, lists derived from
  another structure, e.g. `COMPONENT_TYPES` from `ComponentSchema.options`)
  and never holds a hand-copied literal that could drift from what the
  domain file actually declares. `component-traits.ts`'s `EVIDENCE_TYPES`
  is the one deliberate exception: relative priority order across
  component types ("chart beats image beats comparison") is knowledge no
  single domain file can declare about itself, so the order stays
  hand-written there — each listed component's own domain file still
  declares the membership half (`traits.evidence: true`), and a test
  (`component-traits.test.ts`) asserts the two stay in sync.

**Adding a component** touches, at minimum, the 2 domain files above plus
6 points a normal `pnpm check` catches if skipped — a missing entry fails
the build or the test suite, never silently (this list was measured
against the most recent real addition, `data_table`, not predicted):

1. `src/ir/index.ts` — import the new schema, add it to `ComponentSchema`'s
   `z.discriminatedUnion` array
2. `src/svg/components/index.tsx` — import the new `renderDef`, add it to
   `RENDER_DEFS` (a total `Record<ComponentType, RenderDef>` — TypeScript
   rejects the object literal at compile time if any `ComponentType` is
   missing)
3. `src/svg/component-traits.ts` — import the new `traits`, add it to
   `ALL_TRAITS` (same total-`Record` compile guard)
4. `src/ir/corpus-coverage.test.ts` — the new type must be behaviorally
   exercised by the validation corpus at least once, either because an
   existing `examples/*.json`/`STRESS_DECKS` fixture already uses it, or
   because a new `COVERAGE_ENTRIES` `-valid`/`-tripwire` pair was added
   for it (the test fails red otherwise)
5. `src/pptx/generate-fidelity-export.test.ts` — `COMPONENT_BY_TYPE` is
   another total `Record<Component["type"], Component>`: the fidelity
   sweep needs one real instance of the new type (compile error if
   missing)
6. `src/svg/audit/full-matrix-contrast.test.ts` — `MUTED_SURFACE_CLASS`
   classifies every component type for the contrast sweep; an
   `Object.hasOwn` exhaustiveness test fails red until the new type is
   classified

Plus, only when they apply: a `src/ir/field-aliases.ts` row in either
alias table (only if the component needs a synonym rescue); an
`EVIDENCE_TYPES` insertion when `traits.evidence: true` (the position is
an editorial call, not mechanical); a `skills/pptfast/SKILL.md`
"Component selection" table row, so the authoring skill's own guidance
knows the type exists; any doc's component-count mention that reads as a
literal number rather than worded ("every component type"); and a
`STRESS_DECKS` fixture entry if the type needs render-pressure coverage
beyond what the validation corpus already exercises.

## Adding a theme

A new theme is style tokens + an optional brand config, never new render
code: add a `StyleTokens` object under `src/themes/`, then register its id
and tokens in `CANONICAL_THEME_IDS` / `THEME_STYLES` (`src/themes/index.ts`)
and its id in `BUILTIN_THEME_IDS` (`src/ir/index.ts`). `THEME_DEFINITIONS`
(`src/themes/definitions.ts`) derives the theme entry from those
automatically — add a `BRANDS` entry there only if the theme needs
non-default brand chrome. A new theme also needs a `layouts` entry in
`LAYOUTS` (`src/themes/definitions.ts`) — that record stays total over
`CanonicalThemeId`, so a missing entry fails to compile. Each of the four
page types defaults to `FULL_LAYOUTS.<type>` (every registered archetype for
that type), and as of the post-v0.3 W8 fix round **all 17 built-ins point
every page type there** — the last three chapter-only curation exclusions
(bloom/classroom/heritage excluding `fashion-chapter`, an artifact of
`readableOn`'s old fixed-luminance threshold) were reverted once `src/svg/ink.ts`'s
real dual-ink contrast comparison confirmed all three clear 3:1 without the
exclusion (`src/themes/definitions.ts:121-146` has the full history). Narrowing
a page type below the full set is still supported and stays a deliberate
curation act, not a requirement — see `docs/contrast-system.md` for why a
narrowing usually turns out to be a contrast bug in disguise rather than a
real design constraint. The SDK registration seam (`registerTheme`,
same file) mirrors the full-set default: its `layouts` argument, and each of
its four page-type entries, are independently optional and fall back to the
same full set when omitted. Archetypes and components read only from tokens,
so no archetype file changes. A theme may also optionally declare
`layoutTendencies` (theme-structure wave) — a per-page-type soft weight over
ids already in that same page type's `layouts` entry, giving the new theme a
structural personality rather than only a palette; see `docs/concepts.md`'s
theme section and `docs/selection-and-seed.md` for the mechanics. Leaving it
undeclared (the default) is a legitimate choice, not a lesser one — several
built-ins do.

See `docs/concepts.md` for the fuller theme/layout/component/narrative
vocabulary this section assumes.
