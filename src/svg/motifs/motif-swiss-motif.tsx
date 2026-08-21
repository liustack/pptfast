import { CANVAS_W_PX } from "../../constants"
import type { DecorProps } from "./types"

/**
 * swiss-motif —— 「冷白制度」页缘（2026-08-21 wave7，设计源
 * `theme-wave7/Swiss.dc.html` 的封面样例 + 任务书的 motif 条款）。
 *
 * light 档，两件，位置写死，四页型同一张：
 *   - **顶边 12px 红条**：y0–12 通栏，走 accent（瑞士红）。五区外（标题区
 *     上沿是 y48）。这是「红成边」的那一条边，不是横幅，上面不承字。
 *   - **右缘 x1252 三格灰刻度短划**：y64 / 96 / 128（32px 模数），各 16px
 *     水平短划指向页缘，走 muted。落在右缘空带，标题区/正文区右沿 x1136
 *     之外，也在右上 logo 带 (1120,48,96×40) 右沿之外。
 *
 * **板上那根 x852 整高裸格线不进本文件。** 它纵穿正文区 (96,200,1040×420)，
 * 违反 `docs/designing-themes.md` 第 5 条五个保护区。封面样例用它交代网格，
 * 引擎里网格感改由右缘三格短划承担，格线本身不做。
 *
 * 板上左下 150×14 红签名块跟随标题位置，不进 motif（恒位红线：内容位置
 * 派生的装饰不画）。
 *
 * 安全区：标题区 (96,48,1040×122)、正文区 (96,200,1040×420)、页脚 meta 带
 * (48,664,1184×44)、右下 logo 盒 (1120,630,96×40)、第五带 y620–664。
 *   - 红条 y0–12，整条在标题区上沿之上，也在第五带之上。
 *   - 三格短划 x1252–1268、y64–128，横向在标题/正文右沿与右上 logo 带之外。
 *     纵向不进第五带、不进页脚、不进右下 logo 盒。
 *
 * chapter 不退让。swiss 的 chapter 默认底是 primary 硬黑（不是红），红条压
 * 黑 3.84:1、灰刻度压黑 2.97:1，都过 motif 可见度地板 1.02。红条在黑章节页
 * 上正是制度腔的签名。
 *
 * 位置全部写死，不读内容、不随 seed 变。
 *
 * 纪律：零 theme id、零 hex，颜色只来自 ctx（accent = 瑞士红、muted = 灰刻度）。
 * 本 motif 是 swiss 独占的单成员候选集（`motif-selection.ts` 的
 * `MOTIF_CANDIDATES`），没有别的主题借用它。短划用真正的 `<line>`，不用
 * `<path>`（svg2pptx 会把纯水平 path 转成 custGeom，包围盒零高度会被
 * package-audit 拒绝，vermilion-motif 同款）。
 */

const BAR_Y = 0
const BAR_H = 12

const TICK_X = 1252
const TICK_LEN = 16
const TICK_YS = [64, 96, 128] as const
const TICK_STROKE = 1.5

export function SwissMotif({ ctx }: DecorProps) {
  const red = ctx.colors.accent
  const tick = ctx.colors.muted

  return (
    <>
      {/* 顶边 12px 红条。页缘边条，不是横幅。 */}
      <rect x={0} y={BAR_Y} width={CANVAS_W_PX} height={BAR_H} fill={red} />
      {/* 右缘三格灰刻度。水平短划，不画纵穿正文的格线。 */}
      <g stroke={tick} strokeWidth={TICK_STROKE}>
        {TICK_YS.map((y) => (
          <line key={y} x1={TICK_X} y1={y} x2={TICK_X + TICK_LEN} y2={y} />
        ))}
      </g>
    </>
  )
}
