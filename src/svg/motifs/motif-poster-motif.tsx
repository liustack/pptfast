import type { DecorProps } from "./types"

/**
 * poster-motif —— insight 的「行情语汇」（2026-08-19 深底组皮肤重设计，
 * 设计源 `.issues/2026-08-18-theme-redesign/skins/group1-dark-boards.dc.html`
 * 的 insight 设计表，几何坐标逐条抄录，不派生）。
 *
 * 换掉的东西：v2 只剩 cover 左下/右下一枚同心光点（三档 seed 变体），那是
 * 「深底 + 左竖条 + 左上标题」时期的残留签名——一枚点既撑不起主题识别，也
 * 与 insight 的财经语域没有关系。covers-review 把深底三家共用一张脸记成本轮
 * 的反面基线，insight 的处方是把装饰整个换成行情屏的语汇：
 *
 *   - **顶缘行情带**（四种页型都画）：y28 / y42 两条横贯细线（border 色，
 *     2px / 1px），线上五枚琥珀刻度齿（x128/368/608/848/1088，y24-32）。
 *     行情屏顶部的刻度尺，也是这套语言里唯一「有节奏」的元素。
 *   - **基线面积线**（四种页型都画）：页面下缘一道行情走线 + 12% 琥珀
 *     面积填充，左起 x48。
 *   - **幽灵季度水印**（仅 cover）：430px 的季度字样压在版心，5% 琥珀——
 *     大到不像字、淡到不参与判读的一层底纹。字样从 `ir.meta.date` 推，
 *     推不出就整块不画（见 `quarterLabel`）。
 *
 * 安全区：四个内容区是标题区 (96,48,1040×122)、正文区 (96,200,1040×420)、
 * 页脚 meta 带 (48,664,1184×44)、右下 logo 盒 (1120,630,96×40)。
 *   - 行情带 y24-42 全程在标题区上沿 y48 之上。
 *   - 基线面积线右端**在 x1100 收笔**（主会话裁定，设计稿原稿画到 x1232）：
 *     原稿右端会从 logo 盒 (1120,630,96×40) 正中穿过去，x1100 让出 20px。
 *     `motif-poster-motif.test.tsx` 锁死这条线——把右端改回 1232 测试立刻红。
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

// ── 顶缘行情带（设计稿坐标，逐条抄录） ──────────────────────────────────
const BAND_X1 = 48
const BAND_X2 = 1232
const BAND_LINE_Y_TOP = 28
const BAND_LINE_Y_BOTTOM = 42
const BAND_STROKE_TOP = 2
const BAND_STROKE_BOTTOM = 1
/** 刻度齿：等距五枚，跨在 y28 那条线上（y24-32）。 */
const TICK_XS = [128, 368, 608, 848, 1088]
const TICK_Y1 = 24
const TICK_Y2 = 32
const TICK_STROKE = 2

// ── 基线面积线 ──────────────────────────────────────────────────────────
/**
 * 走线折点（设计稿逐点抄录）。右端**止于 x1100**：设计稿原稿的最后两点
 * (1170,590) 与 (1232,596) 会让走线从 logo 盒 (1120,630,96×40) 上方穿过并
 * 一路画到页缘，主会话裁定提前收笔。收笔点 x1100 距 logo 盒左缘 x1120
 * 留 20px。
 */
const BASELINE_POINTS: readonly (readonly [number, number])[] = [
  [48, 642], [120, 646], [190, 634], [260, 640], [330, 622], [400, 632],
  [470, 618], [540, 626], [610, 608], [680, 618], [750, 604], [820, 612],
  [890, 598], [960, 608], [1030, 594], [1100, 602],
]
/** 面积填充的下缘（走线与它之间填 12% 琥珀）。 */
const BASELINE_FLOOR = 656
const BASELINE_STROKE = 2
const BASELINE_LINE_OPACITY = 0.8
const BASELINE_FILL_OPACITY = 0.12

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

const areaPath = (points: readonly (readonly [number, number])[]): string => {
  const first = points[0]
  const last = points[points.length - 1]
  const mid = points.map(([x, y]) => `L ${x} ${y}`).join(" ")
  return `M ${first[0]} ${BASELINE_FLOOR} ${mid} L ${last[0]} ${BASELINE_FLOOR} Z`
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

      {/* 顶缘行情带：双细线。用 <line> 不用 <path>——纯水平 <path> 会被
          svg2pptx 转成包围盒零高度的 custGeom，package-audit 的
          invalid-shape-transform 硬门拒收（luxe-motif 建这道门时的实测缺陷）。 */}
      <line
        x1={BAND_X1}
        y1={BAND_LINE_Y_TOP}
        x2={BAND_X2}
        y2={BAND_LINE_Y_TOP}
        stroke={colors.border}
        strokeWidth={BAND_STROKE_TOP}
      />
      <line
        x1={BAND_X1}
        y1={BAND_LINE_Y_BOTTOM}
        x2={BAND_X2}
        y2={BAND_LINE_Y_BOTTOM}
        stroke={colors.border}
        strokeWidth={BAND_STROKE_BOTTOM}
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

      {/* 基线面积线：12% 填充 + 80% 走线 */}
      <path d={areaPath(BASELINE_POINTS)} fill={colors.accent} opacity={BASELINE_FILL_OPACITY} />
      <polyline
        points={BASELINE_POINTS.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke={colors.accent}
        strokeWidth={BASELINE_STROKE}
        opacity={BASELINE_LINE_OPACITY}
      />
    </>
  )
}
