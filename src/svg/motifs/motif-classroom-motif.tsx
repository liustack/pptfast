import type { DecorProps } from "./types"
import { cachedDeckSeed, pickBySeed } from "../variety"

/**
 * classroom-motif archetype（2026-07-13 第 13 主题）：莫兰迪教学模板
 * 语言——**平滑有机斑块**（大圆润 blob，2-3 档灰调色错落，与 bloom 的
 * 水彩纹理刻意区分：参考图斑块是平滑无纹理的）+ **手绘小装饰**（点阵
 * /短线组/波浪线/空心圆线描——课堂手账气质）。
 * 构图变体（cover/ending 强档）：a=四角斑块群、b=左上+右下对角大斑、
 * c=顶部斑块带。chapter 完全退让（chrome 碰撞铁律）。content 弱档=
 * 右上+左下角小斑+一组点阵。
 * 颜色取 ctx.colors.chartPalette 莫兰迪四色（零 hex）。实色 path+
 * opacity（无渐变无 filter，预览/导出一致）。LCG 确定性。
 */

/** 平滑有机 blob（三形状轮换，Catmull 风格闭合贝塞尔——刻意光滑）。 */
function blobPath(cx: number, cy: number, r: number, s: number): string {
  const f = (v: number) => Math.round(v * 10) / 10
  if (s === 1)
    return `M ${f(cx - r * 1.05)} ${f(cy + r * 0.15)} C ${f(cx - r)} ${f(cy - r * 0.65)} ${f(cx - r * 0.3)} ${f(cy - r * 1.1)} ${f(cx + r * 0.42)} ${f(cy - r * 0.82)} C ${f(cx + r * 1.02)} ${f(cy - r * 0.48)} ${f(cx + r * 0.98)} ${f(cy + r * 0.38)} ${f(cx + r * 0.55)} ${f(cy + r * 0.78)} C ${f(cx + r * 0.15)} ${f(cy + r * 1.12)} ${f(cx - r * 0.62)} ${f(cy + r * 0.92)} ${f(cx - r * 1.05)} ${f(cy + r * 0.15)} Z`
  if (s === 2)
    return `M ${f(cx - r * 0.88)} ${f(cy - r * 0.42)} C ${f(cx - r * 0.48)} ${f(cy - r * 1.05)} ${f(cx + r * 0.52)} ${f(cy - r)} ${f(cx + r * 0.92)} ${f(cy - r * 0.32)} C ${f(cx + r * 1.18)} ${f(cy + r * 0.18)} ${f(cx + r * 0.66)} ${f(cy + r * 0.72)} ${f(cx + r * 0.12)} ${f(cy + r * 0.92)} C ${f(cx - r * 0.48)} ${f(cy + r * 1.12)} ${f(cx - r * 1.1)} ${f(cy + r * 0.45)} ${f(cx - r * 0.88)} ${f(cy - r * 0.42)} Z`
  return `M ${f(cx - r)} ${f(cy)} C ${f(cx - r)} ${f(cy - r * 0.85)} ${f(cx - r * 0.38)} ${f(cy - r * 1.08)} ${f(cx + r * 0.22)} ${f(cy - r * 0.92)} C ${f(cx + r * 0.82)} ${f(cy - r * 0.72)} ${f(cx + r * 1.08)} ${f(cy - r * 0.12)} ${f(cx + r * 0.88)} ${f(cy + r * 0.48)} C ${f(cx + r * 0.62)} ${f(cy + r * 1.02)} ${f(cx - r * 0.12)} ${f(cy + r * 1.05)} ${f(cx - r * 0.58)} ${f(cy + r * 0.78)} C ${f(cx - r * 1.05)} ${f(cy + r * 0.48)} ${f(cx - r)} ${f(cy + r * 0.28)} ${f(cx - r)} ${f(cy)} Z`
}

