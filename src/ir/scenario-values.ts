// Leaf module — no imports. Shared enum value tuples for the three scenario
// axes (mode / delivery / audience, spec §5).
//
// `src/scenario` (the `Mode`/`Delivery`/`Audience` types, `resolveScenario`'s
// runtime validation) reads these tuples from here rather than owning them
// directly. This package's IR schema (`./index.ts`) originally read them too
// (the `scenario` field's axes-object shape used to enum-close per axis
// right at the schema layer) — the W3 task-2 review fix loosened that branch
// to a plain open record (schema now only distinguishes string vs. object,
// `resolveScenario` is the sole semantic authority), so `./index.ts` no
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
export const MODE_VALUES = ["pyramid", "narrative", "instructional", "showcase", "briefing"] as const
export const DELIVERY_VALUES = ["text", "balanced", "presentation"] as const
export const AUDIENCE_VALUES = ["executive", "technical", "customer", "public"] as const
