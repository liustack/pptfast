---
summary: 'Internal JS API: the SDK surface is sealed — dist entries exist for the package''s own use, no semver promise'
read_when:
  - tempted to import @liustack/pptfast from JS
  - wondering why exports has no /node /browser /validate subpaths
  - wiring a new internal consumer (DSH plugin, MCP, tools)
---

# Internal JS API — no public promise

**Internal implementation. No semantic-versioning promise.** Everything in
this document can change or disappear in any release, including a patch.

## What happened

The pre-0.17 releases exported a programmatic SDK (`.` root, `/node`,
`/browser`, `/validate` subpaths). It was sealed in the SDK-sealing wave:
the package had never been announced, had zero known JS consumers, and a
public JS API is pure maintenance surface (Hyrum's law). The public support
surface is now:

- the **CLI** (`pptfast …`)
- the **IR schema** (`pptfast schema`) and its validate/render contract
- the **deck project format** (`deck.spec.json` + `pages/` + `assets/`)
- the **agent skill** (`skills/pptfast/SKILL.md`)
- the **DSH plugin** (the package root export)

## What still builds, and for whom

`dist/index.js` and `dist/node.js` are still built (see `tsup.config.ts`).
They exist so that code *inside this package* — the CLI bundle, the DSH
plugin layer under `dsh/`, and future MCP/tool surfaces — can share the
render core by **relative path** (`../dist/index.js`), version-locked to
the same install. They are deliberately absent from `package.json`
`exports`, so Node refuses a bare `@liustack/pptfast/node` import from
outside the package.

If you need pptfast from your own program, shell out to the CLI: `pptfast
validate` / `render` / `preview` speak JSON and exit codes, and that
contract *is* covered by semver.

## The former browser bundles

`dist/browser.js` and `dist/validate.js` (self-contained ESM for bare
`<script type="module">` pages) were external-only artifacts and are no
longer built. If a web playground ever ships, it will be a product built on
the internal API, not an exported bundle.
