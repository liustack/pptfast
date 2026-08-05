import type { DecorProps } from "./types"
import { cachedDeckSeed, pickBySeed } from "../variety"

/**
 * vermilion-motif archetype（gov-theme wave，第 17 主题）：庄重公务汇报主题
 * 专属装饰语言——**旗帜感绸带弧线**（沿上升二次贝塞尔曲线的渐变宽度实心
 * 绸带，起点宽、尾部收窄，像一面正在展开的旗/一条飘起的绸带，读出「提气/
 * 庄重」的仪式感）+ **金色光芒细线**（自一角放射的一束等距细线，像报头背后
 * 的光芒，克制不喧宾）。刻意**不用五角星等政治符号**（过线风险，plan 裁定
 * 2——用抽象的绸带/光芒传达提气感）。克制布置，参考 ember-motif/terra-motif
 * 的角落策略：cover/ending 强档（绸带 + 光芒束成对布置），content 极轻（单角
 * 小光芒束 + 一条淡绸带短弧），chapter 完全退让（return null——同
 * pulse/terra/ember-motif 的 chrome 碰撞判断：八个 chapter archetype 都在整版
 * primary 正红色块上画巨幅居中标题，可用净空本就零碎，不额外叠加装饰）。
 * 颜色取 ctx.colors（primary/accent/chartPalette），零 baked hex。实色 path/
 * line + opacity（无渐变无 filter，预览/导出一致）。LCG 确定性（cachedDeckSeed
 * + pickBySeed，同 ember-motif/terra-motif 先例）。
 */

const f = (v: number) => Math.round(v * 10) / 10

/**
 * 一条旗帜感绸带：沿从 (x0,y0) 到 (x0+dx,y0+dy) 的二次贝塞尔曲线（控制点在
 * 中点沿法向偏移 `bow`，弧线鼓出的来源），宽度从 `wStart` 线性收窄到 `wEnd`
 * （起点宽、尾部尖，绸带飘展的形态）。沿中线取样 `SAMPLES` 点，各点沿曲线
 * 法向 ±半宽偏移，正向走一条边、逆向走另一条边，闭合成实心带。
 */
function ribbon(x0: number, y0: number, dx: number, dy: number, bow: number, wStart: number, wEnd: number, color: string, opacity: number) {
  const x1 = x0 + dx
  const y1 = y0 + dy
  // 控制点：中点沿弦法向偏移 bow
  const mx = (x0 + x1) / 2
  const my = (y0 + y1) / 2
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const cx = mx + nx * bow
  const cy = my + ny * bow
  const SAMPLES = 16
  const left: [number, number][] = []
  const right: [number, number][] = []
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / (SAMPLES - 1)
    const mt = 1 - t
    const px = mt * mt * x0 + 2 * mt * t * cx + t * t * x1
    const py = mt * mt * y0 + 2 * mt * t * cy + t * t * y1
    // 切向 = 贝塞尔导数；法向 = 切向旋转 90°
    const tanx = 2 * mt * (cx - x0) + 2 * t * (x1 - cx)
    const tany = 2 * mt * (cy - y0) + 2 * t * (y1 - cy)
    const tl = Math.hypot(tanx, tany) || 1
    const half = (wStart + (wEnd - wStart) * t) / 2
    const ox = (-tany / tl) * half
    const oy = (tanx / tl) * half
    left.push([px + ox, py + oy])
    right.push([px - ox, py - oy])
  }
  let d = `M ${f(left[0][0])} ${f(left[0][1])}`
  for (let i = 1; i < SAMPLES; i++) d += ` L ${f(left[i][0])} ${f(left[i][1])}`
  for (let i = SAMPLES - 1; i >= 0; i--) d += ` L ${f(right[i][0])} ${f(right[i][1])}`
  return <path d={`${d} Z`} fill={color} opacity={opacity} />
}

/**
 * 金色光芒束：自 (cx,cy) 放射的 `count` 条等距细线，角度在 [a0, a1]（弧度）
 * 均匀铺开，每条从 innerR 到 outerR。像报头背后的一束光芒，提气而不喧宾。
 */
function rayFan(cx: number, cy: number, count: number, innerR: number, outerR: number, a0: number, a1: number, color: string, opacity: number, strokeWidth: number) {
  const lines = []
  for (let i = 0; i < count; i++) {
    const a = count === 1 ? a0 : a0 + (a1 - a0) * (i / (count - 1))
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    lines.push(
      <line
        key={i}
        x1={f(cx + ca * innerR)}
        y1={f(cy + sa * innerR)}
        x2={f(cx + ca * outerR)}
        y2={f(cy + sa * outerR)}
        stroke={color}
        strokeWidth={strokeWidth}
      />,
    )
  }
  return <g opacity={opacity}>{lines}</g>
}

const R = Math.PI / 180

export function VermilionMotif({ ir, slide, ctx }: DecorProps) {
  const { primary, accent, chartPalette } = ctx.colors
  const [, , navy, warm] = chartPalette

  // chapter 全部 8 个 archetype 都在整版 primary 正红色块上画巨幅居中标题——
  // 同 pulse/terra/ember-motif 的 chrome 碰撞判断，chapter 完全退让。
  if (slide.type === "chapter") return null

  if (slide.type === "content") {
    // 弱档：右上角一小束金色光芒 + 左下角一条淡红绸带短弧，贴角低调，不与
    // 正文区抢空间。
    return (
      <>
        {rayFan(1256, 26, 6, 24, 132, 108 * R, 172 * R, accent, 0.5, 1.2)}
        {ribbon(-30, 706, 250, -66, 34, 20, 5, primary, 0.1)}
      </>
    )
  }

  const variant = pickBySeed(cachedDeckSeed(ir), "vermilion-decor", ["a", "b", "c"] as const)

  if (variant === "b") {
    // 左上角金色光芒束 + 右下角主绸带上扬（大，正红）+ 藏青伴随绸带。
    return (
      <>
        {rayFan(28, 30, 9, 30, 208, 20 * R, 82 * R, accent, 0.52, 1.3)}
        {ribbon(1320, 712, -300, -150, -58, 46, 9, primary, 0.15)}
        {ribbon(1300, 660, -230, -96, -40, 22, 6, navy, 0.12)}
      </>
    )
  }
  if (variant === "c") {
    // 右上角金色光芒束 + 左下角主绸带上扬（大，正红）+ 暖灰伴随绸带。
    return (
      <>
        {rayFan(1252, 30, 9, 30, 208, 98 * R, 160 * R, accent, 0.52, 1.3)}
        {ribbon(-40, 712, 300, -150, 58, 46, 9, primary, 0.15)}
        {ribbon(-20, 660, 230, -96, 40, 22, 6, warm, 0.14)}
      </>
    )
  }
  // a：左下角金色光芒束（自地面向上放射，提气）+ 右上角主绸带斜掠（大，正红）
  // + 藏青伴随绸带——旗帜展开的主构图（cover/ending）。
  return (
    <>
      {rayFan(30, 700, 10, 40, 220, -78 * R, -14 * R, accent, 0.52, 1.3)}
      {ribbon(1330, 24, -300, 150, 58, 46, 9, primary, 0.15)}
      {ribbon(1310, 70, -232, 120, 42, 22, 6, navy, 0.12)}
    </>
  )
}
