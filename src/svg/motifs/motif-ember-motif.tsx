import type { DecorProps } from "./types"

/**
 * ember-motif v3 —— 上升火星退役（第八波批 1）。
 *
 * 板上中景只剩角楔，碎点和斜引线被否。封面双层楔由 `corner-wedge` 版式画，
 * 章节右下小楔由 `ember-index-chapter` 版式画。本 motif 不再输出任何叶子：
 * 封面 / 内容 / 收尾 / 章节一律 `return null`，零碎点、零斜引线、零孤立 tick。
 *
 * 若某一页的章节版式自己不画小楔，本文件可以再把小楔接回来（包进
 * `data-decor-piece`，opacity 走 `leafRecessOpacity`）。当前锁板的章节版式
 * 已经画了，这里不重画。
 *
 * 纪律：零 theme id、零 hex。本 motif 仍是 ember 独占的单成员候选集
 * （`motif-selection.ts` 的 `MOTIF_CANDIDATES`）。
 */
export function EmberMotif(_props: DecorProps) {
  return null
}
