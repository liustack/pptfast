---
summary: 'Architecture: five-dimension model, single-source SVG render chain, platform seam'
read_when:
  - first time in this repo
  - adding styles/blocks/archetypes
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
| Content model | IR (zod schema, semantic blocks) | `src/ir/` |
| 2D layout | archetypes + blocks + capacity tables + seeded variety | `src/svg/` |
| Visual style | design tokens + manifest (13 built-in styles) | `src/styles/` |
| Time-based interaction | `meta.animation` in the IR → slide transition / element entrance patches | `src/pptx/` |
| Narrative | two-phase plan→fill skill methodology (v0.2) | `skills/` |

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
  → pptxgenjs + JSZip patches (animations, gradients, media dedupe)
  → .pptx bytes
```

`renderSlideSvg` and `generatePptx` both start from the same `FullSlideSvg`
component — the SDK has no second, cheaper rendering path to fall out of sync.

## Platform seam

`src/index.ts` and everything it imports must stay usable in a browser: no
`commander`, no `linkedom`, no `sharp`. Two seams in `src/platform/registry.ts`
(`domParser`, `recodeImageToPng`) are `undefined` until something calls
`installPlatform()`. `src/platform/node.ts` supplies the Node implementation
(linkedom for DOM parsing, sharp for image re-encoding) via
`installNodePlatform()` — the CLI calls it on startup. SDK consumers running in
Node must call it themselves before rendering.

## Adding a style

A new style is tokens + a master config, never new render code: add a
`ThemeTokens` object under `src/styles/`, register it in `STYLE_DEFINITIONS`
(`src/styles/styles.ts`) and its id in `BUILTIN_STYLE_IDS`
(`src/ir/index.ts`). Archetypes and blocks read only from tokens, so no
archetype file changes.
