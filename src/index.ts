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
export { registerTheme, getInstalledThemeIds, getThemeDefinition } from "./themes/definitions"
export type { ThemeDefinition } from "./themes/definitions"
export {
  resolveScenario,
  SCENARIO_PRESETS,
  DELIVERY_BUDGETS,
  MODE_DEFINITIONS,
  DEFAULT_SCENARIO,
  MODE_VALUES,
  DELIVERY_VALUES,
  AUDIENCE_VALUES,
  type Mode,
  type Delivery,
  type Audience,
  type ScenarioAxes,
  type ModeDefinition,
  type DeliveryBudget,
  type ScenarioPreset,
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
