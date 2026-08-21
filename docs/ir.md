---
summary: 'The IR a deck is written in: deck and slide fields, full-body components, narratives, layout selection and seed, and the deck project directory format'
read_when:
  - writing IR by hand or teaching a model to write it
  - a field name or version was rejected at validate time
  - deciding between a single IR file and a deck project directory
  - a slide picked an unexpected layout, or layouts reshuffle between revisions
---

# The IR

The IR is a JSON file that describes a whole deck: which pages exist, what is on them, and which theme they wear. It is what an agent writes, and it is the only input `pptfast render` needs.

Run `pptfast schema` for the full JSON Schema. Feed it to a model before asking it to write IR.

## A deck

A deck (`PptxIR`) carries:

- `version` — currently `"4"`, and the default when omitted.
- `filename`.
- `narrative` — a preset id string, or a partial axes object (see [Narratives](#narratives)).
- `theme` — an `id` plus optional `style`/`brand` overrides.
- `meta` and `assets`.
- `brand` — logo placement.
- `chrome` — where the brand footer and logo appear: `"cover-only"` (keep the brand logo on cover and chapter pages, drop the footer rule, meta, and logo on content and ending pages), `"full"` (draw the content-page footer and logo, and paint confidentiality and date on cover and ending meta rows), or `"minimal"` (drop the content-page footer rule and meta, keep the logo). Omitted equals `"cover-only"`. Other postures leave confidentiality and date off the canvas even when `meta` carries them. Layout `chrome: "none"` still wins. Theme motifs are unaffected. Omitted by default. Write `"full"` only when every content page needs the brand footer.
- `slides` — required, ordered.

Everything but `slides` is optional and has a sensible default.

`assets` is `{ images: { [id]: { src, alt? } } }`. Components reference images by `asset_id`, so the same image can be reused across slides without duplication. `alt`, when set, lands in the exported PPTX's standard accessibility-description slot for that image — what PowerPoint's "Edit Alt Text" panel reads and writes. An `image` component whose asset has no `alt` exports exactly as before the field existed.

A deck can also carry a `seed`: an integer that keeps auto-selected layouts stable across revisions (see [Layout selection](#layout-selection)).

## A slide

Each slide has:

- `type` — `cover`, `chapter`, `content`, or `ending`.
- `layout` — an explicit page-layout id. It always wins over auto-selection. Omit it and pptfast picks one.
- `arrangement` — how a content slide's body is laid out, for example `two_column` or `kpi_focus`.
- `components` — the typed units that fill the page (`bullets`, `kpi_cards`, `image`, `chart`, …).

Any slide may also set a stable `id` (what spec pages and validation errors reference it by), `placeholder: true` (a page with no content yet — injected by `assemble` for a spec page nobody has filled in, skipped by content-quality checks, and blocking `render` unless `--draft`), and `notes` (aliases `note`/`speaker_notes`/`speakerNotes`), which exports as a native PowerPoint speaker note. Notes are for the presenter's own view: never drawn on the slide canvas, never counted toward layout capacity. The spoken script belongs in `notes`. The agent playbook's Sparse-page contract (`skills/pptfast/SKILL.md`) is the rule. If the file must stand alone as a document, put the extra words in notes or use a PDF.

## Field names that drift

55 synonym pairs across component types — kpi `title`→`label`, quote `content`→`text`, swot `strength`→`strengths`, bmc `partners`→`key_partners`, and so on — are silently normalized to the canonical name at validate time. `validate`/`render`/`preview` print a note listing what changed, never a hard error.

That rescue covers weak-model synonym drift only. It does not cover pre-v4 vocabulary. A v4-labeled document that writes `scenario` instead of `narrative`, `mode`/`delivery` instead of `strategy`/`pacing`, or the old `narrative`/`text`/`presentation` axis values is rejected outright, with the current names and values listed. An explicit `version: "3"` (or `"2"`) is rejected the same way, with a migration pointer.

## Full-body components

Eight component types fill a slide's entire content rect and must be the only component on their slide:

- `swot` — strengths/weaknesses/opportunities/threats.
- `bmc` — the nine-block Business Model Canvas.
- `waterfall` — a running-total bridge chart.
- `gantt` — dated bars on a shared numeric axis.
- `pest` — a political/economic/social/technological macro-environment scan.
- `five_forces` — Porter's competitive-forces hub-and-spoke.
- `heatmap` — a value-driven color grid.
- `sankey` — a layered, quantity-proportional flow diagram, shipped as native editable vectors rather than the rasterized image this chart type usually gets.

Mixing one in with another component fails `validate` instead of silently dropping the sibling.

## Schema stability

The v4 IR schema is frozen as of 0.4.0. Future evolution is additive only: new optional fields, new enum members. Any breaking change ships under a new top-level `version` value, with the same reject-and-migrate treatment v3 got.

`pptfast migrate <v3-file.json> -o <out.json>` converts a v3 file to v4 deterministically — field renames only, so theme, layout selection, content budgets, and visual output all stay the same. The sibling `deck.plan.json` → `deck.spec.json` conversion is under [Deck projects](#deck-projects).

## Narratives

A narrative is three axes that set editorial discipline, independent of the theme's visual style:

- `strategy` — how the argument is built: `pyramid`, `storytelling`, `instructional`, `showcase`, `briefing`.
- `pacing` — how dense the content is: `dense`, `balanced`, `spacious`.
- `audience` — a tone anchor: `executive`, `technical`, `customer`, `public`. No rendering effect yet.

Set the IR's top-level `narrative` to a named preset string (`"boardroom-report"`) or a partial axes object (`{ "pacing": "spacious" }`). An omitted axis, or an omitted `narrative` entirely, falls back to `general` (`briefing` × `balanced` × `public`). An unknown preset name or axis value is a validate error that lists what is available.

`pacing` drives the content-quality gate and the body-text baseline (paragraph, bullets, and callout only — every other component's type scale and the heading system are unaffected). The per-slide component budget and the bullets budget tighten from `dense` toward `spacious`, while the body font size grows the other way. Density is additionally capped by whichever layout the slide resolves to, whichever ceiling is tighter.

| pacing | body text | components / slide | bullets |
|---|---|---|---|
| `dense` | 20px | 5 | up to 6 items, ~48 characters each |
| `balanced` (the default) | 24px | 4 | up to 5 items, ~40 characters each |
| `spacious` | 32px | 3 | up to 4 items, ~30 characters each |

These are editorial guidance, not hard limits: `validate` reports them as warnings and still succeeds. Only genuine render-safety ceilings can block generation.

Bullets shrink below their tier's baseline to fit when needed, down to a 14px floor, before any overflow handling kicks in. Across every bullet style — `default`, `plain`, `divided`, `numbered`, `checklist` — an item long enough to still overflow at that floor is a hard validate error. That is looser than the per-pacing length guidance above, and it fires for a different reason: the text genuinely loses characters to an ellipsis at render.

`pptfast validate` reports the exact numbers that applied to each slide. `pptfast narratives [--json]` lists the named presets (each carrying soft theme recommendations, a suggestion rather than a constraint) plus the raw axes tables.

## Layout selection

When a slide omits `layout`, pptfast resolves one in four deterministic steps:

1. The page type's full registry pool.
2. Narrowed to the theme's layout set for that page type (the full set by default — see [Themes](./themes.md)).
3. The narrative's `strategy` upweights (×3) a handful of content-layout ids that suit it, everything else stays at a ×1 floor. Cover, chapter, and ending pages are never weighted this way: their character comes from the theme.
4. A seeded weighted pick, swapped deterministically to the runner-up when it would repeat the immediately preceding slide's layout.

An explicit `layout` wins and skips all four steps. Whether the content fits is flagged separately by `validate`'s density gate, never by selection — so editing a page's content cannot silently flip its layout.

The pick is fully deterministic: the same IR always resolves the same way, so preview and the final render never disagree. Staying stable *across revisions* — editing one page without reshuffling every other page's auto-pick — additionally needs a persisted `seed`, resolved in this order:

1. An explicit `ir.seed`. Full revision stability, always wins.
2. A deck project's own seed. `pptfast assemble` derives one from the spec's filename and page ids the first time a spec omits `seed`, and prints the value — copy it into `deck.spec.json`'s `seed` field to persist it.
3. Neither set: a content hash of `filename` plus every slide's `heading`. Editing any heading reshuffles every auto-picked layout deck-wide.

`pptfast assemble` also writes every auto-picked `layout` back into the assembled `deck.json`, leaving a page file's own explicit `layout` untouched. The CLI notes how many pages it filled in.

The mechanics behind all of this are in [`selection-and-seed.md`](./selection-and-seed.md).

## Deck projects

A deck can be authored two ways, and every command that takes IR accepts either: a single **IR JSON file** (everything above), or a **deck project directory** — the same content split across files, so an agent can spec out the structure first and then write and revise page by page instead of holding one growing JSON blob in context.

```
my-deck/
  deck.spec.json         the locked spec: page order, type, and heading for every page
  pages/<page-id>.json   one file per filled page (components/layout/arrangement/background/image_side/footnote)
  assets/                local images, auto-registered by filename (image id = filename without extension)
```

`deck.spec.json` validates on its own, before any page exists: `pptfast spec validate deck.spec.json` checks the schema plus the strategy-aware hard gates (boundary pages, heading length, beat rotation, page count vs. pacing).

A spec page with no matching `pages/<id>.json` becomes a **placeholder** slide — heading only, not missing — so a partially written deck always assembles and previews. `pptfast render` refuses to export a deck with unfilled placeholders unless you pass `--draft`. `pptfast preview` never gates on them.

A directory still carrying the pre-v4 `deck.plan.json` instead of `deck.spec.json` is not read directly. `pptfast migrate <dir> -o <dir>` converts it in place: it writes `deck.spec.json` alongside, never overwrites, never deletes the source — delete `deck.plan.json` yourself once you have confirmed the new file. A directory with both files present is a hard error, never a guessed priority.

`pptfast assemble <dir>` materializes spec + pages + assets into a single IR JSON file (`deck.json` by default). `pptfast disassemble <ir.json> -o <dir>` does the reverse, and is lossy by design: spec-only fields like `beat`/`focus` have no IR-side home to recover. `render`/`validate`/`preview` accept a directory directly too, assembling in memory first.

A deck project directory can be referenced by a bare name instead of a path. `pptfast render my-deck -o out.pptx` resolves `my-deck` under `$PPTFAST_HOME/decks` (`$PPTFAST_HOME` defaults to `~/.pptfast`) when no local file or directory of that name exists.

All deck defaults resolve in four layers, highest wins: CLI flag > project `pptfast.config.json` > user `~/.pptfast/config.json` > the deck's own values. Both config layers can set `decksDir` to redirect where bare names resolve — the project layer's value resolves against that config file's own directory (for a team that wants deck projects checked into the repo), the user layer's against `$PPTFAST_HOME`. Project wins when both are set.

The format's finer points are in [`deck-projects.md`](./deck-projects.md).
