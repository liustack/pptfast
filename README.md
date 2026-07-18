# pptfast

Stable, editable PPTX generation for AI agents — semantic IR in, native
DrawingML out.

[English] | [简体中文](./README.zh-CN.md)

## Why

Freeform SVG/HTML-to-PPTX pipelines have a high ceiling but an unstable floor — a weak model (or a strong one having an off turn) produces a deck that's broken, off-brand, or unreadable. pptfast trades freeform drawing for a controlled vocabulary: a semantic IR (zod schema), 13 built-in themes bundling a style (design tokens) and a brand (identity chrome), a layout-and-component library with seeded variety, and native DrawingML output where every shape stays editable — not a picture pasted onto a slide.

A deck is really five things: a content model, a 2D layout, a visual style, motion, and a narrative. pptfast owns the last four — you (or your agent) own the content model by writing the IR.

## Install

```bash
npm install -g @liustack/pptfast
pptfast --help
```

Node >= 18. Or build from source: `git clone https://github.com/liustack/pptfast.git && cd pptfast && pnpm install && pnpm build`.

### As a Claude Code plugin

The repo doubles as a Claude Code plugin that ships the deck-generation skill:

```
/plugin marketplace add liustack/pptfast
/plugin install pptfast@pptfast
/reload-plugins
```

The skill drives the CLI, so install the CLI too (`npm install -g @liustack/pptfast`).

### Other agents (Codex, etc.)

[`skills/pptfast/SKILL.md`](./skills/pptfast/SKILL.md) is a self-contained Markdown playbook — reference it from your agent's context (e.g. `AGENTS.md`) and it teaches the same schema → outline → validate → render loop.

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
import { installNodePlatform } from "@liustack/pptfast/node"
import { generatePptx } from "@liustack/pptfast"

installNodePlatform()
const bytes = await generatePptx(ir) // Uint8Array, ready to write to a .pptx
```

## CLI

| Command | Does |
|---|---|
| `render <target> -o <out.pptx> [--theme <id>] [--style <file>] [--draft]` | Validate + render to a `.pptx` — `target` is an IR JSON file, a deck project directory, or a bare deck name (see Deck projects) |
| `validate <target>` | Check the IR, print page-scoped errors — same `target` forms as `render` |
| `audit <target> [--json]` | Deterministic geometry review (overflow/out-of-bounds/low-contrast/overlap) — same `target` forms as `render`, exits 1 when it finds anything (see Auditing) |
| `plan validate <plan.json>` | Check a deck plan against the schema and mode-aware hard gates (see Deck projects) |
| `assemble <dir\|name> [-o <file>]` | Materialize a deck project directory into a single IR JSON file |
| `disassemble <ir.json> -o <dir>` | Split an IR JSON file into a deck project directory |
| `schema [--style \| --plan]` | Print the IR JSON Schema (or the style-override schema, or the deck plan schema) |
| `themes [--json]` | List the 13 built-in themes |
| `scenarios [--json]` | List named scenario presets (mode/delivery/audience axes + theme recommendations) |
| `preview <target> -o <dir>` | Render each slide to a standalone SVG — same `target` forms as `render`, never gated on placeholder pages |
| `init` | Scaffold `pptfast.config.json` |
| `check-update` / `self-update` | Check npm for a newer release / update the global install |

## The IR

Run `node dist/cli.js schema` for the full JSON Schema — feed it to a model before asking it to write IR. A deck (`PptxIR`) has `version` (currently `"3"`), `filename`, an optional `scenario` (a preset id string or a partial axes object — see Scenarios below), `theme` (`id` plus optional `style`/`brand` overrides), `meta`, and `assets` — all optional with sane defaults — plus a separate optional `brand` (logo placement) and a required ordered list of `slides`. Each slide has a `type` (`cover`, `chapter`, `content`, `ending`), an optional `layout` (an explicit page-layout id that always wins over auto-selection — omit it and pptfast auto-selects one from the theme's curated set), an optional `arrangement` (how a content slide's body is laid out, e.g. `two_column`, `kpi_focus`), and a list of typed `components` (`bullets`, `kpi_cards`, `image`, `chart`, …). `assets` is `{ images: { [id]: { src, alt? } } }` — components reference images by `asset_id`, so the same image can be reused across slides without duplication.

A deck also carries an optional `seed` (an integer that keeps auto-selected layouts stable across revisions, derived deterministically the first time a plan is assembled when omitted — see Deck projects below). Any slide may set a stable `id` (what plan pages and validation error messages reference it by) and `placeholder: true` (a slide with no content yet — injected by `assemble` for a plan page nobody has filled in, skipped by the content-quality checks, and blocking `render` unless `--draft`). Field names that commonly drift between a model's output and the schema (25 synonym pairs across component types, e.g. kpi `title`→`label`, quote `content`→`text`) are silently normalized to the canonical name at validate time — `validate`/`render`/`preview` print a note listing what changed, never a hard error.

## Themes

A theme bundles a style (design tokens), a brand (identity chrome), and a curated layout set — the 13 built-ins below. Override the style (`--style`) to re-color a theme.

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

## Scenarios

A scenario is three narrative axes, independent of theme (visual style), that set editorial discipline: `mode` (how the argument is built — `pyramid`, `narrative`, `instructional`, `showcase`, `briefing`), `delivery` (how dense the content is — `text`, `balanced`, `presentation`), and `audience` (a tone anchor — `executive`, `technical`, `customer`, `public`, no rendering effect yet). Set the IR's top-level `scenario` to a named preset string (e.g. `"boardroom-report"`) or a partial axes object (e.g. `{ "delivery": "presentation" }`) — an omitted axis, or an omitted `scenario` field entirely, falls back to `general` (`briefing` × `balanced` × `public`). An unknown preset name or axis value is a hard validate error listing what's available.

`delivery` drives the content-quality gate: the per-slide component budget and the bullets budget (item count and per-item length) both tighten from `text` toward `presentation` — density is additionally capped by whichever layout the slide resolves to, whichever ceiling is tighter. `pptfast validate` reports the exact numbers that applied to each slide.

Run `pptfast scenarios [--json]` to list the named presets (each carries soft theme recommendations — a starting suggestion, never a constraint) plus the raw axes tables.

## Style overrides & project config

Override the built-in palette without forking a theme: write a style JSON
(schema: `pptfast schema --style`) and pass it per-render
(`--style brand.json`), or pin it project-wide in a `pptfast.config.json`
(found by walking up from cwd, scaffold one with `pptfast init`).
Precedence: CLI flag > project config file > user config file > IR (Deck
projects below has the full four-layer chain). The IR itself can carry the
same override in `theme.style` for fully self-contained decks.

```json
{ "theme": "consulting", "style": { "colors": { "primary": "#0B5FFF", "accent": "#FF6A00" } } }
```

## Deck projects

A deck can be authored two ways, and every command that takes IR accepts either: a single **IR JSON file** (everything above), or a **deck project directory** — the same content split across files so an agent can plan a deck's structure first, then write and revise it page by page instead of holding one growing JSON blob in context.

```
my-deck/
  deck.plan.json        the locked plan: page order, type, and heading for every page
  pages/<page-id>.json  one file per filled page (components/layout/arrangement/background/image_side/footnote)
  assets/                local images, auto-registered by filename (image id = filename without extension)
