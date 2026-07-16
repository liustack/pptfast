import type { CoverArchetype, CoverArchetypeId } from "./types"
import { BannerTitleCover } from "./cover-banner-title"
import { PosterCenterCover } from "./cover-poster-center"
import { SplitDiagonalCover } from "./cover-split-diagonal"
import { LeftAnchorCover } from "./cover-left-anchor"
import { ConstellationCover } from "./cover-constellation"
import { EditorialMastheadCover } from "./cover-editorial-masthead"
import { ToneAdaptiveHeaderCover } from "./cover-tone-adaptive-header"
import { FashionMastheadCover } from "./cover-fashion-masthead"

export type { CoverArchetype, CoverArchetypeId } from "./types"

// Wave 1 收尾：六个 CoverArchetypeId 字面量全覆盖，收紧回完整 Record（P1
// Task4→5 起过渡态到此结束，不再是 Partial）。
export const COVER_ARCHETYPES: Record<CoverArchetypeId, CoverArchetype> = {
  "banner-title": BannerTitleCover,
  "poster-center": PosterCenterCover,
  "left-anchor": LeftAnchorCover,
  constellation: ConstellationCover,
  "editorial-masthead": EditorialMastheadCover,
  "tone-adaptive-header": ToneAdaptiveHeaderCover,
  "fashion-masthead": FashionMastheadCover,
  "split-diagonal": SplitDiagonalCover,
}
