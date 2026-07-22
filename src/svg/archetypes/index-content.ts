import type { ContentArchetype, ContentArchetypeId } from "./types"
import { NarrowColumnContent } from "./content-narrow-column"
import { TwoColumnContent } from "./content-two-column"
import { RailNumberedContent } from "./content-rail-numbered"
import { BannerHeadingContent } from "./content-banner-heading"
import { StackedPosterContent } from "./content-stacked-poster"
import { ToneAdaptiveContent } from "./content-tone-adaptive-content"
import { BentoPanelContent } from "./content-bento-panel"
import { SideHighlightContent } from "./content-side-highlight"
import { AsymmetricTriptychContent } from "./content-asymmetric-triptych"
import { QuietFrameContent } from "./content-quiet-frame"

export type { ContentArchetype, ContentArchetypeId } from "./types"

// Wave 3 content 页型注册表：六主题四页型的 content 段已全部到位（tech 的
// bento-panel 是最后一个，见 Wave 3 Task 22）——收紧回完整 Record，不再是
// Partial 过渡态（沿用 chapter 页型在 Wave 2 收尾任务的同一模式）。
// P1 variety wave, task 4：content 池 7 -> 10，新增三个（顺序与
// `LAYOUT_REGISTRY`/`CONTENT_LAYOUTS` 的声明顺序一致，见 registry.ts）。
export const CONTENT_ARCHETYPES: Record<ContentArchetypeId, ContentArchetype> = {
  "narrow-column": NarrowColumnContent,
  "two-column": TwoColumnContent,
  "rail-numbered": RailNumberedContent,
  "banner-heading": BannerHeadingContent,
  "stacked-poster": StackedPosterContent,
  "bento-panel": BentoPanelContent,
  "tone-adaptive-content": ToneAdaptiveContent,
  "side-highlight": SideHighlightContent,
  "asymmetric-triptych": AsymmetricTriptychContent,
  "quiet-frame": QuietFrameContent,
}
