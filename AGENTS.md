# Project Overview (for AI Agent)

## Goal

`pptfast` — semantic-IR → native editable PPTX toolchain (SDK + CLI, later Claude Code plugin/skills).

## Architecture

IR (zod, `src/ir`) → React SVG templates (`src/svg`: archetypes/blocks/layout, `src/styles`: tokens+manifest)
→ `renderToStaticMarkup` → svg2pptx (`src/pptx`) → pptxgenjs + JSZip patches (animations/gradients) → `.pptx`.
Browser APIs are isolated behind `src/platform` (registry seam, node impl = linkedom + sharp).
See `docs/architecture.md` for the full five-dimension model and render-chain diagram.

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
