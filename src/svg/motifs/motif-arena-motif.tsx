import { PACING_BUDGETS } from "@/narrative"
import type { DecorProps } from "./types"

/**
 * arena-motif —— 「HUD 括弧＋速度线」（2026-08-21，设计源
 * `design-project/skin-boards` 的 arena 板，几何坐标逐条抄录，不派生）。
 *
 * 三件东西，全部恒位，能量全部留在页缘四带：
 *   - **四角 HUD 括弧**：24×24，电光绿（accent），恒在四角内缩 12px 处。
 *     板上四条 path：`M12,36 L12,12 L36,12` / `M1244,12 L1268,12 L1268,36` /
 *     `M12,684 L12,708 L36,708` / `M1268,684 L1268,708 L1244,708`。
 *   - **左右页缘斜速度线束**：x20-88 与 x1150-1260 两带，各 5 道 45° 斜线
 *     （dx=52、dy=-52），电光绿 / 品红相间，后三道按 1 / 0.5 / 0.25 退远。
 *     品红取 `chartPalette[1]`（图表与装饰同源，红蓝对抗的那一格）。
 *   - **底带能量分段条**：y648，x 从 96 起 8 段，每段 rect
 *     `x=96+i*39`、宽 30 高 8。前 5 段 accent，后 3 段 border。
 *
 * 可拉伸性（审计 #28 音乐演出）：accent 电光绿→电光紫或舞台金、速度线束→
 * 声波弧（同带同参数）、HUD 括弧改圆角即从「赛场」变「演出」。chart 红蓝
 * 对抗位在演出场景退化为双主色。本文件不焊死 hex，换 token 即换装。
 *
 * ## 密页降档（heavy 主题硬要求，机制照 campaign 先例）
 *
 * 判据只钉 IR 结构层：`slide.components.length >= PACING_BUDGETS.dense.maxComponentsPerSlide`
 * （全仓自己的「最密一档每页块数上限」）。到了这个数，速度线束撤场，只留
 * 四角括弧＋底能量条（注脚页再撤能量条，见下「让位」）。内容区 1040×420
 * 内零装饰像素（满场也成立，降档把侧带也让出来）。
 *
 * 不许读渲染后的文字几何。理由同 `motif-campaign-motif.tsx`：motif 画在正文
 * 之前，读文字几何会让两次渲染拿到不同值，违反「同 IR 同 seed 两次渲染必须
 * 逐字节同」。
 *
 * chapter 完全退让（`return null`）：八个 chapter layout 都在整版底色上画
 * 巨幅居中标题与章节号水印，页缘正是它们的活动范围（campaign 同款裁定，
 * 实测 `01` 水印可横跨 x933-1224、纵跨 y390-702，右缘速度线与底能量条都在
 * 这块里）。
 *
 * 安全区（设计板上四条红虚线禁区）：标题区 (96,48,1040×122)、正文区
 * (96,200,1040×420)、页脚 meta 带 (48,664,1184×44)、右下 logo 盒
 * (1120,630,96×40)。
 *   - 括弧落在四角 12px 内缩，正文/标题区从 x96 起，左括弧止于 x36，右括弧
 *     起于 x1244。底括弧 y684-708 在页脚带 y664 之下，但横向在 x48 以左 /
 *     x1232 以右，与页脚带不相交。右下括弧 x1244 在 logo 盒 x1216 以右。
 *   - 左速度线 x28-80，正文左沿 x96 以左。右速度线 x1200-1252，正文右沿
 *     x1136 以右，最低点 y600 在 logo 盒上沿 y630 之上。
 *   - 能量条 y648-656，正文区下沿 y620 之下、页脚带上沿 y664 之上，右端
 *     x399 在 logo 盒 x1120 以左。四保护区过了，但这段空隙正是第五文字带
 *     （见下「让位」）。
 *
 * ## 让位：第五文字带（cover 撤能量条 / 注脚页撤能量条）
 *
 * y620-664 是一条设计板上没圈进四保护区的文字带。住在里面的有两类字：
 *   - 封面构造的 meta 行。`cover-poster-center.tsx` 基线
 *     `Math.max(650, subtitleLastY + 56)`，字号 20，字身约 y624-656。
 *     `cover-split-diagonal.tsx` 基线 662、字号 19，从 x596 起排，纵跨会
 *     擦到 y648-656，横向上在能量条右端 x399 以右，这一张其实不撞。arena
 *     的封面候选就是这两张。motif 不许感知当页选中的 layout（terra 板的
 *     确定性红线），所以照 crayon「cover 撤底带」、terra「chapter 整页退让」
 *     的同一模式按页型处理：cover 一律撤能量条。四角 HUD 括弧与左右速度线
 *     不在这条带里，不动。
 *   - 图表来源注脚。基线由 `branding-geometry.ts` 的 `footnoteBaselineFor`
 *     从 `FOOTER_DIVIDER_Y = 664` 减净空得出：14px 在 645，20px 在 644，
 *     字身落到约 y630-650。绝大多数 layout 从 x96 起排（`banner-heading`
 *     的 `BANNER_X`、`narrow-column`、`bento-panel`），与能量条
 *     x96-399 重叠。
 *
 * 能量条是带内实色粗件（y648 高 8，8 段实色 rect）。电光绿不减淡，用让位。
 *
 * 注脚出现与否可在 IR 结构层判定：`slide.footnote` 有真值，各 content
 * layout 就画这条注脚（`{slide.footnote && …}`，与 `validate-core.ts` 的
 * 边界页硬闸互证：cover/chapter/ending 根本不渲染 footnote）。判据只读这
 * 个字段有无，不读字符串长度，不读渲染后文字几何，纪律照 crayon 密页降档
 * 同款。`two-column` 是唯一不画注脚的 content layout。motif 读不到选中的
 * layout，有字段就撤，两栏页会多撤一次，宁过勿漏。
 *
 * 组件级 `data_table.source` / `kpi_cards[].source` 画在组件盒里，不是
 * 第五文字带，不撤。
 *
 * 密页降档继续只撤速度线。注脚页叠加密页时两条让位各自生效。
 *
 * 设计红线：任何形态的「粗平左竖条」禁止出现。括弧的短竖边只有 24px，
 * 不是一条轨。
 *
 * 纪律：零 theme id、零 hex，颜色只来自 ctx（accent / border /
 * chartPalette[1]）。画笔属性一律写在叶子上不挂 `<g>`——导出侧
 * `svg2pptx/dispatch.ts` 的 `leafToOp` 只读叶子自己的 fill/stroke/opacity。
 * 本 motif 是 arena 独占的单成员候选集（`motif-selection.ts` 的
 * `MOTIF_CANDIDATES`），没有别的主题借用它。
 */

