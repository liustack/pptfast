import type { DecorProps } from "./types"
import { cachedDeckSeed, pickBySeed } from "../variety"

/**
 * campaign-motif archetype v4（2026-07-13 用户裁决三轮返工：圆头 stroke
 * 弧线「没有纹理没有笔刷感」——参考图的蜡笔/干刷条是**毛糙锯齿边 +
 * 内部露底条痕 + 端头飞散颗粒**）。
 * 蜡笔条 crayon()：矩形起始 + Hobbs 边中点位移变形（长边中等方差=毛边、
 * 短边高方差=端头散开）+ 三层错位低透明叠加（蜡质层次）+ 内部沿长轴
 * bg 色细条痕（露底）+ 两端飞散颗粒。
 * 另有暗斑 blot 打破纯色底、白三角/彩点散布。
 * 配色纪律（Hobbs 概率结构）：品红主导、湖蓝辅、黄/薄荷点缀。
 * 构图变体（cover/ending 强档）：a=左上+右下对角束、b=顶底横扫、c=四角
 * 环布。chapter 完全退让。content 弱档=贴边小条。
 * 颜色取 ctx.colors.chartPalette + bg（露底痕）+ text（白散点），零外部
 * hex（黑色暗斑为中性色豁免，split-diagonal 先例）。纯 path+opacity。
 */

function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

