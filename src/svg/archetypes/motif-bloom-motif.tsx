import type { DecorProps } from "./types"
import { cachedDeckSeed, pickBySeed } from "../variety"

/**
 * bloom-motif archetype v5（2026-07-13 联网核实最佳实践后重写：Tyler
 * Hobbs 水彩模拟算法——生成艺术圈标准做法，来源
 * tylerxhobbs.com/words/a-guide-to-simulating-watercolor-paint-with-generative-art
 * 与 sighack.com 的 Processing 实现）。
 * 算法四要素（v4 差距即在此）：
 * - 递归边中点高斯位移变形（分形级边缘，非极坐标抖动）
 * - 每团 = base 多边形（3 轮变形）再派生 18 层（各自再 2 轮变形），每层
 *   opacity ~4.5%——几十层微差累积出真羽化（v4 只叠 3 层=台阶感根源）
 * - per-edge variance 继承：起始边各自方差、子边继承×衰减——部分边缘
 *   锐利部分柔软（湿纸/干纸差异）
 * - 颜料沉积：前 1/3 层用浅变形 base（贴中心浓），后 2/3 外扩渐淡；
 *   边缘带撒深色微粒=颗粒沉积，散布微粒=纸肌理
 * 预算：起始 8 边+base 3 轮+层 2 轮=~128 点/层，18 层×4 团/页 ≈ 72 path，
 * 坐标取整控制 SVG 体积。全部实色 path+opacity（无渐变无 filter，预览/
 * 导出一致；svg2pptx path 链原生支持）。LCG 确定性可复现。
 * chapter 退让；content 弱档小团；植物细线枝保留（用户认可）。
 */

type XY = { x: number; y: number }

/** 两锚点间的山脊线：不对称单峰 profile 大波浪 + 中点位移细分 + 高频细碎。
 * (nx,ny) 是凸出方向单位法线（指向页内）。 */
function ridgeLine(a: XY, b: XY, nx: number, ny: number, depth: number, seed: number): XY[] {
  let sd = (seed * 2654435761 + 13) >>> 0
  const rnd = () => ((sd = (sd * 1664525 + 1013904223) >>> 0), sd / 4294967296)
  const N = 9
  const peakAt = 0.3 + rnd() * 0.4
  const pts: XY[] = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const prof =
      t < peakAt
        ? Math.pow(t / peakAt, 0.8 + rnd() * 0.6)
        : Math.pow((1 - t) / (1 - peakAt), 0.7 + rnd() * 0.7)
    const d = depth * (0.2 + 0.8 * prof) * (0.75 + rnd() * 0.5)
    pts.push({ x: a.x + (b.x - a.x) * t + nx * d, y: a.y + (b.y - a.y) * t + ny * d })
  }
  let cur = pts
  for (let r = 0; r < 2; r++) {
    const next: XY[] = [cur[0]]
    const amp = depth * (r === 0 ? 0.15 : 0.08)
    for (let i = 1; i < cur.length; i++) {
      next.push({
        x: (cur[i - 1].x + cur[i].x) / 2 + (rnd() - 0.5) * amp * 2,
        y: (cur[i - 1].y + cur[i].y) / 2 + (rnd() - 0.5) * amp * 2,
      })
      next.push(cur[i])
    }
    cur = next
  }
  return cur.map((q) => ({ x: q.x + (rnd() - 0.5) * depth * 0.05, y: q.y + (rnd() - 0.5) * depth * 0.05 }))
}

/** 贴边大形（参考图右上大片/左下山）：脊线 + 页边角点闭合。 */
function ridgePath(a: XY, b: XY, spine: XY[], corners: XY[]): string {
  const f = (v: number) => Math.round(v)
  let d = `M ${f(a.x)} ${f(a.y)}`
  for (const q of spine) d += ` L ${f(q.x)} ${f(q.y)}`
  d += ` L ${f(b.x)} ${f(b.y)}`
  for (const c of corners) d += ` L ${f(c.x)} ${f(c.y)}`
  return d + " Z"
}

function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

type Pt = { x: number; y: number; v: number } // v: 该点起始边的 variance

/** 一轮边中点位移：每条边取中点、按边 variance 高斯位移，子边继承衰减方差。 */
function deformOnce(pts: Pt[], rnd: () => number): Pt[] {
  const out: Pt[] = []
  const n = pts.length
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5 // 近似高斯 [-1,1]
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    out.push(a)
    out.push({
      x: (a.x + b.x) / 2 + gauss() * a.v,
      y: (a.y + b.y) / 2 + gauss() * a.v,
      v: a.v * (0.45 + rnd() * 0.3), // 子边继承×衰减
    })
  }
  return out
}

