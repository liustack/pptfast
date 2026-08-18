---
summary: 'Deck project directory layout, the six-phase CLI workflow, the live `pptfast serve` preview loop, the `pptfast asset-brief` image-generation brief, placeholder/--draft semantics, locked fields, the boundary-page render surface, and the four-layer config/home directory scheme'
read_when:
  - authoring or debugging a deck project directory (deck.spec.json + pages/ + assets/)
  - touching src/spec, src/cli/deck-dir.ts, src/cli/home.ts, src/cli/config.ts, or src/cli/serve.ts
  - a placeholder/--draft, orphan-file, or locked-field error needs tracing
  - a cover/chapter/ending page's components or footnote go missing at render, or you need to know which fields a page type actually renders
  - deciding whether a revision-loop change belongs to the download form (`preview --html`) or the live form (`serve`)
  - generating art for an image slot and needing its real rendered frame/crop mode/palette (`pptfast asset-brief`, `src/svg/asset-brief.ts`)
---

# Deck projects

## Directory layout

```
my-deck/
  deck.spec.json         locked spec — page order, type, heading. Sole order-of-truth
  pages/<page-id>.json  one file per filled page, components only (no type/heading)
  assets/                local images, auto-registered by filename
```

Layout and fs-safety discipline live in `src/cli/deck-dir.ts` (header comment restates the layout). The pure assembly logic is `assembleDeck`/`disassembleDeck` in `src/spec/assemble.ts` — zero-fs by design (`AGENTS.md`'s `src/index.ts` closure rule), so it's the CLI shell (`deck-dir.ts`, Node-only) that actually reads `deck.spec.json`/`pages/*.json`/`assets/*` off disk. `assertSafeFileSegment` (`deck-dir.ts:83`) is the CWE-22 defense every id-to-path join goes through — a `slide.id`/asset-id is an open `z.string()` at the schema layer, so this is a real, tested guard, not defense-in-depth theater. A directory that still has `deck.plan.json` (the pre-vocabulary-v4 filename) instead of `deck.spec.json` is not read directly — `readSpecFile` (`deck-dir.ts`) points at `pptfast migrate` instead; both files present at once is a hard error, never a guessed priority (spec §9.2).

## Six-phase CLI workflow

`skills/pptfast/SKILL.md` is the authored playbook. The phases map onto commands as: **align** (`pptfast schema` / `schema --spec` / `narratives --json` / `themes --json`) → **spec** (write `deck.spec.json`, `pptfast spec validate <file>` — strategy-aware hard gates: boundary pages, heading length, beat rotation, page count vs. pacing, `validateSpec`/`formatInvalidSpecError` in `src/spec/index.ts`) → **fill** (`pages/<id>.json` in small batches, `pptfast assemble <dir> -o deck.json` after each batch, then `pptfast validate`) → **audit** (`pptfast audit <target> [--json]`, `docs/*` cross-reference: `src/svg/audit/deck-audit.ts`) → **preview** (`pptfast preview <target> -o <dir> --html` — once every page is filled, this also overlays the same `audit` findings on `preview.html`, and writes a machine-readable `manifest.json` beside it) → **revise** (edit one `pages/<id>.json` by hand, then re-`assemble` → `validate`/`audit` → re-render). Every consumer command (`validate`/`render`/`preview`/`audit`) accepts a single IR file, a deck project directory, or a bare name — `isDeckDirectory` (`deck-dir.ts`) is the dispatch. Preview is read-only end to end: a reviewer who wants something changed says so in the conversation, usually with a screenshot, and the agent makes the edit through the same `pages/*.json` gate everything else passes — see `skills/pptfast/SKILL.md`'s phase 6.

## Live preview (`pptfast serve`)

`pptfast serve <target> [--port 4400] [--no-open]` (same `target` forms as every other deck-accepting command above) is the **preview** phase's review loop in live form, not a separate workflow — the identical `preview.html` markup, running off a local `node:http` server bound to `127.0.0.1` instead of a file `pptfast preview --html` writes once. A source edit (`deck.spec.json`/`pages/`/`assets/` for a deck project directory, or the file itself for a bare IR target) triggers a rebuild and pushes a whole-page reload to the open browser tab over SSE, 200ms-debounced so a multi-file save coalesces into one refresh. A rebuild that fails (a mid-edit invalid JSON save is the common case) shows a recoverable error banner instead of taking the server down, and clears itself on the next successful save.

The one behavioral difference from the download form is liveness: the tab re-renders on every source change, so a revision the agent saves appears in the tab the reviewer already has open, with no new link and nothing for them to click. Neither form writes to the deck — an annotation panel and a `POST /revision-request` endpoint existed here until 2026-08-16 and were removed together, because a reviewer describing a change in conversation (with a screenshot) reaches the agent faster than one typing into a panel whose output then has to be exported and read back. Both forms stay valid, for different needs: `serve` for a live local loop where the agent and a reviewer are both watching the same running deck, `preview --html` for a static, shareable artifact (attach to a ticket, review offline, nothing to keep running). No auth and no remote bind (`127.0.0.1` only, no `--host` flag) — a local dev tool, not a hosted review server.

## Asset briefs (`pptfast asset-brief`)

`pptfast asset-brief <target> [--json]` (`src/svg/asset-brief.ts`, `buildAssetBrief`) closes the same knowledge gap for image assets that `audit` closes for layout defects: an image slot's real rendered frame (`image.tsx`'s `measure` — `Math.min(round(w * 0.5), MAX_IMAGE_H)`, then cover/contain cropping) is engine-internal geometry no amount of reading the IR reveals, and generating art at the wrong aspect ratio is the single most common reason a placed image looks wrong. The brief comes from an actual off-screen render pass, never a copied constant — every `asset_id` an `image` component references, resolved or not, gets its own dummy 1×1 PNG injected into an in-memory copy of the IR for that render (never the real `ir`, never the export path), so the geometry extracted afterward is always real. A slide whose selected layout never actually draws the component (e.g. a cover layout, which never reads `slide.components` at all) reports `rendered: false` rather than being silently dropped. Same `target` resolution as every other deck-accepting command; purely informational, no exit-code gate. v1 scope is `image` components only — `image_grid`/`image_compare` and `background` asset specs are a natural v2 extension of the same shape, not yet covered. Each item also carries `alt` (A11Y-01 alt chain wave) when `ir.assets.images[asset_id].alt` is set — the same accessibility description that lands in the exported PPTX — so a generator agent filling in `missing`/`suggested_prompt` items can see at a glance which ids still need one written.

