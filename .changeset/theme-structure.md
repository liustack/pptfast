---
"@liustack/pptfast": minor
---

`ThemeDefinition` gains an optional `layoutTendencies` field: a per-page-type soft weight (`{ cover?, chapter?, content?, ending?: string[] }`) naming the archetype ids a theme's author wants auto-selection to lean toward, composed with the existing narrative-strategy and beat weights via `max` (agreement corroborates a pick, it never compounds into a monoculture). It is a soft steer within a theme's own `layouts` set, never a second whitelist — a tendency can only reweight an id already curated into that set for the same page type.

Six of the thirteen built-in themes (`consulting`, `insight`, `academic`, `tech`, `runway`, `journal`) now declare tendencies on their cover/chapter/ending pages, each toward the archetype family that is that theme's own native visual register (e.g. `consulting` toward its banner-assertion layouts, `journal` toward its masthead family). Practically, this means the same deck rendered under two different themes can now differ in *which layouts get picked*, not only in color and type — a fixed IR and seed rendered across all 13 themes previously produced one identical per-page layout sequence; it now produces seven distinct sequences.

Fully backward compatible: the field is optional, and any theme that doesn't declare it — the other 7 built-ins, every custom theme registered via `registerTheme` before this release, and any deck whose pages pin `layout` explicitly — renders and selects exactly as it did before, byte-for-byte.
