export { VERSION } from "./version"
export { PptfastError } from "./errors"
export {
  validateIr,
  formatIssues,
  renderSlideSvg,
  generatePptx,
  listThemes,
  irJsonSchema,
  styleJsonSchema,
  type ValidateResult,
  type ValidationIssue,
  type ThemeInfo,
} from "./api"
export { PptxIRSchema, ThemeSchema, StyleOverrideSchema, BUILTIN_THEME_IDS, BrandConfigSchema, COMPONENT_TYPES } from "./ir"
export type { PptxIR, Slide, Component, Meta, Assets, BackgroundSpec, StyleOverride, BrandConfig } from "./ir"
// v3 (frozen, spec §9.3) — kept on the SDK surface only for the deterministic
// migration primitive below and a caller that still needs to parse a
// genuinely v3-shaped document (e.g. the `pptfast migrate` CLI command, task
// 2) before migrating it. `validateIr`'s own v3 path never calls either of
// these — it hard-rejects an explicit `version: "3"` before any schema parse.
export { PptxIRV3Schema } from "./ir/legacy-v3"
export type { PptxIRV3 } from "./ir/legacy-v3"
// Deterministic, pure IR v3 → v4 migration (spec §9.1/§9.3, vocabulary-v4
// rename task 1) — the primitive the `pptfast migrate` CLI command (task 2)
// wraps. Field-for-field, value-for-value; never runs a model, never
// rewrites content, never re-selects a layout.
export { migrateIrV3ToV4 } from "./ir/migrate"
export { registerTheme, getInstalledThemeIds, getThemeDefinition } from "./themes/definitions"
export type { ThemeDefinition, ThemeRegistration } from "./themes/definitions"
export {
  resolveNarrative,
  NARRATIVE_PRESETS,
  PACING_BUDGETS,
  STRATEGY_DEFINITIONS,
  DEFAULT_NARRATIVE,
  STRATEGY_VALUES,
  PACING_VALUES,
  AUDIENCE_VALUES,
  type Strategy,
  type Pacing,
  type Audience,
  type NarrativeProfile,
  type StrategyDefinition,
  type PacingBudget,
  type NarrativePreset,
} from "./scenario"
export { installPlatform, type PptfastPlatform } from "./platform/registry"
export {
  validatePlan,
  planJsonSchema,
  formatPlanIssues,
  resolvePlanThemeId,
  DeckPlanSchema,
  PlanPageSchema,
  PLAN_PAGE_COUNT_RANGE,
  type DeckPlan,
  type PlanPage,
  type PlanPageType,
  type PlanRhythm,
  type PlanValidateResult,
  type PlanValidationIssue,
} from "./plan"
export { assembleDeck, disassembleDeck, type PageContent, type AssembleResult } from "./plan/assemble"
export { auditDeck, type AuditReport, type AuditFinding } from "./svg/audit/deck-audit"
