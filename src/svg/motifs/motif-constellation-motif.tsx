import type { DecorProps } from "./types"
import { DecorPiece } from "./decor-piece"
import { leafRecessOpacity } from "./decor-budget"

/**
 * constellation-motif —— tech 的「星座链 v2」（2026-08-19 深底组皮肤重设计，
 * 设计源 `.issues/2026-08-18-theme-redesign/skins/group1-dark-boards.dc.html`
 * 的 tech 设计表，几何坐标逐条抄录，不派生）。
 *
 * 删掉的两件东西，逐条交代去向，免得后来人当成漏搬：
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
 * v2 画的三件东西，r2 预算裁成两件（gallery review 点名 tech p01 星点/星轨）：
 *   - **右缘节点链**（四种页型都画）：主链七个折点，节点只留主链上的。
 *     三条支链和支链末端的点是次件，裁掉。连线取 `colors.border`。节点自
 *     2026-08-21 的变淡波起整档乘一个退底系数，内容页再按 3:1 天花板退一档，
 *     几何一 px 不动，见 `NODE_INK_OPACITY`。
 *   - **顶带疏星**：裁掉。四枚 muted 小点是最次的一件，盖在标题带上方抢数。
 *   - **双轨道弧**（仅 cover / chapter）：圆心在页外右上 (1420,140)，
 *     r430 / r310 两道极淡的弧。
 *
 * 安全区：四个内容区是标题区 (96,48,1040×122)、正文区 (96,200,1040×420)、
 * 页脚 meta 带 (48,664,1184×44)、右下 logo 盒 (1120,630,96×40)。
 *   - 节点链声明坐标 x >= 1170（裁支链后最左是主链 x1170），正文/标题区
 *     右缘在 x1136，让开 34px。链底最低一枚节点 (1190,570) 半径 3，着墨
 *     止于 y573，logo 盒上沿 y630，让开 57px。
 *     `motif-constellation-motif.test.tsx` 锁这两条。
 *
 * 位置全部写死，不读内容、不随 seed 变——`inventory.md` 的确定性红线。
 *
 * 纪律：零 theme id、零 hex，颜色全部来自 ctx（accent / border +
 * chartPalette 的第 2 位）。疏星裁掉后 muted 退出本文件。
 */

// ── 右缘节点链（设计稿坐标，逐条抄录） ──────────────────────────────────
/** 主链：从顶到底一路折下来的七个折点。支链是 r2 裁掉的次件。 */
const CHAIN_MAIN: readonly (readonly [number, number])[] = [
  [1180, 90], [1230, 150], [1170, 230], [1215, 320], [1175, 420], [1225, 500], [1190, 570],
]
const CHAIN_STROKE = 1.5

/**
 * 节点分三档着色，全部读 token：
 *   - `accent`：主链的两枚辉光大节点（r7 光晕 + r4 实心）与两枚小节点。
 *   - `chartPalette[1]`（冷序列第二位，蓝）：一枚辉光节点 + 两枚小节点。
 *   支链末端的紫点随支链一起裁掉。
 * 图表与装饰同源是设计稿点名的意图（「节点/连线几何参数不动——色板角色化
 * 后一次换装」），所以这里读 chartPalette 而不是另造两个 token。
 * `ctx.colors.chartPalette` 本身不随 `chartPaletteOffset` 轮转（那次轮转
 * 早已移出 `buildCtx`，见 `motif-chart-palette-isolation.test.tsx`），
 * 所以读它不会让装饰随页码变色。
 */
const NODES_ACCENT = [
  { cx: 1180, cy: 90, glow: 7, r: 4 },
  { cx: 1170, cy: 230, r: 3 },
  { cx: 1175, cy: 420, glow: 7, r: 4 },
  { cx: 1190, cy: 570, r: 3 },
] as const
const NODES_COOL = [
  { cx: 1230, cy: 150, r: 3 },
  { cx: 1215, cy: 320, glow: 6, r: 4 },
  { cx: 1225, cy: 500, r: 3 },
] as const
const GLOW_OPACITY_ACCENT = 0.25
const GLOW_OPACITY_COOL = 0.3
/**
 * 节点整档的退底系数（2026-08-21 变淡波）。位置一 px 不动，只降不透明度。
 *
 * 墨盒扫掠工具扫三语料 153 页的实测
 * （`.issues/2026-08-21-restore-design-decor/tools/decor-ink-sweep.mts`）：
 * 连线用的是 border，压在 tech 底色上是 1.43:1，本主题最安静的一条结构线，
 * 本来就是背景。节点不是：accent 满不透明是 **11.59:1**，比正文 16.5:1 只低一档，
 * 冷序列两色也有 5.9:1，全都在正文的判读区间里。「星轨进前景」说的正是
 * 这几枚点，而不是它们的位置。
 *
 * 0.45 把三档节点分别压到 2.79 / 2.66 / 2.67:1：都在 4.5:1 的正文地板以下，
 * 一眼看过去先读文字后读星链，而 r2.5-7 的小圆点在深底上仍清清楚楚。辉光
 * halo 同乘这个系数，节点与自己 halo 的强弱关系保持不变。
 *
 * 连线与双轨道弧本来就在 3:1 以下。顶带疏星已裁。内容页节点再按
 * `leafRecessOpacity` 压到 3:1 天花板以下。
 */
