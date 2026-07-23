# @liustack/pptfast

## 0.8.0

### Minor Changes

- f0fb885: Structure components wave 2: four new full-body components join `swot`/`bmc`/`waterfall`/`gantt` — `pest` (a political/economic/social/technological macro-environment scan), `five_forces` (Porter's Five Forces hub-and-spoke competitive analysis), `heatmap` (a value-driven color grid with a theme-derived sequential ramp and per-cell accessible ink), and `sankey` (a layered, quantity-proportional flow diagram exported as native editable vectors — zero `<p:pic>`, every band a real `<a:custGeom>`, a direct differentiation point against the rasterized-image treatment this chart type gets elsewhere). `COMPONENT_TYPES` grows from 28 to 32, `FULL_BODY_TYPES` from 4 to 8.

  - Two review-round fixes shipped with the components themselves: `heatmap`'s value-ramp dead zone (a narrow relative-luminance band where neither black nor white ink clears 4.5:1) is now pinned as an audit-visible regression rather than silently degrading, and `sankey`'s label-over-band contrast is measured against the real rendered alpha composite (with an opaque backing chip as a guaranteed fallback when no single ink clears every overlapping band), its node/band stacking order keyed to node id rather than authored array position, and its non-conserved-hub gap explicitly disclosed and covered.
  - Field-alias rescue (`COMPONENT_FIELD_ALIASES`/`COMPONENT_ITEM_FIELD_ALIASES`) and pyramid-strategy narrative-tendency membership — both deferred when the four components first landed — now cover all four, the same treatment `swot`/`bmc`/`waterfall`/`gantt` got (53 total synonym pairs, up from 40).
  - SKILL.md's component-selection table, README/README.zh-CN's full-body paragraph, and every stale "28 components" reference across docs and internal doc comments are updated to 32.
  - The browser-bundle bare-import scanner (`pnpm e2e`'s build-verification leg) is now syntax-aware instead of doing a raw text match, closing a false-positive class a `sankey` validate-error path collided with during development.
  - Full 13-theme contrast-matrix coverage, pathological-input export coverage through the real `generatePptx` + package-audit hard gate for all four, and a zero-findings e2e leg exercising all eight full-body components on one deck.

### Patch Changes

- 2afecab: Headings no longer overflow in PowerPoint. The width estimator gains exact per-character advance models for the exported faces (Georgia and Microsoft YaHei, both weights, extracted from real font metrics) with a conservative fallback for unmeasured faces — bold headings were previously estimated with regular-weight assumptions and could clip at the slide edge. Nine structure components additionally now pass their heading weight through the fitter.
- 1a9dffa: Validation now emits non-blocking editorial warnings when comparison, citation, or architecture content exceeds its editorial budget, alongside the existing hard geometric limits. Export hardening: the timestamp normalizer is enforced as the final patch in the export chain, and a determinism-seal violation now surfaces loudly instead of being swallowed by media dedupe's error handling.

## 0.7.0

### Minor Changes

- 0420c3c: P0 hardening wave: depth-axis robustness, input-trust surface, error-message quality, and export-byte-determinism hardening across the validate/render/export chain, plus a SKILL.md fix targeting the largest share of residual weak-model failures.

  - **Depth axis** (unbounded array fields, not deck breadth): `bullets`/`comparison`/`citation`/`architecture`/`timeline` text-stacking components now cap their vertical item stack to the component's own box height instead of overflowing the 1280×720 canvas — extreme item counts land gracefully with `data-dropped`/`data-truncated` markers instead of producing a non-integer EMU value that crashed package-audit. A horizontal-axis sweep also found and fixed a reachable negative-width crash in `kpi_cards` at high item counts. `bullets_overflow` now escalates from warning to hard error at item counts far past the pacing budget (previously only geometry-crash-adjacent extremes were caught, and only indirectly). `formatViolations` now groups and truncates package-audit's violation list (first 20 per rule + a total count) instead of dumping every line — a single pathological input used to produce a 2.5MB error string.
  - **Input trust surface**: `validateIr` now byte-sniffs image assets (PNG/JPEG/WebP/GIF magic bytes) instead of trusting the file extension alone, rejecting zero-byte, corrupted, or extension-mismatched assets as an error before they can silently reach the exported package (this covers both local file assets and fetched http(s) assets). A dangling `asset_id` — one that doesn't resolve against `assets.images` — now warns and names the missing key, closing what was previously a fully silent misconfiguration (a gray placeholder box with no error or warning anywhere in the chain). `auditDeck` now guards against raw, unvalidated IR input with a `PptfastError` pointing at `validateIr` instead of an opaque downstream crash, on both Node and browser platforms.
  - **Error-message quality**: icon and component-`type` enum validation errors now suggest the closest valid value ("did you mean 'circle-check'?") instead of dumping the full enum wall — a single typo could previously produce an error message over 24,000 characters long. The `scenario`→`narrative` v3-rename hint generalizes to the rest of the v2/v3 migration map (starting with `blocks`→`components`), and an "Unrecognized key" error now adds a general pointer toward where a misplaced field likely belongs (e.g. `components` under `slides[].components[]`).
  - **Whole-file export determinism**: every zip entry written across the export chain — pptxgenjs's own initial write plus every JSZip patch stage (gradient fills, `a:ea` CJK font slots, slide transitions, element animations, media dedupe) — now carries a fixed timestamp, and `docProps/core.xml`'s `<dcterms:created>`/`<dcterms:modified>` are pinned to the same fixed instant. Rendering the same IR twice, even across a real multi-second gap, now produces a byte-identical `.pptx` (verified via whole-file SHA256), replacing jszip's prior default of stamping every entry with the real wall-clock instant it was written — content was always deterministic, but the packaged bytes were not.
  - **`skills/pptfast/SKILL.md`**: the `cover`/`chapter`/`ending` boundary-page rule ("these page types never render `components` or `footnote`") moved from a mid-Phase-3 aside to Phase 1, with a concrete wrong/corrected page-JSON example — a benchmark rescoring pass found this single misunderstanding behind 60% of residual weak-model validate failures.

- 86d8dec: Variety wave: the deterministic engine now varies real composition, not just paint.

  - Page-level `beat` (anchor / dense / breathing) is a live selection signal — declared beats weight the layout pick (composed with strategy weights via max, never compounding), while decks without beats render byte-identically.
  - Theme motifs rotate within style-compatible candidate sets per page and seed instead of one fixed sticker per deck, with a decor-visibility guard, and chart palettes shift phase by deck seed.
  - Cover/chapter/ending pages take on the narrative strategy's character through soft selection weights, and pyramid/briefing content tendencies now genuinely differ.
  - Three new content archetypes (side-highlight, asymmetric-triptych, quiet-frame) grow the thinnest pool from 7 to 10, raising realized layout entropy and cutting repeat rates.

- 339136b: Browser distribution wave, task 1: `@liustack/pptfast` now ships two additional, fully self-contained ESM entries alongside the existing bundler-oriented default — closing the gap between "the SDK's dependency closure is browser-safe" (always true) and "the published package actually loads in a browser" (not true until now, per a real-Chrome investigation that found a bare `<script type="module">` failing at the very first `import`).

  - **`@liustack/pptfast/browser`** — the full engine (`validateIr`/`generatePptx`/`auditDeck`, including the `{ pixels: true }` OffscreenCanvas path), every dependency inlined (react + react-dom/server + zod + jszip + dagre + pptxgenjs, ~1.7 MB raw / ~455 KB gzip). Loads with a bare `<script type="module">`, no bundler, no import map. Verified against a real Chrome tab: identical console behavior to the Node CLI and byte-identical `.pptx` output.
  - **`@liustack/pptfast/validate`** — `validateIr` and its own supporting exports only (`formatIssues`/`formatWarnings`/`irJsonSchema`/`styleJsonSchema`/`listThemes`/the IR and style zod schemas), with the render/export chain (`react`, `react-dom/server`, `pptxgenjs`, `jszip`, `dagre`) excluded from the bundle by construction, not just unused at runtime (~730 KB raw / ~155 KB gzip). For an "embed a validator" page that checks pasted/edited IR JSON and has no reason to carry a renderer.
  - The default `"."`/`"./node"` entries are unchanged — `dependencies` stay external there, the correct default for a bundler consumer.
  - A new build-verification pass (wired into `pnpm e2e`) parses both new bundles post-build and asserts zero bare import/require specifiers, generous size-budget smoke bounds, and tree separation between the two entries — the regression guard for the exact failure class the investigation found.
  - README/README.zh-CN gain a Browser section (quickstart for both new subpaths, the bundler path, and honest caveats: assets must be `data:` URIs or CORS-readable `http(s)` URLs, `--pixels`-equivalent auditing needs `OffscreenCanvas`). `docs/architecture.md`'s platform-seam section gets the distribution story.

## 0.6.0

### Minor Changes

- 4604367: Chart `axes` field now renders. `x_title`/`y_title` draw as fitted axis titles on bar (both directions) and line charts, with space reserved only when present. `show_grid` toggles the existing bar/line gridlines and adds an opt-in vertical grid for horizontal bars. Non-cartesian chart types (pie, funnel, dumbbell) report a non-blocking validate warning instead of silently ignoring the field.

## 0.5.0

### Minor Changes

- Audit chain, CJK font identity, and text-fit hardening.

  - Package-integrity hard gate on every export (9 OOXML invariants, no opt-out) plus an optional pixel-contrast audit (`pptfast audit --pixels`, Node via sharp and browser via OffscreenCanvas) with an explicit `checks` field — an unchecked pass can never read as a pass.
  - East-asian typeface slots (`a:ea`) declared on every text run, so CJK glyphs under Georgia/Consolas render in a controlled font instead of PowerPoint's silent per-glyph substitution.
  - `validate` moves to dual-threshold severity: editorial budgets warn without blocking, geometric content-loss ceilings block. Long bullet items that render fine no longer fail generation.
  - Exact mono width model for code blocks (measured Consolas metrics), universal bullet wrap budgets across all styles, matrix axis-title fitting, and a heading truncation signal the audit can see.
  - Chart robustness: zero/negative data values, mixed-sign dumbbell domains, and extreme magnitudes all export cleanly. Donut/pie center labels attribute contrast against the real sector geometry, not a bounding box.

## 0.4.0 (2026-07-20)

Narrative vocabulary v4 — `narrative`/`strategy`/`pacing`/`beat`, `deck.spec.json`, IR v4 with a `migrate` command for v3 projects. Benchmark-driven fixes: deterministic exports, audit attribution overhaul, CJK copy cleanup, boundary-page hard gates, truncation visibility markers.

## 0.3.0 (2026-07-19)

Keynote-style flat rendering, weighted deterministic layout selection with seed-stable revisions, 13 themes with a real-contrast ink system, deck-project workflow (spec + pages, assemble/disassemble), deterministic audit, speaker notes, preview overlay with annotation export, 28 components including SWOT/BMC/waterfall/gantt.

## 0.1.0 (2026-07-17)

Initial release — semantic IR to native editable PPTX via an SVG dialect compiler.