function deform(pts: Pt[], rounds: number, rnd: () => number): Pt[] {
  let cur = pts
  for (let i = 0; i < rounds; i++) cur = deformOnce(cur, rnd)
  return cur
}

/** 高频细碎抖动：每点独立小位移——水彩边缘的絮状小凸起（低通递归给
 * 不出的高频段，v6 边缘「太光滑」的解）。 */
function fineJitter(pts: Pt[], amp: number, rnd: () => number): Pt[] {
  return pts.map((p) => ({
    x: p.x + (rnd() - 0.5) * amp * 2,
    y: p.y + (rnd() - 0.5) * amp * 2,
    v: p.v,
  }))
}

function toPathD(pts: Pt[]): string {
  let d = `M ${Math.round(pts[0].x)} ${Math.round(pts[0].y)}`
  for (let i = 1; i < pts.length; i++) d += ` L ${Math.round(pts[i].x)} ${Math.round(pts[i].y)}`
  return d + " Z"
}

/** 起始多边形：8 边不规则 + per-edge variance（软硬边分布）+ 方向拉伸
 * （elong/elongAngle：洇染沿角对角方向「流向页内」，圆团=无方向感）。 */
function seedPolygon(
  cx: number,
  cy: number,
  R: number,
  rnd: () => number,
  elong = 1,
  elongAngle = 0,
): Pt[] {
  const pts: Pt[] = []
  const ca = Math.cos(elongAngle)
  const sa = Math.sin(elongAngle)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rnd() * 0.3
    const r = R * (0.72 + rnd() * 0.5)
    // 局部坐标拉伸后旋转
    const lx = Math.cos(a) * r * elong
    const ly = Math.sin(a) * r
    pts.push({
      x: cx + lx * ca - ly * sa,
      y: cy + lx * sa + ly * ca,
      // 软硬边分布：约 1/3 的边低方差（锐利缘），其余高方差（羽化缘）
      v: rnd() < 0.35 ? R * 0.035 : R * (0.1 + rnd() * 0.1),
    })
  }
  return pts
}

