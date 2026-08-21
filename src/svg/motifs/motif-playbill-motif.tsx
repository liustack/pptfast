import type { DecorProps } from "./types"

/**
 * playbill-motif —— 「右上黑贴片」（2026-08-21，设计源
 * `scratchpad/theme-wave7/Playbill.dc.html`）。
 *
 * 单锚一件，恒位，零随机。板上封面样例把日期写进一块斜 4° 的大黑贴
 * （right:56 top:64，约 x960 起笔），那是封面 layout 件的读法，motif
 * 版取小号、贴片内无字符。位置收进右上带：x≥1150、y8-60，躲开标题区
 * 右沿 x1136。
 *
 * 斜 4° 与板上 CSS `rotate(4deg)` 同向（顺时针）。不用
 * `<rect transform="rotate(...)">`：导出侧 `svg2pptx/dispatch.ts` 明说
 * 旋转不在受控子集内，转角会被当成没转处理。四角算成一条闭合 path，
 * 与 campaign 斜方片同一写法。
 *
 * ## 板上底部 5px 粗收场线不进 motif
 *
 * 封面样例底边一条 5px 硬黑线，落在 y620-664 第五带（`docs/designing-
 * themes.md` 第 5 条：实色粗件禁入）。第五带粗件禁入，这条线不画。
 * heritage 底缘金菱是祖父条款，不是新件先例。
 *
 * ## 密页不降档
 *
 * heavy 主题通常要有密页降档（campaign / crayon / arena）。playbill 的
 * heavy 在字重与满版荧光黄，装饰只有这一枚小贴片（AABB 约 90×38，落在
 * 标题区之上、正文区之外）。密页再挤，贴片也碰不到内容区，加降档机制
 * 是空动作。判据不读文字几何，这里连判据都不设。
 *
 * 四页型同一张，包括 chapter：贴片在 y8-46，chapter 巨幅居中标题的活动
 * 范围从标题区 y48 起，不相交。fashion-masthead 满版 primary 会盖住贴片
 * （motif 画在 layout 之下），那是黑压黑，不是漏画。
 *
 * 安全区：标题区 (96,48,1040×122)、正文区 (96,200,1040×420)、页脚 meta
 * 带 (48,664,1184×44)、右下 logo 盒 (1120,630,96×40)、第五带 y620-664。
 * 贴片 AABB x1151-1241 y8-46，五条都不进。顺带清掉右上 logo 盒
 * (1120,48,96×40)：贴片底沿 y46，盒顶沿 y48。
 *
 * 纪律：零 theme id、零 hex，填色只来自 `ctx.colors.primary`。画笔属性
 * 写在叶子上不挂 `<g>`。本 motif 是 playbill 独占的单成员候选集。
 */

const PATCH_CX = 1196
const PATCH_CY = 27
const PATCH_W = 88
const PATCH_H = 32
/** 顺时针 4°，对齐板上 CSS `rotate(4deg)`。标准矩阵用负角。 */
const PATCH_DEG = -4

const round1 = (v: number) => Math.round(v * 10) / 10

/**
 * 88×32 方片绕中心顺时针 4°，四角算成一条闭合 path。模块加载时算一次，
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

export function PlaybillMotif({ ctx }: DecorProps) {
  return <path d={PLAYBILL_PATCH_D} fill={ctx.colors.primary} />
}
