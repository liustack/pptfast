import { PACING_BUDGETS } from "@/narrative"
import type { DecorProps } from "./types"

/**
 * campaign-motif v6 —— 「纸屑场」（2026-08-20 柔和组皮肤重设计，设计源
 * `.issues/2026-08-18-theme-redesign/skins/group4-soft-boards.dc.html` 的
 * `section#g4` campaign 设计表；v6 是同日第四轮评审「纸屑太机械」的返工）。
 *
 * 换掉的东西：v4 是「蜡笔条」——p5.brush 图章模型，一条笔画由沿路径的密集
 * 粒子图章构成（每步 7-9 粒、四个透明度桶、飞屑 outlier），一页六到八条，
 * 外加 240 粒全页颗粒尘和两道干刷扫痕。质感是有的，代价也是真的：
 * `vitest.config.ts` 的超时注释里专门写着「campaign 是最重的一个，一个 deck
 * ~156k custGeom 点，典型主题 ~40」。v5 把整台戏换成剧场彩带：
 *   - **纸屑带**：纸屑只落在页缘的带里，画面正中整片让给内容。
 *   - **两形制**：圆点与斜方片（8×5 的方片转个角度）。两者的尺寸区间与
 *     转角区间在 v6 放开，见下。
 *   - **四色轮换**：第 k 枚取 `chartPalette[k % 4]`，图表与装饰同源——
 *     板上原话「四色即纸屑色」。
 *   - **共 {@link CONFETTI_COUNT} 枚**，满足任务书「装饰点数百级」的硬指标。
 * 蜡笔条、颗粒尘、干刷扫痕、白三角/彩点散布整族退役。
 *
 * ## v6 返工：同一条 LCG，撒得不再匀
 *
 * 用户对 campaign p03 的原话是「这些撒花的装饰太机械了，没有灵动的感觉」。
 * 病灶不在「随机」而在**处处一样**：v5 每一枚都在带内独立均布，尺寸只在
 * r2-4.5 这一档窄区间里线性取，斜方片一律 ±45°（于是全场都是近水平的
 * 平行四边形），透明度整场恒定 0.9。均匀撒点看起来就是机械的——真实的
 * 彩带是一阵一阵、有大有小、有正有侧、有近有远。
 *
 * v6 一枚不加、一枚不减，只把同一条 LCG 的输出摊开：
 *   - **疏密节奏**：每条带先在长轴上撒 {@link Band.clumps} 个团心，团重
 *     不等（{@link CLUMP_WEIGHT_MIN} 起、跨度 {@link CLUMP_WEIGHT_SPAN}），
 *     枚数按团重分配；团内位置用「两次均匀取样相加」的三角分布，团心稠、
 *     团缘疏。另有 {@link STRAGGLER_RATE} 的枚数不进团、整条带均布——
 *     全进团会读成一串葡萄，那是另一种机械。
 *   - **尺寸**：圆点半径改成平方分布（`min + rnd()² × span`），多数小、
 *     少数大；斜方片另乘一个 {@link CHIP_SCALE_MIN}-{@link CHIP_SCALE_MAX}
 *     的缩放，不再是一个模子刻的。
 *   - **转角**：斜方片放开到整圈 360°，于是有的读成横片、有的读成竖条。
 *   - **透明度**：{@link OPACITY_MIN} 到满不透明之间逐枚取，远近拉开层次。
 * 形制判据（`k % 3 === 2` 走斜方片）、配色轮换（`k % 4`）、总枚数、
 * 三条带的枚数分配一处未改——80 圆点 / 40 斜方片 / 四色各 30 枚照旧。
 *
 * 尺寸放大让单枚的最大外扩从 4.72 长到 {@link PIECE_REACH}，三条带的取样窗
 * 因此各自收窄了一档（见 {@link BANDS}），「带内、字外」仍然是构造上成立的。
 *
 * ## 确定性：固定 seed 的 LCG，不是 deck seed
 *
 * 120 枚的位置由一条 seed=7 的 LCG 在模块加载时算一次，算完就是常量
 * （{@link CONFETTI}）。所以它满足「位置写死」那条红线的实质：每个 deck、
 * 每一页、每一次渲染拿到的是同一张纸屑图，`cachedDeckSeed`/`pickBySeed`
 * 不参与。v4 的三档 seed 变体（a 对角束 / b 顶底横扫 / c 四角环布）随之删除。
 *
 * **偏离设计板之一：LCG 的乘子与增量。** 板上写的是 glibc 那一组
 * （`s = (s * 1103515245 + 12345) % 2147483648`），但 `s` 逼近 2³¹ 时
 * `s * 1103515245` 会到 2⁶¹ 量级——远超 IEEE754 双精度能精确表示的 2⁵³，
 * 低位是舍入垃圾。换成本仓自己各处在用的那一组
 * （`s = (s * 1664525 + 1013904223) >>> 0`，Numerical Recipes；乘积 < 2⁵³
 * 精确可表示），seed 仍取板上的 7。形制、配色轮换、总枚数一处未改，变的
 * 只是随机流本身（尺寸区间与取样方式在 v6 另行放开，见上）。
 *
 * ## 偏离设计板之二：四带环场 → 三带，底带退役（实测驱动）
 *
 * 板上的四个取样窗是顶 y10-44 / 底 y624-658 / 左 x20-88 / 右 x1150-1260，
 * 并声称「120 点全部在四带内、四区外」。**把 `LAYOUT_REGISTRY` 全部 41 个
 * 版式 + 主题 deck 十页在 campaign 上渲一遍逐条量文字墨迹盒**（工具：
 * `.issues/2026-08-18-theme-redesign/skins/tools/text-margin-sweep.mts`，
 * 486 条文字、51 页），四个窗全部压字：顶带 4 条、底带 35 条、左带 38 条、
 * 右带 34 条。`auditDeck` 当场判红四处（poster-center / split-diagonal 的
 * 页脚 meta、colophon 的日期、tone-adaptive-content 的标题）。原因不难找——
 * 板上那四条红虚线是「意图」，而版式们真实的排字外沿比它宽得多：
 *   - 最高的一行字顶在 y34（poster-chapter/roman-chapter 的右上引首）
 *   - 最低的一行字底在 y708.6（image-bottom 的遮罩页脚）
 *   - 最左的一行字起于 x56（fashion 家族的 meta 行、`branding.tsx` 的
 *     页脚两行）
 *   - 最右的一行字止于 x1224（同上，右对齐那一列）
 * 于是页面真正空着的四条边分别是 y<34、y>708.6、x<56、x>1224。同一条
 * 先例在冷调组已经踩过一次：设计板把 academic 的点轨画在 y648，那正是
 * `branding-geometry.ts` 的 `FOOTNOTE_BASELINE_Y`，实测后点轨整条搬去顶带。
 *
 * 三条边够用，第四条不够：底边只剩 y708.6 到页缘 720 的十来个像素，塞不下
 * 一条读得出来的带（`FOOTNOTE_BASELINE_Y = 648`、`FOOTER_DIVIDER_Y = 664`、
 * `branding.tsx` 自己的两行页脚 y700/705 把 596-710 整段占满了）。
 * **底带因此退役**，它的点数并进顶带。板上的「半场」算术反而更准了：
 * 顶带 60 枚 = 总数 120 的一半，降档就是顶带一条，见下。
 *
 * 三个窗按最大外扩 {@link PIECE_REACH}（v6 放开尺寸后 ≈6.37px，v5 是斜方片
 * 半对角 √(4²+2.5²) ≈ 4.72px）收边，于是「带内、字外」是构造上成立的，
 * 不靠抽样运气：
 *   - 顶带 y `[10,27]`，外扩后 y3.63-33.37 < 34
 *   - 左带 x `[20,48]`，外扩后 x13.63-54.37 < 56
 *   - 右带 x `[1232,1264]`，外扩后 x1225.63-1270.37 > 1224，且 < 1280
 *   - 两条侧带 y `[40,655]`，外扩后 y33.63-661.37，上不进右上/左上 logo 带
 *     （y48-88 那两只盒子的 x 是 64-160 与 1120-1216，与两条侧带的 x 窗
 *     本就不相交），下不进页脚 meta 带（y664）
 * 板上四条红虚线禁区（标题区 96,48,1040×122 / 正文区 96,200,1040×420 /
 * 页脚 meta 带 48,664,1184×44 / 右下 logo 盒 1120,630,96×40）与
 * `branding.tsx` **四个** logo 位（tl/tr/bl/br，各 96×40）全部清空——
 * 比板上生成器自己做到的还严一档（板上的底带横穿它自己画的那只右下
 * logo 盒）。`motif-campaign-motif.test.tsx` 对 120 枚逐枚量包围盒。
 *
 * ## heavy 档降档：判据只钉 IR 结构层
 *
 * 板上组内互检那行写着「密页时 heavy 档由引擎降为半场」。判据是**这一页的
 * 组件数量**（{@link HALF_FIELD_COMPONENTS}），一个纯 IR 结构量，
 * `slide.components.length` 一个属性读到底；降档形态是只留顶带
 * （60 枚，正好是 120 的一半）。
 *
 * **不许读渲染后的文字几何**（标题占几行、正文缩到几号字、有没有溢出）。
 * 两条理由，都不是洁癖：
 *   - motif 在渲染树里画在正文**之前**（`full-slide-svg.tsx` 的
 *     `<g data-decor>` 排在 `SlideDecor`/版式之前），那时正文几何还不存在，
 *     「读」只能去读某个跨页共享的测量缓存——于是同一份 IR 第一次渲染和第二
 *     次渲染会拿到不同的值。
 *   - 文字几何随字体解析结果变（`hasExactWidthTable` 有没有命中精确宽表），
 *     预览端与导出端一旦不同，同一份 IR 两处画出两张纸屑图。
 * 两条都直接违反「同 IR 同 seed 两次渲染必须逐字节同」。守卫写在
 * `motif-campaign-motif.test.tsx` 的「判据纯度」一节：同一页结构、把标题和
 * 正文换成长短悬殊的两套文字，输出必须逐字节相同——判据一旦改去读文字几何，
 * 这条立刻红。
 *
 * chapter 完全退让（`return null`，v4 起如此）：八个 chapter layout 都在
 * 整版底色上画巨幅居中标题与章节号水印，页缘正是它们的活动范围
 * （实测里 `01` 水印的墨迹盒能横跨 x933-1224、纵跨 y390-702）。
 *
 * 纪律：零 theme id、零 hex，四色只来自 `ctx.colors.chartPalette`
 * （`chartPaletteOffset` 是 ctx 上的独立字段、不改 `colors.chartPalette`
 * 本身，`motif-chart-palette-isolation.test.tsx` 逐主题钉着这条）。
 * 画笔属性一律写在叶子上不挂 `<g>`——导出侧 `svg2pptx/dispatch.ts` 的
 * `leafToOp` 只读叶子自己的 `fill`/`opacity`，挂在组上预览看得见、导出全丢
 * （本轮实测：`.issues/2026-08-18-theme-redesign/skins/tools/probe-group-inherit.mts`）。
 */