export function ClassroomMotif({ ir, slide, ctx }: DecorProps) {
  const [blue, coral, sage, latte] = ctx.colors.chartPalette

  if (slide.type === "chapter") return null

  const blob = (cx: number, cy: number, r: number, color: string, o: number, s = 0) => (
    <path d={blobPath(cx, cy, r, s)} fill={color} opacity={o} />
  )

  /** 点阵（手账点点）：rows×cols 小圆点，斜向错位。 */
  const dots = (x: number, y: number, rows: number, cols: number, color: string, o = 0.5) => {
    const pts: React.ReactNode[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        pts.push(
          <circle key={`${r}-${c}`} cx={x + c * 16 + r * 5} cy={y + r * 14} r={2.2} fill={color} opacity={o} />,
        )
      }
    }
    return <g>{pts}</g>
  }

  /** 短线组（手绘速写线）。 */
  const ticks = (x: number, y: number, angle: number, color: string) => {
    const a = (angle * Math.PI) / 180
    const dx = Math.cos(a) * 14
    const dy = Math.sin(a) * 14
    return (
      <g stroke={color} strokeWidth={2.4} strokeLinecap="round" opacity={0.55}>
        <path d={`M ${x} ${y} l ${dx} ${dy}`} fill="none" />
        <path d={`M ${x + 10} ${y - 6} l ${dx} ${dy}`} fill="none" />
        <path d={`M ${x + 20} ${y - 12} l ${dx} ${dy}`} fill="none" />
      </g>
    )
  }

  /** 波浪线（手绘下划波浪）。 */
  const squiggle = (x: number, y: number, n: number, color: string) => {
    let d = `M ${x} ${y}`
    for (let i = 0; i < n; i++) d += ` q 9 ${i % 2 === 0 ? -8 : 8} 18 0`
    return <path d={d} stroke={color} strokeWidth={2.2} strokeLinecap="round" fill="none" opacity={0.6} />
  }

  /** 空心圆线描（手绘圈圈）。 */
  const ring = (cx: number, cy: number, r: number, color: string, o = 0.5) => (
    <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={2} opacity={o} />
  )

  if (slide.type === "content") {
    // 弱档：右上小斑 + 左下小斑 + 一组点阵（贴角低调）
    return (
      <>
        {blob(1246, 26, 90, sage, 0.35, 1)}
        {blob(1280, 90, 60, coral, 0.25, 2)}
        {blob(20, 700, 84, latte, 0.35, 0)}
        {dots(1140, 92, 3, 4, blue, 0.4)}
        {squiggle(60, 660, 3, coral)}
      </>
    )
  }

  const variant = pickBySeed(cachedDeckSeed(ir), "classroom-decor", ["a", "b", "c"] as const)

  if (variant === "b") {
    // 左上 + 右下对角大斑（错落两档）
    return (
      <>
        {blob(70, 60, 190, blue, 0.3, 0)}
        {blob(220, 10, 120, sage, 0.35, 2)}
        {blob(20, 210, 90, coral, 0.28, 1)}
        {blob(1210, 660, 200, coral, 0.3, 2)}
        {blob(1060, 700, 120, latte, 0.4, 0)}
        {blob(1268, 520, 84, sage, 0.32, 1)}
        {dots(320, 130, 3, 5, blue, 0.4)}
        {ticks(1000, 600, -35, coral)}
        {squiggle(150, 260, 4, latte)}
        {ring(1150, 480, 14, blue, 0.45)}
      </>
    )
  }
  if (variant === "c") {
    // 顶部斑块带 + 左下点缀
    return (
      <>
        {blob(140, -20, 150, sage, 0.35, 1)}
        {blob(420, -50, 180, latte, 0.4, 0)}
        {blob(760, -30, 150, coral, 0.26, 2)}
        {blob(1080, -40, 170, blue, 0.28, 1)}
        {blob(1272, 60, 80, coral, 0.3, 0)}
        {blob(30, 690, 110, blue, 0.28, 2)}
        {dots(880, 70, 2, 5, blue, 0.4)}
        {squiggle(230, 100, 3, coral)}
        {ticks(60, 600, -30, sage)}
        {ring(1180, 150, 12, latte, 0.55)}
      </>
    )
  }
  // a：四角斑块群（参考图主构图——柔和环抱、中央留白）
  return (
    <>
      {blob(60, 50, 160, sage, 0.35, 0)}
      {blob(210, 0, 110, coral, 0.25, 2)}
      {blob(1230, 40, 170, coral, 0.3, 1)}
      {blob(1290, 170, 100, latte, 0.4, 0)}
      {blob(50, 680, 170, latte, 0.42, 2)}
      {blob(200, 730, 110, blue, 0.25, 1)}
      {blob(1240, 680, 180, blue, 0.28, 0)}
      {blob(1100, 730, 110, sage, 0.35, 2)}
      {dots(300, 80, 3, 5, blue, 0.42)}
      {dots(1000, 640, 2, 4, coral, 0.4)}
      {squiggle(1090, 120, 3, blue)}
      {squiggle(180, 640, 4, coral)}
      {ticks(1180, 560, -35, sage)}
      {ring(260, 170, 13, coral, 0.5)}
      {ring(1050, 90, 10, latte, 0.55)}
    </>
  )
}
