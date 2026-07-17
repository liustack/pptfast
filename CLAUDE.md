# CLAUDE.md

1. Read [AGENTS.md](AGENTS.md)
2. Run `pnpm docs:list`, then read the `docs/*.md` relevant to the task

## Iron rules

1. Open a topic branch (`feat/` `fix/` `refactor/` `docs/` `chore/` prefix) before touching main
2. `pnpm check` is the default acceptance gate. Also run `pnpm e2e` when the render chain changes
3. The `src/index.ts` dependency closure must stay free of Node-only deps (commander/linkedom/sharp are only allowed under `src/cli*` and `src/platform/node.ts`)
4. Never blindly pass `-u` on snapshot failures. Find the root cause first
5. Public surfaces (CLI output/error messages/README/JSDoc) are in English. Chinese comments in migrated code stay as-is
