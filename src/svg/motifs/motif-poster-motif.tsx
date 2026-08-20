import type { DecorProps } from "./types"

/**
 * poster-motif v4 —— insight 的「行情语汇」（2026-08-19 深底组皮肤重设计，
 * 设计源 `.issues/2026-08-18-theme-redesign/skins/group1-dark-boards.dc.html`
 * 的 insight 设计表；v4 是 2026-08-20 第四轮评审「装饰归背景」的返工）。
 *
 * 换掉的东西：v2 只剩 cover 左下/右下一枚同心光点（三档 seed 变体），那是
 * 「深底 + 左竖条 + 左上标题」时期的残留签名——一枚点既撑不起主题识别，也
 * 与 insight 的财经语域没有关系。covers-review 把深底三家共用一张脸记成本轮
 * 的反面基线，insight 的处方是把装饰整个换成行情屏的语汇。
 *
 * ## v4 返工：整套行情语汇搬进页面顶缘
 *
 * 用户对 insight p01 / p10 与 tech p01（tech 借本 motif）的原话是「折线图完全
 * 给文本交叉，分不清主次」「也看不出来它到底是给谁对齐的」。两句都成立，
 * 而且都是位置问题，不是浓淡问题：
 *
 *   - v3 的基线走线画在 y594-656，那正是各版式署名行、脚注、页脚 meta 的
 *     地盘。用 `text-margin-sweep` 把 insight 的全部 41 个版式 + 主题十页逐条
 *     量文字墨迹盒（477 条），这条走线压中 **40 条**：封面署名、ending 署名、
 *     poster-center 的页脚串、各内容页的脚注……几乎每一页都压。
 *   - v3 的第二条带线画在 y42，压中 **4 条**（`本季度概览` 这类居左引首行的
 *     墨迹上沿在 y40，poster-chapter/roman-chapter 的右上引首在 y34）——
 *     评审 insight p07「本季度概览都跟分割线交叉了」说的就是它。
 *
 * 同一次扫掠给出页面真正空着的四条边：**y<34 / x<56 / x>1224 / y>715**。
 * 于是 v4 把整套行情语汇收进顶缘那条 y<34 的空带，一件不留在下半页：
 *
 *   - **顶缘行情带**（四种页型都画）：上檐细线 y8（1px）+ 行情轴 y28（2px），
 *     两条都是 border 色、都从 x48 走到 x1232。x48/x1232 是页面自己的外边距
 *     （页脚 meta 带 48,664,1184×44 的左右缘），走线与轴因此对齐在页面网格上
 *     ——这是「给谁对齐」的答案。
 *   - **行情走线**（四种页型都画）：16 个折点在上檐与轴之间起伏（y11-25），
 *     两端各自落在 x48 / x1232 的边距上；12% 琥珀面积填充闭合到**行情轴
 *     y28**，轴就是这条走线的基线，不再是半空里的一个数字。
 *   - **刻度齿**（四种页型都画）：五枚琥珀齿骑在轴上（y24-32，x128/368/608/
 *     848/1088），下缘 y32 仍在 y34 之上。
 *   - **幽灵季度水印**（仅 cover）：430px 的季度字样压在版心，5% 琥珀——
 *     大到不像字、淡到不参与判读的一层底纹。字样从 `ir.meta.date` 推，
 *     推不出就整块不画（见 `quarterLabel`）。
 *
 * 安全区：四个内容区是标题区 (96,48,1040×122)、正文区 (96,200,1040×420)、
 * 页脚 meta 带 (48,664,1184×44)、右下 logo 盒 (1120,630,96×40)。
 *   - 线状部分的着墨全段落在 y7.5-32，四个内容区与 `brand-chrome.tsx` 的四只
 *     logo 盒（y48 起）全部在它之下。`motif-poster-motif.test.tsx` 把
 *     {@link DECOR_CEILING} 这条上限逐元素钉死。
 *   - 面积填充 12% / 水印 5% 都低于 `deck-audit.ts` 的 `MIN_BG_OPACITY`
 *     (0.5)，永远不会被当成某段文字的背景去判对比度（ink v3 一角残山的
 *     同一条形式化说法）。
 *
 * 位置全部写死，不读内容、不随 seed 变——`inventory.md` 的确定性红线
 * （装饰位置做内容感知会让 seed 的修订稳定性失效）。v2 的三档 seed 变体
 * 因此一并删除。
 *
 * 纪律：零 theme id、零 hex，颜色全部来自 ctx（border / accent 两个角色）。
 */

/**
 * 线状装饰的着墨下限：本 motif 的每一笔（含描边半宽）都必须在此之上。
 *
 * 34 不是设计意图而是实测——`text-margin-sweep` 在 insight 与 tech（两家共用
 * 本 motif）各自的 477 / 480 条文字墨迹盒里，最高的一行顶在 y34
 * （poster-chapter / roman-chapter 的右上引首）。测试读这个常量，不复述
 * 字面量。水印不受此约束：它是 5% 的整版底纹，不是线。
 */
export const DECOR_CEILING = 34

