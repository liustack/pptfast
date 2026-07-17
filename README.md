# pptfast

Stable, editable PPTX generation for AI agents — semantic IR in, native
DrawingML out.

[English] | [简体中文](./README.zh-CN.md)

## Why

Freeform SVG/HTML-to-PPTX pipelines have a high ceiling but an unstable floor — a weak model (or a strong one having an off turn) produces a deck that's broken, off-brand, or unreadable. pptfast trades freeform drawing for a controlled vocabulary: a semantic IR (zod schema), 13 built-in themes driven by design tokens, an archetype/block layout library with seeded variety, and native DrawingML output where every shape stays editable — not a picture pasted onto a slide.

A deck is really five things: a content model, a 2D layout, a visual style, motion, and a narrative. pptfast owns the last four — you (or your agent) own the content model by writing the IR.

## Install

```bash
npm install -g pptfast
pptfast --help
```

Node >= 18. Or build from source: `git clone https://github.com/liustack/pptfast.git && cd pptfast && pnpm install && pnpm build`.

## Quick start

```bash
node dist/cli.js validate examples/basic.json
# → OK — 5 slides, theme "consulting"
node dist/cli.js render examples/basic.json -o out/basic.pptx
# → wrote out/basic.pptx (5 slides, ~29 KB)
node dist/cli.js render examples/basic.json -o out/basic-tech.pptx --theme tech
node dist/cli.js preview examples/basic.json -o out/svgs   # SVG per slide, for a visual self-check
```

Or drive the SDK directly (Node requires `installNodePlatform()` once, before
any render call — the CLI does this for you):

```ts
import { installNodePlatform } from "pptfast/node"
import { generatePptx } from "pptfast"

installNodePlatform()
const bytes = await generatePptx(ir) // Uint8Array, ready to write to a .pptx
```

## CLI

| Command | Does |
|---|---|
| `render <ir.json> -o <out.pptx> [--theme <id>]` | Validate + render to a `.pptx` |
| `validate <ir.json>` | Check the IR, print page-scoped errors |
| `schema` | Print the IR JSON Schema |
| `themes [--json]` | List the 13 built-in themes |
| `preview <ir.json> -o <dir>` | Render each slide to a standalone SVG |

## The IR

Run `node dist/cli.js schema` for the full JSON Schema — feed it to a model before asking it to write IR. A deck (`PptxIR`) is a required `filename`, `version`, `theme`, `meta`, `assets`, an optional `brand`, and an ordered list of `slides`; each slide has a `type` (`cover`, `chapter`, `content`, `ending`) and, for content slides, a list of typed `blocks` (`bullets`, `kpi_cards`, `image`, `chart`, …). `assets` is `{ images: { [id]: { src, alt? } } }` — blocks reference images by `asset_id`, so the same image can be reused across slides without duplication.

## Themes

Each theme is a token set (color, type, motif) plus a manifest of which archetypes it allows — themes never touch layout code.

| id | label |
|---|---|
| `consulting` | Business Consulting |
| `enterprise` | Enterprise |
| `academic` | Academic |
| `insight` | Financial Insight |
| `campaign` | Marketing Campaign |
| `bloom` | Soft Bloom |
| `classroom` | Classroom |
| `ink` | Ink Wash |
| `tech` | Tech |
| `runway` | Fashion Runway |
| `journal` | Editorial Journal |
| `luxe` | Luxe |
| `heritage` | Heritage |

## For AI agents

The recommended loop for an agent generating a deck: read `pptfast schema` to learn the vocabulary, write an IR JSON, run `pptfast validate` and fix whatever it reports (errors carry a page number and a fixable-in-place message — the point is to close this loop without a human), then `pptfast render`. `pptfast preview` gives the agent SVG files it can look at to self-check layout before committing to a render. A Claude Code plugin that wraps this loop as a skill is planned for v0.2 (see Roadmap).

## Roadmap

- **v0.2** — Claude Code plugin + skills wrapping the render loop, design token overrides (`--tokens`), `init`/self-update commands.
- **v0.3** — theme-customization skill (brand colors → tokens), custom manifest slots, 1.0.
- **v0.4** — richer motion (more entrance animations), Office real-device testing, web playground.

## Credits

Icon primitives are extracted from [lucide](https://lucide.dev) (ISC License). pptfast itself was extracted from a production AI-deck-generation system and CJK-typography-tuned (full-width punctuation width, Chinese line breaking, a Chinese-first font stack) from day one.

## License

[MIT](./LICENSE)
