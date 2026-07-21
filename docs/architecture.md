---
summary: 'Architecture: five-dimension model, single-source SVG render chain, platform seam'
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
| Visual style | style tokens + theme definitions (curated layout sets + motif, 13 built-in themes) | `src/themes/` |
| Time-based interaction | `meta.animation` in the IR → slide transition / element entrance patches | `src/pptx/` |
| Narrative | narrative axes (strategy × pacing × audience, named presets) resolving editorial discipline, plus a first-class spec artifact (`deck.spec.json` — locked page order/type/heading, strategy-aware hard gates via `spec validate`) that `assembleDeck`/`disassembleDeck` materialize to and from IR, driving a six-phase spec→fill skill methodology for slide sequencing | `src/plan/`, `src/narrative/`, `skills/` |

The core insight, carried over from the production system pptfast was extracted
from: **visual variety comes from tokens × archetype library × seed — not
freeform drawing.** Swapping only color tokens (the shadcn-style reskin) still
converges on sameness. The archetype library is what raises the ceiling.

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
(`ImagePages.tsx`) — resolves a real asset first. When one is missing it
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
that type), and as of the post-v0.3 W8 fix round **all 13 built-ins point
every page type there** — the last three chapter-only curation exclusions
(bloom/classroom/heritage excluding `fashion-chapter`, an artifact of
`readableOn`'s old fixed-luminance threshold) were reverted once `src/svg/ink.ts`'s
real dual-ink contrast comparison confirmed all three clear 3:1 without the
exclusion (`src/themes/definitions.ts:70-95` has the full history). Narrowing
a page type below the full set is still supported and stays a deliberate
curation act, not a requirement — see `docs/contrast-system.md` for why a
narrowing usually turns out to be a contrast bug in disguise rather than a
real design constraint. The SDK registration seam (`registerTheme`,
same file) mirrors the full-set default: its `layouts` argument, and each of
its four page-type entries, are independently optional and fall back to the
same full set when omitted. Archetypes and components read only from tokens,
so no archetype file changes.

See `docs/concepts.md` for the fuller theme/layout/component/narrative
vocabulary this section assumes.
