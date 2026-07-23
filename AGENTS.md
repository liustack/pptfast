# Project Overview (for AI Agent)

## Goal

`pptfast` — semantic-IR → native editable PPTX toolchain (SDK + CLI + a Claude Code plugin/skill, shipped since 0.2.0: `skills/pptfast/SKILL.md` + `.claude-plugin/`).

## Architecture

IR (zod, `src/ir`) → React SVG templates (`src/svg`: archetypes/components/layouts, `src/themes`: tokens+definitions)
→ `renderToStaticMarkup` → svg2pptx (`src/pptx`) → pptxgenjs + JSZip patches (animations/gradients) → `.pptx`.
Browser APIs are isolated behind `src/platform` (registry seam, node impl = linkedom + sharp).
See `docs/architecture.md` for the full five-dimension model and render-chain diagram.

Vocabulary: **theme** (style + brand + a curated layout set, 13 built-ins), **layout** (a page-level template with named slots, 33 archetypes + 4 image takeovers), **component** (the 32 typed units that fill a slot), **narrative** (strategy × pacing × audience — that weight layout selection and set editorial density). A deck spec (`deck.spec.json`) locks narrative/theme/page order before page-level fill. See `docs/concepts.md` for the model, `docs/selection-and-seed.md` for how a layout gets picked, `docs/contrast-system.md` for the ink/contrast machinery, `docs/deck-projects.md` for the spec/assemble workflow.

## Layout rules

- `src/index.ts` dependency closure must stay free of Node-only deps (commander/linkedom/sharp only under `src/cli*` and `src/platform/node.ts`)
- Migrated code keeps its Chinese comments — do not translate wholesale, do not refactor while migrating
- Path alias `@/*` → `src/*` (declared in both tsconfig paths and the vitest alias — when you change one, change the other)

## Commands

`pnpm check` (typecheck+lint+test, default acceptance gate) / `pnpm e2e` (build + CLI end-to-end + soffice visual check) / `pnpm docs:list`

## Workflow

- Topic branch (`feat/` `fix/` `docs/` `chore/` prefix) → merge to main. Conventional commits, atomic commits
- Never blindly pass `-u` on snapshot failures: find the root cause first — a snapshot diff means a behavior change
- Changes touching exported XML structure must pass the PowerPoint repair-dialog probe before release (`docs/testing.md`)

## Operational Docs (docs/)

Each doc carries front-matter (`summary`/`read_when`). Run `pnpm docs:list` to check for duplicates before adding a new doc.
