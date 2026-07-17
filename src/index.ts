export { VERSION } from "./version"
export { PptfastError } from "./errors"
export {
  validateIr,
  formatIssues,
  renderSlideSvg,
  generatePptx,
  listStyles,
  irJsonSchema,
  tokensJsonSchema,
  type ValidateResult,
  type ValidationIssue,
  type StyleInfo,
} from "./api"
export { PptxIRSchema, TokensOverrideSchema, BUILTIN_STYLE_IDS, MasterConfigSchema } from "./ir"
export type { PptxIR, Slide, Block, Meta, Assets, BackgroundSpec, TokensOverride, MasterConfig } from "./ir"
export { installPlatform, type PptfastPlatform } from "./platform/registry"
