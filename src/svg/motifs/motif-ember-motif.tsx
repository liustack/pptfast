import type { DecorProps } from "./types"
import { DecorPiece } from "./decor-piece"
import { leafRecessOpacity } from "./decor-budget"

/**
 * ember-motif v2 —— 「上升火星」（2026-08-19 暖纸组皮肤重设计，设计源
 * `.issues/2026-08-18-theme-redesign/skins/group2-warm-boards.dc.html` 的
 * ember 设计表，几何坐标逐条抄录，不派生）。
 *
 * 换掉的东西：v1 是三档 seed 变体，每档两三串 `sparkTrail`（沿二次贝塞尔
 * 弧线取样、半径与不透明度同步衰减的粒子串，9-10 颗一串），从页面角落
 * 往中间飘。粒子多、opacity 低到 0.03、位置随 seed 跳——读起来是「散落的
 * 火花」，不是「上升」。v2 把散乱收编成一条有方向的轨迹，位置写死：
 *   - **右缘上升点列**：七枚圆点串在那条轨迹上，自下而上渐大、火橙
 *     （primary）与琥珀（accent）相间——primary 四枚在 y560/430/290/120
 *     （r2.5/3.5/4.5/6），accent 三枚插在 y495/360/205（r3/4/5）。实色
 *     不透明，不再靠 0.03 的余烬撑数量。横坐标不再逐枚手抄，见下。
 *   - **顶缘一枚斜引线**：(48,14)→(120,14) 的 2px 火橙短线，左上角一记
 *     起手，与右缘的上升轨迹对角呼应。
 *   - **右缘斜引线**：(1150,600)→(1245,86) 的 1px 暖沙线（border），
 *     火星骑在它上面攀升——轨迹本身画出来，方向感才不用靠读者脑补。
 *
 * ## 圆心必须落在线上（2026-08-20 第四轮评审，ember p01）
 *
 * 用户原话：「能不能让斜线串上圆点啊，这样一会串上一会没串上，忽左忽右，
 * 太奇怪了。」设计板给的是逐枚手抄的整数横坐标，抄完之后七枚点相对那条
 * 斜线各偏右 0.7-4.7px 不等：最下面 r2.5 的一枚偏 2.6px（半径都不到，整枚
 * 悬在线外），最上面 r6 的一枚偏 -0.7px（正骑在线上）。同一串点一半串上
 * 一半没串上，读起来就是「忽左忽右」。
 *
 * 本轮把横坐标从常量表里删掉，改由 `guideXAt(cy)` 把 cy 代进
 * `GUIDE_FROM→GUIDE_TO` 这条直线解出来——七枚圆心因此严格落在线上，误差
 * 为零而不是「肉眼差不多」。y 与半径一处未改，横向最大位移 4.7px。
 * 这仍然是写死的位置：两枚端点是常量，解出来的 x 也就是常量，不读内容、
 * 不随 seed 变（`inventory.md` 的确定性红线），只是让几何自己说话，
 * 而不是靠人手对齐。
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
 *   - 右缘点列与斜引线的最左点 x1150（引线下端）/x1154.89（最下一枚火星
 *     的左缘，落线之后比原来还右了 2.6px），都在正文区右沿 x1136 与
 *     标题区右沿 x1136 之外。
 *   - 斜引线的最低点 y600 在右下 logo 盒上沿 y630 之上；引线在 y88
 *     （右上 logo 盒下沿）处的横坐标 ≈1244.6，在该盒右沿 x1216 之外，
 *     最靠上的一枚火星 (1238.72,120,r6) 也在 y88 之下、x1216 之外——右上
 *     logo 盒四边都不相交，最右缘 x1244.72 仍在页内。
 *   - 顶缘斜引线 y14 在标题区上沿 y48 之上。
 *   - 设计板坐标只改了点列的 x 一处（改成由斜引线解出，见上），y、半径、
 *     件数与两条引线一处未改。
 *
 * 封面页火星改骑 `corner-wedge` 的斜边：(820,720)→(1280,120)，沿内法线
 * 往楔内偏，落在楔面内侧。浅色四枚走 `colors.bg`（板上纸色压火橙楔）。
 * primary 压 primary 会消失，这不是内容页右缘那套取色。内容页和收尾页仍走
 * 右缘轨道 (1150,600)→(1245,86)，避免火星穿过正文区。chapter 继续完全退让。
 * 读的是 `slide.type`，不是当页选中了哪个 layout。
 *
 * 位置全部写死，不读内容、不随 seed 变——`inventory.md` 的确定性红线。
 * v1 的三档 seed 变体因此删除，`cachedDeckSeed`/`pickBySeed` 依赖退出本文件。
 *
 * 纪律：零 theme id、零 hex，颜色只来自 ctx（primary = 火橙、accent = 琥珀、
 * border = 暖沙线）。本 motif 是 ember 独占的单成员候选集
 * （`motif-selection.ts` 的 `MOTIF_CANDIDATES`），没有别的主题借用它。
 */