// ── 顶缘行情带 ──────────────────────────────────────────────────────────
/** 两条带线的左右端点 = 页面外边距，走线也用同一对数字。 */
const BAND_X1 = 48
const BAND_X2 = 1232
/** 上檐细线。 */
const BAND_CAP_Y = 8
const BAND_CAP_STROKE = 1
/** 行情轴：走线的基线，也是面积填充的底。 */
const BAND_AXIS_Y = 28
const BAND_AXIS_STROKE = 2
/** 刻度齿：等距五枚，骑在行情轴上（y24-32）。 */
const TICK_XS = [128, 368, 608, 848, 1088]
const TICK_Y1 = 24
const TICK_Y2 = 32
const TICK_STROKE = 2

// ── 行情走线 ────────────────────────────────────────────────────────────
/**
 * 16 个折点，横向等距铺满 x48→x1232（步长 1184/15，取整），纵向在上檐
 * (y8) 与行情轴 (y28) 之间的 y11-25 起伏。走势沿用 v3 的「左低右高」，
 * 那是行情屏语汇里唯一有方向的一笔。
 */
const TICKER_POINTS: readonly (readonly [number, number])[] = [
  [48, 24], [127, 25], [206, 22], [285, 23], [364, 18], [443, 21],
  [522, 17], [601, 19], [679, 15], [758, 17], [837, 14], [916, 16],
  [995, 12], [1074, 15], [1153, 11], [1232, 13],
]
const TICKER_STROKE = 2
const TICKER_LINE_OPACITY = 0.8
const TICKER_FILL_OPACITY = 0.12

// ── 幽灵季度水印（仅 cover） ────────────────────────────────────────────
const WATERMARK_X = 640
const WATERMARK_Y = 560
const WATERMARK_SIZE = 430
const WATERMARK_WEIGHT = 700
const WATERMARK_OPACITY = 0.05

/**
 * `ir.meta.date` → 季度字样（`Q1`…`Q4`），推不出就返回 undefined。
 *
 * 沿用 `motif-ink-motif.tsx` 的 `colophonDateGlyphs` 同一条纪律：`meta.date`
 * 在 IR 里是自由字符串（schema 不约束格式），所以只认「四位年 + 非数字分隔
 * + 一到两位月」这一种能确定读懂的形状，读不懂就整块不画。封面上印一个
 * 猜错的季度，比不印季度糟得多——这也是设计稿里写死 "Q2" 不能照抄的原因。
 */
function quarterLabel(date: string | undefined): string | undefined {
  const m = /^(\d{4})\D+(\d{1,2})(?:\D|$)/.exec(date ?? "")
  if (!m) return undefined
  const month = Number(m[2])
  if (month < 1 || month > 12) return undefined
  return `Q${Math.floor((month - 1) / 3) + 1}`
}

/** 走线与行情轴之间的闭合面积。 */
const areaPath = (points: readonly (readonly [number, number])[]): string => {
  const first = points[0]
  const last = points[points.length - 1]
  const mid = points.map(([x, y]) => `L ${x} ${y}`).join(" ")
  return `M ${first[0]} ${BAND_AXIS_Y} ${mid} L ${last[0]} ${BAND_AXIS_Y} Z`
}

export function PosterMotif({ ir, slide, ctx }: DecorProps) {
  const { colors } = ctx
  const quarter = slide.type === "cover" ? quarterLabel(ir.meta.date) : undefined

  return (
    <>
      {/* 幽灵季度水印：先画，压在所有行情语汇之下。5% 透明度远低于
          MIN_BG_OPACITY(0.5)，不参与任何对比度判读。 */}
      {quarter && (
        <text
          x={WATERMARK_X}
          y={WATERMARK_Y}
          fontFamily={ctx.fonts.heading}
          fontSize={WATERMARK_SIZE}
          fontWeight={WATERMARK_WEIGHT}
          fill={colors.accent}
          opacity={WATERMARK_OPACITY}
          textAnchor="middle"
        >
          {quarter}
        </text>
      )}

      {/* 行情走线：12% 面积填充闭合到行情轴，再叠 80% 走线。先于带线画，
          带线因此压在填充之上，轴读起来是走线的基线。 */}
      <path d={areaPath(TICKER_POINTS)} fill={colors.accent} opacity={TICKER_FILL_OPACITY} />
      <polyline
        points={TICKER_POINTS.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke={colors.accent}
        strokeWidth={TICKER_STROKE}
        opacity={TICKER_LINE_OPACITY}
      />

      {/* 顶缘行情带：上檐细线 + 行情轴。用 <line> 不用 <path>——纯水平
          <path> 会被 svg2pptx 转成包围盒零高度的 custGeom，package-audit 的
          invalid-shape-transform 硬门拒收（luxe-motif 建这道门时的实测缺陷）。 */}
      <line
        x1={BAND_X1}
        y1={BAND_CAP_Y}
        x2={BAND_X2}
        y2={BAND_CAP_Y}
        stroke={colors.border}
        strokeWidth={BAND_CAP_STROKE}
      />
      <line
        x1={BAND_X1}
        y1={BAND_AXIS_Y}
        x2={BAND_X2}
        y2={BAND_AXIS_Y}
        stroke={colors.border}
        strokeWidth={BAND_AXIS_STROKE}
      />
      {/* 琥珀刻度齿（竖向 <line>，同上理由） */}
      {TICK_XS.map((x) => (
        <line
          key={`tick-${x}`}
          x1={x}
          y1={TICK_Y1}
          x2={x}
          y2={TICK_Y2}
          stroke={colors.accent}
          strokeWidth={TICK_STROKE}
        />
      ))}
    </>
  )
}
