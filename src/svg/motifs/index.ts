import type { Motif, MotifId } from "./types"
import { CornerOrnamentMotif } from "./motif-corner-ornament-motif"
import { RailMotif } from "./motif-rail-motif"
import { BannerMotif } from "./motif-banner-motif"
import { PosterMotif } from "./motif-poster-motif"
import { ToneAdaptiveMotif } from "./motif-tone-adaptive-motif"
import { ConstellationMotif } from "./motif-constellation-motif"
import { CampaignMotif } from "./motif-campaign-motif"
import { ClassroomMotif } from "./motif-classroom-motif"
import { InkMotif } from "./motif-ink-motif"
import { LuxeMotif } from "./motif-luxe-motif"
import { EnterpriseMotif } from "./motif-enterprise-motif"
import { HeritageMotif } from "./motif-heritage-motif"
import { PulseMotif } from "./motif-pulse-motif"
import { TerraMotif } from "./motif-terra-motif"
import { EmberMotif } from "./motif-ember-motif"
import { VermilionMotif } from "./motif-vermilion-motif"
import { CrayonMotif } from "./motif-crayon-motif"
import { ArenaMotif } from "./motif-arena-motif"
import { PlaybillMotif } from "./motif-playbill-motif"

export type { Motif, MotifId } from "./types"

// Wave 3 motif 注册表：六 motif id（每主题一个）已随各自的 content 任务
// 全部迁完，tech 的 constellation-motif 是最后一个（Wave 3 Task 22）——收紧
// 回完整 Record，不再是 Partial 过渡态（沿用 chapter 页型在 Wave 2 收尾任务
// 的同一模式，见 index-chapter.ts）。
export const MOTIFS: Record<MotifId, Motif> = {
  "corner-ornament-motif": CornerOrnamentMotif,
  "rail-motif": RailMotif,
  "banner-motif": BannerMotif,
  "poster-motif": PosterMotif,
  "constellation-motif": ConstellationMotif,
  "tone-adaptive-motif": ToneAdaptiveMotif,
  "campaign-motif": CampaignMotif,
  "classroom-motif": ClassroomMotif,
  "ink-motif": InkMotif,
  "luxe-motif": LuxeMotif,
  "enterprise-motif": EnterpriseMotif,
  "heritage-motif": HeritageMotif,
  "pulse-motif": PulseMotif,
  "terra-motif": TerraMotif,
  "ember-motif": EmberMotif,
  "vermilion-motif": VermilionMotif,
  "crayon-motif": CrayonMotif,
  "arena-motif": ArenaMotif,
  "playbill-motif": PlaybillMotif,
}
