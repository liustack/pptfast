---
"@liustack/pptfast": minor
---

Seal the programmatic SDK entry points (breaking, pre-1.0 minor by convention).

**Breaking:** the `./node`, `./browser`, and `./validate` export subpaths are removed, and the package root is no longer a supported JS API. The self-contained browser bundles (`dist/browser.js`, `dist/validate.js`) are no longer built or shipped. Importing `@liustack/pptfast` from your own code was never announced and had no known consumers; it now carries no semantic-versioning promise (see `docs/internal-api.md`).

The public support surface is: the `pptfast` CLI, the IR schema (`pptfast schema`), the deck project format, the agent skill (`skills/pptfast/SKILL.md`), and the DSH plugin. If you drove pptfast from JS, shell out to the CLI instead — its JSON-and-exit-code contract is covered by semver.
