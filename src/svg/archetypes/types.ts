import type React from "react"
import type { PptxIR, Slide } from "@/ir"
import type { ComponentCtx } from "../components/types"

/**
 * Props every archetype receives（原 templates/types.ts 的 SvgTemplateProps，
 * templates/ 删除后原地定义于此，P2 Wave 5）。
 */
export interface SvgTemplateProps {
  ir: PptxIR
  slide: Slide
  index: number
  ctx: ComponentCtx
}

/**
 * Props for a motif archetype（原 templates/types.ts 的 DecorProps）。与
 * SvgTemplateProps 相比无 index：装饰几何是 (theme, slide.type) 的纯函数。
 */
export interface DecorProps {
  ir: PptxIR
  slide: Slide
  ctx: ComponentCtx
}

/**
 * Cover archetype：与旧模板 Cover 同签名的 SVG fragment 组件（spec §3.2）。
 * 纪律：实现文件内禁 theme id、禁 baked hex——颜色/字体只来自 p.ctx。
 */
export type CoverArchetype = (p: SvgTemplateProps) => React.ReactElement

/** P2：与 Cover 同签名，覆盖 chapter/content/ending 三页型。 */
export type ChapterArchetype = (p: SvgTemplateProps) => React.ReactElement
export type ContentArchetype = (p: SvgTemplateProps) => React.ReactElement
export type EndingArchetype = (p: SvgTemplateProps) => React.ReactElement
/** Motif（原 per-theme Decor）：签名对齐 templates/types.ts 的 DecorProps，可为 null。 */
export type MotifArchetype = (p: DecorProps) => React.ReactElement | null

/** P1 仅两个（spec §4.2）。P2 扩展时在此加 id 并在 index.ts 注册。 */
// Wave 1（cover 补齐）：新增 4 个 id，与 P1 的 2 个合并
export type CoverArchetypeId =
  | "banner-title" | "poster-center"
  | "left-anchor" | "constellation" | "editorial-masthead" | "tone-adaptive-header"
  | "split-diagonal" // P3 Item ①：新表达（非提炼），academic/tech 吸纳
  | "fashion-masthead" // 2026-07-10：时尚 magazine 超大报头（新表达）

// Wave 2（chapter/ending）新增 id：每主题 1 个（命名见 Wave 2 任务表）
export type ChapterArchetypeId =
  | "banner-chapter" | "rail-chapter" | "poster-chapter"
  | "constellation-chapter" | "masthead-chapter" | "tone-adaptive-chapter"
  | "fashion-chapter" // 2026-07-10：时尚 magazine 满版色块出血大号（新表达）
  | "roman-chapter" // 2026-07-12：财经罗马数字+圆环光晕（新表达，insight 先挂）
export type EndingArchetypeId =
  | "banner-ending" | "rail-ending" | "poster-ending"
  | "constellation-ending" | "masthead-ending" | "tone-adaptive-ending"
  | "fashion-ending" // 2026-07-10：时尚 runway 满版收尾（新表达）

// Wave 3（content）新增 id
export type ContentArchetypeId =
  | "banner-heading" | "rail-numbered" | "stacked-poster"
  | "bento-panel" | "narrow-column" | "tone-adaptive-content"
  | "two-column" // P3 Item ②：跨主题通用第二 content 版式（轮换素材）

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
