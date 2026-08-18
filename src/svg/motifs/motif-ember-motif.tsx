import type { DecorProps } from "./types"
import { cachedDeckSeed, pickBySeed } from "../variety"

/**
 * ember-motif（themes-16 wave, task T3）：创业路演/暖色能量主题
 * 专属装饰语言——**上升火花**：沿一段上升弧线（二次贝塞尔曲线取样，非直线）
 * 渐次缩小、渐次淡出的圆点粒子串，读出「起飞/热身」的上升动势。每串粒子
 * 起点最大最亮（贴近地面/角落，能量最足），沿弧线向上飘散时半径与不透明度
 * 同步衰减，尾部几颗几乎融入背景——克制布置，参考 classroom-motif 的角落
 * 策略：cover/ending 强档（角落多串火花+弱一档的伴随小火花），content 极轻
 * （单角一串短火花），chapter 完全退让（return null，同 pulse-motif/
 * terra-motif 的 chrome 碰撞判断——8 个 chapter layout 都在整页满版
 * primary 色块上画巨幅居中标题，可用净空本就零碎，不额外叠加装饰）。
 * 颜色取 ctx.colors（primary/accent/chartPalette），零 baked hex。实色
 * circle + opacity（无渐变无 filter，预览/导出一致）。LCG 确定性
 * （cachedDeckSeed + pickBySeed，同 pulse-motif/terra-motif 先例）。
 */

/**
 * 一串上升火花：从 (x0,y0) 沿二次贝塞尔弧线飘向 (x0+dx, y0+dy)，途经控制点
 * 偏移 `bow`（正值向右鼓出，负值向左鼓出，弧线感的来源）。`count` 颗粒子
 * 沿弧线均匀取样，半径从 `rStart` 线性衰减到 `rEnd`，不透明度从
 * `opacityStart` 衰减到 `opacityEnd`——起点最大最亮，尾部几乎融入背景。
 */
function sparkTrail(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  bow: number,
  count: number,
  rStart: number,
  rEnd: number,
  opacityStart: number,
  opacityEnd: number,
  color: string,
) {
  const x1 = x0 + dx
  const y1 = y0 + dy
  const cx = (x0 + x1) / 2 + bow
  const cy = (y0 + y1) / 2
  const dots = []
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1)
    const mt = 1 - t
    const px = mt * mt * x0 + 2 * mt * t * cx + t * t * x1
    const py = mt * mt * y0 + 2 * mt * t * cy + t * t * y1
    const r = rStart + (rEnd - rStart) * t
    const opacity = opacityStart + (opacityEnd - opacityStart) * t
    dots.push(<circle key={i} cx={Math.round(px * 10) / 10} cy={Math.round(py * 10) / 10} r={r} fill={color} opacity={opacity} />)
  }
  return <g>{dots}</g>
}

export function EmberMotif({ ir, slide, ctx }: DecorProps) {
  const { primary, accent, chartPalette } = ctx.colors
  const [, navy, , warmGray] = chartPalette

  // chapter 全部 8 个 layout 都在整页满版 primary 色块上画巨幅居中标题
  // （部分还带右下角编号水印/底部进度轨），可用净空本就零碎——同
  // pulse-motif/terra-motif 的 chrome 碰撞判断，chapter 完全退让。
  if (slide.type === "chapter") return null

  if (slide.type === "content") {
    // 弱档：右下角一串短火花，贴角低调，不与正文区抢空间。
    return sparkTrail(1240, 700, -60, -140, 24, 6, 6, 1, 0.2, 0.03, accent)
  }

  const variant = pickBySeed(cachedDeckSeed(ir), "ember-decor", ["a", "b", "c"] as const)

  if (variant === "b") {
    // 左下角主火花串（大，primary）+ 右上角伴随小火花（accent）。
    return (
      <>
        {sparkTrail(60, 720, 90, -220, 40, 9, 11, 1.5, 0.26, 0.03, primary)}
        {sparkTrail(150, 690, 60, -160, 24, 6, 7, 1, 0.2, 0.03, accent)}
        {sparkTrail(1180, 90, -50, -70, -18, 5, 6, 1, 0.16, 0.02, warmGray)}
      </>
    )
  }
  if (variant === "c") {
    // 右下角主火花串（大，primary）+ 左上角伴随小火花（navy 点缀）。
    return (
      <>
        {sparkTrail(1220, 720, -90, -220, -40, 9, 11, 1.5, 0.26, 0.03, primary)}
        {sparkTrail(1130, 690, -60, -160, -24, 6, 7, 1, 0.2, 0.03, accent)}
        {sparkTrail(100, 90, 50, -70, 18, 5, 6, 1, 0.14, 0.02, navy)}
      </>
    )
  }
  // a：两角火花串（cover/ending 主构图）——左下 primary 主串上升，右上
  // accent 小串呼应，火花密度左重右轻，读出「从这里起飞」的方向感。
  return (
    <>
      {sparkTrail(70, 730, 110, -240, 46, 10, 12, 1.5, 0.28, 0.03, primary)}
      {sparkTrail(180, 700, 70, -170, 26, 6, 7, 1, 0.2, 0.03, accent)}
      {sparkTrail(1210, 70, -60, -60, -20, 5, 6, 1, 0.16, 0.02, warmGray)}
    </>
  )
}
