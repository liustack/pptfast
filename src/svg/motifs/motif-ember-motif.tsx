import type { DecorProps } from "./types"

/**
 * ember-motif v2 —— 「上升火星」（2026-08-19 暖纸组皮肤重设计，设计源
 * `.issues/2026-08-18-theme-redesign/skins/group2-warm-boards.dc.html` 的
 * ember 设计表，几何坐标逐条抄录，不派生）。
 *
 * 换掉的东西：v1 是三档 seed 变体，每档两三串 `sparkTrail`（沿二次贝塞尔
 * 弧线取样、半径与不透明度同步衰减的粒子串，9-10 颗一串），从页面角落
 * 往中间飘。粒子多、opacity 低到 0.03、位置随 seed 跳——读起来是「散落的
 * 火花」，不是「上升」。v2 把散乱收编成一条有方向的轨迹，位置写死：
 *   - **右缘上升点列**：七枚圆点沿一条自右下向右上的轨迹排开，自下而上
 *     渐大、火橙（primary）与琥珀（accent）相间——primary 四枚
 *     (1160,560,r2.5)/(1185,430,r3.5)/(1212,290,r4.5)/(1238,120,r6)，
 *     accent 三枚 (1172,495,r3)/(1198,360,r4)/(1226,205,r5)。实色不透明，
 *     不再靠 0.03 的余烬撑数量。
 *   - **顶缘一枚斜引线**：(48,14)→(120,14) 的 2px 火橙短线，左上角一记
 *     起手，与右缘的上升轨迹对角呼应。
 *   - **右缘斜引线**：(1150,600)→(1245,86) 的 1px 暖沙线（border），
 *     火星骑在它上面攀升——轨迹本身画出来，方向感才不用靠读者脑补。
 *
 * chapter 继续完全退让（`return null`，v1 起就是如此，理由本轮更硬）：
 * ember 的 chapter 默认底色是整版 primary 火橙（`themes/ember.ts` 的
 * `defaultBackgrounds.chapter`），四枚 primary 火星压在同色上直接消失，
 * accent 琥珀压火橙只有 2.38:1、border 暖沙压火橙 3.85:1——七枚点里四枚
 * 看不见、三枚发灰，加上八个 chapter layout 都在这块整版色上画巨幅居中
 * 标题，chapter 不画。
 *
 * 安全区（设计板上四条红虚线禁区）：标题区 (96,48,1040×122)、正文区
 * (96,200,1040×420)、页脚 meta 带 (48,664,1184×44)、右下 logo 盒
 * (1120,630,96×40)。
 *   - 右缘点列与斜引线的最左点 x1150（引线下端）/x1157.5（最下一枚火星
 *     的左缘），都在正文区右沿 x1136 与标题区右沿 x1136 之外。
 *   - 斜引线的最低点 y600 在右下 logo 盒上沿 y630 之上；引线在 y88
 *     （右上 logo 盒下沿）处的横坐标 ≈1244.6，在该盒右沿 x1216 之外，
 *     最靠上的一枚火星 (1238,120,r6) 也在 y88 之下、x1216 之外——右上
 *     logo 盒四边都不相交。
 *   - 顶缘斜引线 y14 在标题区上沿 y48 之上。
 *   - 设计板坐标一处未改。
 *
 * 已知且照实记录：设计板的 ember 封面样例里，火星是骑在 `split-diagonal`
 * 的火橙楔形面上、沿斜边内侧攀升的（板上原话「楔形属 layout 件」）。楔形
 * 由 `cover-split-diagonal.tsx` 画，本 motif 不碰 layout；motif 的点列因此
 * 走恒位的右缘轨道，抽到 split-diagonal 封面时会压在楔形上（primary 点
 * 压 primary 楔形不可见，accent/border 仍可见）。让点列避开楔形要么让
 * motif 知道当页选中了哪个 layout（内容感知，`inventory.md` 的确定性红线
 * 禁止），要么改 layout（本轮「其余主题逐字节不变」的约束禁止）。
 *
 * 位置全部写死，不读内容、不随 seed 变——`inventory.md` 的确定性红线。
 * v1 的三档 seed 变体因此删除，`cachedDeckSeed`/`pickBySeed` 依赖退出本文件。
 *
 * 纪律：零 theme id、零 hex，颜色只来自 ctx（primary = 火橙、accent = 琥珀、
 * border = 暖沙线）。本 motif 是 ember 独占的单成员候选集
 * （`motif-selection.ts` 的 `MOTIF_CANDIDATES`），没有别的主题借用它。
 */

// ── 右缘斜引线（火星攀升的轨道） ────────────────────────────────────────
const GUIDE_FROM: readonly [number, number] = [1150, 600]
const GUIDE_TO: readonly [number, number] = [1245, 86]
const GUIDE_STROKE = 1

// ── 右缘上升点列（自下而上渐大，火橙与琥珀相间） ────────────────────────
/** 火橙（primary）四枚。 */
const PRIMARY_SPARKS: readonly [number, number, number][] = [
  [1160, 560, 2.5],
  [1185, 430, 3.5],
  [1212, 290, 4.5],
  [1238, 120, 6],
]
/** 琥珀（accent）三枚，插在火橙之间。 */
const ACCENT_SPARKS: readonly [number, number, number][] = [
  [1172, 495, 3],
  [1198, 360, 4],
  [1226, 205, 5],
]

// ── 顶缘斜引线（左上角的起手） ──────────────────────────────────────────
const TICK_X1 = 48
const TICK_X2 = 120
const TICK_Y = 14
const TICK_STROKE = 2

export function EmberMotif({ slide, ctx }: DecorProps) {
  const fire = ctx.colors.primary
  const amber = ctx.colors.accent
  const sand = ctx.colors.border ?? ctx.colors.muted

  // chapter 是整版 primary 火橙底——四枚 primary 火星直接消失（见文件头）。
  if (slide.type === "chapter") return null

  return (
    <>
      {/* 右缘斜引线。真正的 <line>，不用 <path> — svg2pptx 会把 <path> 转成
          custGeom，走 prstGeom="line" 才是 package-audit 硬门认的形状
          （spec §4.4）。 */}
      <line x1={GUIDE_FROM[0]} y1={GUIDE_FROM[1]} x2={GUIDE_TO[0]} y2={GUIDE_TO[1]} stroke={sand} strokeWidth={GUIDE_STROKE} />

      {/* 右缘上升点列 */}
      <g fill={fire}>
        {PRIMARY_SPARKS.map(([cx, cy, r]) => (
          <circle key={cy} cx={cx} cy={cy} r={r} />
        ))}
      </g>
      <g fill={amber}>
        {ACCENT_SPARKS.map(([cx, cy, r]) => (
          <circle key={cy} cx={cx} cy={cy} r={r} />
        ))}
      </g>

      {/* 顶缘斜引线 */}
      <line x1={TICK_X1} y1={TICK_Y} x2={TICK_X2} y2={TICK_Y} stroke={fire} strokeWidth={TICK_STROKE} />
    </>
  )
}
