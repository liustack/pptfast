---
summary: 'Deck project directory layout, the six-phase CLI workflow, placeholder/--draft semantics, locked fields, the boundary-page render surface, and the four-layer config/home directory scheme'
read_when:
  - authoring or debugging a deck project directory (deck.spec.json + pages/ + assets/)
  - touching src/plan, src/cli/deck-dir.ts, src/cli/home.ts, or src/cli/config.ts
  - a placeholder/--draft, orphan-file, or locked-field error needs tracing
  - a cover/chapter/ending page's components or footnote go missing at render, or you need to know which fields a page type actually renders
---

# Deck projects

## Directory layout

```
my-deck/
  deck.spec.json         locked spec — page order, type, heading. Sole order-of-truth
  pages/<page-id>.json  one file per filled page, components only (no type/heading)
  assets/                local images, auto-registered by filename
```

Layout and fs-safety discipline live in `src/cli/deck-dir.ts` (header comment restates the layout). The pure assembly logic is `assembleDeck`/`disassembleDeck` in `src/plan/assemble.ts` — zero-fs by design (`AGENTS.md`'s `src/index.ts` closure rule), so it's the CLI shell (`deck-dir.ts`, Node-only) that actually reads `deck.spec.json`/`pages/*.json`/`assets/*` off disk. `assertSafeFileSegment` (`deck-dir.ts:83`) is the CWE-22 defense every id-to-path join goes through — a `slide.id`/asset-id is an open `z.string()` at the schema layer, so this is a real, tested guard, not defense-in-depth theater. A directory that still has `deck.plan.json` (the pre-vocabulary-v4 filename) instead of `deck.spec.json` is not read directly — `readSpecFile` (`deck-dir.ts`) points at `pptfast migrate` instead; both files present at once is a hard error, never a guessed priority (spec §9.2).

## Six-phase CLI workflow

`skills/pptfast/SKILL.md` is the authored playbook. The phases map onto commands as: **align** (`pptfast schema` / `schema --spec` / `narratives --json` / `themes --json`) → **spec** (write `deck.spec.json`, `pptfast spec validate <file>` — strategy-aware hard gates: boundary pages, heading length, beat rotation, page count vs. pacing, `validateSpec`/`formatInvalidSpecError` in `src/plan/index.ts`) → **fill** (`pages/<id>.json` in small batches, `pptfast assemble <dir> -o deck.json` after each batch, then `pptfast validate`) → **audit** (`pptfast audit <target> [--json]`, `docs/*` cross-reference: `src/svg/audit/deck-audit.ts`) → **preview** (`pptfast preview <target> -o <dir> --html` — once every page is filled, this also overlays the same `audit` findings on `preview.html` and lets a human reviewer leave per-page annotations that export as `revision-request.json`) → **revise** (edit one `pages/<id>.json` by hand, or route a handed-back `revision-request.json`'s entries into their `pageId`'s page file, then re-`assemble` → `validate`/`audit` → re-render). Every consumer command (`validate`/`render`/`preview`/`audit`) accepts a single IR file, a deck project directory, or a bare name — `isDeckDirectory` (`deck-dir.ts`) is the dispatch. The `revision-request.json` loop is what closes preview's read-only design back into the normal edit path — see `skills/pptfast/SKILL.md`'s phase 6 for the exact routing rule (`pageId` = slide id, else 1-based page number).

## Placeholder pages and the `--draft` gate

A spec page with no matching `pages/<id>.json` file assembles into `{ placeholder: true, type, heading, subheading? }` (from the spec's `summary`, if set) — never an error (`buildSlide`, `src/plan/assemble.ts:360`). `validate` and `preview` pass placeholder pages through unconditionally. `render` hard-refuses a deck containing one unless `--draft` is passed (SDK: `generatePptx(ir, { draft?: boolean })`), and `audit` skips them (`auditDeck`, `pagesSkipped`). Assemble's exact contract: a missing page always succeeds (placeholder), while a structural contradiction — an orphan `pages/<id>.json` with no matching spec id, a locked-field violation — always throws.

## Locked fields

`type` and `heading` are spec-owned (`LOCKED_KEYS`, `src/plan/assemble.ts:145`) — a page file that redeclares either (even set to `undefined`, caught via `Object.hasOwn`, not `!== undefined`) throws before assembly proceeds. `PageContent` (`assemble.ts:61-69`) is the exhaustive shape a page file may set: `components`, `layout`, `arrangement`, `background`, `image_side`, `footnote`, `notes` (speaker notes — content, not locked, exported as native PowerPoint speaker notes, never rendered onto the canvas SVG).

## Boundary-page render surface

`PageContent` above is the same shape for every page type, but not every field it allows is actually drawn onto the canvas by every type — `components` and `footnote` never render on a `cover`, `chapter`, or `ending` page, confirmed by reading every archetype in both families (`src/svg/archetypes/index-{chapter,ending}.ts`'s registries, `cover-*.tsx`'s 8 files) plus the background-asset `ImageCoverPage` takeover that intercepts `cover`/`chapter` before any archetype runs (`full-slide-svg.tsx`'s `imageCoverTakeover` branch, `src/svg/image-pages.tsx`). `validate` hard-errors a page that sets either (`checkBoundaryPageContent`, `src/api.ts`) — bench-driven fixes wave, defect D: before this gate existed, that content was silently dropped at render with no signal anywhere.

| type | heading | subheading | components | footnote |
|---|---|---|---|---|
| `cover` | always (8/8 archetypes) | always (8/8) | never (0/8) | never (0/8) |
| `chapter` | always (8/8) | 5/8 (not `fashion-chapter`/`poster-chapter`/`tone-adaptive-chapter`) | never (0/8) | never (0/8) |
| `content` | always (7/7) | 7/7 archetypes, 3/4 image takeovers (not the `image-top` takeover) | always (7/7, 4/4 takeovers) | 6/7 archetypes (not `two-column`), 0/4 takeovers |
| `ending` | always (7/7) | 6/7 (not `tone-adaptive-ending`) | never (0/7) | never (0/7) |

`subheading` is deliberately not hard-gated on any type, on either side of the table — no type drops it on every archetype, so a "this type never renders subheading" claim would be unsound and false-positive on the majority archetype that does render it (this is also why `subheading` is absent from `checkBoundaryPageContent`'s rule despite being one of the fields the wave's benchmark evidence first suspected). `notes` sits outside this table entirely by design — speaker notes, never drawn onto the canvas SVG regardless of page type (see its docstring in `ir/index.ts`).

## `~/.pptfast` home and four-layer config

`pptfastHome()` (`src/cli/home.ts:17-19`) is `$PPTFAST_HOME` or `~/.pptfast`, read fresh every call — one predictable dotdir (same posture as `.ssh`/`.npmrc`/`~/.claude`), not a per-OS XDG/AppData split. `decksRoot()` (same file, line 40-42) is `$PPTFAST_HOME/decks` by default, where a bare deck name resolves (`pptfast render my-deck -o out.pptx`) when no local file/directory of that name exists. `userConfigPath()` is `$PPTFAST_HOME/config.json`.

Four-layer precedence, highest wins: **CLI flag** > **project config** (`pptfast.config.json`, found by walking up from cwd — `findConfig`, `src/cli/config.ts:121-132`) > **user config** (`~/.pptfast/config.json`, `findUserConfig`, same file) > **the artifact's own value** (an authored IR's `theme`, or the schema's `consulting` default). Both config layers can set `decksDir` to redirect bare-name resolution — project's resolves against that config file's own directory (for a team that wants deck projects checked into the repo), user's against `pptfastHome()`. `theme`/`style` values aren't validated against the installed set at file-read time — only once, at whichever layer actually wins (`applyDeckConfig`, `src/cli/commands.ts`).

## Disassemble

`disassembleDeck` (`src/plan/assemble.ts:504`) is the IR → project-directory inverse — round-trips content but is documented-lossy: `beat`/`focus` (named `rhythm`/`focus` before the vocabulary-v4 rename) have no `Slide`-side home at all, `theme.style`/`theme.brand` overrides collapse to a bare theme-id string, and a `deck.json` produced by `assembleDeck` (whose omitted layouts are already materialized) disassembles every auto-pick back out as if it had been an explicit pin — a real, accepted narrowing of revision stability for that specific reuse pattern, not a bug.
