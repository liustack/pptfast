import type { DecorProps } from "./types"
import { DecorPiece } from "./decor-piece"
import { leafRecessOpacity } from "./decor-budget"
import { LECTURE_FRAME_BOTTOM_BOARD, frameBottomY } from "./branded-frame"

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
 * ## 下边：branding full 时 y624，否则板上 inset y694
 *
 * 板上 `inset: 26px` 四边等距，下边落在 y694。`branding: "full"` 会画页脚
 * meta 和右下 logo 盒 (1120,630,96×40)，那条横线会穿过去，所以收到 624。
 * 画廊默认省略 branding（等于 cover-only），内容页不画 footer/logo，框
 * 停在 624 会空出约 96px。未声明 full、或 layout `branding: "none"` 时走
 * 板上 694。左右上三边仍是板上的 26px。
 *
 * 安全区：标题区 (96,48,1040×122)、正文区 (96,200,1040×420)、页脚 meta
 * 带 (48,664,1184×44)、右下 logo 盒 (1120,630,96×40)。
 *   - 左右两轨 x26 / x1254，在版心 (x96-1136) 之外。
 *   - 上边 y26，在标题区上沿 y48 之上。
 *   - 下边在 branding full 时 y624（logo 盒上沿之上）。否则 y694。
 *
 * 纪律：零 theme id、零 hex，颜色只来自 ctx（border = 粉笔槽）。
 */

const FRAME_X = 26
const FRAME_Y = 26
const FRAME_RIGHT = 1254
const FRAME_STROKE = 1

export function LectureMotif({ ir, slide, ctx }: DecorProps) {
  const tray = ctx.colors.border ?? ctx.colors.muted
  const bg = ctx.defaultBg ?? ctx.colors.bg
  const bottom = frameBottomY(ir, slide, LECTURE_FRAME_BOTTOM_BOARD)

  return (
    <DecorPiece id="frame">
      <rect
        x={FRAME_X}
        y={FRAME_Y}
        width={FRAME_RIGHT - FRAME_X}
        height={bottom - FRAME_Y}
        fill="none"
        stroke={tray}
        strokeWidth={FRAME_STROKE}
        opacity={leafRecessOpacity(slide.type, tray, bg)}
      />
    </DecorPiece>
  )
}