/** 板上的 seed。随机流本身换成本仓精确可表示的那一组，见文件头。 */
const CONFETTI_SEED = 7

/** 圆点半径区间 [{@link DOT_R_MIN}, DOT_R_MIN+{@link DOT_R_SPAN})，平方分布。 */
const DOT_R_MIN = 1.5
const DOT_R_SPAN = 4
/** 斜方片：板上的 8×5 再乘一个逐枚缩放，转角放开到整圈。 */
const CHIP_W = 8
const CHIP_H = 5
const CHIP_SCALE_MIN = 0.65
const CHIP_SCALE_MAX = 1.35
const CHIP_ANGLE_SPAN = 360

/**
 * 一枚纸屑的最大外扩：斜方片半对角 √(4²+2.5²) × 最大缩放，圆点最大半径，
 * 取大者（v6 放开尺寸后约 6.37px，v5 是 4.72px）。三条带的取样窗按它对实测
 * 排字外沿收边（见文件头）。导出给 `motif-campaign-motif.test.tsx`——安全区
 * 守卫要用同一个数量边界，两处各写一遍就会各自漂。
 */
export const PIECE_REACH = Math.max(
  DOT_R_MIN + DOT_R_SPAN,
  Math.sqrt((CHIP_W / 2) ** 2 + (CHIP_H / 2) ** 2) * CHIP_SCALE_MAX,
)

