import type { DecorProps } from "./types"

/**
 * lecture-motif —— 「粉笔槽细框」（2026-08-21 黑板夜校主题。设计源
 * `theme-wave7/Lecture.dc.html` 封面样例：`inset: 26px; border: 1px solid
 * #35443C`）。
 *
 * 一件东西，四种页型都画，位置写死，不读内容、不随 seed 变：
 *   - **26px 内缩 1px 细框**：走 `border`（粉笔槽），单层，直角。light 档
 *     的全部量。
 *
 * ## 不做：板上标题下的黄粉笔弧
 *
 * 设计板在标题「反向传播」下面画了一道 `stroke #E9C46A` 的手绘弧。那道弧
 * 跟着标题走，标题换行、换版式、换字号都会让它错位。装饰位置做内容感知会
 * 让 seed 的修订稳定性失效（`docs/designing-themes.md` 第 5 条恒位红线），
 * 所以这道弧**不进 motif**。重点色留给 token `accent`，由版式自己的强调线
 * 去用，不在这里再画一根。
 *
 * ## 与两家框分家
 *
 *   - **对 luxe 请柬金框**：luxe 是双层（1.5px 外框 + 0.75px 内框）走
 *     `accent` 香槟金，框顶还有一枚金菱。本框是单层 1px 走 `border`。单/双
 *     线是结构差，明度是色差：粉笔槽是暗缝（压 bg 1.48:1，板上的凹槽），
 *     香槟金是亮线（压 bg 8.19:1，请柬的闪光）。同一类「页缘框」，两张脸。
 *   - **对 ink 落款列**：ink 的「框」是右缘竖界线 + 逐字落款 + 朱砂印，一
 *     套印章体系。本框四边闭合、零文字、零印。有无印章是两家的分家线，不
 *     是谁的框更细。
 *
 * ## 偏离设计板：下边上移到 y624
 *
 * 板上 `inset: 26px` 四边等距，下边落在 y694。那条横线会从页脚 meta 文字
 * （`brand-chrome.tsx` 基线 y700、字号 20，墨迹大约 y686-704）正中穿过去，
 * 也穿过第五保护带（y620-664）。luxe 把请柬框下边从设计稿的 650 收到 624
 * 是同一条先例：让开右下 logo 盒 (1120,630,96×40)。本框下边收到同一条
 * y624，距 logo 盒上沿 6px，距正文区下沿 y620 4px。1px 发丝落在第五带里，
 * 走 `docs/designing-themes.md` 第 5 条的发丝豁免（≤1.5px）。左右上三边
 * 仍是板上的 26px。
 *
 * 安全区：标题区 (96,48,1040×122)、正文区 (96,200,1040×420)、页脚 meta
 * 带 (48,664,1184×44)、右下 logo 盒 (1120,630,96×40)。
 *   - 左右两轨 x26 / x1254，在版心 (x96-1136) 之外。
 *   - 上边 y26，在标题区上沿 y48 之上。
 *   - 下边 y624，在 logo 盒上沿 y630 之上、页脚带 y664 之上。
 *
 * 纪律：零 theme id、零 hex，颜色只来自 ctx（border = 粉笔槽）。
 */

const FRAME_X = 26
const FRAME_Y = 26
const FRAME_RIGHT = 1254
/**
 * 下边。设计板原稿是 694（1280×720 画布 inset 26），会穿页脚文字基线
 * y700。收到 624：luxe 金框同一条线，让开 logo 盒上沿 y630。
 */
const FRAME_BOTTOM = 624
const FRAME_STROKE = 1

export function LectureMotif({ ctx }: DecorProps) {
  const tray = ctx.colors.border ?? ctx.colors.muted

  return (
    <rect
      x={FRAME_X}
      y={FRAME_Y}
      width={FRAME_RIGHT - FRAME_X}
      height={FRAME_BOTTOM - FRAME_Y}
      fill="none"
      stroke={tray}
      strokeWidth={FRAME_STROKE}
    />
  )
}
