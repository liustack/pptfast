---
summary: 'Test layers: vitest+snapshots, node smoke, e2e with soffice, PowerPoint repair-dialog gate'
read_when:
  - adding or debugging tests
  - before publishing a release
  - export XML structure changed
---

# Testing

## Layers

1. **Unit + snapshot** (`pnpm test`, vitest) — 148 files / 2676 cases, colocated
   with source as `*.test.ts(x)`. Covers the IR schema, every archetype/component,
   the svg2pptx element converters, style tokens, the animation/gradient/
   media-dedupe JSZip patches, the deck spec schema and hard gates,
   assemble/disassemble plus the deck-project-directory CLI shell, the v3→v4
   and deck.plan.json→deck.spec.json migration functions, the
   deterministic deck audit (overflow/out-of-bounds/low-contrast/overlap/
   content-truncated/content-dropped), and the PPTX package-audit reader and
   rules (see "Package-audit hard gate" below).
   Snapshots pin rendered SVG/DrawingML output.
2. **Node smoke** (`src/platform/node.smoke.test.ts`) — exercises the
   `installNodePlatform()` seam (linkedom DOM parsing, sharp re-encode) against
   real inputs, catching browser/Node DOM behavior drift early.
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
   and `--json` output), a migrate leg (a pre-rename `deck.plan.json`
   project directory migrates to `deck.spec.json` with `scenario`→`narrative`
   and `rhythm`→`beat` renamed and the source file left untouched, both files
   present is a hard error, migrate never overwrites an existing output),
   asserts on the produced pptx's zip structure
   (required XML parts, embedded text), and converts to PDF with LibreOffice
   (`soffice`) when it's installed on the machine — a real render, not a mock.

`pnpm check` runs typecheck + lint + `pnpm test` and is the default merge gate.
`pnpm e2e` is not part of `pnpm check` (it needs a build and is slower) — run
it whenever the render chain (`src/svg/`, `src/pptx/`, `src/themes/`) changes.

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
one allowed zero axis, and animation timing references a real shape on the
same slide) and throws a `PptfastError` naming the broken invariant — there
is no opt-out. `src/pptx/package-audit.test.ts` renders a real deck and
surgically breaks it via JSZip to prove each invariant actually rejects the
right corruption; `scripts/e2e.mts`'s package-audit leg re-asserts the
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
