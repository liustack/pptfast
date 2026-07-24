// GF/svg/motifs/motif-corner-ornament-motif.tsx
import type { DecorProps } from "./types"
import { cachedDeckSeed, pickBySeed } from "../variety"

/**
 * corner-ornament-motif archetype（spec §3.2，Wave 3 Task 17）：four L-shaped
 * double-line corner ornaments on cover/chapter ("强", the 4-corner
 * treatment is the tier's whole look — chapter mirrors cover, no
 * separable cover-only bonus withheld); content/ending ("弱", ending
 * mirrors content) keep only the top-right one. Each ornament is two
 * concentric "L" brackets (an outer + a 4px-inset inner one, "双线"), each
 * leg 20px long, the outer bracket's corner sitting 40px in from the page
 * edge — margin(40) + gap(4) + length(20) = 64 exactly matches
 * BrandChrome's logo bands' own inner edge (x 64/1216, tl/tr), a tangent
 * not an overlap. Extracted from 源 templates/magazine.tsx 的
 * `EditorialSerifDecor`（511-524 行）+ 私有 helper `CornerOrnament`
 * （484-509 行，随其常量 `ORNAMENT_MARGIN`/`ORNAMENT_LEN`/`ORNAMENT_GAP`
 * 一并复制进本文件，均非导出、非公共 util，不建公共依赖）。
 *
 * 替换表（Step B，逐十六进制核实，对照 themes/magazine.ts 的 colors）：
 * Step A 对函数区间（462-524 行，含 CornerOrnament + EditorialSerifDecor）
 * grep 未命中任何 `#XXXXXX` 字面量或 theme id 字符串——源函数体已直接消费
 * `ctx.colors.border ?? ctx.colors.muted`，无烤死颜色常量，无孤儿色。
 * **档位一・逐字节等价**。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量。
 */
const ORNAMENT_MARGIN = 40
const ORNAMENT_LEN = 20
const ORNAMENT_GAP = 4

/**
 * One corner's double-line "L" bracket. `(cx,cy)` is the page's own corner
 * (0/1280, 0/720); `signX`/`signY` point the bracket inward — +1 for the
 * left/top corners, -1 for the right/bottom ones.
 */
function CornerOrnament({
  cx,
  cy,
  signX,
  signY,
  stroke,
}: {
  cx: number
  cy: number
  signX: 1 | -1
  signY: 1 | -1
  stroke: string
}) {
  const outerX = cx + signX * ORNAMENT_MARGIN
  const outerY = cy + signY * ORNAMENT_MARGIN
  const innerX = outerX + signX * ORNAMENT_GAP
  const innerY = outerY + signY * ORNAMENT_GAP
  return (
    <>
      <line x1={outerX} y1={outerY} x2={outerX + signX * ORNAMENT_LEN} y2={outerY} stroke={stroke} strokeWidth="1" />
      <line x1={outerX} y1={outerY} x2={outerX} y2={outerY + signY * ORNAMENT_LEN} stroke={stroke} strokeWidth="1" />
      <line x1={innerX} y1={innerY} x2={innerX + signX * ORNAMENT_LEN} y2={innerY} stroke={stroke} strokeWidth="1" />
      <line x1={innerX} y1={innerY} x2={innerX} y2={innerY + signY * ORNAMENT_LEN} stroke={stroke} strokeWidth="1" />
    </>
  )
}

/**
 * 构图变体（2026-07-10 装饰多样性推广）：a=四角全饰（原构图）、b=主对角
 * （左上+右下）、c=副对角（右上+左下）。弱档（content/ending）恒单角。
 */
export function CornerOrnamentMotif({ ir, slide, ctx }: DecorProps) {
  const stroke = ctx.colors.border ?? ctx.colors.muted
  const variant = pickBySeed(cachedDeckSeed(ir), "corner-ornament-decor", ["a", "b", "c"] as const)
  const topRight = <CornerOrnament cx={1280} cy={0} signX={-1} signY={1} stroke={stroke} />
  if (slide.type === "content" || slide.type === "ending") return topRight

  const topLeft = <CornerOrnament cx={0} cy={0} signX={1} signY={1} stroke={stroke} />
  const bottomLeft = <CornerOrnament cx={0} cy={720} signX={1} signY={-1} stroke={stroke} />
  const bottomRight = <CornerOrnament cx={1280} cy={720} signX={-1} signY={-1} stroke={stroke} />
  if (variant === "b") {
    return (
      <>
        {topLeft}
        {bottomRight}
      </>
    )
  }
  if (variant === "c") {
    return (
      <>
        {topRight}
        {bottomLeft}
      </>
    )
  }
  return (
    <>
      {topLeft}
      {topRight}
      {bottomLeft}
      {bottomRight}
    </>
  )
}
