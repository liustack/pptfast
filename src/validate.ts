/**
 * validateIr-only entry (P2 browser-distribution wave, task 1) — the
 * "embed a validator" surface: a web page that lets someone paste/edit IR
 * JSON and see validateIr's errors/warnings needs none of the render/export
 * chain (React, react-dom/server, pptxgenjs, jszip, dagre are all reachable
 * only from generatePptx/renderSlideSvg/auditDeck). This entry's closure
 * stops at validateIr's own dependency graph — zod plus the pure IR
 * schema/quality-check modules under src/ir and src/svg (effective-layout.ts
 * and layouts/registry.ts are metadata tables, no React import).
 *
 * Imports from `./validate-core` directly — *not* `./api`, which also
 * defines `generatePptx`/`renderSlideSvg` and statically imports
 * `./pptx/generate`/`./svg/render-slide` (react-dom/server, jszip,
 * pptxgenjs, dagre) at module scope. A first attempt re-exported the light
 * subset through `./api` and relied on the bundler to tree-shake the unused
 * `generatePptx`/`renderSlideSvg` bindings away — it didn't: esbuild's
 * CJS-interop wrapper for jszip/react-dom's `require()`-based code kept
 * their init closures in the output even though the two functions' own
 * bodies were correctly eliminated (see this task's report for the esbuild
 * metafile trace that caught it). Importing `./validate-core` directly
 * makes the exclusion a physical file-graph fact instead of a tree-shaking
 * bet: this entry's build never even sees `./api`, `./pptx/generate`, or
 * `./svg/render-slide` as input files. The build verification in
 * scripts/e2e.mts asserts this holds: dist/validate.js must never contain
 * pptxgenjs's/react-dom's/jszip's/dagre's actual bundled code.
 */
export {
  validateIr,
  formatIssues,
  formatWarnings,
  listThemes,
  irJsonSchema,
  styleJsonSchema,
  type ValidateResult,
  type ValidationIssue,
  type ThemeInfo,
} from "./validate-core"
export { PptxIRSchema, ThemeSchema, StyleOverrideSchema, BUILTIN_THEME_IDS, BrandConfigSchema, COMPONENT_TYPES } from "./ir"
export type { PptxIR, Slide, Component, Meta, Assets, BackgroundSpec, StyleOverride, BrandConfig } from "./ir"
export { PptfastError } from "./errors"
export { VERSION } from "./version"
