---
"@liustack/pptfast": minor
---

Browser distribution wave, task 1: `@liustack/pptfast` now ships two additional, fully self-contained ESM entries alongside the existing bundler-oriented default — closing the gap between "the SDK's dependency closure is browser-safe" (always true) and "the published package actually loads in a browser" (not true until now, per a real-Chrome investigation that found a bare `<script type="module">` failing at the very first `import`).

- **`@liustack/pptfast/browser`** — the full engine (`validateIr`/`generatePptx`/`auditDeck`, including the `{ pixels: true }` OffscreenCanvas path), every dependency inlined (react + react-dom/server + zod + jszip + dagre + pptxgenjs, ~1.7 MB raw / ~455 KB gzip). Loads with a bare `<script type="module">`, no bundler, no import map. Verified against a real Chrome tab: identical console behavior to the Node CLI and byte-identical `.pptx` output.
- **`@liustack/pptfast/validate`** — `validateIr` and its own supporting exports only (`formatIssues`/`formatWarnings`/`irJsonSchema`/`styleJsonSchema`/`listThemes`/the IR and style zod schemas), with the render/export chain (`react`, `react-dom/server`, `pptxgenjs`, `jszip`, `dagre`) excluded from the bundle by construction, not just unused at runtime (~730 KB raw / ~155 KB gzip). For an "embed a validator" page that checks pasted/edited IR JSON and has no reason to carry a renderer.
- The default `"."`/`"./node"` entries are unchanged — `dependencies` stay external there, the correct default for a bundler consumer.
- A new build-verification pass (wired into `pnpm e2e`) parses both new bundles post-build and asserts zero bare import/require specifiers, generous size-budget smoke bounds, and tree separation between the two entries — the regression guard for the exact failure class the investigation found.
- README/README.zh-CN gain a Browser section (quickstart for both new subpaths, the bundler path, and honest caveats: assets must be `data:` URIs or CORS-readable `http(s)` URLs, `--pixels`-equivalent auditing needs `OffscreenCanvas`). `docs/architecture.md`'s platform-seam section gets the distribution story.