## Placeholder pages and the `--draft` gate

A spec page with no matching `pages/<id>.json` file assembles into `{ placeholder: true, type, heading, subheading? }` from the spec's `summary`, if set. This is never an error (`buildSlide`, `src/spec/assemble.ts`). Once a boundary page (`cover`, `chapter`, or `ending`) has a page file, its summary remains visible as `subheading`. A filled `content` page keeps summary as a fill-only prompt so it does not duplicate the authored body. `validate` and `preview` pass placeholder pages through unconditionally. `render` hard-refuses a deck containing one unless `--draft` is passed (SDK: `generatePptx(ir, { draft?: boolean })`), and `audit` skips them (`auditDeck`, `pagesSkipped`). Assemble's exact contract says a missing page always succeeds as a placeholder. A structural contradiction, such as an orphan `pages/<id>.json` with no matching spec id or a locked-field violation, always throws.

## Locked fields

`type` and `heading` are spec-owned (`LOCKED_KEYS`, `src/spec/assemble.ts:145`) — a page file that redeclares either (even set to `undefined`, caught via `Object.hasOwn`, not `!== undefined`) throws before assembly proceeds. `PageContent` (`assemble.ts:61-69`) is the exhaustive shape a page file may set: `components`, `layout`, `arrangement`, `background`, `image_side`, `footnote`, `notes` (speaker notes — content, not locked, exported as native PowerPoint speaker notes, never rendered onto the canvas SVG).

