import type { DecorProps } from "./types"
import { DecorPiece } from "./decor-piece"
import { leafRecessOpacity } from "./decor-budget"
import { yieldsOnSparsePin } from "./branded-frame"

/**
 * poster-motif —— insight 的行情语汇（2026-08-22 第八波批 1 演化）：
 * 顶缘行情带、刻度齿、封面 430px 幽灵季字全部退役。留下的是板上那根
 * **底缘暗线**（polyline，stroke 走 border，中景）。
 *
 * 设计源 `.issues/design-boards/wave8/b1/Insight.dc.html`：
 *   - 封面走线抄封面样例折点（穿在结论句与落款之间）。
 *   - 内容页 / ending 走线抄 ending 样例折点（更贴底缘）。
 *   - 章节页不画：幽灵序号改由 `ghost-section-chapter` 画可控中景字，
 *     motif 再铺一根线会和那枚巨号抢同一层。
 *
 * 安全区：
 *   - 封面走线 y514-552，在默认 br logo 盒 (1120,630,96×40) 之上。
 *   - ending / 内容走线 y578-602，同样让开 logo 盒上沿。
 *   - 全宽 0→1280 是板上的底缘线，不再为 logo 提前收笔（线在 logo 上方）。
 *
 * 位置全部写死，不读内容、不随 seed 变。零 theme id、零 hex。
 */

const COVER_POINTS: readonly (readonly [number, number])[] = [
  [0, 545], [180, 538], [320, 552], [470, 530], [640, 542], [810, 522],
  [980, 534], [1140, 514], [1280, 522],
]

const FOOT_POINTS: readonly (readonly [number, number])[] = [
  [0, 600], [200, 590], [380, 602], [560, 584], [760, 594], [960, 578],
  [1280, 586],
]

const STROKE = 2

function pointsAttr(points: readonly (readonly [number, number])[]): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ")
}

export function PosterMotif({ slide, ctx }: DecorProps) {
  if (yieldsOnSparsePin(slide)) return null
  if (slide.type === "chapter") return null
  const { colors } = ctx
  const bg = ctx.defaultBg ?? colors.bg
  const border = colors.border ?? colors.muted
  const points = slide.type === "cover" ? COVER_POINTS : FOOT_POINTS

  return (
    <DecorPiece id="baseline">
      <polyline
        points={pointsAttr(points)}
        fill="none"
        stroke={border}
        strokeWidth={STROKE}
        opacity={leafRecessOpacity(slide.type, border, bg)}
      />
    </DecorPiece>
  )
}
