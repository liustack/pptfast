// Leaf module — no imports. Shared enum value tuples for the three narrative
// axes (strategy / pacing / audience, spec §5, renamed from
// mode/delivery/audience per the vocabulary-v4 wave — spec §8.1's rename
// table and §4's value table).
//
// `src/scenario` (the `Strategy`/`Pacing`/`Audience` types, `resolveNarrative`'s
// runtime validation) reads these tuples from here rather than owning them
// directly. This package's IR schema (`./index.ts`) originally read them too
// (the `narrative` field's axes-object shape used to enum-close per axis
// right at the schema layer) — the W3 task-2 review fix loosened that branch
// to a plain open record (schema now only distinguishes string vs. object,
// `resolveNarrative` is the sole semantic authority), so `./index.ts` no
// longer imports from here. This still stays a separate leaf module rather
// than folding into `src/scenario` directly: `src/scenario/index.test.ts`
// already imports `BUILTIN_THEME_IDS` from `src/ir` (every preset's
// `themeRecommendations` is checked against it), so `src/ir` importing these
// axis tuples *from* `src/scenario` would risk a real cycle the day
// scenario's runtime code (not just its test) needs something from `src/ir`
// too — and `src/ir` reading them again in the future (another schema-layer
// enum, a JSON-schema description, ...) is not unlikely. A neutral leaf
// module with zero imports sidesteps the direction question entirely —
// neither module depends on the other.
//
// File renamed `scenario-values.ts` → `narrative-values.ts` in the
// vocabulary-v4 rename (task 1): not itself one of spec §8.1's named public
// symbols, but this leaf module's entire content is the narrative axis value
// tuples, so its filename follows the same rename for internal consistency.
// Only two importers (`src/scenario/index.ts`, `src/svg/layouts/registry.ts`
// — both updated in the same commit), no external/public path reference.
export const STRATEGY_VALUES = ["pyramid", "storytelling", "instructional", "showcase", "briefing"] as const
export const PACING_VALUES = ["dense", "balanced", "spacious"] as const
export const AUDIENCE_VALUES = ["executive", "technical", "customer", "public"] as const