// ── 四角 HUD 括弧（板上 path 逐条抄录） ────────────────────────────────
const BRACKET_STROKE = 2.5
const BRACKETS: readonly string[] = [
  "M12,36 L12,12 L36,12",
  "M1244,12 L1268,12 L1268,36",
  "M12,684 L12,708 L36,708",
  "M1268,684 L1268,708 L1244,708",
]

// ── 左右页缘斜速度线束 ────────────────────────────────────────────────
const SPEED_STROKE = 2.5
/** 一条速度线：起点、终点、是否走品红（否则电光绿）、透明度。 */
interface SpeedLine {
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  readonly magenta: boolean
  readonly opacity: number
}
const SPEED_LINES: readonly SpeedLine[] = [
  { x1: 28, y1: 160, x2: 80, y2: 108, magenta: false, opacity: 1 },
  { x1: 28, y1: 220, x2: 80, y2: 168, magenta: true, opacity: 1 },
  { x1: 28, y1: 280, x2: 80, y2: 228, magenta: false, opacity: 0.5 },
  { x1: 28, y1: 340, x2: 80, y2: 288, magenta: true, opacity: 0.5 },
  { x1: 28, y1: 400, x2: 80, y2: 348, magenta: false, opacity: 0.25 },
  { x1: 1200, y1: 360, x2: 1252, y2: 308, magenta: true, opacity: 1 },
  { x1: 1200, y1: 420, x2: 1252, y2: 368, magenta: false, opacity: 1 },
  { x1: 1200, y1: 480, x2: 1252, y2: 428, magenta: true, opacity: 0.5 },
  { x1: 1200, y1: 540, x2: 1252, y2: 488, magenta: false, opacity: 0.5 },
  { x1: 1200, y1: 600, x2: 1252, y2: 548, magenta: true, opacity: 0.25 },
]

// ── 底带能量分段条 ────────────────────────────────────────────────────
const ENERGY_Y = 648
const ENERGY_X0 = 96
const ENERGY_STEP = 39
const ENERGY_W = 30
const ENERGY_H = 8
const ENERGY_COUNT = 8
const ENERGY_LIT = 5

/**
 * 半场降档判据：一页的组件数到这个数就撤速度线。取
 * `PACING_BUDGETS.dense.maxComponentsPerSlide`，不另造一个魔数。
 */
const HALF_FIELD_COMPONENTS = PACING_BUDGETS.dense.maxComponentsPerSlide

export function ArenaMotif({ slide, ctx }: DecorProps) {
  // chapter 是整版底色上的巨幅居中标题 + 章节号水印，页缘正是它们的活动
  // 范围（见文件头）。
  if (slide.type === "chapter") return null

  const green = ctx.colors.accent
  const magenta = ctx.colors.chartPalette[1] ?? ctx.colors.accent
  const dim = ctx.colors.border ?? ctx.colors.primary
  // 半场降档：判据只读 IR 结构层的组件数量，绝不读渲染后的文字几何。
  const halfField = slide.components.length >= HALF_FIELD_COMPONENTS
  // cover 撤能量条：第五文字带住着封面 meta 行。注脚页撤能量条：IR 结构层
  // `slide.footnote` 有真值即本页会画来源注脚（见文件头「让位」一节）。
  const energyBar = slide.type !== "cover" && !slide.footnote

  return (
    <>
      {BRACKETS.map((d) => (
        <path key={d} d={d} fill="none" stroke={green} strokeWidth={BRACKET_STROKE} />
      ))}
      {halfField
        ? null
        : SPEED_LINES.map((l) => (
            <line
              key={`${l.x1}-${l.y1}`}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke={l.magenta ? magenta : green}
              strokeWidth={SPEED_STROKE}
              opacity={l.opacity}
            />
          ))}
      {energyBar
        ? Array.from({ length: ENERGY_COUNT }, (_, i) => (
            <rect
              key={i}
              x={ENERGY_X0 + i * ENERGY_STEP}
              y={ENERGY_Y}
              width={ENERGY_W}
              height={ENERGY_H}
              fill={i < ENERGY_LIT ? green : dim}
            />
          ))
        : null}
    </>
  )
}