export function BloomMotif({ ir, slide, ctx }: DecorProps) {
  const palette = ctx.colors.chartPalette
  // 配色结构（Hobbs 概率结构 + 水彩「一深压众淡」）：暖杏 apricot 为主调
  // （大团），rose/wisteria 为辅，primary（深紫藤）只做小锚团，mist 不成团
  const [wisteria, apricot, rose] = palette
  const anchorColor = ctx.colors.primary

  if (slide.type === "chapter") return null

  /** 一团水彩：Hobbs 分层 + 沉积微粒 + 纸肌理微粒。
   * 配色纪律（Hobbs 概率结构）：main 主导 ~85% 层、deep 是**同族加深色**
   * 只占 ~15%（跨色相混层=浑浊之源）。anchor=true 为深色锚团（层少而浓、
   * 面积小——「一深压众淡」的视觉重心）。 */
  const wash = (
    cx: number,
    cy: number,
    R: number,
    seed: number,
    main: string,
    deep: string,
    strength = 1,
    elongAngle = 0,
    anchor = false,
  ) => {
    const rnd = lcg(seed * 2654435761 + 1)
    const elong = anchor ? 1.15 : 1.35 + rnd() * 0.25
    const base = deform(seedPolygon(cx, cy, R, rnd, elong, elongAngle), 3, rnd)
    const layers: React.ReactNode[] = []
    const L = anchor ? 3 : Math.max(3, Math.round(3 * strength))
    const perLayer = anchor ? 0.17 : 0.15
    for (let i = 0; i < L; i++) {
      // 颜料沉积：前 1/3 层贴中心（base 收缩 0.86 再浅变形），后 2/3 外扩
      const inner = i < L / 3
      const src = inner
        ? base.map((p) => ({ x: cx + (p.x - cx) * 0.86, y: cy + (p.y - cy) * 0.86, v: p.v * 0.8 }))
        : base
      const layer = fineJitter(deform(src, 2, rnd), R * 0.018, rnd)
      layers.push(
        <path
          key={i}
          d={toPathD(layer)}
          fill={main}
          opacity={(inner ? perLayer * 1.3 : perLayer) * strength}
        />,
      )
    }
    // 干湿不均块状痕：2-3 个局部深斑（缩小偏移的 deform 小形，非整形深版）
    const blotN = anchor ? 0 : 2 + Math.floor(rnd() * 2)
    for (let i = 0; i < blotN; i++) {
      const ox = (rnd() - 0.5) * R * 0.7
      const oy = (rnd() - 0.5) * R * 0.7
      const sc = 0.3 + rnd() * 0.22
      const src = base.map((p) => ({
        x: cx + ox + (p.x - cx) * sc,
        y: cy + oy + (p.y - cy) * sc,
        v: p.v * sc * 1.6,
      }))
      layers.push(
        <path
          key={`b${i}`}
          d={toPathD(fineJitter(deform(src, 2, rnd), R * 0.012, rnd))}
          fill={deep}
          opacity={0.06 * strength}
        />,
      )
    }
    // 边缘絮片：脱离主体悬浮的微小碎形（云絮感）
    for (let i = 0; i < (anchor ? 3 : 6); i++) {
      const ang = rnd() * Math.PI * 2
      const dist = R * (0.95 + rnd() * 0.35)
      const fx = cx + Math.cos(ang) * dist
      const fy = cy + Math.sin(ang) * dist
      const fr = R * (0.04 + rnd() * 0.05)
      const flake: Pt[] = []
      for (let k = 0; k < 5; k++) {
        const fa = (k / 5) * Math.PI * 2
        flake.push({ x: fx + Math.cos(fa) * fr * (0.6 + rnd() * 0.8), y: fy + Math.sin(fa) * fr * (0.6 + rnd() * 0.8), v: fr * 0.3 })
      }
      layers.push(
        <path key={`f${i}`} d={toPathD(deform(flake, 1, rnd))} fill={main} opacity={(0.05 + rnd() * 0.05) * strength} />,
      )
    }
    // 颗粒沉积（边缘带加密深色微粒）+ 纸肌理（内部稀疏微粒）
    // 颗粒：菱形子路径按 3 档 opacity 分桶聚合（真机导出实测逐 circle
    // =634 shapes/页会拖垮 PPT 编辑，campaign 同款分桶后 ~55/页）
    const diamond = (px: number, py: number, r: number) => {
      const X = Math.round(px)
      const Y = Math.round(py)
      const RR = Math.round(r * 10) / 10
      return `M ${X} ${Y - RR} L ${X + RR} ${Y} L ${X} ${Y + RR} L ${X - RR} ${Y} Z `
    }
    const gBuckets: [string, string, string] = ["", "", ""]
    const gN = Math.round(170 * strength)
    for (let i = 0; i < gN; i++) {
      const ang = rnd() * Math.PI * 2
      const edge = i < gN * 0.75
      const dist = edge ? R * (0.62 + rnd() * 0.55) : Math.sqrt(rnd()) * R * 0.62
      const d = diamond(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist, 0.7 + rnd() * 1.7)
      const bi = rnd() < 0.2 ? 2 : edge ? 0 : 1
      gBuckets[bi] += d
    }
    // 干刷拖痕合并为单 stroke path（多段 M 子路径）
    let dryD = ""
    for (let i = 0; i < 14; i++) {
      const ang = rnd() * Math.PI * 2
      const dist = R * (0.72 + rnd() * 0.45)
      const fx = cx + Math.cos(ang) * dist
      const fy = cy + Math.sin(ang) * dist
      const fl = 10 + rnd() * 22
      const fa = ang + Math.PI / 2 + (rnd() - 0.5) * 0.6
      dryD += `M ${Math.round(fx)} ${Math.round(fy)} q ${Math.round(Math.cos(fa) * fl * 0.5)} ${Math.round(Math.sin(fa) * fl * 0.5 - 2)} ${Math.round(Math.cos(fa) * fl)} ${Math.round(Math.sin(fa) * fl)} `
    }
    // 干刷扫帚丝纹：2-3 组平行细线束（每束 4 条平行线合并 1 path——
    // 干刷的招牌特征）
    let broomD = ""
    const broomN = 2 + Math.floor(rnd() * 2)
    for (let bi = 0; bi < broomN; bi++) {
      const ang = rnd() * Math.PI * 2
      const dist = R * (0.5 + rnd() * 0.5)
      const bx = cx + Math.cos(ang) * dist
      const by = cy + Math.sin(ang) * dist
      const bl = 26 + rnd() * 40
      const ba = rnd() * Math.PI
      const pxn = Math.cos(ba + Math.PI / 2)
      const pyn = Math.sin(ba + Math.PI / 2)
      for (let li = 0; li < 4; li++) {
        const off = (li - 1.5) * (2.6 + rnd() * 1.6)
        const jl = bl * (0.7 + rnd() * 0.5)
        broomD += `M ${Math.round(bx + pxn * off)} ${Math.round(by + pyn * off)} l ${Math.round(Math.cos(ba) * jl)} ${Math.round(Math.sin(ba) * jl)} `
      }
    }
    const grains: React.ReactNode[] = [
      gBuckets[0] ? <path key="g0" d={gBuckets[0]} fill={anchorColor} opacity={0.3} /> : null,
      gBuckets[1] ? <path key="g1" d={gBuckets[1]} fill={main} opacity={0.2} /> : null,
      gBuckets[2] ? <path key="g2" d={gBuckets[2]} fill={anchorColor} opacity={0.48} /> : null,
      dryD ? (
        <path key="dry" d={dryD} stroke={anchorColor} strokeWidth={2.4} strokeLinecap="round" fill="none" opacity={0.32} />
      ) : null,
      broomD ? (
        <path key="broom" d={broomD} stroke={anchorColor} strokeWidth={1.2} strokeLinecap="round" fill="none" opacity={0.3} />
      ) : null,
    ]
    return (
      <g>
        {layers}
        {grains}
      </g>
    )
  }

  /** 贴角大形（参考图「右上大淡片 / 左下深紫山」）：两档独立色阶——
   * 浅晕大形垫底 + 深核小形压上（各自独立脊线，峰位不相似=手绘感）。 */
  const cornerWash = (
    a: XY,
    b: XY,
    nx: number,
    ny: number,
    depth: number,
    corners: XY[],
    seed: number,
    tiers: { c: string; o: number; s: number }[],
  ) => {
    let sd = (seed * 69069 + 5) >>> 0
    const rnd = () => ((sd = (sd * 1664525 + 1013904223) >>> 0), sd / 4294967296)
    return (
      <g>
        {tiers.map((t, ti) => {
          // 每档 2 层微差（近平涂色阶——晕染再降，质感全交给颗粒/干刷）
          const L = 2
          const layers = []
          for (let li = 0; li < L; li++) {
            const spine = ridgeLine(
              a,
              b,
              nx,
              ny,
              depth * t.s * (0.92 + rnd() * 0.16),
              seed + ti * 97 + li * 31,
            )
            layers.push(
              <path key={li} d={ridgePath(a, b, spine, corners)} fill={t.c} opacity={t.o / (L * 0.85)} />,
            )
          }
          return <g key={ti}>{layers}</g>
        })}
        {(() => {
          const spine = ridgeLine(a, b, nx, ny, depth * 0.96, seed + 7)
          const dia = (px: number, py: number, r: number) => {
            const X = Math.round(px)
            const Y = Math.round(py)
            const RR = Math.round(r * 10) / 10
            return `M ${X} ${Y - RR} L ${X + RR} ${Y} L ${X} ${Y + RR} L ${X - RR} ${Y} Z `
          }
          let d0 = ""
          let d1 = ""
          for (let i = 0; i < 150; i++) {
            const q = spine[Math.floor(rnd() * spine.length)]
            const d = dia(
              q.x + (rnd() - 0.5) * depth * 0.3,
              q.y + (rnd() - 0.5) * depth * 0.3,
              0.6 + rnd() * 1.5,
            )
            if (rnd() > 0.35) d0 += d
            else d1 += d
          }
          return (
            <g>
              {d0 ? <path d={d0} fill={anchorColor} opacity={0.3} /> : null}
              {d1 ? <path d={d1} fill={tiers[0].c} opacity={0.22} /> : null}
            </g>
          )
        })()}
      </g>
    )
  }

  const sprig = (x: number, y: number, s: number, color: string, o: number) => (
    <>
      <path d={`M ${x} ${y} Q ${x + 14 * s} ${y - 30 * s} ${x + 10 * s} ${y - 62 * s}`} stroke={color} strokeWidth={1.2} fill="none" opacity={o} />
      <path d={`M ${x + 7 * s} ${y - 20 * s} q -14 ${-4 * s} -20 ${-16 * s} q 16 ${-2 * s} 20 ${16 * s} Z`} fill={color} opacity={o * 0.8} />
      <path d={`M ${x + 11 * s} ${y - 36 * s} q 15 ${-8 * s} 24 ${-4 * s} q -8 ${12 * s} -24 ${4 * s} Z`} fill={color} opacity={o * 0.7} />
      <path d={`M ${x + 10 * s} ${y - 52 * s} q -12 ${-6 * s} -14 ${-18 * s} q 14 0 14 ${18 * s} Z`} fill={color} opacity={o * 0.75} />
    </>
  )

  if (slide.type === "content") {
    // 弱档：右上 + 左下小团（无锚团，低调纹理）
    return (
      <>
        {wash(1355, 60, 170, 11, apricot, rose, 0.7, 1.55)}
        {wash(1350, 280, 140, 13, rose, apricot, 0.55, 1.5)}
        {wash(-75, 620, 180, 12, wisteria, anchorColor, 0.55, 1.45)}
        {sprig(1155, 128, 0.6, wisteria, 0.42)}
      </>
    )
  }

  const variant = pickBySeed(cachedDeckSeed(ir), "bloom-decor", ["a", "b", "c"] as const)

  if (variant === "b") {
    // 左缘带（常驻）+ 顶缘横帘
    return (
      <>
        {wash(-85, 300, 230, 24, wisteria, anchorColor, 0.9, 1.4)}
        {wash(-60, 560, 190, 27, apricot, rose, 0.8, 1.5)}
        {wash(-75, 710, 160, 28, rose, apricot, 0.7, 1.45)}
        {wash(320, -100, 220, 21, apricot, rose, 0.95, 0.1)}
        {wash(700, -110, 240, 22, rose, wisteria, 0.85, -0.05)}
        {wash(1060, -95, 210, 23, apricot, rose, 0.9, 0.12)}
        {wash(1265, -85, 160, 26, wisteria, rose, 0.65, 0.05)}
        {sprig(1150, 640, 1.05, wisteria, 0.48)}
      </>
    )
  }
  if (variant === "c") {
    // 左右页缘纵向洇染（左紫右暖）+ 右缘深锚
    return (
      <>
        {wash(-80, 220, 250, 31, wisteria, anchorColor, 1, 1.35)}
        {wash(-50, 500, 220, 32, apricot, rose, 0.85, 1.6)}
        {wash(-70, 690, 180, 36, rose, apricot, 0.75, 1.5)}
        {wash(1360, 140, 200, 33, apricot, rose, 1, 1.55)}
        {wash(1345, 400, 180, 34, rose, apricot, 0.85, 1.6)}
        {wash(1360, 630, 170, 37, wisteria, rose, 0.8, 1.5)}
        {wash(1350, 520, 110, 35, anchorColor, wisteria, 0.55, 1.55)}
        {sprig(1180, 645, 0.9, wisteria, 0.45)}
        {/* 顶部一排短横虚线：六个 <line>，不用同轴 <path>——svg2pptx 把
            <path>（哪怕只走一根轴）转成 custGeom 形状，包围盒零高度会被
            package-audit 硬门的 invalid-shape-transform 规则拒收（建这道门
            时发现的真实缺陷，package-audit 波任务 1，spec §4.4）。真正的
            <line> 走 svg2pptx/line.ts 的 prstGeom="line"，该规则明确允许
            其中一轴为零。 */}
        {[560, 588, 616, 644, 672, 700].map((x) => (
          <line key={x} x1={x} y1={44} x2={x + 12} y2={44} stroke={wisteria} strokeWidth={1.4} opacity={0.35} />
        ))}
      </>
    )
  }
  // a：左缘窄流淌带（用户三轮圈图认可的常驻主体）+ 右上大淡片（参考图
  // 「紫梦花园」右上）+ 左上虚线排。左缘带在三个变体中恒在，变奏只发生
  // 在右侧搭配。
  return (
    <>
      {wash(-80, 220, 250, 31, wisteria, anchorColor, 1, 1.35)}
      {wash(-50, 500, 220, 32, apricot, rose, 0.85, 1.6)}
      {wash(-70, 690, 180, 36, rose, apricot, 0.75, 1.5)}
      {cornerWash({ x: 780, y: 0 }, { x: 1280, y: 430 }, -0.62, 0.62, 230, [{ x: 1280, y: 0 }], 141, [
        { c: apricot, o: 0.3, s: 1 },
        { c: rose, o: 0.28, s: 0.52 },
      ])}
      <g opacity={0.55}>
        <path d="M 180 66 q 10 -4 20 0 M 212 64 q 10 -4 20 0 M 244 66 q 10 -4 20 0 M 276 63 q 10 -4 20 0
                 M 168 86 q 10 -4 20 0 M 200 84 q 10 -4 20 0 M 232 86 q 10 -4 20 0
                 M 180 106 q 10 -4 20 0 M 212 104 q 10 -4 20 0 M 244 106 q 10 -4 20 0 M 276 103 q 10 -4 20 0"
              stroke={wisteria} strokeWidth={1.6} fill="none" />
      </g>
      {sprig(1150, 630, 1.25, wisteria, 0.5)}
      {sprig(1235, 660, 0.85, rose, 0.42)}
    </>
  )
}
