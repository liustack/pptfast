import type { DecorProps } from "./types"

/**
 * enterprise-motif v2 —— 「方块秩序」（2026-08-20 冷调组皮肤重设计，设计源
 * `.issues/2026-08-18-theme-redesign/skins/group3-cool-boards.dc.html` 的
 * enterprise 设计表，几何坐标逐条抄录，不派生）。
 *
 * 换掉的东西：v1 是三档 seed 变体，a=右上 3×3 小方块阵、b=**左缘竖细条**
 * ＋右下实心方块、c=对角双方块，另有一档弱位（content/ending 只画右上一枚
 * 小方点）。三样构图轮流上场、位置随 seed 跳；其中 variant b 的
 * `rect x=0 y=180 w=6 h=360` 正是设计板红线点名要撤的那根左竖条（冷调组
 * 三家的组内互检写死「左竖条 0 处」），variant a 的 3×3 方阵则是 2026-07-11
 * 用户截图实锤过的碰撞源。v2 只留三件，位置写死：
 *   - **顶缘刻度尺**：y36 一条 x48→1120 的细线（border），线上六枚灰齿
 *     （muted）——两端两枚 y30-42 长齿、中间四枚 y32-40 短齿，等距 214。
 *     Swiss 网格的露出，一把量画面的尺子。
 *   - **右上 IKB 方块阶**：x1150/1188/1218 上三枚递减方块（28/20/14），
 *     底边对齐 y40，primary 实色。秩序的具象，不是装饰花纹。
 *   - **左缘下方一枚炸橘方块**：x60,y626 的 16×16（accent）。全页唯一的
 *     暖色，蓝橘对撞的那一撞。
 * 弱档（content/ending 画得更少）一并取消——三件本来就轻，再分档只会让
 * 同一套语汇在页与页之间闪烁。
 *
 * chapter 继续完全退让（`return null`，2026-07-11 用户裁决沿用，理由本轮
 * 更硬）：v1 的退让理由是 3×3 方阵叠在 `poster-chapter` 右上 org 文字与
 * 顶部 divider 上；v2 的刻度尺与方块阶整组挂在 y12-42 的顶带里，正是八个
 * chapter layout 摆 org 行与顶部分隔线的同一条带子，碰撞面反而更大。
 *
 * 安全区（设计板上四条红虚线禁区）：标题区 (96,48,1040×122)、正文区
 * (96,200,1040×420)、页脚 meta 带 (48,664,1184×44)、右下 logo 盒
 * (1120,630,96×40)。
 *   - 刻度尺整组 y30-42，在标题区上沿 y48 之上；横向止于 x1120，正好让开
 *     `brand-chrome.tsx` 右上 logo 带（1120,48,96×40）的左沿。
 *   - 方块阶 x1150-1232、y12-40，在标题区右沿 x1136 之外、上沿 y48 之上。
 *   - 炸橘方块 x60-76、y626-642，在正文区左沿 x96 之外、下沿 y620 之下，
 *     页脚 meta 带上沿 y664 之上，离右下 logo 盒一整页宽。
 *   - 设计板坐标一处未改。
 *
 * 位置全部写死，不读内容、不随 seed 变——`inventory.md` 的确定性红线。
 * v1 的三档 seed 变体因此删除，`cachedDeckSeed`/`pickBySeed` 依赖退出本文件。
 *
 * 纪律：零 theme id、零 hex，颜色只来自 ctx（primary = IKB、accent = 炸橘、
 * border = 尺身、muted = 齿）。设计板给刻度齿标的是 `#7A7F87`——那是
 * enterprise `chartPalette` 的第四格（机灰）。本文件改读 `muted`：motif 读
 * `chartPalette` 是有先例的坑（`motif-chart-palette-isolation.test.tsx` 的
 * 文件头记着 campaign/classroom/bloom 三家被图表调色板轮转悄悄改色的那次
 * Major），而一枚刻度齿在语义上本来就是「安静的记号」，`muted` 是它的岗位
 * 色。两者同为中性灰，齿比板上略深半档。
 *
 * 借用网（`motif-selection.ts` 的 `MOTIF_CANDIDATES`）：consulting 与 tech
 * 的候选集里都有本 motif，抽到时画的是它们自己 token 下的刻度尺与方块阶。
 */

// ── 顶缘刻度尺 ──────────────────────────────────────────────────────────
const RULE_Y = 36
const RULE_X1 = 48
/** 止于右上 logo 带（brand-chrome.tsx 的 `logoBox`）的左沿。 */
const RULE_X2 = 1120
/** 六枚齿：两端长齿（y30-42），中间四枚短齿（y32-40），等距 214。 */
const TICKS: readonly { x: number; y1: number; y2: number }[] = [
  { x: 48, y1: 30, y2: 42 },
  { x: 262, y1: 32, y2: 40 },
  { x: 476, y1: 32, y2: 40 },
  { x: 690, y1: 32, y2: 40 },
  { x: 904, y1: 32, y2: 40 },
  { x: 1118, y1: 30, y2: 42 },
]
const TICK_STROKE = 1.5

// ── 右上 IKB 方块阶 ─────────────────────────────────────────────────────
/** 三枚递减方块，底边同在 y40。 */
const STEPS: readonly { x: number; y: number; size: number }[] = [
  { x: 1150, y: 12, size: 28 },
  { x: 1188, y: 20, size: 20 },
  { x: 1218, y: 26, size: 14 },
]

// ── 左缘下方一枚炸橘方块 ────────────────────────────────────────────────
const SPARK = { x: 60, y: 626, size: 16 }

export function EnterpriseMotif({ slide, ctx }: DecorProps) {
  // chapter 完全退让：顶带正是 chapter layout 摆 org 行与分隔线的地方
  // （见文件头）。
  if (slide.type === "chapter") return null

  const ikb = ctx.colors.primary
  const rule = ctx.colors.border ?? ctx.colors.muted

  return (
    <>
      {/* 顶缘刻度尺：尺身 + 六枚灰齿 */}
      <line x1={RULE_X1} y1={RULE_Y} x2={RULE_X2} y2={RULE_Y} stroke={rule} strokeWidth={1} />
      <g stroke={ctx.colors.muted} strokeWidth={TICK_STROKE}>
        {TICKS.map((t) => (
          <line key={t.x} x1={t.x} y1={t.y1} x2={t.x} y2={t.y2} />
        ))}
      </g>
      {/* 右上 IKB 方块阶 */}
      <g fill={ikb}>
        {STEPS.map((s) => (
          <rect key={s.x} x={s.x} y={s.y} width={s.size} height={s.size} />
        ))}
      </g>
      {/* 左缘下方一枚炸橘方块 */}
      <rect x={SPARK.x} y={SPARK.y} width={SPARK.size} height={SPARK.size} fill={ctx.colors.accent} />
    </>
  )
}
