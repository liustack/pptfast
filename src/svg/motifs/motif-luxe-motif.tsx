import type { DecorProps } from "./types"

/**
 * luxe-motif —— 「请柬金框」（2026-08-19 深底组皮肤重设计，设计源
 * `.issues/2026-08-18-theme-redesign/skins/group1-dark-boards.dc.html`
 * 的 luxe 设计表，几何坐标逐条抄录，不派生）。
 *
 * 换掉的东西：v1 是「烫金细线」的三档 seed 变体（右上双细线角 + 左下金点 /
 * 顶部细线横贯 + 双端金点 / 四角细短线），chapter 整个退让。三档变体各画各的，
 * 没有一档撑得起主题识别——covers-review 把深底三家共用一张脸记成本轮的反面
 * 基线，luxe 的处方是把这些零碎收成一件整的：一张请柬的金框。
 *
 * 画的两件东西（四种页型都画，设计稿的 light 档就是这两件）：
 *   - **双层金框**：外框 1.5px / 0.9 不透明，内框 0.75px / 0.45 不透明、
 *     四边内缩 10px。一张请柬的边，不是四个孤立的角。
 *   - **框顶金菱**：框上边中点一枚 12×12 旋转 45° 的金方块，请柬的引首。
 *
 * chapter 不再退让：v1 退让的理由是 variant b 的顶部金线（y44）横穿
 * poster-chapter 右上的 org 文字（2026-07-11 用户截图实锤）。金框走的是
 * 页缘（x36 / x1244，y28 / y624），离 org 文字所在的版心有 60px 以上，
 * 那条理由不再成立。
 *
 * 安全区：四个内容区是标题区 (96,48,1040×122)、正文区 (96,200,1040×420)、
 * 页脚 meta 带 (48,664,1184×44)、右下 logo 盒 (1120,630,96×40)。
 *   - 左右两轨 x36 / x1244，在版心 (x96-1136) 之外。
 *   - 上边 y28，在标题区上沿 y48 之上；金菱 y22-34，同。
 *   - 下边**上移到 y624**（主会话裁定，设计稿原稿画在 y650）：原稿那条
 *     横边会从 logo 盒 (1120,630,96×40) 的竖直区间正中穿过去，y624 让开
 *     6px。内框跟着错位（外框内缩 10px → 内框下边 y614）。
 *     `motif-luxe-motif.test.tsx` 锁死这条——把下边改回 650 测试立刻红。
 *
 * 位置全部写死，不读内容、不随 seed 变——`inventory.md` 的确定性红线
 * （装饰位置做内容感知会让 seed 的修订稳定性失效）。v1 的三档 seed 变体
 * 因此一并删除。
 *
 * 纪律：零 theme id、零 hex，颜色只来自 ctx（accent = 香槟金）。
 * v1 取的是 `ctx.colors.primary`——本轮 primary 已退成与底几乎同黑的色块色
 * （见 `themes/luxe.ts` 的改动来历），金色现在只在 accent 这一个角色上，
 * 框线因此改读 accent。
 */

// ── 双层金框（设计稿坐标，下边按裁定上移） ──────────────────────────────
const FRAME_X = 36
const FRAME_Y = 28
const FRAME_RIGHT = 1244
/**
 * 外框下边。设计稿原稿是 650，会穿 logo 盒 (1120,630,96×40) 的竖直区间；
 * 主会话裁定上移到 624，距 logo 盒上沿 y630 让开 6px。
 */
const FRAME_BOTTOM = 624
const FRAME_STROKE = 1.5
const FRAME_OPACITY = 0.9

/** 内框四边一律内缩这么多——下边因此落在 614，跟着外框一起上移。 */
const INNER_INSET = 10
const INNER_STROKE = 0.75
const INNER_OPACITY = 0.45

// ── 框顶金菱 ────────────────────────────────────────────────────────────
const DIAMOND_SIZE = 12
/** 金菱中心：框上边的中点。旋转 45° 用的也是这个点。 */
const DIAMOND_CX = (FRAME_X + FRAME_RIGHT) / 2
const DIAMOND_CY = FRAME_Y

export function LuxeMotif({ ctx }: DecorProps) {
  const gold = ctx.colors.accent

  return (
    <>
      {/* 外框 */}
      <rect
        x={FRAME_X}
        y={FRAME_Y}
        width={FRAME_RIGHT - FRAME_X}
        height={FRAME_BOTTOM - FRAME_Y}
        fill="none"
        stroke={gold}
        strokeWidth={FRAME_STROKE}
        opacity={FRAME_OPACITY}
      />
      {/* 内框（四边内缩 10px） */}
      <rect
        x={FRAME_X + INNER_INSET}
        y={FRAME_Y + INNER_INSET}
        width={FRAME_RIGHT - FRAME_X - INNER_INSET * 2}
        height={FRAME_BOTTOM - FRAME_Y - INNER_INSET * 2}
        fill="none"
        stroke={gold}
        strokeWidth={INNER_STROKE}
        opacity={INNER_OPACITY}
      />
      {/* 框顶金菱（引首） */}
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