/**
 * 一条纸屑带：`n` 是枚数，`x`/`y` 是取样窗，`axis` 是这条带铺开的方向
 * （长轴）。疏密节奏做在长轴上，短轴仍是均布。
 */
interface Band {
  readonly n: number
  readonly x: readonly [number, number]
  readonly y: readonly [number, number]
  readonly axis: "x" | "y"
  /** 长轴上的团心数。 */
  readonly clumps: number
  /** 一团的半径（长轴单位）。 */
  readonly spread: number
}

/**
 * 三条纸屑带的取样窗（顶 / 左 / 右）。窗口都已按 {@link PIECE_REACH} 对实测
 * 排字外沿收过边，推导见文件头。顶带排第一位是有意的：
 * {@link HALF_FIELD_BANDS} 按下标切半场。
 *
 * 团心数与团半径按各自长轴的长短取：顶带 1184px 长、七团、团半径 80px；
 * 两条侧带 615px 长、四团、团半径 55px。都是「团比团距小」，于是团与团
 * 之间读得出空档。
 */
const BANDS: readonly Band[] = [
  { n: 60, x: [48, 1232], y: [10, 27], axis: "x", clumps: 7, spread: 80 },
  { n: 30, x: [20, 48], y: [40, 655], axis: "y", clumps: 4, spread: 55 },
  { n: 30, x: [1232, 1264], y: [40, 655], axis: "y", clumps: 4, spread: 55 },
]

