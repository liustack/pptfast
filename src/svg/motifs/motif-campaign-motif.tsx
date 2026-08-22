import type { DecorProps } from "./types"
import { DecorPiece } from "./decor-piece"
import { leafRecessOpacity } from "./decor-budget"

/**
 * campaign-motif v7 —— 右上一簇纸屑（第八波批 1，campaign 板对账）。
 *
 * 换掉的东西：v6 是页缘三带共 120 枚的纸屑场。板上封面只留右上三枚斜方片，
 * 50% 透明，避字。满场百级点阵退役。
 *
 * 三枚固定位置，成组落在右上，包进同一个 `data-decor-piece`。不是单件漂
 * 角落。第三枚相对板面右移，让开右上 logo 盒 (1120,48,96×40)。转角写进
 * path，不用 `transform="rotate"`（导出侧旋转不在受控子集内）。
 *
 * 颜色走 `accent` 与 `muted`，零 theme id、零 hex。透明度上限 0.5，叶子
 * 再经 `leafRecessOpacity`。内容页中景对比低于 3:1。
 *
 * chapter 完全退让：对镜居中的幕次与标题占画面中轴，纸屑不抢。
 *
 * 位置写死，不吃 deck seed。画笔属性写在叶子上。
 */

const OPACITY = 0.5

type Chip = {
  readonly cx: number
  readonly cy: number
  readonly deg: number
  readonly w: number
  readonly h: number
  readonly token: "accent" | "muted"
}

/** 板上右上三枚，第三枚从 (1200,70) 挪到 logo 盒右侧以免压品牌位。 */
const CHIPS: readonly Chip[] = [
  { cx: 1055, cy: 99, deg: 24, w: 10, h: 18, token: "accent" },
  { cx: 1144, cy: 167, deg: -18, w: 8, h: 14, token: "muted" },
  { cx: 1248, cy: 102, deg: 40, w: 9, h: 16, token: "accent" },
]

const round1 = (v: number) => Math.round(v * 10) / 10

/**
 * 一枚纸屑的最大外扩：最大斜方片半对角。测试安全区用同一个数。
 */
export const PIECE_REACH = Math.max(
  ...CHIPS.map((c) => Math.sqrt((c.w / 2) ** 2 + (c.h / 2) ** 2)),
)

/** 斜方片四角算成一条闭合 path。不用 `<rect transform="rotate">`。 */
function chipPath(cx: number, cy: number, deg: number, w: number, h: number): string {
  const a = (deg * Math.PI) / 180
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  const hw = w / 2
  const hh = h / 2
  const corners: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ]
  const pts = corners.map(([lx, ly]) => `${round1(cx + lx * ca - ly * sa)} ${round1(cy + lx * sa + ly * ca)}`)
  return `M ${pts[0]} L ${pts[1]} L ${pts[2]} L ${pts[3]} Z`
}

const CONFETTI = CHIPS.map((c) => ({
  ...c,
  d: chipPath(c.cx, c.cy, c.deg, c.w, c.h),
}))

/** 纸屑总枚数。测试读这个数，不复述字面量。 */
export const CONFETTI_COUNT = CONFETTI.length

export function CampaignMotif({ slide, ctx }: DecorProps) {
  if (slide.type === "chapter") return null

  const bg = ctx.defaultBg ?? ctx.colors.bg

  return (
    <DecorPiece id="confetti">
      {CONFETTI.map((piece, i) => {
        const fill = piece.token === "accent" ? ctx.colors.accent : ctx.colors.muted
        return (
          <path
            key={i}
            d={piece.d}
            fill={fill}
            opacity={leafRecessOpacity(slide.type, fill, bg, OPACITY)}
          />
        )
      })}
    </DecorPiece>
  )
}
