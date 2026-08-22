import type { ContentLayout, ContentLayoutId } from "./types"
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
import { SplitBandContent } from "./content-split-band"
import { QuoteStageContent } from "./content-quote-stage"
import { StatementContent } from "./content-statement"
import { PullQuoteContent } from "./content-pull-quote"
import { StatHeroContent } from "./content-stat-hero"
import { OneEvidenceContent } from "./content-one-evidence"
import { MonoBleedContent } from "./content-mono-bleed"

export type { ContentLayout, ContentLayoutId } from "./types"

// Wave 3 content 页型注册表：六主题四页型的 content 段已全部到位（tech 的
// bento-panel 是最后一个，见 Wave 3 Task 22）——收紧回完整 Record，不再是
// Partial 过渡态（沿用 chapter 页型在 Wave 2 收尾任务的同一模式）。
// P1 variety wave, task 4：content 池 7 -> 10，新增三个（顺序与
// `LAYOUT_REGISTRY`/`CONTENT_LAYOUT_DEFS` 的声明顺序一致，见 registry.ts）。
// Content-layout expansion wave, task T2：新增 split-band。
// quote-stage / editorial-verse / speech-layouts waves：pinOnly members
// (quote-stage, statement, pull-quote, stat-hero, one-evidence, mono-bleed).
// Gallery r2 D10 retired image-lead-split. Auto-selectable content pool is
// 11, plus 6 pin-only.
export const CONTENT_LAYOUTS: Record<ContentLayoutId, ContentLayout> = {
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
  "split-band": SplitBandContent,
  "quote-stage": QuoteStageContent,
  statement: StatementContent,
  "pull-quote": PullQuoteContent,
  "stat-hero": StatHeroContent,
  "one-evidence": OneEvidenceContent,
  "mono-bleed": MonoBleedContent,
}