/** 团重区间：团重不等，于是有的团挤、有的团松。 */
const CLUMP_WEIGHT_MIN = 0.35
const CLUMP_WEIGHT_SPAN = 1.65
/** 不进团、整条带均布的比例——全进团会读成一串葡萄，那是另一种机械。 */
const STRAGGLER_RATE = 0.25
/** 逐枚透明度区间 [{@link OPACITY_MIN}, 1]，拉开远近层次。 */
const OPACITY_MIN = 0.45
const OPACITY_SPAN = 0.55

/** 半场 = 顶带一条（60 枚，正好是总数的一半）。 */
const HALF_FIELD_BANDS = 1

/**
 * 半场降档判据：一页的组件数到这个数就只画顶带。取
 * `PACING_BUDGETS.dense.maxComponentsPerSlide`——全仓自己的「最密一档每页
 * 块数上限」（`narrative/index.ts`，`ir-quality.ts` 的 density 门用的也是
 * 它），不另造一个魔数。到了这个数，页面已经是内容说了算的一页，装饰把
 * 左右两条竖带让出来。
 */
const HALF_FIELD_COMPONENTS = PACING_BUDGETS.dense.maxComponentsPerSlide

/** 一枚纸屑：圆点或斜方片，`c` 是 `chartPalette` 的下标，`o` 是逐枚透明度。 */
type Confetti =
  | { kind: "dot"; band: number; c: number; o: number; cx: number; cy: number; r: number }
  | { kind: "chip"; band: number; c: number; o: number; cx: number; cy: number; d: string }

/**
 * Numerical Recipes LCG（`src/svg/motifs` 各处同款）。`s < 2³²`、
 * `1664525 < 2²¹`，乘积 < 2⁵³，双精度下精确——板上那组 glibc 常数不满足
 * 这一条，见文件头。
 */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const round1 = (v: number) => Math.round(v * 10) / 10
const round2 = (v: number) => Math.round(v * 100) / 100
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** 斜方片：8×5 的方片按 `scale` 缩放、绕自身中心转 `deg`，四角算成一条闭合
 * path。不用 `<rect transform="rotate(...)">`：导出侧 `svg2pptx/dispatch.ts`
 * 明说「旋转/斜切不在受控子集内」，转角会被当成没转处理。 */
function chipPath(cx: number, cy: number, deg: number, scale: number): string {
  const a = (deg * Math.PI) / 180
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  const hw = (CHIP_W / 2) * scale
  const hh = (CHIP_H / 2) * scale
  const corners: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ]
  const pts = corners.map(([lx, ly]) => `${round1(cx + lx * ca - ly * sa)} ${round1(cy + lx * sa + ly * ca)}`)
  return `M ${pts[0]} L ${pts[1]} L ${pts[2]} L ${pts[3]} Z`
}

