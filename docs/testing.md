---
summary: 'Test layers: vitest+snapshots, node smoke, CLI and DSH e2e, PowerPoint repair-dialog gate'
read_when:
  - adding or debugging tests
  - before publishing a release
  - export XML structure changed
  - validating the installed DSH plugin
---

# Testing

## Layers

1. **Unit + snapshot** (`pnpm test`, vitest) — 157 files / 2878 cases, colocated
   with source as `*.test.ts(x)`. Covers the IR schema, every archetype/component,
   the svg2pptx element converters, style tokens, the animation/gradient/
   ea-font/media-dedupe JSZip patches, the deck spec schema and hard gates,
   assemble/disassemble plus the deck-project-directory CLI shell, the v3→v4
   and deck.plan.json→deck.spec.json migration functions, the
   deterministic deck audit (overflow/out-of-bounds/low-contrast/overlap/
   content-truncated/content-dropped), the optional pixel-contrast audit
   (`--pixels` — real-Sharp end-to-end coverage plus a dedicated no-platform
   file for the "nothing can rasterize" contract, see `docs/contrast-system.md`),
   and the PPTX package-audit reader and rules (see "Package-audit hard gate"
   below).
   Snapshots pin rendered SVG/DrawingML output.
2. **Node smoke** (`src/platform/node.smoke.test.ts`) — exercises the
   `installNodePlatform()` seam (linkedom DOM parsing, sharp re-encode) against
   real inputs, catching browser/Node DOM behavior drift early.
   `src/platform/node-rasterize.test.ts` does the same for `rasterizeSvg`,
   plus the red-first Sharp/librsvg fidelity probe against a real subset of
   this repo's own SVG output (spec §11.9's escape-clause evidence).
3. **E2E** (`pnpm e2e`) — builds the package, drives the *built* CLI binary
   (`dist/cli.js`, not the vitest-transpiled source) through render/validate/
   preview on `examples/basic.json`, a deck project directory leg (a temp
   spec + pages directory left with one unfilled page → `assemble` reports it
   as a placeholder → a plain `render` is refused → `render --draft` succeeds
   with the placeholder as a real slide → filling the page and re-assembling
   drops the placeholder count to zero → a plain `render` then succeeds too),
   an audit leg (`examples/basic.json` audits clean and exits 0, while a
   deliberately near-background text color, set via a validate-legal
   `theme.style` override, exits 1 with a low-contrast finding in both human
   and `--json` output, plus an `--pixels` leg exercising real Sharp through
   the built binary), a migrate leg (a pre-rename `deck.plan.json`
   project directory migrates to `deck.spec.json` with `scenario`→`narrative`
   and `rhythm`→`beat` renamed and the source file left untouched, both files
   present is a hard error, migrate never overwrites an existing output),
   asserts on the produced pptx's zip structure
   (required XML parts, embedded text), and converts to PDF with LibreOffice
   (`soffice`) when it's installed on the machine — a real render, not a mock.

`pnpm check` runs typecheck + lint + `pnpm test` and is the default merge gate.
`pnpm e2e` is not part of `pnpm check` (it needs a build and is slower) — run
it whenever the render chain (`src/svg/`, `src/pptx/`, `src/themes/`) changes.

## Installed DSH plugin E2E

The DSH browser flow is a host-level smoke test. It proves that the selected
profile loads the published plugin, the model sees the registered skill, and
the plugin's packaged CLI can make a PPTX in a real workspace. Prepare an
isolated existing directory, then run the read-only preflight:

```bash
mkdir -p /tmp/pptfast-dsh-e2e
pnpm e2e:dsh --workspace /tmp/pptfast-dsh-e2e --profile web
```

The preflight checks four boundaries. The selected profile must declare
`@liustack/pptfast`. Its own `node_modules` must contain the same version as
this checkout plus the plugin entry, bundle patch, skill, and packaged CLI.
DSH's composed config must mount the `pptfast` row. The workspace path is
resolved with `fs.realpath`, matching DSH's `WorkspaceRegistry.create`
identity rule, and the canonical value is printed for the browser leg.

On macOS this distinction is observable because `/tmp/...` normally resolves
to `/private/tmp/...`. Add the workspace through DSH's own directory picker
when testing by hand. The picker crosses the host API and preserves the
registry invariant. Chrome automation cannot drive the native directory
picker. If a browser fixture must be seeded outside the UI, store the exact
`canonical workspace` value printed by the preflight. Do not write the
unresolved `/tmp` spelling into the storage fixture. A fresh session records
its canonical cwd, and DSH rejects attachment when that value differs from a
fixture path by strict string comparison.

Start the web profile from the same canonical workspace, then open its URL in
Chrome:

