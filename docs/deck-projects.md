---
summary: 'Deck project directory layout, the six-phase CLI workflow, placeholder/--draft semantics, locked fields, and the four-layer config/home directory scheme'
read_when:
  - authoring or debugging a deck project directory (deck.plan.json + pages/ + assets/)
  - touching src/plan, src/cli/deck-dir.ts, src/cli/home.ts, or src/cli/config.ts
  - a placeholder/--draft, orphan-file, or locked-field error needs tracing
---

# Deck projects

## Directory layout

```
my-deck/
  deck.plan.json        locked plan — page order, type, heading; sole order-of-truth
  pages/<page-id>.json  one file per filled page, components only (no type/heading)
  assets/                local images, auto-registered by filename
```

Layout and fs-safety discipline live in `src/cli/deck-dir.ts` (header comment restates the layout); the pure assembly logic is `assembleDeck`/`disassembleDeck` in `src/plan/assemble.ts` — zero-fs by design (`AGENTS.md`'s `src/index.ts` closure rule), so it's the CLI shell (`deck-dir.ts`, Node-only) that actually reads `deck.plan.json`/`pages/*.json`/`assets/*` off disk. `assertSafeFileSegment` (`deck-dir.ts:67-77`) is the CWE-22 defense every id-to-path join goes through — a `slide.id`/asset-id is an open `z.string()` at the schema layer, so this is a real, tested guard, not defense-in-depth theater.

## Six-phase CLI workflow

`skills/pptfast/SKILL.md` is the authored playbook; the phases map onto commands as: **align** (`pptfast schema` / `schema --plan` / `scenarios --json` / `themes --json`) → **plan** (write `deck.plan.json`, `pptfast plan validate <file>` — mode-aware hard gates: boundary pages, heading length, rhythm rotation, page count vs. delivery, `validatePlan`/`formatInvalidPlanError` in `src/plan/index.ts`) → **fill** (`pages/<id>.json` in small batches, `pptfast assemble <dir> -o deck.json` after each batch, then `pptfast validate`) → **audit** (`pptfast audit <target> [--json]`, `docs/*` cross-reference: `src/svg/audit/deck-audit.ts`) → **preview** (`pptfast preview <target> -o <dir> --html`) → **revise** (edit one `pages/<id>.json`, re-`assemble` → `validate`/`audit` → re-render). Every consumer command (`validate`/`render`/`preview`/`audit`) accepts a single IR file, a deck project directory, or a bare name — `isDeckDirectory` (`deck-dir.ts`) is the dispatch.

## Placeholder pages and the `--draft` gate

A plan page with no matching `pages/<id>.json` file assembles into `{ placeholder: true, type, heading, subheading? }` (from the plan's `summary`, if set) — never an error (`buildSlide`, `src/plan/assemble.ts:346-368`). `validate` and `preview` pass placeholder pages through unconditionally; `render` hard-refuses a deck containing one unless `--draft` is passed (SDK: `generatePptx(ir, { draft?: boolean })`); `audit` skips them (`auditDeck`, `pagesSkipped`). Assemble's exact contract: a missing page always succeeds (placeholder); a structural contradiction — an orphan `pages/<id>.json` with no matching plan id, a locked-field violation — always throws.

## Locked fields

`type` and `heading` are plan-owned (`LOCKED_KEYS`, `src/plan/assemble.ts:138`) — a page file that redeclares either (even set to `undefined`, caught via `Object.hasOwn`, not `!== undefined`) throws before assembly proceeds. `PageContent` (`assemble.ts:57-64`) is the exhaustive shape a page file may set: `components`, `layout`, `arrangement`, `background`, `image_side`, `footnote`.

## `~/.pptfast` home and four-layer config

`pptfastHome()` (`src/cli/home.ts:17-19`) is `$PPTFAST_HOME` or `~/.pptfast`, read fresh every call — one predictable dotdir (same posture as `.ssh`/`.npmrc`/`~/.claude`), not a per-OS XDG/AppData split. `decksRoot()` (same file, line 40-42) is `$PPTFAST_HOME/decks` by default, where a bare deck name resolves (`pptfast render my-deck -o out.pptx`) when no local file/directory of that name exists. `userConfigPath()` is `$PPTFAST_HOME/config.json`.

Four-layer precedence, highest wins: **CLI flag** > **project config** (`pptfast.config.json`, found by walking up from cwd — `findConfig`, `src/cli/config.ts:121-132`) > **user config** (`~/.pptfast/config.json`, `findUserConfig`, same file) > **the artifact's own value** (an authored IR's `theme`, or the schema's `consulting` default). Both config layers can set `decksDir` to redirect bare-name resolution — project's resolves against that config file's own directory (for a team that wants deck projects checked into the repo), user's against `pptfastHome()`. `theme`/`style` values aren't validated against the installed set at file-read time — only once, at whichever layer actually wins (`applyDeckConfig`, `src/cli/commands.ts`).

## Disassemble

`disassembleDeck` (`src/plan/assemble.ts:490-517`) is the IR → project-directory inverse — round-trips content but is documented-lossy: `rhythm`/`focus` have no `Slide`-side home at all, `theme.style`/`theme.brand` overrides collapse to a bare theme-id string, and a `deck.json` produced by `assembleDeck` (whose omitted layouts are already materialized) disassembles every auto-pick back out as if it had been an explicit pin — a real, accepted narrowing of revision stability for that specific reuse pattern, not a bug.
