import type React from "react"
import type { PptxIR, Slide } from "@/ir"
import type { ComponentCtx } from "../components/types"

/**
 * Props for a motif archetype（原 templates/types.ts 的 DecorProps）。与
 * SvgTemplateProps（archetypes/types.ts）相比无 index：装饰几何是
 * (theme, slide.type) 的纯函数。
 */
export interface DecorProps {
  ir: PptxIR
  slide: Slide
  ctx: ComponentCtx
}

/** Motif（原 per-theme Decor）：签名对齐 templates/types.ts 的 DecorProps，可为 null。 */
export type MotifArchetype = (p: DecorProps) => React.ReactElement | null

// Wave 3（motif，随 content 任务迁移）
export type MotifArchetypeId =
  | "banner-motif" | "rail-motif" | "poster-motif"
  | "constellation-motif" | "corner-ornament-motif" | "tone-adaptive-motif"
  | "campaign-motif" // 2026-07-13：多彩笔刷涂鸦（campaign 专属，memphis 拆分 A）
  | "bloom-motif" // 2026-07-13：水彩晕染+植物细线（bloom 专属，memphis 拆分 B）
  | "classroom-motif" // 2026-07-13：莫兰迪平滑斑块+手绘点线（classroom 专属，第 13 主题）
  | "ink-motif" // 2026-07-10：古籍版框+印章+远山（ink 专属新表达）
  | "luxe-motif" // 2026-07-10 全覆盖：烫金细线（luxe 专属）
  | "enterprise-motif" // 2026-07-10 全覆盖：IKB 方块秩序（enterprise 专属）
  | "heritage-motif" // 2026-07-10 全覆盖：典藏纹饰（heritage 专属）
