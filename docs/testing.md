---
summary: 'Test layers: vitest+snapshots, node smoke, e2e with soffice, PowerPoint repair-dialog gate'
read_when:
  - adding or debugging tests
  - before publishing a release
  - export XML structure changed
---

# Testing

## Layers

1. **Unit + snapshot** (`pnpm test`, vitest) — 126 files / 1467 cases, colocated
   with source as `*.test.ts(x)`. Covers the IR schema, every archetype/component,
   the svg2pptx element converters, style tokens, and the animation/gradient/
   media-dedupe JSZip patches. Snapshots pin rendered SVG/DrawingML output.
2. **Node smoke** (`src/platform/node.smoke.test.ts`) — exercises the
   `installNodePlatform()` seam (linkedom DOM parsing, sharp re-encode) against
   real inputs, catching browser/Node DOM behavior drift early.
3. **E2E** (`pnpm e2e`) — builds the package, drives the *built* CLI binary
   (`dist/cli.js`, not the vitest-transpiled source) through render/validate/
   preview on `examples/basic.json`, asserts on the produced pptx's zip
   structure (required XML parts, embedded text), and converts to PDF with
   LibreOffice (`soffice`) when it's installed on the machine — a real render,
   not a mock.

`pnpm check` runs typecheck + lint + `pnpm test` and is the default merge gate.
`pnpm e2e` is not part of `pnpm check` (it needs a build and is slower) — run
it whenever the render chain (`src/svg/`, `src/pptx/`, `src/themes/`) changes.

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
`svg2pptx/` or the animation/gradient JSZip patches), run a local repair-dialog
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
