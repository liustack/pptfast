import type React from "react"
import type { PptxIR, Slide } from "@/ir"
import type { ComponentCtx } from "../components/types"

/**
 * Props every layout receives（原 templates/types.ts 的 SvgTemplateProps，
 * templates/ 删除后原地定义于此，P2 Wave 5）。
 */
export interface SvgTemplateProps {
  ir: PptxIR
  slide: Slide
  index: number
  ctx: ComponentCtx
}

/**
 * Cover layout：与旧模板 Cover 同签名的 SVG fragment 组件（spec §3.2）。
 * 纪律：实现文件内禁 theme id、禁 baked hex——颜色/字体只来自 p.ctx。
 */
export type CoverLayout = (p: SvgTemplateProps) => React.ReactElement

/** P2：与 Cover 同签名，覆盖 chapter/content/ending 三页型。 */
export type ChapterLayout = (p: SvgTemplateProps) => React.ReactElement
export type ContentLayout = (p: SvgTemplateProps) => React.ReactElement
export type EndingLayout = (p: SvgTemplateProps) => React.ReactElement

/** P1 仅两个（spec §4.2）。P2 扩展时在此加 id 并在 index.ts 注册。 */
// Wave 1（cover 补齐）：新增 4 个 id，与 P1 的 2 个合并
export type CoverLayoutId =
  | "banner-title" | "poster-center"
  | "left-anchor" | "constellation" | "editorial-masthead" | "tone-adaptive-header"
  | "split-diagonal" // P3 Item ①：新表达（非提炼），academic/tech 吸纳
  | "fashion-masthead" // 2026-07-10：时尚 magazine 超大报头（新表达）
  // 主题重设计第一期（2026-08-18，cover 池 8 -> 9）：左轴单栏 + 引首块，
  // 内容右边界收在 x1180 给右缘落款列让路——见 cover-colophon.tsx 的文件头。
  | "colophon"

// Wave 2（chapter/ending）新增 id：每主题 1 个（命名见 Wave 2 任务表）
export type ChapterLayoutId =
  | "banner-chapter" | "rail-chapter" | "poster-chapter"
  | "constellation-chapter" | "masthead-chapter" | "tone-adaptive-chapter"
  | "fashion-chapter" // 2026-07-10：时尚 magazine 满版色块出血大号（新表达）
  | "roman-chapter" // 2026-07-12：财经罗马数字+圆环光晕（新表达，insight 先挂）
export type EndingLayoutId =
  | "banner-ending" | "rail-ending" | "poster-ending"
  | "constellation-ending" | "masthead-ending" | "tone-adaptive-ending"
  | "fashion-ending" // 2026-07-10：时尚 runway 满版收尾（新表达）

// Wave 3（content）新增 id
export type ContentLayoutId =
  | "banner-heading" | "rail-numbered" | "stacked-poster"
  | "bento-panel" | "narrow-column" | "tone-adaptive-content"
  | "two-column" // P3 Item ②：跨主题通用第二 content 版式（轮换素材）
  // P1 variety wave, task 4 (content-pool expansion, 7 -> 10): a persistent
  // asymmetric side panel, a lead+stacked-pair triptych, and a whitespace-
  // led centered frame — see each file's own composition-sketch header.
  | "side-highlight" | "asymmetric-triptych" | "quiet-frame"
  // Content-layout expansion wave, task T1 (content-pool expansion,
  // 10 -> 11): an unconditional 60/40 visual/text split — see the file's own
  // composition-sketch header.
  | "image-lead-split"
  // Content-layout expansion wave, task T2 (content-pool expansion,
  // 11 -> 12): the pool's first horizontal split — a full-bleed header band
  // over an ordinary body band — see the file's own composition-sketch
  // header.
  | "split-band"
  // quote-stage wave, task T2 (content-pool expansion, 12 -> 13): the
  // pool's first `pinOnly` member (registry.ts's `LayoutDefinition.pinOnly`)
  // — a single-heading "金句" page, capacity-1 body — see the file's own
  // composition-sketch header.
  | "quote-stage"
