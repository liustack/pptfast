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
  // 第七波封面保真（2026-08-22，cover 池 9 -> 13）：四家板面构图在池里不存在，
  // 按构造进共享池。institutional-block = 左置巨字+签名块，memo-head =
  // MEMORANDUM 眉行+红双线+末词下划，board-head = 左轴板书+粉笔弧，
  // bill-head = 出血巨字+底粗线。stage 复用 poster-center，不另开 id。
  | "institutional-block"
  | "memo-head"
  | "board-head"
  | "bill-head"
  // 封面还原第一波（2026-08-22，cover 池 13 -> 19）：六家板面构图在池里
  // 不存在，按构造进共享池。verdict-index = 结论句+强调色块+编号论据，
  // band-title = 通栏色带承反白标题，header-band = 顶栏只承 meta、标题落纸面，
  // paper-masthead = 纸底巨号+右缘年份一字一行，horizon-wedge = 底缘缓坡楔，
  // corner-wedge = 右下角三角楔。单 signer 坐标写在文件常量里，共用构造的
  // 对齐/带高/峰点走 `style.shape.cover`，零 theme id。
  | "verdict-index"
  | "band-title"
  | "header-band"
  | "paper-masthead"
  | "horizon-wedge"
  | "corner-wedge"

// Wave 2（chapter/ending）新增 id：每主题 1 个（命名见 Wave 2 任务表）
export type ChapterLayoutId =
  | "banner-chapter" | "rail-chapter" | "poster-chapter"
  | "constellation-chapter" | "masthead-chapter" | "tone-adaptive-chapter"
  | "fashion-chapter" // 2026-07-10：时尚 magazine 满版色块出血大号（新表达）
  | "roman-chapter" // 2026-07-12：财经罗马数字+圆环光晕（新表达，insight 先挂）
  | "verse-chapter" // editorial-verse wave: pinOnly centered verse as chapter open
export type EndingLayoutId =
  | "banner-ending" | "rail-ending" | "poster-ending"
  | "constellation-ending" | "masthead-ending" | "tone-adaptive-ending"
  | "fashion-ending" // 2026-07-10：时尚 runway 满版收尾（新表达）

// Wave 3（content）新增 id
export type ContentLayoutId =
  | "banner-heading" | "rail-numbered" | "stacked-poster"
  | "bento-panel" | "narrow-column" | "tone-adaptive-content"
  | "two-column" // P3 Item ②：跨主题通用第二 content 版式（轮换素材）
  // P1 variety wave, task 4 (content-pool expansion): a lead+stacked-pair
  // triptych and a whitespace-led centered frame — see each file's own
  // composition-sketch header. The third member (side-highlight) was later
  // retired with its 176px primary side panel.
  | "asymmetric-triptych" | "quiet-frame"
  // Content-layout expansion wave, task T2: the pool's first horizontal
  // split — a full-bleed header band over an ordinary body band.
  | "split-band"
  // quote-stage wave, task T2 (content-pool expansion, 12 -> 13): the
  // pool's first `pinOnly` member (registry.ts's `LayoutDefinition.pinOnly`)
  // — a single-heading "金句" page, capacity-1 body — see the file's own
  // composition-sketch header.
  | "quote-stage"
  // editorial-verse wave: two more pinOnly content members (statement =
  // whole-page verse, pull-quote = centered quote + attribution + prose).
  // Neither enters the auto-pick pool.
  | "statement"
  | "pull-quote"
  // speech-layouts wave: three more pinOnly content members (stat-hero =
  // whole-page number, one-evidence = assertion + one visual, mono-bleed =
  // full-bleed primary field). None enter the auto-pick pool.
  | "stat-hero"
  | "one-evidence"
  | "mono-bleed"
