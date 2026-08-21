import type { DecorProps } from "./types"

/**
 * heritage-motif v3 —— 「藏书票纹饰」（2026-08-19 暖纸组皮肤重设计，设计源
 * `.issues/2026-08-18-theme-redesign/skins/group2-warm-boards.dc.html` 的
 * heritage 设计表，几何坐标逐条抄录，不派生）。
 *
 * 换掉的东西：v2 是三档 seed 变体（a 顶部中央菱形徽记 + 两侧延伸线 / b 四角
 * 焦糖角钉大菱形 / c 左右页缘竖双线）+ 弱档右上小菱形，chapter 整个退让。
 * 三档各画各的，没有一档撑得起主题识别；c 的左右页缘竖线正是本轮设计板
 * 点名要清零的「左竖条」。v3 把这些零碎收成一件整的：一张藏书票的边饰。
 *
 * 画的三件东西（四种页型都画，恒位，无 seed 变体）：
 *   - **顶缘双线**：y28 粗（2px）/ y36 细（0.75px），焦糖（accent），
 *     x48→1232。报头的双规则线，藏书票和扉页的排印惯例。
 *   - **顶部两角小角花**：左右各一枚 8×8 旋转 45° 的酒红（primary）方块，
 *     中心 (60,16) / (1220,16)。v2 的四角大菱形（半径 9 的实心菱形，四角
 *     全占）退役——它与 split-diagonal 封面的斜切缘、footer meta 带都碰过。
 *   - **底缘细线带中点金菱**：y626 一条 1px 纸纹线（border），x96→1184，
 *     线上中点 (640,626) 一枚 10×10 旋转 45° 的焦糖（accent）方块。
 *
 * chapter 不再退让：v2 退让的理由是「org + 上下 divider + 巨号数字已满」，
 * 针对的是 v2 那枚画在版心顶部中央 (640,36-80) 的徽记。v3 的三件东西全部
 * 走页缘带（y<48 与 y620-664），与 luxe v2 的金框走的是同一条边缘轨道
 * ——那一轮已经实测过这条轨道离 chapter chrome 有余量。heritage 的
 * chapter 默认底色本来就是纸色（不像 terra/vermilion/ember 的 chapter 是
 * 整版 primary），纹饰压在纸上读得出来，没有「画了也看不见」的问题。
 *
 * 安全区（设计板上四条红虚线禁区）：标题区 (96,48,1040×122)、正文区
 * (96,200,1040×420)、页脚 meta 带 (48,664,1184×44)、右下 logo 盒
 * (1120,630,96×40)。
 *   - 顶缘双线 y28/36 与两角角花（旋转后外接半径 8/2·√2 ≈ 5.66，y 10.3-21.7）
 *     全部在标题区上沿 y48 之上。
 *   - 底缘细线 y626 在右下 logo 盒上沿 y630 之上，让开 4px；线的中点金菱
 *     （外接半径 10/2·√2 ≈ 7.07，y 618.9-633.1）虽然纵向压过 630，但它在
 *     x640，离 logo 盒的 x1120-1216 有 480px，两者不相交。
 *   - 三件东西的最低点 633.1 在页脚 meta 带上沿 y664 之上。
 *   - 设计板的坐标一处未改——不同于 luxe v2 需要把框下边从 650 上移到
 *     624，本设计板自己就把底缘线画在 626。`motif-heritage-motif.test.tsx`
 *     逐条锁死这些数字。
 *
 * 位置全部写死，不读内容、不随 seed 变——`inventory.md` 的确定性红线
 * （装饰位置做内容感知会让 seed 的修订稳定性失效）。v2 的三档 seed 变体
 * 因此一并删除，`cachedDeckSeed`/`pickBySeed` 的依赖也随之退出本文件。
 *
 * 纪律：零 theme id、零 hex，颜色只来自 ctx（accent = 焦糖、primary = 勃艮第、
 * border = 纸纹线）。board-cover-restore wave 2 把 heritage / journal / luxe
 * 的候选集都钉成各自的封面板 motif，本文件不再被那两家轮换抽中。
 *
 * 封面另加一枚 60×76 藏书票章（外框 (1150,96)，内缩 6px，中心一枚 16×16
 * 焦糖菱），只在 cover 上画。外框走 primary（酒红），内框与中心菱走 accent。
 * 顶双线 / 角花 / 底菱四种页型都保留。
 */