/**
 * 一条带的长轴取样器：先撒团心、再按团重分配枚数，团内走三角分布
 * （两次均匀取样相加），另有 {@link STRAGGLER_RATE} 的枚数整条带均布。
 * 取样结果一律夹回窗内，所以「带内」是构造上成立的，与团半径无关。
 */
function alongSampler(band: Band, rnd: () => number): () => number {
  const [lo, hi] = band.axis === "x" ? band.x : band.y
  const clumps = Array.from({ length: band.clumps }, () => ({
    at: lo + rnd() * (hi - lo),
    weight: CLUMP_WEIGHT_MIN + rnd() * CLUMP_WEIGHT_SPAN,
  }))
  const total = clumps.reduce((s, c) => s + c.weight, 0)
  return () => {
    if (rnd() < STRAGGLER_RATE) return lo + rnd() * (hi - lo)
    let pick = rnd() * total
    let chosen = clumps[clumps.length - 1]!
    for (const c of clumps) {
      pick -= c.weight
      if (pick <= 0) {
        chosen = c
        break
      }
    }
    return clamp(chosen.at + (rnd() + rnd() - 1) * band.spread, lo, hi)
  }
}

/**
 * 模块加载时算一次的 120 枚纸屑。取样顺序、形制判据（`k % 3 === 2` 走斜方
 * 片）、配色轮换（`k % 4`）逐条照板；位置的疏密节奏与逐枚的尺寸/转角/
 * 透明度是 v6 的返工，全部出自同一条 seed=7 的 LCG（见文件头）。
 */
const CONFETTI: readonly Confetti[] = (() => {
  const rnd = lcg(CONFETTI_SEED)
  const out: Confetti[] = []
  let k = 0
  for (let b = 0; b < BANDS.length; b++) {
    const band = BANDS[b]!
    const along = alongSampler(band, rnd)
    const across = band.axis === "x" ? band.y : band.x
    for (let i = 0; i < band.n; i++) {
      const t = along()
      const u = across[0] + rnd() * (across[1] - across[0])
      const cx = round1(band.axis === "x" ? t : u)
      const cy = round1(band.axis === "x" ? u : t)
      const c = k % 4
      const o = round2(OPACITY_MIN + rnd() * OPACITY_SPAN)
      if (k % 3 === 2) {
        const deg = Math.round(rnd() * CHIP_ANGLE_SPAN)
        const scale = CHIP_SCALE_MIN + rnd() * (CHIP_SCALE_MAX - CHIP_SCALE_MIN)
        out.push({ kind: "chip", band: b, c, o, cx, cy, d: chipPath(cx, cy, deg, scale) })
      } else {
        // 平方分布：多数小、少数大。线性取样会让全场一个尺寸档，那正是
        // 「太机械」的一半来源。
        out.push({ kind: "dot", band: b, c, o, cx, cy, r: round1(DOT_R_MIN + rnd() ** 2 * DOT_R_SPAN) })
      }
      k++
    }
  }
  return out
})()

/** 纸屑总枚数（板上的百级硬指标）。测试与文档都读这个数，不复述字面量。 */
export const CONFETTI_COUNT = CONFETTI.length

/** 半场（密页降档）时实际落笔的枚数。 */
export const CONFETTI_HALF_FIELD_COUNT = CONFETTI.filter((p) => p.band < HALF_FIELD_BANDS).length

export function CampaignMotif({ slide, ctx }: DecorProps) {
  // chapter 是整版底色上的巨幅居中标题 + 章节号水印，页缘正是它们的活动
  // 范围（见文件头）。
  if (slide.type === "chapter") return null

  const palette = ctx.colors.chartPalette
  // 半场降档：判据只读 IR 结构层的组件数量，绝不读渲染后的文字几何。
  const halfField = slide.components.length >= HALF_FIELD_COMPONENTS

  return (
    <>
      {CONFETTI.map((piece, i) =>
        halfField && piece.band >= HALF_FIELD_BANDS ? null : piece.kind === "dot" ? (
          <circle key={i} cx={piece.cx} cy={piece.cy} r={piece.r} fill={palette[piece.c]} opacity={piece.o} />
        ) : (
          <path key={i} d={piece.d} fill={palette[piece.c]} opacity={piece.o} />
        ),
      )}
    </>
  )
}
