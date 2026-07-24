import type { DecorProps } from "./types"
import { cachedDeckSeed, pickBySeed } from "../variety"

/**
 * luxe-motif archetype（2026-07-10 motif 全覆盖补齐）：奢侈品包装的烫金
 * 细线语言——细金线角饰/金点/细分隔线组，深炭底上克制的金色细节。
 * 构图变体：a=右上双细线角+左下金点、b=顶部细线横贯+双端金点、c=四角
 * 细短线。强档（仅 cover）全量，弱档（content/ending）单元素。
 * chapter 完全退让（2026-07-11 用户截图实锤：variant b 顶部金线穿过
 * poster-chapter 右上 org 文字）——memphis 先例：chapter 自带 org + 上下
 * divider + 巨号数字，没有装饰空间。
 * 纪律：零 theme id、零 hex，颜色来自 ctx（primary=香槟金）。
 */
export function LuxeMotif({ ir, slide, ctx }: DecorProps) {
  const gold = ctx.colors.primary
  if (slide.type === "chapter") return null
  const strong = slide.type === "cover"
  const variant = pickBySeed(cachedDeckSeed(ir), "luxe-decor", ["a", "b", "c"] as const)

  if (!strong) {
    // 弱档：右上一段细金线
    // 用 <line>，不用纯水平的 <path>——svg2pptx 把 <path>（哪怕只走一根轴）
    // 转成 custGeom 形状，包围盒零高度会被 package-audit 硬门的
    // invalid-shape-transform 规则拒收（建这道门时发现的真实缺陷，
    // package-audit 波任务 1，spec §4.4）。真正的 <line> 走
    // svg2pptx/line.ts 的 prstGeom="line"，该规则明确允许其中一轴为零。
    return <line x1={1160} y1={48} x2={1232} y2={48} stroke={gold} strokeWidth={1.2} opacity={0.65} />
  }

  if (variant === "b") {
    return (
      <>
        {/* 顶部细金线横贯 + 双端金点——<line>，理由同上方弱档分支注释 */}
        <line x1={96} y1={44} x2={1184} y2={44} stroke={gold} strokeWidth={1} opacity={0.5} />
        <circle cx={96} cy={44} r={3.5} fill={gold} />
        <circle cx={1184} cy={44} r={3.5} fill={gold} />
      </>
    )
  }
  if (variant === "c") {
    return (
      <>
        {/* 四角细短线（内缩烫金框角） */}
        <path d="M 56 72 H 128 M 56 72 V 144" stroke={gold} strokeWidth={1.2} fill="none" opacity={0.6} />
        <path d="M 1224 72 H 1152 M 1224 72 V 144" stroke={gold} strokeWidth={1.2} fill="none" opacity={0.6} />
        <path d="M 56 648 H 128 M 56 648 V 576" stroke={gold} strokeWidth={1.2} fill="none" opacity={0.6} />
        <path d="M 1224 648 H 1152 M 1224 648 V 576" stroke={gold} strokeWidth={1.2} fill="none" opacity={0.6} />
      </>
    )
  }
  // a：右上双细线角 + 左下金点组
  return (
    <>
      <path d="M 1224 56 H 1080 M 1224 56 V 200" stroke={gold} strokeWidth={1.2} fill="none" opacity={0.6} />
      <path d="M 1208 72 H 1096 M 1208 72 V 184" stroke={gold} strokeWidth={0.8} fill="none" opacity={0.35} />
      <circle cx={64} cy={648} r={3.5} fill={gold} />
      <circle cx={82} cy={648} r={2.2} fill={gold} opacity={0.6} />
      <circle cx={97} cy={648} r={1.4} fill={gold} opacity={0.35} />
    </>
  )
}
