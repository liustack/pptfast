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
| `spec validate <spec.json>` | Check a deck spec against the schema and strategy-aware hard gates (see Deck projects) |
| `assemble <dir\|name> [-o <file>]` | Materialize a deck project directory into a single IR JSON file |
| `disassemble <ir.json> -o <dir>` | Split an IR JSON file into a deck project directory |
| `schema [--style \| --spec]` | Print the IR JSON Schema (or the style-override schema, or the deck spec schema) |
| `themes [--json]` | List the 13 built-in themes |
| `narratives [--json]` | List named narrative presets (strategy/pacing/audience axes + theme recommendations) |
| `preview <target> -o <dir> [--html]` | Render each slide to a standalone SVG (`--html` also writes a self-contained `preview.html`) — same `target` forms as `render`, never gated on placeholder pages |
| `migrate <input> -o <output>` | Convert a v3 IR file to v4, or a `deck.plan.json` project directory to `deck.spec.json` — deterministic, no model call (see The IR and Deck projects) |
| `init` | Scaffold `pptfast.config.json` |
| `check-update` / `self-update` | Check npm for a newer release / update the global install |

## The IR

Run `node dist/cli.js schema` for the full JSON Schema — feed it to a model before asking it to write IR. A deck (`PptxIR`) has `version` (currently `"4"`, and now the default when omitted), `filename`, an optional `narrative` (a preset id string or a partial axes object — see Narratives below), `theme` (`id` plus optional `style`/`brand` overrides), `meta`, and `assets` — all optional with sane defaults — plus a separate optional `brand` (logo placement) and a required ordered list of `slides`. Each slide has a `type` (`cover`, `chapter`, `content`, `ending`), an optional `layout` (an explicit page-layout id that always wins over auto-selection — omit it and pptfast auto-selects one, see Layout selection below), an optional `arrangement` (how a content slide's body is laid out, e.g. `two_column`, `kpi_focus`), and a list of typed `components` (`bullets`, `kpi_cards`, `image`, `chart`, …). `assets` is `{ images: { [id]: { src, alt? } } }` — components reference images by `asset_id`, so the same image can be reused across slides without duplication.

A deck also carries an optional `seed` (an integer that keeps auto-selected layouts stable across revisions — see Layout selection below for how it's derived when omitted). Any slide may set a stable `id` (what spec pages and validation error messages reference it by), `placeholder: true` (a slide with no content yet — injected by `assemble` for a spec page nobody has filled in, skipped by the content-quality checks, and blocking `render` unless `--draft`), and an optional `notes` (aliases `note`/`speaker_notes`/`speakerNotes`) that exports as a native PowerPoint speaker note — content for the presenter's own view, never drawn onto the slide canvas and never counted toward any layout capacity. Field names that commonly drift between a model's output and the schema (40 synonym pairs across component types, e.g. kpi `title`→`label`, quote `content`→`text`, swot `strength`→`strengths`, bmc `partners`→`key_partners`) are silently normalized to the canonical name at validate time — `validate`/`render`/`preview` print a note listing what changed, never a hard error. The same rescue covers a v4-labeled document that still writes the pre-v4 vocabulary (`scenario` instead of `narrative`, `mode`/`delivery` instead of `strategy`/`pacing`, or the old `narrative`/`text`/`presentation` axis values) — normalized to the current spelling with the same kind of note, never a hard reject. An explicit `version: "3"` (or `"2"`) is not covered by this rescue and hard-rejects with a migration pointer — see `pptfast migrate` below.

Four component types are *full-body*: `swot` (strengths/weaknesses/opportunities/threats), `bmc` (the nine-block Business Model Canvas), `waterfall` (a running-total bridge chart), and `gantt` (dated bars on a shared numeric axis). Each fills a slide's entire content rect and must be the only component on its slide — mixing one in with anything else fails `validate` instead of silently dropping the sibling.

The v4 IR schema is frozen as of 0.4.0 — future evolution is additive only (new optional fields, new enum members), and any breaking change ships under a new top-level `version` value with the same hard-reject-and-migration treatment v3 got. `pptfast migrate <v3-file.json> -o <out.json>` deterministically converts a v3 file to v4 (field renames only — same theme, layout selection, content budgets, and visual output) — see Deck projects below for the sibling `deck.plan.json` → `deck.spec.json` conversion.

## Themes

A theme bundles a style (design tokens), a brand (identity chrome), and a layout set for each page type — the 13 built-ins below. Every built-in defaults to the *full* set of registered layouts for each page type (every archetype adapts its text color to the theme's actual background, so the full set stays readable everywhere). Narrowing it is a deliberate theme-author choice, not the norm — only 3 of the 13 exclude a single chapter layout (a runway-native design whose contrast doesn't clear those themes' accent color). Override the style (`--style`) to re-color a theme.

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

## Narratives

A narrative is three axes, independent of theme (visual style), that set editorial discipline: `strategy` (how the argument is built — `pyramid`, `storytelling`, `instructional`, `showcase`, `briefing`), `pacing` (how dense the content is — `dense`, `balanced`, `spacious`), and `audience` (a tone anchor — `executive`, `technical`, `customer`, `public`, no rendering effect yet). Set the IR's top-level `narrative` to a named preset string (e.g. `"boardroom-report"`) or a partial axes object (e.g. `{ "pacing": "spacious" }`) — an omitted axis, or an omitted `narrative` field entirely, falls back to `general` (`briefing` × `balanced` × `public`). An unknown preset name or axis value is a hard validate error listing what's available.

`pacing` drives the content-quality gate and the body-text baseline (paragraph/bullets/callout only — every other component's own type scale and the heading system are unaffected): the per-slide component budget and the bullets budget (item count and per-item length) both tighten from `dense` toward `spacious`, while the body font size grows the other way — density is additionally capped by whichever layout the slide resolves to, whichever ceiling is tighter.

| pacing | body text | components / slide | bullets |
|---|---|---|---|
| `dense` | 20px | 5 | up to 6 items, ~48 characters each |
| `balanced` (the default) | 24px | 4 | up to 5 items, ~40 characters each |
| `spacious` | 32px | 3 | up to 4 items, ~30 characters each |

Bullets shrink below their tier's baseline to fit when needed, down to a 14px floor, before any overflow handling kicks in. `pptfast validate` reports the exact numbers that applied to each slide.

Run `pptfast narratives [--json]` to list the named presets (each carries soft theme recommendations — a starting suggestion, never a constraint) plus the raw axes tables.

## Layout selection

When a slide omits `layout`, pptfast resolves one automatically in four deterministic steps: the page type's full registry pool → the theme's layout set for that page type (full by default, see Themes above) → the narrative's `strategy` softly upweights (×3) a handful of content-layout ids that suit that strategy, everything else stays at a ×1 floor (cover/chapter/ending are never weighted — their character comes from the theme, not the strategy) → a seeded weighted pick, swapped deterministically to the runner-up when it would repeat the immediately preceding slide's layout. An explicit `layout` always wins and skips every step above. Whether the content actually fits is enforced separately by `validate`'s density gate, never by selection — so editing a page's content cannot silently flip its layout.

The pick is fully deterministic — the same IR always resolves the same way, so preview and the final render never disagree. Staying stable *across revisions* (editing one page without reshuffling every other page's auto-picked layout) additionally needs a persisted `seed`, resolved in this order:

1. An explicit `ir.seed` — full revision stability, always wins.
2. A deck project's own seed: `pptfast assemble` derives one from the spec's filename and page ids the first time a spec omits `seed`, and prints a note with the value — copy it into `deck.spec.json`'s `seed` field to persist it.
3. Neither set: a content hash of `filename` + every slide's `heading` (legacy-compatible) — editing any heading reshuffles every auto-picked layout deck-wide.

`pptfast assemble` also writes every auto-picked `layout` back into the assembled `deck.json` (a page file's own explicit `layout` is left untouched) — the CLI notes how many pages it filled in.

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

A deck can be authored two ways, and every command that takes IR accepts either: a single **IR JSON file** (everything above), or a **deck project directory** — the same content split across files so an agent can spec out a deck's structure first, then write and revise it page by page instead of holding one growing JSON blob in context.

```
my-deck/
  deck.spec.json         the locked spec: page order, type, and heading for every page
  pages/<page-id>.json  one file per filled page (components/layout/arrangement/background/image_side/footnote)
  assets/                local images, auto-registered by filename (image id = filename without extension)
```

`deck.spec.json` validates on its own, before any page exists: `pptfast spec validate deck.spec.json` checks the schema plus strategy-aware hard gates (boundary pages, heading length, beat rotation, page count vs. pacing). A spec page with no matching `pages/<id>.json` becomes a **placeholder** slide — heading only, not missing — so a partially-written deck always assembles and previews. `pptfast render` refuses to export a deck with unfilled placeholders unless you pass `--draft`. `pptfast preview` never gates on them. A directory still carrying the pre-v4 `deck.plan.json` instead of `deck.spec.json` is not read directly — `pptfast migrate <dir> -o <dir>` converts it in place (writes `deck.spec.json` alongside, never overwrites, never deletes the source — delete `deck.plan.json` yourself once you've confirmed the new file); a directory with both files present is a hard error, never a guessed priority.

`pptfast assemble <dir>` materializes spec + pages + assets into a single IR JSON file (`deck.json` by default). `pptfast disassemble <ir.json> -o <dir>` does the reverse (documented-lossy — spec-only fields like `beat`/`focus` have no IR-side home to recover). `render`/`validate`/`preview` accept a directory directly too, assembling in memory first.

Deck project directories can be referenced by a bare name instead of a path — `pptfast render my-deck -o out.pptx` resolves `my-deck` under `$PPTFAST_HOME/decks` (`$PPTFAST_HOME` defaults to `~/.pptfast`) when no local file or directory of that name exists. All deck defaults resolve in four layers, highest wins: CLI flag > project `pptfast.config.json` > user `~/.pptfast/config.json` > the deck's own values. Both config layers can set `decksDir` to redirect where bare names resolve — the project layer's value resolves against that config file's own directory (for a team that wants deck projects checked into the repo), the user layer's against `$PPTFAST_HOME`. Project wins when both are set.

## Auditing

`pptfast audit <target> [--json]` renders every page off-screen and runs a deterministic geometry review — no LLM screenshot squinting, no variance. Four checks: **overflow** (text past its own box or column), **out-of-bounds** (past the page edge), **low-contrast** (WCAG relative-luminance ratio between text and its resolved background), and **overlap** (two components' regions substantially colliding). Advisory, not a hard gate — `validate` already rejects structurally invalid or over-dense decks. Audit catches what a valid deck can still get wrong at render time (an author-chosen near-background text color, two components whose combined content collides).

Run it once every page is filled, on the same `target` forms as `validate`/`render` (file, deck project directory, or bare name). Human output groups findings by page (`page 3 (p-kpi): [low-contrast] …`, each message carries a fix suggestion) plus a summary line. `--json` prints the full machine-readable report. The exit code alone is agent-judgeable: `0` clean, `1` when it finds anything — fix the flagged page and re-run `audit` alone, no need to re-render. Skipped placeholder pages are noted, the same "not missing, just not written yet" treatment used everywhere else.

```bash
pptfast audit examples/basic.json
# → audited 5 pages, 0 skipped, 0 findings
```

## For AI agents

The recommended loop for an agent generating a deck: read `pptfast schema` to learn the vocabulary, write an IR JSON, run `pptfast validate` and fix whatever it reports (errors carry a page number and a fixable-in-place message — the point is to close this loop without a human), then `pptfast audit` for the same kind of fixable-in-place feedback on what a *valid* deck can still get wrong at render time (overflow, low-contrast, overlap — exit code alone says whether it's clean), then `pptfast render`. `pptfast preview` gives the agent SVG files it can look at to self-check layout before committing to a render. Add `--html` to also write a self-contained `preview.html` for a human to review (keyboard nav, placeholder badges — a remote-URL image asset stays remote, the one self-containment gap). When every page is filled, that `preview.html` also overlays the same `audit` findings (per-page badges plus a findings panel, click to jump to the page) so a human reviewer sees them without a terminal — a deck with any placeholder page shows a one-line "audit skipped" notice instead. The reviewer can leave free-text per-page annotations right in `preview.html` and export them as a `revision-request.json` (a Blob download, no network or file write — preview stays read-only) for the agent to route back through `pages/*.json`. The Claude Code plugin above wraps this loop as a skill ([`skills/pptfast/SKILL.md`](./skills/pptfast/SKILL.md)). This exact loop is exercised by an internal, model-agnostic benchmark (`bench/`, not published to npm) that mechanically scores how well a model follows the skill on a fixed question bank — see `bench/README.md`.

## Roadmap

- **v0.2** — Claude Code plugin + skill wrapping the render loop (shipped), design token overrides (`--style`), `init`/self-update commands.
- **v0.3** — narrative-driven axes (strategy/pacing/audience), an explicit layout + component registry with weighted seeded selection, the deck spec/assemble workflow, a deterministic geometry audit, a self-contained HTML preview, and the six-phase skill (shipped; these axes shipped named `scenario`/`mode`/`delivery`, renamed to `narrative`/`strategy`/`pacing` in the v0.4 vocabulary rewrite below).
- **v0.4** — vocabulary-v4: `scenario`→`narrative`, `mode`→`strategy`, `delivery`→`pacing`, `plan`→`spec` (`deck.plan.json`→`deck.spec.json`), page `rhythm`→`beat`, a deterministic `pptfast migrate` command, no behavior change (shipped, schema frozen as of 0.4.0 — see The IR above).
- **v0.5+** — theme ecosystem (distributable theme registry, theme-customization skill, custom brand slots), richer motion (more entrance animations), Office real-device testing, web playground, 1.0.

## Credits

Icon primitives are extracted from [lucide](https://lucide.dev) (ISC License). pptfast itself was extracted from a production AI-deck-generation system and CJK-typography-tuned (full-width punctuation width, Chinese line breaking, a Chinese-first font stack) from day one.

## License

[MIT](./LICENSE)
