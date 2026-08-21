import { fitSvgLine } from "@/lib/svg-text-layout"
import type { DecorProps } from "./types"

/**
 * playbill-motif —— 「右上日期贴片」（2026-08-22 用户终审还原，设计源
 * `scratchpad/theme-wave7/Playbill.dc.html` 的封面样例贴片）。
 *
 * 第一版落地时贴片被剥掉了字（「motif 不许携带内容」被执行成了空黑块），
 * 空块触犯「反对为装饰而装饰」被裁撤。用户终审推翻裁撤：板上那块**带日期
 * 的**斜贴片是设计的一部分，要求还原。合法性走 journal 期号先例
 * （`motif-corner-ornament-motif.tsx`：期号从 `ir.meta.date` 推）——
 * `meta.date` 是 IR 结构字段，不是渲染后文字几何，motif 读它不破确定性
 * 红线。规则因此是：
 *
 *   - `ir.meta.date` 有真值：画贴片，日期字排进贴片（`fitSvgLine` 缩字
 *     适配，贴片几何恒位不随文字变）
 *   - 没有：整片不画。**空黑块在任何情况下都不再出现**
 *   - 与密级/日期缺省隐藏（2026-08-22 `showsDocumentMeta`）的关系：
 *     motif 的日期衍生件按该案任务书豁免（journal 期号、ink 年月同批），
 *     贴片不看 `ir.chrome`
 *
 * 几何：150×34 方片绕 (1136, 25) 顺时针 4°（对齐板上 CSS `rotate(4deg)`）。
 * 方片四角在模块加载时算成一条闭合 path——导出侧 `svg2pptx/dispatch.ts`
 * 对 `<rect transform>` 的旋转不在受控子集内，path 不受此限。贴片内的
 * 日期字用 `<text transform="rotate(4 …)">`：文本旋转导出路径已在图表
 * 竖排标题波落地（`svg2pptx/text.ts` 的 `rotate` 字段），4° 在支持面内。
 *
 * AABB 约 x1059-1213、y5-45：在标题区 (96,48,1040×122) 上方、右上
 * logo 盒 (1120,48,96×40) 顶沿之上、五个保护区全不进。四页型同一张；
 * fashion-masthead 满版 primary 盖住贴片是黑压黑，不是漏画。
 *
 * 密页不降档：装饰只有这一枚顶带贴片，碰不到内容区，判据都不设
 * （第一版的论证原样成立）。
 *
 * 纪律：零 theme id、零 hex。贴片填 `ctx.colors.primary`，日期字填
 * `ctx.colors.bg`（板上「黑贴反出黄字」的 token 化读法）。画笔属性写在
 * 叶子上不挂 `<g>`。本 motif 是 playbill 独占的单成员候选集。
 */

const PATCH_CX = 1136
const PATCH_CY = 25
const PATCH_W = 150
const PATCH_H = 34
/** 顺时针 4°，对齐板上 CSS `rotate(4deg)`。手算矩阵用负角（y 向下）。 */
const PATCH_DEG = -4

/** 日期字的排版预算：贴片内宽留 16px 内边距，字号 20 起缩到 13。 */
const DATE_MAX_WIDTH = PATCH_W - 32
const DATE_FONT_SIZE = 20
const DATE_MIN_FONT_SIZE = 13

const round1 = (v: number) => Math.round(v * 10) / 10

/**
 * 150×34 方片绕中心顺时针 4°，四角算成一条闭合 path。模块加载时算一次，
 * 输入零随机，两次渲染逐字节同。
 */
function patchPath(cx: number, cy: number, deg: number): string {
  const a = (deg * Math.PI) / 180
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  const hw = PATCH_W / 2
  const hh = PATCH_H / 2
  const corners: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ]
  const pts = corners.map(([lx, ly]) => `${round1(cx + lx * ca - ly * sa)} ${round1(cy + lx * sa + ly * ca)}`)
  return `M ${pts[0]} L ${pts[1]} L ${pts[2]} L ${pts[3]} Z`
}

export const PLAYBILL_PATCH_D = patchPath(PATCH_CX, PATCH_CY, PATCH_DEG)

export function PlaybillMotif({ ir, ctx }: DecorProps) {
  const date = ir.meta.date
  if (!date) return null
  const fitted = fitSvgLine(date, {
    maxWidth: DATE_MAX_WIDTH,
    fontSize: DATE_FONT_SIZE,
    minFontSize: DATE_MIN_FONT_SIZE,
    bold: true,
  })
  return (
    <>
      <path d={PLAYBILL_PATCH_D} fill={ctx.colors.primary} />
      <text
        x={PATCH_CX}
        y={PATCH_CY + fitted.fontSize * 0.35}
        transform={`rotate(4 ${PATCH_CX} ${PATCH_CY})`}
        fontFamily={ctx.fonts.heading}
        fontSize={fitted.fontSize}
        fontWeight={700}
        fill={ctx.colors.bg}
        textAnchor="middle"
        dominantBaseline="alphabetic"
      >
        {fitted.text}
      </text>
    </>
  )
}
