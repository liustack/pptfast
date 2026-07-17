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
export { PptxIRSchema, ThemeSchema, StyleOverrideSchema, BUILTIN_THEME_IDS, BrandConfigSchema } from "./ir"
export type { PptxIR, Slide, Component, Meta, Assets, BackgroundSpec, StyleOverride, BrandConfig } from "./ir"
export {
  resolveScenario,
  SCENARIO_PRESETS,
  DELIVERY_BUDGETS,
  MODE_DEFINITIONS,
  DEFAULT_SCENARIO,
  type Mode,
  type Delivery,
  type Audience,
  type ScenarioAxes,
  type ModeDefinition,
  type DeliveryBudget,
  type ScenarioPreset,
} from "./scenario"
export { installPlatform, type PptfastPlatform } from "./platform/registry"