// ── 顶缘双线（报头双规则线） ────────────────────────────────────────────
const RULE_X1 = 48
const RULE_X2 = 1232
const RULE_THICK_Y = 28
const RULE_THICK_W = 2
const RULE_THIN_Y = 36
const RULE_THIN_W = 0.75

// ── 顶部两角小角花 ──────────────────────────────────────────────────────
const FLORET_SIZE = 8
/** 两枚角花的中心。旋转 45° 用的也是这两个点。 */
const FLORET_CENTERS: readonly [number, number][] = [
  [60, 16],
  [1220, 16],
]

// ── 底缘细线 + 中点金菱 ─────────────────────────────────────────────────
const FOOT_X1 = 96
const FOOT_X2 = 1184
/**
 * 底缘线。右下 logo 盒是 (1120,630,96×40)，626 让开它的上沿 4px——设计板
 * 自己画的就是 626，本文件未改坐标。
 */
const FOOT_Y = 626
const FOOT_W = 1
const DIAMOND_SIZE = 10
/** 金菱中心：底缘线的中点。 */
const DIAMOND_CX = (FOOT_X1 + FOOT_X2) / 2
const DIAMOND_CY = FOOT_Y

const STAMP_X = 1150
const STAMP_Y = 96
const STAMP_W = 60
const STAMP_H = 76
const STAMP_INSET = 6
const STAMP_DIAMOND = 16
const STAMP_CX = STAMP_X + STAMP_W / 2
const STAMP_CY = STAMP_Y + STAMP_H / 2

export function HeritageMotif({ slide, ctx }: DecorProps) {
  const caramel = ctx.colors.accent
  const wine = ctx.colors.primary
  const hairline = ctx.colors.border ?? ctx.colors.muted

  return (
    <>
      {/* 顶缘双线。两条真正的 <line>，不用只走一根轴的 <path> — svg2pptx
          会把 <path>（哪怕纯水平）转成 custGeom，包围盒零高度会被
          package-audit 硬门的 invalid-shape-transform 规则拒绝（spec §4.4）。
          <line> 走 svg2pptx/line.ts 的 prstGeom="line"，该规则明确允许一根
          轴为零。 */}
      <line x1={RULE_X1} y1={RULE_THICK_Y} x2={RULE_X2} y2={RULE_THICK_Y} stroke={caramel} strokeWidth={RULE_THICK_W} />
      <line x1={RULE_X1} y1={RULE_THIN_Y} x2={RULE_X2} y2={RULE_THIN_Y} stroke={caramel} strokeWidth={RULE_THIN_W} />

      {/* 顶部两角小角花 */}
      {FLORET_CENTERS.map(([cx, cy]) => (
        <rect
          key={cx}
          x={cx - FLORET_SIZE / 2}
          y={cy - FLORET_SIZE / 2}
          width={FLORET_SIZE}
          height={FLORET_SIZE}
          fill={wine}
          transform={`rotate(45 ${cx} ${cy})`}
        />
      ))}

      {/* 底缘细线 + 中点金菱 */}
      <line x1={FOOT_X1} y1={FOOT_Y} x2={FOOT_X2} y2={FOOT_Y} stroke={hairline} strokeWidth={FOOT_W} />
      <rect
        x={DIAMOND_CX - DIAMOND_SIZE / 2}
        y={DIAMOND_CY - DIAMOND_SIZE / 2}
        width={DIAMOND_SIZE}
        height={DIAMOND_SIZE}
        fill={caramel}
        transform={`rotate(45 ${DIAMOND_CX} ${DIAMOND_CY})`}
      />

      {slide.type === "cover" && (
        <>
          <rect
            x={STAMP_X}
            y={STAMP_Y}
            width={STAMP_W}
            height={STAMP_H}
            fill="none"
            stroke={wine}
            strokeWidth={1.2}
          />
          <rect
            x={STAMP_X + STAMP_INSET}
            y={STAMP_Y + STAMP_INSET}
            width={STAMP_W - STAMP_INSET * 2}
            height={STAMP_H - STAMP_INSET * 2}
            fill="none"
            stroke={caramel}
            strokeWidth={0.75}
          />
          <rect
            x={STAMP_CX - STAMP_DIAMOND / 2}
            y={STAMP_CY - STAMP_DIAMOND / 2}
            width={STAMP_DIAMOND}
            height={STAMP_DIAMOND}
            fill={caramel}
            transform={`rotate(45 ${STAMP_CX} ${STAMP_CY})`}
          />
        </>
      )}
    </>
  )
}
