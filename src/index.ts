export { VERSION } from "./version"
export { PptfastError } from "./errors"
export {
  validateIr,
  formatIssues,
  renderSlideSvg,
  generatePptx,
  listThemes,
  irJsonSchema,
  tokensJsonSchema,
  type ValidateResult,
  type ValidationIssue,
  type ThemeInfo,
} from "./api"
export { PptxIRSchema, TokensOverrideSchema, THEME_IDS } from "./ir"
export type { PptxIR, Slide, Block, Meta, Assets, BackgroundSpec, TokensOverride } from "./ir"
export { installPlatform, type PptfastPlatform } from "./platform/registry"
