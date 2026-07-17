// Leaf module — no imports. Shared enum value tuples for the three scenario
// axes (mode / delivery / audience, spec §5).
//
// Both this package's IR schema (`./index.ts`, the `scenario` field's
// axes-object shape) and `src/scenario` (the `Mode`/`Delivery`/`Audience`
// types, `resolveScenario`'s runtime validation) import from here, instead
// of one module importing the other's:
//
// `src/scenario/index.test.ts` already imports `BUILTIN_THEME_IDS` from
// `src/ir` (every preset's `themeRecommendations` is checked against it), so
// if `src/ir` in turn imported these axis tuples *from* `src/scenario`, that
// direction would risk a real cycle the day scenario's runtime code (not
// just its test) needs something from `src/ir` too. A leaf module with zero
// imports that both sides read from sidesteps the direction question
// entirely — neither module depends on the other.
export const MODE_VALUES = ["pyramid", "narrative", "instructional", "showcase", "briefing"] as const
export const DELIVERY_VALUES = ["text", "balanced", "presentation"] as const
export const AUDIENCE_VALUES = ["executive", "technical", "customer", "public"] as const