export function CampaignMotif({ ir, slide, ctx }: DecorProps) {
  const [pink, blue, yellow, mint] = ctx.colors.chartPalette
  const white = ctx.colors.text
  if (slide.type === "chapter") return null

  /** 蜡笔条 v5（p5.brush 图章模型，联网核实的标准做法）：笔画本身由沿
   * 路径的密集粒子图章构成——每步一组粒子、沿法线高斯散布、横截面密度
   * 渐变（中心实/边缘散/少量飞屑）、两端收细散开。粒子按透明度三档分桶
   * 聚合成单 path（菱形子路径），一条笔画=4 个 path（导出 shape 预算）。 */
  const crayon = (
    x: number,
    y: number,
    angleDeg: number,
    len: number,
    w: number,
    color: string,
    seed: number,
    o = 0.85,
  ) => {
    const rnd = lcg(seed * 2654435761 + 7)
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5
    const a = (angleDeg * Math.PI) / 180
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    // 主轴微弯（二次贝塞尔）：控制点侧偏
    const bend = (rnd() - 0.5) * len * 0.24
    const world = (u: number, t: number) => {
      const tt = u / len
      const curve = bend * 4 * tt * (1 - tt) // 二次弯曲
      return { x: x + u * ca - (t + curve) * sa, y: y + u * sa + (t + curve) * ca }
    }
    // 三个透明度桶（中心/中带/边缘）+ 飞屑桶
    const buckets: string[] = ["", "", "", ""]
    const diamond = (px: number, py: number, r: number) => {
      const X = Math.round(px)
      const Y = Math.round(py)
      const R = Math.round(r * 10) / 10
      return `M ${X} ${Y - R} L ${X + R} ${Y} L ${X} ${Y + R} L ${X - R} ${Y} Z `
    }
    const steps = Math.max(50, Math.round(len / 1.8))
    for (let i = 0; i <= steps; i++) {
      const tt = i / steps
      const u = tt * len
      // 压力曲线：两端细、中段饱满 + 随机呼吸
      const press = (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, tt * 1.15))) * (0.85 + rnd() * 0.3)
      const halfW = (w / 2) * press
      const n = 7 + (rnd() < 0.5 ? 2 : 0)
      for (let k = 0; k < n; k++) {
        const off = gauss() * halfW * 0.78
        const q = world(u, off)
        const rel = Math.abs(off) / (halfW + 0.01)
        // 中心大粒重叠成实身、边缘细粒散（横截面密度渐变）
        const rr = rel < 0.4 ? 1.1 + rnd() * 0.9 : rel < 0.8 ? 0.6 + rnd() * 0.7 : 0.35 + rnd() * 0.45
        const endZone = tt < 0.06 || tt > 0.92
        const bi = endZone ? (rel < 0.5 ? 1 : 2) : rel < 0.4 ? 0 : rel < 0.8 ? 1 : 2
        buckets[bi] += diamond(q.x, q.y, rr)
      }
      // 飞屑（低频 outlier）
      if (rnd() < 0.11) {
        const off = (rnd() < 0.5 ? -1 : 1) * halfW * (1.2 + rnd() * 0.7)
        const q = world(u, off)
        buckets[3] += diamond(q.x, q.y, 0.4 + rnd() * 0.8)
      }
    }
    const ops = [o * 0.92, o * 0.55, o * 0.24, o * 0.15]
    return (
      <g>
        {buckets.map((d, i) => (d ? <path key={i} d={d} fill={color} opacity={ops[i]} /> : null))}
      </g>
    )
  }

  const diamondBg = (px: number, py: number, r: number) => {
    const X = Math.round(px)
    const Y = Math.round(py)
    const R = Math.round(r * 10) / 10
    return `M ${X} ${Y - R} L ${X + R} ${Y} L ${X} ${Y + R} L ${X - R} ${Y} Z `
  }
  /** 全页颗粒尘（纸纹/喷砂感）+ 干刷大扫痕（黑色稀粒宽痕，中性色豁免）——
   * 替代光滑暗斑（用户裁决：平滑大斑=脏，颗粒/干刷才是质感语言）。 */
  const grainBase = (seed: number) => {
    const rnd = lcg(seed * 7919 + 3)
    let dark = ""
    let light = ""
    for (let i = 0; i < 240; i++) {
      const px = rnd() * 1280
      const py = rnd() * 720
      const d = diamondBg(px, py, 0.5 + rnd() * 0.9)
      if (rnd() < 0.6) dark += d
      else light += d
    }
    // 干刷大扫痕：两道对角宽痕（稀疏大粒横扫，非光滑形）
    let sweep = ""
    for (let sw = 0; sw < 2; sw++) {
      const sx = sw === 0 ? 150 + rnd() * 200 : 700 + rnd() * 200
      const sy = sw === 0 ? 120 + rnd() * 120 : 420 + rnd() * 140
      const ang = -0.5 + rnd() * 1.0
      const slen = 380 + rnd() * 260
      const steps = 46
      for (let i = 0; i < steps; i++) {
        const t = i / steps
        const u = t * slen
        const off = ((rnd() + rnd() - 1) * 60) / 2
        if (rnd() < 0.55) {
          sweep += diamondBg(
            sx + Math.cos(ang) * u - Math.sin(ang) * off,
            sy + Math.sin(ang) * u + Math.cos(ang) * off,
            0.8 + rnd() * 2.2,
          )
        }
      }
    }
    return (
      <g>
        {dark ? <path d={dark} fill="#000000" opacity={0.18} /> : null}
        {light ? <path d={light} fill={white} opacity={0.1} /> : null}
        {sweep ? <path d={sweep} fill="#000000" opacity={0.1} /> : null}
      </g>
    )
  }

  if (slide.type === "content") {
    // 弱档：贴边小条（右上 + 左下），不入正文区
    return (
      <>
        {grainBase(601)}
        {crayon(1140, 42, 8, 190, 44, pink, 61)}
        {crayon(-40, 678, -8, 200, 46, blue, 62, 0.7)}
        <path d="M 1122 78 L 1134 64 L 1144 80 Z" fill={white} opacity={0.5} />
        <circle cx={170} cy={630} r={4} fill={white} opacity={0.4} />
      </>
    )
  }

  const variant = pickBySeed(cachedDeckSeed(ir), "campaign-decor", ["a", "b", "c"] as const)

  const splat = (cx: number, cy: number, R: number, seed: number, n = 10) => {
    const rnd = lcg(seed * 9176 + 5)
    const dots = []
    for (let i = 0; i < n; i++) {
      const ang = rnd() * Math.PI * 2
      const dist = R * (0.15 + rnd() * 0.9)
      const c = [pink, blue, yellow, mint, white][Math.floor(rnd() * 5)]
      dots.push(
        <circle key={i} cx={Math.round(cx + Math.cos(ang) * dist)} cy={Math.round(cy + Math.sin(ang) * dist)} r={Math.round((1.2 + rnd() * 3.4) * 10) / 10} fill={c} opacity={0.3 + rnd() * 0.4} />,
      )
    }
    return <g>{dots}</g>
  }
  const scatter = (
    <>
      <path d="M 890 120 L 906 102 L 918 124 Z" fill={white} opacity={0.55} />
      <path d="M 380 590 L 394 574 L 404 596 Z" fill={white} opacity={0.5} />
      {splat(300, 170, 120, 51, 8)}
      {splat(1000, 560, 130, 52, 9)}
      <path d="M 1050 640 l 14 -8 M 240 110 l -12 9" stroke={white} strokeWidth={3} strokeLinecap="round" opacity={0.4} />
    </>
  )

  if (variant === "b") {
    // 顶底横扫：蜡笔条排（品红主、湖蓝辅、黄薄荷点缀——70/20/10）
    return (
      <>
        {grainBase(701)}
        {crayon(-60, 26, 6, 420, 88, pink, 71, 0.95)}
        {crayon(300, -8, -4, 380, 64, blue, 72, 0.8)}
        {crayon(620, 30, 8, 400, 92, pink, 75, 0.9)}
        {crayon(960, -4, -6, 380, 70, mint, 74, 0.7)}
        {crayon(-50, 692, -6, 400, 84, pink, 76, 0.9)}
        {crayon(300, 716, 5, 380, 66, yellow, 77, 0.8)}
        {crayon(660, 688, -4, 400, 60, blue, 78, 0.75)}
        {crayon(1000, 708, 6, 360, 86, pink, 79, 0.85)}
        {scatter}
      </>
    )
  }
  if (variant === "c") {
    // 四角环布
    return (
      <>
        {grainBase(801)}
        {crayon(-50, 90, 14, 320, 78, pink, 81, 0.9)}
        {crayon(-30, 170, 24, 240, 44, yellow, 82, 0.75)}
        {crayon(1310, 84, 166, 310, 74, blue, 83, 0.85)}
        {crayon(1295, 165, 155, 230, 42, pink, 84, 0.8)}
        {crayon(-40, 630, -16, 300, 72, mint, 85, 0.8)}
        {crayon(1315, 645, -158, 310, 80, pink, 87, 0.9)}
        {crayon(1255, 700, -146, 240, 48, yellow, 88, 0.75)}
        {scatter}
      </>
    )
  }
  // a：左上 + 右下对角束（品红主导）
  return (
    <>
      {grainBase(901)}
      {crayon(-70, 130, -24, 440, 96, pink, 91, 0.95)}
      {crayon(-50, 250, -32, 350, 62, blue, 92, 0.8)}
      {crayon(-30, 40, -14, 300, 48, yellow, 93, 0.7)}
      {crayon(1340, 580, 156, 440, 94, pink, 94, 0.9)}
      {crayon(1320, 470, 148, 340, 58, mint, 95, 0.7)}
      {crayon(1310, 680, 162, 380, 68, blue, 96, 0.8)}
      {scatter}
    </>
  )
}
