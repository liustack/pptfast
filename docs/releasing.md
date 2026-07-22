---
summary: 'Release flow: changesets local mode, three-way version sync, pre-publish gates, manual passkey publish'
read_when:
  - preparing an npm release
  - a version-mismatch guard test fails
  - wondering why there is a .changeset directory
---

# Releasing

Versioning uses [changesets](https://github.com/changesets/changesets) in local
mode — no CI is involved today (the CI rebuild is a recorded future item, and
publishing uses an interactive npm passkey that automation cannot hold). The
version's single source of truth is `package.json`. Two mirrors follow it:
`.claude-plugin/plugin.json` and `src/version.ts`, both pinned by
`src/plugin-manifest.test.ts`, so a missed sync fails `pnpm check`.

## During development

Any wave that ships user-visible change should leave a changeset behind:

```bash
npx changeset        # pick the bump level, write a human-readable summary
```

This creates a markdown file under `.changeset/` that travels with the branch.
Multiple changesets accumulate — `changeset version` later collapses them into
one correct bump (two minors do not become two bumps).

## Cutting a release

On a release branch off `main`:

```bash
pnpm release:version   # changeset version + sync the two mirrors
pnpm check             # guard tests confirm the three-way version agreement
```

Review `CHANGELOG.md`, commit, merge to `main`, then tag the merge:

```bash
git tag v$(node -p "require('./package.json').version")
git push origin main --follow-tags
```

## Publishing (maintainer, manual)

1. `pnpm e2e` — full chain on the built CLI.
2. PowerPoint repair-dialog probe (`docs/testing.md`) — mandatory whenever the
   export XML changed since the last release.
3. `npm publish` — `prepublishOnly` reruns `pnpm check && pnpm e2e` as the
   final gate, then npm prompts for the passkey.

When CI is rebuilt, migrate publishing to npm trusted publishing (OIDC) and
let the changesets action open version PRs — that is the current ecosystem
best practice this local flow deliberately scales down from.
