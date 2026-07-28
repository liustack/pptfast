import type { DecorProps } from "./types"
import { cachedDeckSeed, pickBySeed } from "../variety"

/**
 * pulse-motif archetype（themes-16 wave, task T1）：医疗健康主题专属装饰
 * 语言——**细脉搏线**（ECG 心跳线：贯穿的细折线，平直基线中夹一段
 * QRS 波形尖峰）+ **圆润胶囊/细胞圆点簇**（药丸形状 + 大小错落的圆点，
 * 部分空心描边像细胞膜）。克制布置，参考 classroom-motif 的角落策略：
 * cover/ending 强档（角落簇 + 一条横贯脉搏线），content 极轻（单角小簇，
 * 无脉搏线），chapter 完全退让（rail-chapter 自带底部进度点轨 + 巨幅居中
 * 标题压满整页主色块，可用空间已被正文区占满，同 classroom 的 chrome
 * 碰撞铁律判断——不叠加）。
 * 颜色取 ctx.colors（primary/accent/chartPalette），零 baked hex。实色
 * path/rect/circle + opacity（无渐变无 filter，预览/导出一致）。LCG 确定性
 * （cachedDeckSeed + pickBySeed，同 classroom-motif 先例）。
 */

/** ECG 脉搏线：平直基线 + 周期性 QRS 尖峰（Q 小凹、R 主峰、S 回落），跨宽度 w 重复。 */
function ecgPath(x: number, y: number, w: number, amp: number): string {
  const period = 170
  const beats = Math.max(1, Math.round(w / period))
  let d = `M ${x} ${y}`
  for (let i = 0; i < beats; i++) {
    const bx = x + i * period
    d += ` L ${bx + 42} ${y}`
    d += ` L ${bx + 54} ${y + amp * 0.28}`
    d += ` L ${bx + 66} ${y - amp}`
    d += ` L ${bx + 78} ${y + amp * 1.15}`
    d += ` L ${bx + 92} ${y}`
    d += ` L ${bx + period} ${y}`
  }
  return d
}

/** 圆润胶囊（药丸形）：rx=h/2 全圆角矩形，可选旋转角度。 */
function capsule(cx: number, cy: number, w: number, h: number, angle: number, color: string, opacity: number) {
  return (
    <rect
      x={cx - w / 2}
      y={cy - h / 2}
      width={w}
      height={h}
      rx={h / 2}
      ry={h / 2}
      fill={color}
      opacity={opacity}
      transform={`rotate(${angle} ${cx} ${cy})`}
    />
  )
}

/** 实心细胞圆点。 */
function cellDot(cx: number, cy: number, r: number, color: string, opacity: number) {
  return <circle cx={cx} cy={cy} r={r} fill={color} opacity={opacity} />
}

/** 空心细胞圆点（细胞膜线描）。 */
function cellRing(cx: number, cy: number, r: number, color: string, opacity: number) {
  return <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={1.6} opacity={opacity} />
}

export function PulseMotif({ ir, slide, ctx }: DecorProps) {
  const { primary, accent, chartPalette } = ctx.colors
  const [, , sky, sand] = chartPalette

  // chapter 全部 8 个 archetype 都在整页满版 primary 色块上画巨幅居中标题
  // （部分还带右下角编号水印/底部进度轨），可用净空本就零碎——同
  // classroom-motif 的 chrome 碰撞判断，chapter 完全退让，不额外叠加装饰。
  if (slide.type === "chapter") return null

  if (slide.type === "content") {
    // 弱档：右上角小胶囊+细胞点簇，贴角低调，不设脉搏线（正文区优先）。
    return (
      <>
        {capsule(1224, 40, 64, 24, -18, sky, 0.16)}
        {cellDot(1272, 84, 10, accent, 0.18)}
        {cellRing(1244, 100, 14, primary, 0.2)}
        {cellDot(30, 686, 8, sand, 0.2)}
      </>
    )
  }

  const variant = pickBySeed(cachedDeckSeed(ir), "pulse-decor", ["a", "b", "c"] as const)

  if (variant === "b") {
    // 左下角胶囊簇 + 顶部横贯脉搏线（细，克制）。
    return (
      <>
        <path d={ecgPath(0, 56, 1280, 14)} fill="none" stroke={primary} strokeWidth={2} strokeLinejoin="round" opacity={0.22} />
        {capsule(70, 660, 96, 32, 20, primary, 0.14)}
        {capsule(150, 700, 70, 26, -30, sky, 0.16)}
        {cellDot(210, 640, 12, accent, 0.2)}
        {cellRing(1200, 660, 20, sand, 0.24)}
        {cellDot(1240, 700, 9, primary, 0.18)}
      </>
    )
  }
  if (variant === "c") {
    // 右下角胶囊簇 + 底部横贯脉搏线。
    return (
      <>
        <path d={ecgPath(0, 664, 1280, 12)} fill="none" stroke={accent} strokeWidth={2} strokeLinejoin="round" opacity={0.2} />
        {capsule(1210, 70, 90, 30, -15, primary, 0.14)}
        {capsule(1130, 30, 64, 24, 25, sand, 0.18)}
        {cellDot(1250, 130, 11, sky, 0.2)}
        {cellRing(60, 90, 18, primary, 0.2)}
        {cellDot(24, 40, 8, accent, 0.2)}
      </>
    )
  }
  // a：两角胶囊/细胞簇 + 中段横贯脉搏线（cover/ending 主构图）。
  return (
    <>
      <path d={ecgPath(0, 608, 1280, 15)} fill="none" stroke={primary} strokeWidth={2} strokeLinejoin="round" opacity={0.22} />
      {capsule(1216, 54, 100, 32, -20, primary, 0.14)}
      {cellDot(1264, 106, 12, accent, 0.2)}
      {cellRing(1180, 96, 16, sky, 0.22)}
      {capsule(64, 666, 76, 28, 18, sand, 0.18)}
      {cellDot(30, 700, 9, primary, 0.2)}
      {cellRing(150, 686, 14, accent, 0.2)}
    </>
  )
}