// ── 斜引线（火星攀升的轨道） ────────────────────────────────────────
const CONTENT_GUIDE_FROM: readonly [number, number] = [1150, 600]
const CONTENT_GUIDE_TO: readonly [number, number] = [1245, 86]
const COVER_GUIDE_FROM: readonly [number, number] = [820, 720]
const COVER_GUIDE_TO: readonly [number, number] = [1280, 120]
/** Inset along the inward normal so cover sparks sit on the wedge face, not on the cut. */
const COVER_INSET = 18
const GUIDE_STROKE = 1

type Guide = readonly [number, number]

function guideXAt(cy: number, from: Guide, to: Guide): number {
  const [x1, y1] = from
  const [x2, y2] = to
  return Math.round((x1 + ((x2 - x1) * (cy - y1)) / (y2 - y1)) * 100) / 100
}

/** Cover sparks sit a few px along the inward normal, into the wedge. */
function sparkCx(cy: number, r: number, cover: boolean): number {
  if (!cover) return guideXAt(cy, CONTENT_GUIDE_FROM, CONTENT_GUIDE_TO)
  const x = guideXAt(cy, COVER_GUIDE_FROM, COVER_GUIDE_TO)
  const [x1, y1] = COVER_GUIDE_FROM
  const [x2, y2] = COVER_GUIDE_TO
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  const nx = -dy / len
  const cx = x + nx * COVER_INSET
  return Math.round(Math.min(cx, 1280 - r - 0.5) * 100) / 100
}

/** 火橙（primary）四枚，内容/收尾右缘轨道。`[cy, r]`，cx 由 `guideXAt` 解出。 */
const PRIMARY_SPARKS: readonly [number, number][] = [
  [560, 2.5],
  [430, 3.5],
  [290, 4.5],
  [120, 6],
]
/** 琥珀（accent）三枚，插在火橙之间。 */
const ACCENT_SPARKS: readonly [number, number][] = [
  [495, 3],
  [360, 4],
  [205, 5],
]
/**
 * 封面楔面点列：y 抄板面沿斜边那串，不沿用右缘轨道的峰点 y120。
 * 浅色四枚走纸色（板上 `#FBF5EE` 压火橙楔，primary 压 primary 会消失）。
 */
const COVER_PAPER_SPARKS: readonly [number, number][] = [
  [560, 3],
  [470, 4],
  [380, 5],
  [290, 6],
]
const COVER_ACCENT_SPARKS: readonly [number, number][] = [
  [515, 3.5],
  [425, 4.5],
  [335, 5.5],
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

  const cover = slide.type === "cover"
  const from = cover ? COVER_GUIDE_FROM : CONTENT_GUIDE_FROM
  const to = cover ? COVER_GUIDE_TO : CONTENT_GUIDE_TO
  const paper = ctx.colors.bg
  const ground = ctx.defaultBg ?? ctx.colors.bg
  const lightSparks = cover ? COVER_PAPER_SPARKS : PRIMARY_SPARKS
  const darkSparks = cover ? COVER_ACCENT_SPARKS : ACCENT_SPARKS
  const lightFill = cover ? paper : fire
  const fade = (ink: string) => leafRecessOpacity(slide.type, ink, ground)

  return (
    <>
      <DecorPiece id="ascent">
        <line
          x1={from[0]}
          y1={from[1]}
          x2={to[0]}
          y2={to[1]}
          stroke={sand}
          strokeWidth={GUIDE_STROKE}
          opacity={fade(sand)}
        />
        <g fill={lightFill}>
          {lightSparks.map(([cy, r]) => (
            <circle key={cy} cx={sparkCx(cy, r, cover)} cy={cy} r={r} opacity={fade(lightFill)} />
          ))}
        </g>
        <g fill={amber}>
          {darkSparks.map(([cy, r]) => (
            <circle key={cy} cx={sparkCx(cy, r, cover)} cy={cy} r={r} opacity={fade(amber)} />
          ))}
        </g>
      </DecorPiece>

      <DecorPiece id="tick">
        <line
          x1={TICK_X1}
          y1={TICK_Y}
          x2={TICK_X2}
          y2={TICK_Y}
          stroke={fire}
          strokeWidth={TICK_STROKE}
          opacity={fade(fire)}
        />
      </DecorPiece>
    </>
  )
}