```bash
cd /private/tmp/pptfast-dsh-e2e
npx -y @deepseek-ai/dsh web
```

Create a fresh session in that workspace and ask DSH to make a small deck with
pptfast, saving its source as `dsh-pptfast-e2e.json` and its output as
`dsh-pptfast-e2e.pptx`. The source must pass the installed CLI's validate and
audit commands. The result must be a non-empty package and render through
LibreOffice when available:

```bash
test -s /private/tmp/pptfast-dsh-e2e/dsh-pptfast-e2e.pptx
unzip -tq /private/tmp/pptfast-dsh-e2e/dsh-pptfast-e2e.pptx
node ~/.dsh/profiles/web/node_modules/@liustack/pptfast/dist/cli.js \
  validate /private/tmp/pptfast-dsh-e2e/dsh-pptfast-e2e.json
node ~/.dsh/profiles/web/node_modules/@liustack/pptfast/dist/cli.js \
  audit /private/tmp/pptfast-dsh-e2e/dsh-pptfast-e2e.json
soffice --headless --convert-to pdf --outdir /private/tmp/pptfast-dsh-e2e \
  /private/tmp/pptfast-dsh-e2e/dsh-pptfast-e2e.pptx
```

The browser session, generated file, audit output, and rendered PDF together
are the DSH plugin evidence. The normal `pnpm e2e` remains the deterministic
render-chain gate and does not require DSH or model credentials.

## Package-audit hard gate

`generatePptxBlob` (`src/pptx/generate.ts`) runs a package-structure audit
(`src/pptx/package-audit.ts`) on every export, right after the last JSZip
patch (media dedupe) and before returning bytes — piggybacking that patch's
own `JSZip.loadAsync` rather than re-reading the package. It checks OOXML
invariants a broken patch could plausibly violate (core parts present,
`[Content_Types].xml`/relationships parse, `presentation.xml`'s slide list
agrees with its relationships and the actual slide parts, every internal
relationship target resolves, `p:cNvPr` ids are unique per slide, shape
transforms are finite integers with positive `cx`/`cy` except a connector's
one allowed zero axis, animation timing references a real shape on the
same slide, and — IR-aware, via the call's own optional second `ir`
argument (alt-emission-closure fix wave, rewriting the original A11Y-01 alt
chain rule) — a two-sided alt-preservation invariant keyed on the ops that
actually reached svg2pptx, never the IR's *declared* `slide.components`
list (a component `layoutContentFit` gracefully drops on overflow is
correctly not checked at all): (a) every rendered image op that carries
`alt` (from the SVG's `aria-label`) exports that exact string as its
shape's `descr`, and (b) every alt-bearing IR asset that was actually
rendered on the slide has at least one matching rendered `<image>` that
carries its alt as `aria-label` (catches an emission site that draws the
image but forgets to wire the attribute) and
throws a `PptfastError` naming the broken invariant — there is no opt-out. `src/pptx/package-audit.test.ts` renders a real deck and
surgically breaks it via JSZip to prove each invariant actually rejects the
right corruption. `scripts/e2e.mts`'s package-audit leg re-asserts the
three-way slide consistency and id-uniqueness invariants directly against
the built CLI's own output. Read-only by construction —
`PptxPackageReader` (`src/pptx/package-reader.ts`) exposes no mutating
method.

## Snapshot policy

**Never blind-update with `-u`.** A snapshot diff *is* a behavior change —
before regenerating, read the diff and confirm it's the change you intended.
Silently accepting a snapshot update is how visual regressions slip past
review.

## PowerPoint repair-dialog gate

Native PowerPoint is stricter than LibreOffice and pptxgenjs about DrawingML
well-formedness. A file that opens fine in `soffice` can still trigger
PowerPoint's "we found a problem with some content" repair dialog. Before
publishing a release that touched the export XML (`src/pptx/`, especially
`svg2pptx/` or the animation/gradient/ea-font JSZip patches), run a local repair-dialog
probe on a real macOS + PowerPoint install:

```bash
pnpm e2e   # produce .e2e-out/*.pptx first
osascript scripts/ppt-repair-check.applescript "$PWD/.e2e-out/basic.pptx"   # → OK
osascript scripts/ppt-repair-check.applescript "$PWD/.e2e-out/webp.pptx"    # → OK
```

The script quits PowerPoint, opens the file, and polls for the repair dialog
(`REPAIR_DIALOG`), a repaired-title window (`REPAIRED_TITLE`), a clean open
(`OK`), or `TIMEOUT` (~30s per file). A clean open across the example decks
is the release gate — no automated substitute reliably catches this class of
bug, since neither LibreOffice nor pptxgenjs's own validation reproduces
PowerPoint's parser.