const NODE_INK_OPACITY = 0.45

// ── 双轨道弧（仅 cover / chapter） ──────────────────────────────────────
/**
 * 圆心在页外右上角，只有左下一段弧扫进页面。
 *
 * 设计稿两道弧写的是 `#1B2742` / `#16203A`——都比 border `#24304A` 更暗，
 * 不对应任何一个 token 角色。不新造 token（YAGNI，同 ink v3 的孤儿色归属
 * 框架），改成 border 压在 bg 上的两档透明度：按设计稿三色逐通道解
 * `bg + a×(border − bg) = 目标色`，外弧三通道解出 0.65/0.73/0.82（取 0.72），
 * 内弧解出 0.46/0.52/0.64（取 0.52）。换 token 时两道弧跟着 border 走，
 * 这正是「色板角色化后一次换装」要的性质。
 */
const ORBITS = [
  { r: 430, opacity: 0.72 },
  { r: 310, opacity: 0.52 },
] as const
const ORBIT_CX = 1420
const ORBIT_CY = 140
const ORBIT_STROKE = 1.5

const polylinePoints = (pts: readonly (readonly [number, number])[]): string =>
  pts.map(([x, y]) => `${x},${y}`).join(" ")

export function ConstellationMotif({ slide, ctx }: DecorProps) {
  const { colors } = ctx
  const bg = ctx.defaultBg ?? colors.bg
  const cool = colors.chartPalette[1] ?? colors.accent
  const track = colors.border ?? colors.muted
  const showOrbits = slide.type === "cover" || slide.type === "chapter"
  const nodeOp = (ink: string, preferred: number) => leafRecessOpacity(slide.type, ink, bg, preferred)

  return (
    <>
      {showOrbits && (
        <DecorPiece id="orbits">
          {ORBITS.map((o) => (
            <circle
              key={`orbit-${o.r}`}
              cx={ORBIT_CX}
              cy={ORBIT_CY}
              r={o.r}
              fill="none"
              stroke={track}
              strokeWidth={ORBIT_STROKE}
              opacity={o.opacity}
            />
          ))}
        </DecorPiece>
      )}

      <DecorPiece id="star-track">
        <polyline
          points={polylinePoints(CHAIN_MAIN)}
          fill="none"
          stroke={track}
          strokeWidth={CHAIN_STROKE}
          opacity={leafRecessOpacity(slide.type, track, bg)}
        />
        {NODES_ACCENT.map((n) => (
          <g key={`node-a-${n.cx}-${n.cy}`}>
            {"glow" in n && n.glow && (
              <circle
                cx={n.cx}
                cy={n.cy}
                r={n.glow}
                fill={colors.accent}
                opacity={nodeOp(colors.accent, GLOW_OPACITY_ACCENT * NODE_INK_OPACITY)}
              />
            )}
            <circle
              cx={n.cx}
              cy={n.cy}
              r={n.r}
              fill={colors.accent}
              opacity={nodeOp(colors.accent, NODE_INK_OPACITY)}
            />
          </g>
        ))}
        {NODES_COOL.map((n) => (
          <g key={`node-c-${n.cx}-${n.cy}`}>
            {"glow" in n && n.glow && (
              <circle
                cx={n.cx}
                cy={n.cy}
                r={n.glow}
                fill={cool}
                opacity={nodeOp(cool, GLOW_OPACITY_COOL * NODE_INK_OPACITY)}
              />
            )}
            <circle cx={n.cx} cy={n.cy} r={n.r} fill={cool} opacity={nodeOp(cool, NODE_INK_OPACITY)} />
          </g>
        ))}
      </DecorPiece>
    </>
  )
}
