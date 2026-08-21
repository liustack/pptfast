import type React from "react"
import type { PptxIR, Slide } from "@/ir"
import type { ComponentCtx } from "../components/types"

/**
 * Props for a motif（原 templates/types.ts 的 DecorProps）。与
 * SvgTemplateProps（layouts/types.ts）相比无 index：装饰几何是
 * (theme, slide.type) 的纯函数。
 */
export interface DecorProps {
  ir: PptxIR
  slide: Slide
  ctx: ComponentCtx
}

/** Motif（原 per-theme Decor）：签名对齐 templates/types.ts 的 DecorProps，可为 null。 */
export type Motif = (p: DecorProps) => React.ReactElement | null

// Wave 3（motif，随 content 任务迁移）
export type MotifId =
  | "banner-motif" | "rail-motif" | "poster-motif"
  | "constellation-motif" | "corner-ornament-motif" | "tone-adaptive-motif"
  | "campaign-motif" // 2026-07-13：多彩笔刷涂鸦（campaign 专属，memphis 拆分 A）
  | "classroom-motif" // 2026-07-13：第 13 主题 classroom 专属；2026-08-20 柔和组重设计为「拍纸簿」（装订孔排+铅笔虚线+回形针），并成为 bloom 的锚点——bloom 是 classroom 的色板 preset，旧的 "bloom-motif"（水彩晕染）随之整个删除
  | "ink-motif" // 2026-07-10：古籍版框+印章+远山（ink 专属新表达）
  | "luxe-motif" // 2026-07-10 全覆盖：烫金细线（luxe 专属）
  | "enterprise-motif" // 2026-07-10 全覆盖：IKB 方块秩序（enterprise 专属）
  | "heritage-motif" // 2026-07-10 全覆盖：典藏纹饰（heritage 专属）
  | "pulse-motif" // 2026-07-28 themes-16 wave T1：细脉搏线+胶囊/细胞圆点簇（pulse 专属，第 14 主题）
  | "terra-motif" // 2026-07-28 themes-16 wave T2：等高线+叶脉/种子点簇（terra 专属，第 15 主题）
  | "ember-motif" // 2026-07-28 themes-16 wave T3：上升火花（渐隐圆点粒子沿弧线上升，ember 专属，第 16 主题）
  | "vermilion-motif" // 2026-08-06 gov-theme wave：旗帜感绸带弧线 + 金色光芒细线（vermilion 专属，第 17 主题；刻意不用政治符号）
  | "crayon-motif" // 2026-08-21：蜡笔描边（顶缘涂边 + 太阳涂鸦 + 底带彩虹划 + 左下星，crayon 专属，单锚不借用）
  | "arena-motif" // 2026-08-21：HUD 括弧＋速度线（arena 专属，单锚不借用。密页降档撤速度线，只留括弧与底能量条）
  | "playbill-motif" // 2026-08-21：右上黑贴片斜 4°（playbill 专属，单锚不借用。heavy 在字重与满版黄，贴片不降档）
