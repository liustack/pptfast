# CLAUDE.md

1. 读 [AGENTS.md](AGENTS.md)
2. 跑 `pnpm docs:list`，按任务读对应 `docs/*.md`

## 铁律

1. 动 main 前必开 topic branch（`feat/` `fix/` `refactor/` `docs/` `chore/` 前缀）
2. `pnpm check` 默认验收，动渲染链加跑 `pnpm e2e`
3. `src/index.ts` 闭包禁 Node-only 依赖（commander/linkedom/sharp 只准在 `src/cli*` 与 `src/platform/node.ts`）
4. 快照失败禁止盲 `-u`，先查根因
5. 公共接口（CLI 输出/错误消息/README/JSDoc）英文，迁移来的中文注释保留
