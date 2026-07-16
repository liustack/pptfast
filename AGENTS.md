# Project Overview (for AI Agent)

## Goal

`pptfast` — semantic-IR → native editable PPTX toolchain (SDK + CLI, later Claude Code plugin/skills).

## Architecture

IR (zod, `src/ir`) → React SVG templates (`src/svg`: archetypes/blocks/layout, `src/themes`: tokens+manifest)
→ `renderToStaticMarkup` → svg2pptx (`src/pptx`) → pptxgenjs + JSZip patches (animations/gradients) → `.pptx`.
Browser APIs are isolated behind `src/platform` (registry seam, node impl = linkedom + sharp).
See `docs/architecture.md` for the full five-dimension model and render-chain diagram.

## Layout rules

- `src/index.ts` dependency closure must stay free of Node-only deps (commander/linkedom/sharp only under `src/cli*` and `src/platform/node.ts`)
- Migrated code keeps its Chinese comments — do not translate wholesale, do not refactor while migrating
- Path alias `@/*` → `src/*`（tsconfig paths + vitest alias 双处，改一处必改另一处）

## Commands

`pnpm check`（typecheck+lint+test，默认验收）/ `pnpm e2e`（build+CLI 端到端+soffice 目检）/ `pnpm docs:list`

## Workflow

- topic branch（`feat/` `fix/` `docs/` `chore/` 前缀）→ merge to main，conventional commits，原子提交
- 快照失败禁止盲目 `-u`：先查根因，快照差异 = 行为变化
- 涉及导出 XML 结构的改动，发布前须过 PowerPoint 修复弹窗探测（`docs/testing.md`）

## Operational Docs (docs/)

front-matter（`summary`/`read_when`），新文档前先 `pnpm docs:list` 查重。
