import type { ContentArchetype, ContentArchetypeId } from "./types"
import { NarrowColumnContent } from "./content-narrow-column"
import { TwoColumnContent } from "./content-two-column"
import { RailNumberedContent } from "./content-rail-numbered"
import { BannerHeadingContent } from "./content-banner-heading"
import { StackedPosterContent } from "./content-stacked-poster"
import { ToneAdaptiveContent } from "./content-tone-adaptive-content"
import { BentoPanelContent } from "./content-bento-panel"

export type { ContentArchetype, ContentArchetypeId } from "./types"

// Wave 3 content 页型注册表：六主题四页型的 content 段已全部到位（tech 的
// bento-panel 是最后一个，见 Wave 3 Task 22）——收紧回完整 Record，不再是
// Partial 过渡态（沿用 chapter 页型在 Wave 2 收尾任务的同一模式）。
export const CONTENT_ARCHETYPES: Record<ContentArchetypeId, ContentArchetype> = {
  "narrow-column": NarrowColumnContent,
  "rail-numbered": RailNumberedContent,
  "banner-heading": BannerHeadingContent,
  "stacked-poster": StackedPosterContent,
  "bento-panel": BentoPanelContent,
  "tone-adaptive-content": ToneAdaptiveContent,
  "two-column": TwoColumnContent,
}
