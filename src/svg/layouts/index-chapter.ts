import type { ChapterLayout, ChapterLayoutId } from "./types"
import { MastheadChapter } from "./chapter-masthead-chapter"
import { ConstellationChapter } from "./chapter-constellation-chapter"
import { RailChapter } from "./chapter-rail-chapter"
import { BannerChapter } from "./chapter-banner-chapter"
import { PosterChapter } from "./chapter-poster-chapter"
import { RomanChapter } from "./chapter-roman-chapter"
import { ToneAdaptiveChapter } from "./chapter-tone-adaptive-chapter"
import { FashionChapter } from "./chapter-fashion-chapter"
import { VerseChapter } from "./chapter-verse-chapter"

export type { ChapterLayout, ChapterLayoutId } from "./types"

// Wave 2 chapter 页型注册表：六个 ChapterLayoutId 已全部补齐（本任务收尾
// tone-adaptive-chapter，custom 主题），收紧回完整 Record（沿用 cover 页型
// 在 Wave 1 收尾时的同一模式，见 index.ts）。
export const CHAPTER_LAYOUTS: Record<ChapterLayoutId, ChapterLayout> = {
  "masthead-chapter": MastheadChapter,
  "constellation-chapter": ConstellationChapter,
  "rail-chapter": RailChapter,
  "banner-chapter": BannerChapter,
  "poster-chapter": PosterChapter,
  "roman-chapter": RomanChapter,
  "tone-adaptive-chapter": ToneAdaptiveChapter,
  "fashion-chapter": FashionChapter,
  "verse-chapter": VerseChapter,
}