```

`deck.plan.json` validates on its own, before any page exists: `pptfast plan validate deck.plan.json` checks the schema plus mode-aware hard gates (boundary pages, heading length, rhythm rotation, page count vs. delivery). A plan page with no matching `pages/<id>.json` becomes a **placeholder** slide — heading only, not missing — so a partially-written deck always assembles and previews. `pptfast render` refuses to export a deck with unfilled placeholders unless you pass `--draft`. `pptfast preview` never gates on them.

`pptfast assemble <dir>` materializes plan + pages + assets into a single IR JSON file (`deck.json` by default). `pptfast disassemble <ir.json> -o <dir>` does the reverse (documented-lossy — plan-only fields like `rhythm`/`focus` have no IR-side home to recover). `render`/`validate`/`preview` accept a directory directly too, assembling in memory first.

Deck project directories can be referenced by a bare name instead of a path — `pptfast render my-deck -o out.pptx` resolves `my-deck` under `$PPTFAST_HOME/decks` (`$PPTFAST_HOME` defaults to `~/.pptfast`) when no local file or directory of that name exists. All deck defaults resolve in four layers, highest wins: CLI flag > project `pptfast.config.json` > user `~/.pptfast/config.json` > the deck's own values. Both config layers can set `decksDir` to redirect where bare names resolve — the project layer's value resolves against that config file's own directory (for a team that wants deck projects checked into the repo), the user layer's against `$PPTFAST_HOME`. Project wins when both are set.

## Auditing

`pptfast audit <target> [--json]` renders every page off-screen and runs a deterministic geometry review — no LLM screenshot squinting, no variance. Four checks: **overflow** (text past its own box or column), **out-of-bounds** (past the page edge), **low-contrast** (WCAG relative-luminance ratio between text and its resolved background), and **overlap** (two components' regions substantially colliding). Advisory, not a hard gate — `validate` already rejects structurally invalid or over-dense decks. Audit catches what a valid deck can still get wrong at render time (an author-chosen near-background text color, two components whose combined content collides).

Run it once every page is filled, on the same `target` forms as `validate`/`render` (file, deck project directory, or bare name). Human output groups findings by page (`page 3 (p-kpi): [low-contrast] …`, each message carries a fix suggestion) plus a summary line. `--json` prints the full machine-readable report. The exit code alone is agent-judgeable: `0` clean, `1` when it finds anything — fix the flagged page and re-run `audit` alone, no need to re-render. Skipped placeholder pages are noted, the same "not missing, just not written yet" treatment used everywhere else.

```bash
pptfast audit examples/basic.json
# → audited 5 pages, 0 skipped, 0 findings
```

## For AI agents

The recommended loop for an agent generating a deck: read `pptfast schema` to learn the vocabulary, write an IR JSON, run `pptfast validate` and fix whatever it reports (errors carry a page number and a fixable-in-place message — the point is to close this loop without a human), then `pptfast audit` for the same kind of fixable-in-place feedback on what a *valid* deck can still get wrong at render time (overflow, low-contrast, overlap — exit code alone says whether it's clean), then `pptfast render`. `pptfast preview` gives the agent SVG files it can look at to self-check layout before committing to a render. The Claude Code plugin above wraps this loop as a skill ([`skills/pptfast/SKILL.md`](./skills/pptfast/SKILL.md)).

## Roadmap

- **v0.2** — Claude Code plugin + skill wrapping the render loop (shipped), design token overrides (`--style`), `init`/self-update commands.
- **v0.3** — theme-customization skill (brand colors → style), custom theme slots, 1.0.
- **v0.4** — richer motion (more entrance animations), Office real-device testing, web playground.

## Credits

Icon primitives are extracted from [lucide](https://lucide.dev) (ISC License). pptfast itself was extracted from a production AI-deck-generation system and CJK-typography-tuned (full-width punctuation width, Chinese line breaking, a Chinese-first font stack) from day one.

## License

[MIT](./LICENSE)
