import type { DecorProps } from "./types"

/**
 * constellation-motif v3 —— tech 的「星座链」（2026-08-19 深底组皮肤重设计，
 * 设计源 `.issues/2026-08-18-theme-redesign/skins/group1-dark-boards.dc.html`
 * 的 tech 设计表；v3 是 2026-08-20 第四轮评审「装饰归背景」的返工）。
 *
 * v2 删掉的两件东西，逐条交代去向，免得后来人当成漏搬：
 *   - **满页对角渐变场**（`decor-tech-field` + 两个私有 stop 常量
 *     `#04070E`/`#0A1220`）：删。这块 rect 盖在 `Background` 之上、整页
 *     不透明，等于把主题自己的 `defaultBackgrounds` 遮死——tech 的渐变底
 *     从来没被人看见过，改 `tech.ts` 的背景也不会有任何观感变化。本轮设计
 *     稿把背景渐变（`#0E1630` → `#070B16`）明确划给 token，装饰只负责星
 *     链，两边职责因此分清。顺带这也是本文件仅有的两处烤死 hex 的出处，
 *     删掉后本文件回到「零 hex」纪律，不再需要 grep 门的豁免。
 *   - **`hasExplicitBackground` 提前返回**：删。它存在的唯一理由是保护
 *     slide 自带的背景不被上面那块满页 rect 盖掉（见其原注释）。rect 没了，
 *     这个判断也就没有了保护对象——留着反而让 tech 成为唯一一个「页面有
 *     自定义背景就整块装饰消失」的主题，而 ink / luxe / poster 等其余
 *     motif 从来不做这个判断。cover/chapter 的整图接管本就由
 *     `full-slide-svg.tsx` 的 `imageCoverTakeover` 拦在外面，不归 motif 管。
 *   - **Ending 专属 3 点星座 + 三档 seed 变体**（`ENDING_MOTIF_POINTS`
 *     a/b/c）：删。散点是本轮的反面基线本身——「满场随机散点」被设计稿
 *     收编成下面这条固定的右缘节点链，四种页型同一份几何。
 *
 * ## v3 返工：节点链退到页缘空带，双轨道弧退役
 *
 * 用户对 tech p05 的原话是「右侧那个星轨连线也是，所有的装饰理论上应该都
 * 归属与背景的一部分，可以盖在背景图上，但不应该呈现到前景中」。实测两件
 * 事都成立：
 *
 *   - v2 的节点链声明 x >= 1155，理由是「正文/标题区右缘在 x1136」。但版心
 *     右缘是**设计意图**，版式们真实的排字外沿比它宽——`text-margin-sweep`
 *     把 tech 的 41 个版式 + 主题十页逐条量墨迹盒（480 条），最右一列止于
 *     **x1224**（`brand-chrome.tsx` 右对齐的那两行页脚）。x1155-1230 的链
 *     因此压中 **26 条**：内容页正文的行尾、rail-numbered 的 `↓`、章节号
 *     水印、fashion-masthead 的巨幅标题……p05 那张图里链正好穿过柱状图。
 *   - v2 的双轨道弧（圆心 1420,140，r430/r310）左端探到 x990/x1110，扫过
 *     标题区 (96,48,1040×122)。同一次扫掠里它在 cover/chapter 上碰到
 *     fashion-masthead 的标题、left-anchor 的副标题、banner-title 的
 *     `Internal`、poster-chapter 的引首等等。
 *
 * v3 的处置是位置，不是浓淡：
 *   - **节点链**收进实测空带 **x>1224**（页面右缘那 56px，另三条空带是
 *     y<34 / x<56 / y>715）。主链七个折点与三条支链按 x1155-1230 →
 *     x1234-1268 等比压缩，纵向 y90-570 一处未动，链形不变。着墨最左是
 *     x1231.5（x1234 上那枚 r2.5 小节点），距 x1224 让开 7.5px；最右是
 *     x1271（x1268 上那枚 r3），距页缘 1280 让开 9px。
 *   - **双轨道弧退役**。它跟节点链是同一个错误的两种尺寸，而修法在这里
 *     不通：56px 宽的空带塞不下两道 r>300 的同心弧——把 r 压到 196 以内才
 *     能整条留在带里，那时页面上只剩两道几乎重合的短切线，读不出「轨道」。
 *     链与顶带疏星已经足够撑住 tech 的星图语汇，弧就此删除，不留半档。
 *     顺带这也让本 motif 不再分页型——四种页型现在渲出同一份几何。
 *
 * v3 画的两件东西：
 *   - **右缘节点链**（四种页型都画）：x1234-1268、y90-570 的一条折线主链
 *     ＋三条支链，节点分三级（辉光大节点 / 中节点 / 小节点）。连线取
 *     `colors.border`——设计稿色板角色表把 border 写成「连线同色，界格即
 *     星轨」，界格与星轨同色是这套语言的一部分，不是巧合。
 *   - **顶带疏星**（四种页型都画）：y14-26 上四枚 muted 小点，着墨
 *     y11.5-28.5，在实测文字上沿 y34 之上。
 *
 * 安全区：四个内容区是标题区 (96,48,1040×122)、正文区 (96,200,1040×420)、
 * 页脚 meta 带 (48,664,1184×44)、右下 logo 盒 (1120,630,96×40)。
 *   - 节点链整条在 {@link TEXT_RIGHT_EDGE} 之外，`brand-chrome.tsx` 的四只
 *     logo 盒（x64-160 / x1120-1216）也因此全部让开。
 *   - 疏星在 {@link DECOR_CEILING} 之上。两条都由
 *     `motif-constellation-motif.test.tsx` 逐元素钉死。
 *
 * 位置全部写死，不读内容、不随 seed 变——`inventory.md` 的确定性红线。
 *
 * 纪律：零 theme id、零 hex，颜色全部来自 ctx（accent / border / muted 三个
 * 角色 + chartPalette 的第 2、3 位）。
 */

