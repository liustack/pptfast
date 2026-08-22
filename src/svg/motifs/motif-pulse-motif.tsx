import type { DecorProps } from "./types"
import { DecorPiece } from "./decor-piece"
import { leafRecessOpacity } from "./decor-budget"

/**
 * pulse-motif v2 —— 「脉搏线」（2026-08-20 冷调组皮肤重设计，设计源
 * `.issues/2026-08-18-theme-redesign/skins/group3-cool-boards.dc.html` 的
 * pulse 设计表，几何坐标逐条抄录，不派生）。
 *
 * 换掉的东西：v1 是三档 seed 变体，每档在两个角上摆「胶囊（药丸形圆角矩形，
 * 带旋转角）＋大小错落的细胞圆点/空心圈」，再加一条跨全宽、按 170px 周期
 * 重复的 ECG 折线（`ecgPath`），content 另有一套弱档。心跳一页上响八次，
 * 药丸横七竖八地飘在角落——那是「医疗元素堆料」，不是诊疗的清洁感。v2 只
 * 留两件，位置写死：
 *   - **顶缘一条极细心电线**：y30 的一条基线，x48→1232，只在近 x1060 处
 *     搏一次（Q 谷 y42、R 峰 y18，尖峰限在 y18-42），其余全程平直。一整页
 *     一次心搏，比八次更像心电图。
 *   - **右缘细胞轮廓点簇**：x1245 上三枚空心圆（r9/r6/r4，y310/360/404），
 *     细胞膜的线描，收到页缘只占一条窄带。
 * 胶囊图形整族退役（设计板 pulse 的结构行是 light 档，「light 档仅此两件」
 * 是板上原话）。两件都走 accent（浅青），v1 里 `chartPalette` 的天青/砂灰
 * 取色一并退出——motif 读 `chartPalette` 是有先例的坑
 * （`motif-chart-palette-isolation.test.tsx` 的文件头记着 campaign/
 * classroom 被图表调色板轮转悄悄改色的那次 Major）。
 *
 * chapter 继续完全退让（`return null`，v1 起就是如此，理由本轮更硬）：
 * pulse 的 chapter 默认底色是整版 primary 青绿（`themes/pulse.ts` 的
 * `defaultBackgrounds.chapter`），而本 motif 两件东西都走 accent 浅青
 * ——浅青压青绿实测 1.90:1，画上去不是「克制」而是「看不见」。八个 chapter
 * layout 又都在这块整版色上画巨幅居中标题，可用净空本就零碎。两条理由
 * 同向，chapter 不画。
 *
 * 安全区（设计板上四条红虚线禁区）：标题区 (96,48,1040×122)、正文区
 * (96,200,1040×420)、页脚 meta 带 (48,664,1184×44)、右下 logo 盒
 * (1120,630,96×40)。
 *   - 心电线纵向极值 y18（R 峰）到 y42（Q 谷），整条在标题区上沿 y48 之上；
 *     横向 x48-1232 从顶带下方穿过右上 logo 带（1120,48,96×40）的上方。
 *   - 细胞圈 x1236-1254（最大一枚 r9），在标题区/正文区右沿 x1136 之外；
 *     y301-408 与正文区纵向重叠，但横向完全不相交。
 *   - 设计板坐标一处未改。
 *
 * 封面页不画顶缘心电线：`horizon-wedge` 已经在楔面走了一条折线，两条心搏
 * 叠在一页上。细胞圈仍画。内容页和收尾页保持心电线 + 细胞。chapter 仍退让。
 *
 * 位置全部写死，不读内容、不随 seed 变——`inventory.md` 的确定性红线。
 * v1 的三档 seed 变体因此删除，`cachedDeckSeed`/`pickBySeed` 依赖退出本文件。
 *
 * 纪律：零 theme id、零 hex，颜色只来自 ctx（accent = 浅青）。本 motif 是
 * pulse 独占的单成员候选集（`motif-selection.ts` 的 `MOTIF_CANDIDATES`），
 * 没有别的主题借用它。
 */

// ── 顶缘心电线 ──────────────────────────────────────────────────────────
/**
 * 一条基线 + 近 x1060 处的一次心搏。设计板逐点抄录：平直段 y30，
 * Q 谷 (1052,18)/R 峰 (1066,42) 的先后顺序按板上原样（先上冲后回落）。
 */
const ECG_POINTS = "48,30 1020,30 1040,30 1052,18 1066,42 1078,30 1232,30"
const ECG_STROKE = 1.5

// ── 右缘细胞轮廓点簇 ────────────────────────────────────────────────────
const CELL_X = 1245
const CELLS: readonly { cy: number; r: number }[] = [
  { cy: 310, r: 9 },
  { cy: 360, r: 6 },
  { cy: 404, r: 4 },
]
const CELL_STROKE = 1.2

export function PulseMotif({ slide, ctx }: DecorProps) {
  // chapter 是整版 primary 青绿底，本 motif 两件东西都是 accent 浅青——
  // 画上去看不见（见文件头）。
  if (slide.type === "chapter") return null

  const mint = ctx.colors.accent
  const bg = ctx.defaultBg ?? ctx.colors.bg
  const cover = slide.type === "cover"

  return (
    <>
      {!cover && (
        <DecorPiece id="ecg">
          <polyline
            points={ECG_POINTS}
            fill="none"
            stroke={mint}
            strokeWidth={ECG_STROKE}
            opacity={leafRecessOpacity(slide.type, mint, bg)}
          />
        </DecorPiece>
      )}
      <DecorPiece id="cells">
        {CELLS.map((c) => (
          <circle
            key={c.cy}
            cx={CELL_X}
            cy={c.cy}
            r={c.r}
            fill="none"
            stroke={mint}
            strokeWidth={CELL_STROKE}
            opacity={leafRecessOpacity(slide.type, mint, bg)}
          />
        ))}
      </DecorPiece>
    </>
  )
}
