// Leaf module (only a type-only import below, erased at compile time — no
// runtime edge) holding the registered-themes storage that BOTH `index.ts`
// (`resolveStyle` must see a registered theme's style tokens) and
// `definitions.ts` (`registerTheme`/`getThemeDefinition`/
// `getInstalledThemeIds`/`__resetRegisteredThemes` — the W3 task-4
// registration seam) need to read.
//
// Why this can't just live inside `definitions.ts` with `index.ts` importing
// it from there: `definitions.ts`'s top-level `THEME_DEFINITIONS` already
// reads `index.ts`'s top-level `CANONICAL_THEME_IDS`/`THEME_STYLES` consts to
// build itself at *its own* module-eval time. If `index.ts` imported
// anything from `definitions.ts` back (even only for later use inside a
// function body — module evaluation is whole-module, not per-binding-usage),
// the module graph's cycle-break would evaluate `definitions.ts`'s top level
// *before* `index.ts`'s own consts are initialized (index.ts would still be
// stuck mid-evaluation, waiting on its own import of definitions.ts) —
// confirmed empirically (both plain Node ESM and this project's Vite/Vitest
// SSR transform) to crash with a TDZ-class error the moment
// `CANONICAL_THEME_IDS.map(...)` runs. A neutral leaf with no back-edge to
// either file sidesteps the direction question entirely — the same fix
// `ir/narrative-values.ts` (renamed from `scenario-values.ts` in the
// vocabulary-v4 rename, task 1) already uses for an analogous cycle risk
// (see that file's docstring for the fuller rationale).
//
// Exported as a raw mutable `Map`, not wrapped in getter/setter functions:
// this module is internal (never re-exported from `src/index.ts`, the public
// SDK barrel) and has exactly two trusted callers — `themes/index.ts`'s
// `resolveStyle` (read-only) and `themes/definitions.ts`'s `registerTheme` /
// `getThemeDefinition` / `getInstalledThemeIds` / `__resetRegisteredThemes`
// (which own validation and are the only intended writers). A wrapper layer
// would add ceremony without adding safety.
import type { ThemeDefinition } from "./definitions"

export const REGISTERED_THEMES = new Map<string, ThemeDefinition>()
