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
export type { PptxIR, Slide, Block, Meta, Assets, BackgroundSpec, StyleOverride, BrandConfig } from "./ir"
export { installPlatform, type PptfastPlatform } from "./platform/registry"