## Boundary-page render surface

`PageContent` above is the same shape for every page type, but not every field it allows is actually drawn onto the canvas by every type — `components` and `footnote` never render on a `cover`, `chapter`, or `ending` page, confirmed by reading every layout in both families (`src/svg/layouts/index-{chapter,ending}.ts`'s registries, `cover-*.tsx`'s 8 files) plus the background-asset `ImageCoverPage` takeover that intercepts `cover`/`chapter` before any layout runs (`full-slide-svg.tsx`'s `imageCoverTakeover` branch, `src/svg/image-pages.tsx`). `validate` hard-errors a page that sets either (`checkBoundaryPageContent`, `src/api.ts`) — bench-driven fixes wave, defect D: before this gate existed, that content was silently dropped at render with no signal anywhere.

| type | heading | subheading | components | footnote |
|---|---|---|---|---|
| `cover` | always (8/8 layouts) | always (8/8) | never (0/8) | never (0/8) |
| `chapter` | always (8/8) | 5/8 (not `fashion-chapter`/`poster-chapter`/`tone-adaptive-chapter`) | never (0/8) | never (0/8) |
| `content` | always (7/7) | 7/7 layouts, 3/4 image takeovers (not the `image-top` takeover) | always (7/7, 4/4 takeovers) | 6/7 layouts (not `two-column`), 0/4 takeovers |
| `ending` | always (7/7) | 6/7 (not `tone-adaptive-ending`) | never (0/7) | never (0/7) |

`subheading` is deliberately not hard-gated on any type, on either side of the table — no type drops it on every layout, so a "this type never renders subheading" claim would be unsound and false-positive on the majority layout that does render it (this is also why `subheading` is absent from `checkBoundaryPageContent`'s rule despite being one of the fields the wave's benchmark evidence first suspected). `notes` sits outside this table entirely by design — speaker notes, never drawn onto the canvas SVG regardless of page type (see its docstring in `ir/index.ts`).

## `~/.pptfast` home and four-layer config

`pptfastHome()` (`src/cli/home.ts:17-19`) is `$PPTFAST_HOME` or `~/.pptfast`, read fresh every call — one predictable dotdir (same posture as `.ssh`/`.npmrc`/`~/.claude`), not a per-OS XDG/AppData split. `decksRoot()` (same file, line 40-42) is `$PPTFAST_HOME/decks` by default, where a bare deck name resolves (`pptfast render my-deck -o out.pptx`) when no local file/directory of that name exists. `userConfigPath()` is `$PPTFAST_HOME/config.json`.

Four-layer precedence, highest wins: **CLI flag** > **project config** (`pptfast.config.json`, found by walking up from cwd — `findConfig`, `src/cli/config.ts:121-132`) > **user config** (`~/.pptfast/config.json`, `findUserConfig`, same file) > **the artifact's own value** (an authored IR's `theme`, or the schema's `consulting` default). Both config layers can set `decksDir` to redirect bare-name resolution — project's resolves against that config file's own directory (for a team that wants deck projects checked into the repo), user's against `pptfastHome()`. `theme`/`style` values aren't validated against the installed set at file-read time — only once, at whichever layer actually wins (`applyDeckConfig`, `src/cli/commands.ts`).

## Disassemble

`disassembleDeck` (`src/spec/assemble.ts`) is the IR → project-directory inverse and remains intentionally lossy. Boundary-page subheadings are recovered as `PageSpec.summary`, which preserves summary across assemble → disassemble → assemble. A filled content slide's subheading is not reinterpreted as summary because content summary is a fill-only prompt and `PageContent` has no subheading field. `focus` has no `Slide`-side home. `theme.style` and `theme.brand` overrides collapse to a bare theme-id string. A `deck.json` produced by `assembleDeck`, whose omitted layouts are already materialized, disassembles every auto-pick back out as if it had been an explicit pin. This is an accepted narrowing of revision stability for that specific reuse pattern, not a bug.
