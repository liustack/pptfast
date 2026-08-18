import type { DecorProps } from "./types"
import { cachedDeckSeed, pickBySeed } from "../variety"

/**
 * terra-motif（themes-16 wave, task T2）：可持续/ESG 主题专属
 * 装饰语言——**等高线**（地形图细线簇：几条不等距、不规则的平滑闭合
 * 贝塞尔嵌套轮廓，避免画成规整同心圆——每层半径/相位都带扰动，读出
 * 山丘/台地的地形感）+ **叶脉**（单片叶轮廓：中脉+左右侧脉细线，象征
 * 生长）+ **种子点**（大小错落的实心圆点簇，疏落分布，象征播种/根系）。
 * 克制布置，参考 classroom-motif 的角落策略：cover/ending 强档（角落
 * 等高线簇 + 叶脉/种子点缀），content 极轻（单角小簇，无等高线），
 * chapter 完全退让——同 pulse-motif 的 chrome 碰撞判断：8 个 chapter
 * layout 都在整页满版 primary 色块上画巨幅居中标题（部分还带右下角
 * 编号水印/底部进度轨），可用净空本就零碎，不额外叠加装饰。
 * 颜色取 ctx.colors（primary/accent/chartPalette），零 baked hex。实色
 * path/circle + opacity（无渐变无 filter，预览/导出一致）。LCG 确定性
 * （cachedDeckSeed + pickBySeed，同 classroom-motif/pulse-motif 先例）。
 */

/**
 * 一层不规则闭合等高线：以 cx/cy 为中心、平均半径 r 的扰动闭合贝塞尔环。
 * phase 错开各层的凹凸位置，避免嵌套层读成规整同心圆。
 */
function contourRing(cx: number, cy: number, r: number, phase: number): string {
  const bumps = [1.08, 0.86, 1.14, 0.92, 1.05, 0.82, 1.1, 0.95]
  const n = bumps.length
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + phase
    const bumpIdx = (i + Math.round(phase * 2)) % n
    const rr = r * bumps[bumpIdx]
    pts.push([cx + Math.cos(angle) * rr, cy + Math.sin(angle) * rr * 0.62])
  }
  const f = (v: number) => Math.round(v * 10) / 10
  let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[(i + 1) % n]
    const mx = f((x0 + x1) / 2 + (y1 - y0) * 0.18)
    const my = f((y0 + y1) / 2 - (x1 - x0) * 0.18)
    d += ` Q ${mx} ${my} ${f(x1)} ${f(y1)}`
  }
  return `${d} Z`
}

/** 等高线簇：`layers` 层嵌套扰动环，半径递减，共享中心。 */
function contourCluster(cx: number, cy: number, rOuter: number, layers: number, color: string, baseOpacity: number) {
  const rings = []
  for (let i = 0; i < layers; i++) {
    const r = rOuter * (1 - i * (0.62 / layers))
    rings.push(
      <path
        key={i}
        d={contourRing(cx, cy, r, i * 0.7)}
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        opacity={baseOpacity - i * 0.02}
      />,
    )
  }
  return <g>{rings}</g>
}

/** 单片叶脉：椭圆叶轮廓（细描边）+ 中脉 + 两对侧脉。 */
function leafVein(cx: number, cy: number, len: number, angle: number, color: string, opacity: number) {
  const w = len * 0.42
  return (
    <g transform={`rotate(${angle} ${cx} ${cy})`} opacity={opacity}>
      <path
        d={`M ${cx - len / 2} ${cy} Q ${cx - len * 0.2} ${cy - w} ${cx + len / 2} ${cy} Q ${cx - len * 0.2} ${cy + w} ${cx - len / 2} ${cy} Z`}
        fill="none"
        stroke={color}
        strokeWidth={1.4}
      />
      <path d={`M ${cx - len / 2} ${cy} L ${cx + len / 2} ${cy}`} stroke={color} strokeWidth={1.2} />
      <path d={`M ${cx - len * 0.1} ${cy} L ${cx - len * 0.28} ${cy - w * 0.5}`} stroke={color} strokeWidth={1} />
      <path d={`M ${cx - len * 0.1} ${cy} L ${cx - len * 0.28} ${cy + w * 0.5}`} stroke={color} strokeWidth={1} />
    </g>
  )
}

/** 种子点簇：大小错落的实心圆点，疏落分布（播种/根系意象）。 */
function seedCluster(x: number, y: number, color: string, opacity: number) {
  const offsets: [number, number, number][] = [
    [0, 0, 6],
    [22, 10, 4],
    [-16, 18, 5],
    [10, -20, 3.5],
    [-24, -8, 4.5],
  ]
  return (
    <g>
      {offsets.map(([dx, dy, r], i) => (
        <circle key={i} cx={x + dx} cy={y + dy} r={r} fill={color} opacity={opacity} />
      ))}
    </g>
  )
}

export function TerraMotif({ ir, slide, ctx }: DecorProps) {
  const { primary, accent, chartPalette } = ctx.colors
  const [, , wheat, slate] = chartPalette

  // chapter 全部 8 个 layout 都在整页满版 primary 色块上画巨幅居中标题
  // （部分还带右下角编号水印/底部进度轨），可用净空本就零碎——同
  // pulse-motif/classroom-motif 的 chrome 碰撞判断，chapter 完全退让。
  if (slide.type === "chapter") return null

  if (slide.type === "content") {
    // 弱档：右上角小等高线簇 + 左下角种子点，贴角低调，克制不抢正文区。
    return (
      <>
        {contourCluster(1256, 30, 70, 2, wheat, 0.16)}
        {seedCluster(30, 690, slate, 0.2)}
      </>
    )
  }

  const variant = pickBySeed(cachedDeckSeed(ir), "terra-decor", ["a", "b", "c"] as const)

  if (variant === "b") {
    // 左下角大等高线簇 + 右上角叶脉 + 种子点缀。
    return (
      <>
        {contourCluster(90, 700, 210, 4, primary, 0.16)}
        {seedCluster(220, 660, accent, 0.2)}
        {leafVein(1210, 60, 110, -18, wheat, 0.24)}
        {leafVein(1150, 110, 70, 30, slate, 0.2)}
      </>
    )
  }
  if (variant === "c") {
    // 右下角大等高线簇 + 左上角叶脉 + 种子点缀。
    return (
      <>
        {contourCluster(1190, 690, 210, 4, primary, 0.16)}
        {seedCluster(1080, 640, accent, 0.2)}
        {leafVein(70, 50, 110, 18, wheat, 0.24)}
        {leafVein(130, 100, 70, -30, slate, 0.2)}
      </>
    )
  }
  // a：两角等高线簇（大小错落）+ 中段叶脉/种子点缀（cover/ending 主构图）。
  return (
    <>
      {contourCluster(1240, 40, 170, 3, primary, 0.16)}
      {leafVein(1180, 130, 90, -25, wheat, 0.22)}
      {contourCluster(50, 700, 190, 4, accent, 0.14)}
      {seedCluster(180, 660, slate, 0.2)}
    </>
  )
}