/**
 * 实测的排字右沿：`text-margin-sweep` 在 tech / insight（两家共用本 motif）
 * 各 480 / 477 条文字墨迹盒里量到的最右一列（`brand-chrome.tsx` 右对齐的
 * 页脚两行）。节点链的着墨必须整条在它之外。测试读这个常量，不复述字面量。
 */
export const TEXT_RIGHT_EDGE = 1224

/** 实测的排字上沿（同一次扫掠）：顶带疏星的着墨必须整组在它之上。 */
export const DECOR_CEILING = 34

// ── 右缘节点链 ──────────────────────────────────────────────────────────
/** 主链：从顶到底一路折下来的七个折点。 */
const CHAIN_MAIN: readonly (readonly [number, number])[] = [
  [1245, 90], [1268, 150], [1241, 230], [1261, 320], [1243, 420], [1266, 500], [1250, 570],
]
/** 三条支链：各从主链上一个折点岔出去一小段。 */
const CHAIN_BRANCHES: readonly (readonly [number, number])[][] = [
  [[1268, 150], [1236, 120]],
  [[1261, 320], [1234, 280]],
  [[1266, 500], [1236, 530]],
]
const CHAIN_STROKE = 1.5

/**
 * 节点分三档着色，全部读 token：
 *   - `accent`：主链的两枚辉光大节点（r7 光晕 + r4 实心）与两枚小节点。
 *   - `chartPalette[1]`（冷序列第二位，蓝）：另一枚辉光节点 + 三枚小节点。
 *   - `chartPalette[2]`（冷序列第三位，紫）：支链末端一枚。
 * 图表与装饰同源是设计稿点名的意图（「节点/连线几何参数不动——色板角色化
 * 后一次换装」），所以这里读 chartPalette 而不是另造两个 token。
 * `ctx.colors.chartPalette` 本身不随 `chartPaletteOffset` 轮转（那次轮转
 * 早已移出 `buildCtx`，见 `motif-chart-palette-isolation.test.tsx`），
 * 所以读它不会让装饰随页码变色。
 */
const NODES_ACCENT = [
  { cx: 1245, cy: 90, glow: 7, r: 4 },
  { cx: 1241, cy: 230, r: 3 },
  { cx: 1236, cy: 120, r: 2.5 },
  { cx: 1243, cy: 420, glow: 7, r: 4 },
  { cx: 1250, cy: 570, r: 3 },
] as const
const NODES_COOL = [
  { cx: 1268, cy: 150, r: 3 },
  { cx: 1261, cy: 320, glow: 6, r: 4 },
  { cx: 1234, cy: 280, r: 2.5 },
  { cx: 1266, cy: 500, r: 3 },
] as const
const NODE_VIOLET = { cx: 1236, cy: 530, r: 2.5 } as const
const GLOW_OPACITY_ACCENT = 0.25
const GLOW_OPACITY_COOL = 0.3

// ── 顶带疏星 ────────────────────────────────────────────────────────────
const SPARSE_STARS = [
  { cx: 180, cy: 22, r: 2 },
  { cx: 420, cy: 16, r: 2.5 },
  { cx: 700, cy: 26, r: 2 },
  { cx: 960, cy: 14, r: 2 },
] as const

const polylinePoints = (pts: readonly (readonly [number, number])[]): string =>
  pts.map(([x, y]) => `${x},${y}`).join(" ")

export function ConstellationMotif({ ctx }: DecorProps) {
  const { colors } = ctx
  const cool = colors.chartPalette[1] ?? colors.accent
  const violet = colors.chartPalette[2] ?? colors.accent

  return (
    <>
      {/* 节点连线：主链 + 三条支链 */}
      <polyline
        points={polylinePoints(CHAIN_MAIN)}
        fill="none"
        stroke={colors.border}
        strokeWidth={CHAIN_STROKE}
      />
      {CHAIN_BRANCHES.map((branch, i) => (
        <polyline
          key={`branch-${i}`}
          points={polylinePoints(branch)}
          fill="none"
          stroke={colors.border}
          strokeWidth={CHAIN_STROKE}
        />
      ))}

      {/* accent 档节点（含两枚辉光） */}
      {NODES_ACCENT.map((n) => (
        <g key={`node-a-${n.cx}-${n.cy}`}>
          {"glow" in n && n.glow && (
            <circle cx={n.cx} cy={n.cy} r={n.glow} fill={colors.accent} opacity={GLOW_OPACITY_ACCENT} />
          )}
          <circle cx={n.cx} cy={n.cy} r={n.r} fill={colors.accent} />
        </g>
      ))}

      {/* 冷序列第二位（蓝）档节点（含一枚辉光） */}
      {NODES_COOL.map((n) => (
        <g key={`node-c-${n.cx}-${n.cy}`}>
          {"glow" in n && n.glow && (
            <circle cx={n.cx} cy={n.cy} r={n.glow} fill={cool} opacity={GLOW_OPACITY_COOL} />
          )}
          <circle cx={n.cx} cy={n.cy} r={n.r} fill={cool} />
        </g>
      ))}

      {/* 支链末端的紫点 */}
      <circle cx={NODE_VIOLET.cx} cy={NODE_VIOLET.cy} r={NODE_VIOLET.r} fill={violet} />

      {/* 顶带疏星 */}
      {SPARSE_STARS.map((s) => (
        <circle key={`star-${s.cx}`} cx={s.cx} cy={s.cy} r={s.r} fill={colors.muted} />
      ))}
    </>
  )
}
