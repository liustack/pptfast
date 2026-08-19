import type { DecorProps } from "./types"

/**
 * vermilion-motif v2 —— 「文件金线」（2026-08-19 暖纸组皮肤重设计，设计源
 * `.issues/2026-08-18-theme-redesign/skins/group2-warm-boards.dc.html` 的
 * vermilion 设计表，几何坐标逐条抄录，不派生）。
 *
 * 换掉的东西：v1 是三档 seed 变体，每档一条「旗帜感绸带弧线」（沿上升
 * 贝塞尔取样、宽度线性收窄的实心带，`ribbon`）加一束金色光芒（`rayFan`），
 * 位置随 seed 在四角之间跳。绸带是一块大面积半透明色，压在封面的红条与
 * 标题上读成脏斑；v2 把装饰让位给 banner 的红条本体，只留三件贴边的线：
 *   - **顶缘金双线**：y22 粗（2px）/ y30 细（0.75px），金（accent），
 *     x48→1232。红头文件的天头金线。
 *   - **右上角金芒扇**：四条自 (1256,40) 向左上放射的 1.5px 金线，端点
 *     (1160,12)/(1180,8)/(1205,6)/(1230,5)，整组 0.8 不透明。v1 的
 *     `rayFan` 是等角度铺开的一束，v2 的四条端点由设计板逐一给死——收进
 *     右上角一小块，不再横跨半页。
 *   - **底缘红细线带中点金菱**：y626 一条 1px 正红（primary）线、0.6
 *     不透明，x96→1184；线上中点 (640,626) 一枚 10×10 旋转 45° 的金
 *     （accent）方块。与 heritage 的底缘线同轨道、不同颜色分工（heritage
 *     底线走 border、菱走 accent；vermilion 底线走 primary、菱走 accent）。
 *
 * chapter 继续完全退让（`return null`，v1 起就是如此，理由本轮更硬）：
 * vermilion 的 chapter 默认底色是整版 primary 正红（`themes/vermilion.ts`
 * 的 `defaultBackgrounds.chapter`），底缘线是 primary（红压红，看不见），
 * 顶缘金线与金芒虽是 accent（金压红 2.62:1，勉强看得见）却会与八个
 * chapter layout 在整版红上画的巨幅居中标题抢同一块红面。三件东西里两件
 * 失效、一件抢戏，chapter 不画。
 *
 * 安全区（设计板上四条红虚线禁区）：标题区 (96,48,1040×122)、正文区
 * (96,200,1040×420)、页脚 meta 带 (48,664,1184×44)、右下 logo 盒
 * (1120,630,96×40)。
 *   - 顶缘双线 y22/30 与金芒扇（y5-40，x1160-1256）全部在标题区上沿 y48
 *     之上；金芒扇也在右上 logo 盒 (1120,48,96×40) 的上沿之上。
 *   - 底缘线 y626 在右下 logo 盒上沿 y630 之上，让开 4px；中点金菱
 *     （外接半径 10/2·√2 ≈ 7.07，y 618.9-633.1）纵向压过 630，但它在
 *     x640，离 logo 盒的 x1120-1216 有 480px，两者不相交（同 heritage）。
 *   - 三件东西的最低点 633.1 在页脚 meta 带上沿 y664 之上。
 *   - 设计板坐标一处未改。
 *
 * 位置全部写死，不读内容、不随 seed 变——`inventory.md` 的确定性红线。
 * v1 的三档 seed 变体因此删除，`cachedDeckSeed`/`pickBySeed` 依赖退出本文件。
 *
 * 纪律：零 theme id、零 hex，颜色只来自 ctx（accent = 金、primary = 正红）。
 * 本 motif 是 vermilion 独占的单成员候选集（`motif-selection.ts` 的
 * `MOTIF_CANDIDATES`），没有别的主题借用它。刻意不用五角星等政治符号
 * （过线风险，gov-theme wave 的 plan 裁定 2，本轮不变）。
 */

// ── 顶缘金双线 ──────────────────────────────────────────────────────────
const RULE_X1 = 48
const RULE_X2 = 1232
const RULE_THICK_Y = 22
const RULE_THICK_W = 2
const RULE_THIN_Y = 30
const RULE_THIN_W = 0.75

// ── 右上角金芒扇 ────────────────────────────────────────────────────────
/** 四条金芒的共同起点（右上角外缘）。 */
const RAY_ORIGIN: readonly [number, number] = [1256, 40]
/** 四条金芒各自的端点，设计板逐一给死（不是等角度铺开的一束）。 */
const RAY_TIPS: readonly [number, number][] = [
  [1160, 12],
  [1180, 8],
  [1205, 6],
  [1230, 5],
]
const RAY_STROKE = 1.5
const RAY_OPACITY = 0.8

// ── 底缘红细线 + 中点金菱 ───────────────────────────────────────────────
const FOOT_X1 = 96
const FOOT_X2 = 1184
/**
 * 底缘线。右下 logo 盒是 (1120,630,96×40)，626 让开它的上沿 4px——设计板
 * 自己画的就是 626，本文件未改坐标。
 */
const FOOT_Y = 626
const FOOT_W = 1
const FOOT_OPACITY = 0.6
const DIAMOND_SIZE = 10
/** 金菱中心：底缘线的中点。 */
const DIAMOND_CX = (FOOT_X1 + FOOT_X2) / 2
const DIAMOND_CY = FOOT_Y

export function VermilionMotif({ slide, ctx }: DecorProps) {
  const gold = ctx.colors.accent
  const red = ctx.colors.primary

  // chapter 是整版 primary 正红底——底缘红线消失、金线与巨幅标题抢面
  // （见文件头）。
  if (slide.type === "chapter") return null

  return (
    <>
      {/* 顶缘金双线。真正的 <line>，不用只走一根轴的 <path> — svg2pptx 会把
          <path>（哪怕纯水平）转成 custGeom，包围盒零高度会被 package-audit
          硬门的 invalid-shape-transform 规则拒绝（spec §4.4）。 */}
      <line x1={RULE_X1} y1={RULE_THICK_Y} x2={RULE_X2} y2={RULE_THICK_Y} stroke={gold} strokeWidth={RULE_THICK_W} />
      <line x1={RULE_X1} y1={RULE_THIN_Y} x2={RULE_X2} y2={RULE_THIN_Y} stroke={gold} strokeWidth={RULE_THIN_W} />

      {/* 右上角金芒扇 */}
      <g stroke={gold} strokeWidth={RAY_STROKE} opacity={RAY_OPACITY}>
        {RAY_TIPS.map(([x2, y2]) => (
          <line key={`${x2}-${y2}`} x1={RAY_ORIGIN[0]} y1={RAY_ORIGIN[1]} x2={x2} y2={y2} />
        ))}
      </g>

      {/* 底缘红细线 + 中点金菱 */}
      <line
        x1={FOOT_X1}
        y1={FOOT_Y}
        x2={FOOT_X2}
        y2={FOOT_Y}
        stroke={red}
        strokeWidth={FOOT_W}
        opacity={FOOT_OPACITY}
      />
      <rect
        x={DIAMOND_CX - DIAMOND_SIZE / 2}
        y={DIAMOND_CY - DIAMOND_SIZE / 2}
        width={DIAMOND_SIZE}
        height={DIAMOND_SIZE}
        fill={gold}
        transform={`rotate(45 ${DIAMOND_CX} ${DIAMOND_CY})`}
      />
    </>
  )
}
