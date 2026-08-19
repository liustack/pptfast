import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { accessibleOpacity, readableOn } from "../ink"

/**
 * fashion-ending layout（2026-07-10 时尚 runway 专属表达，纯新写）：
 * **满版 primary 底 + 超大字收尾**——与 fashion-masthead 封面首尾呼应
 * （黑封面→红章节→白内容→黑结尾的杂志节奏）。超大 900 字重标题 +
 * 满宽 accent 色带 + 大 letterSpacing 排印。前景 readableOn(primary)
 * 自适应。兜底纪律沿 ending 家族先例：heading 缺省才兜底文案。
 * 纪律：零 theme id、零 hex（readableOn 中性黑白豁免），颜色来自 ctx。
 */
export function FashionEnding({ ir, slide, ctx }: SvgTemplateProps) {
  const org = ir.meta.organization
  const date = ir.meta.date
  const fg = readableOn(ctx.colors.primary)
  // 顶部 org 小字与底部 meta 行各自固定叠 0.72 / 0.6 不透明度，混到满版
  // primary 底上就可能跌破正文的 4.5:1——`chapter-fashion-chapter.tsx` 的
  // org 行是同一个缺陷（2026-08-19 暖纸组皮肤重设计落地时先修的那一处），
  // 这里照同一先例走 `accessibleOpacity`：混合后仍达标就保留原不透明度，
  // 否则退回全不透明（`ink.ts` 的同名函数注释）。
  // 17 家钉 fashion-ending 实测：满版 primary 的明度只要落在 readableOn
  // 两墨的交叠带附近，固定值就必然不够——org 行 academic 4.24 / campaign
  // 4.10 / bloom 3.77 / classroom 3.76 / pulse 3.98 / ember 3.44 /
  // vermilion 4.14，meta 行连 terra 3.75 一起共 8 家违例，`deck-audit` 的
  // low-contrast 逐次报出。混合后本就达标的主题（consulting 9.36、
  // runway 10.20 等）逐字节不变。
  const ORG_FONT_SIZE = 20
  const orgOpacity = accessibleOpacity(fg, ctx.colors.primary, ORG_FONT_SIZE, 0.72)

  // ending 家族兜底纪律：仅 heading 缺省时兜底（模型填了 heading 时兜底
  // 必然语义重复——2026-07-09 用户裁决先例）。
  const headingText = slide.heading || "Thank you"
  const title = fitHeadingLines(headingText, {
    maxWidth: 1168,
    fontSize: 130,
    maxLines: 2,
    minPt: 64,
    fontFamily: ctx.fonts.heading,
  })
  const TITLE_Y = 340
  const titleLastY = TITLE_Y + Math.max(0, title.lines.length - 1) * title.lineHeight

  const bandY = titleLastY + 48
  const BAND_H = 14

  const subtitle = layoutSvgText(slide.subheading || "", {
    maxWidth: 1168,
    fontSize: 28,
    maxLines: 2,
    lineHeightRatio: 1.3,
  })
  const subtitleY = bandY + BAND_H + 54
  // 副题同型：固定叠 0.72，但字号是 `layoutSvgText` 缩出来的（28 起），
  // 所以照 meta 位的同一课按实际渲染字号量，不在 28 常量上量——28px 落在
  // 大字号一侧只需 3:1，长副题被缩到 21px 就翻到正文的 4.5:1，量错字号
  // 就等于量错该过的那条线。实测：短副题 17 家全部 28px 保留 0.72（今天
  // 全矩阵逐字节不变），长副题缩到 21px 时 academic 4.24 / campaign 4.10 /
  // bloom 3.77 / classroom 3.76 / pulse 3.98 / ember 3.44 / vermilion 4.14
  // 共 7 家翻线——守卫在爆雷前就位，而不是等长副题进来才补。
  const subtitleOpacity = accessibleOpacity(fg, ctx.colors.primary, subtitle.fontSize, 0.72)

  const metaParts = [org, date].filter((v): v is string => Boolean(v))
  const metaLine =
    metaParts.length > 0
      ? fitSvgLine(metaParts.join("    ·    "), { maxWidth: 1100, fontSize: 19, minFontSize: 14 })
      : null
  // meta 行的字号是 `fitSvgLine` 缩出来的（19 起，最小 14），所以按实际渲
  // 染出的字号量，而不是起始常量——量错字号就等于量错该过的那条线。
  const metaOpacity = metaLine ? accessibleOpacity(fg, ctx.colors.primary, metaLine.fontSize, 0.6) : 1

  return (
    <>
      {/* 满版 primary 底（与封面首尾呼应） */}
      <rect x={0} y={0} width={1280} height={720} fill={ctx.colors.primary} />

      {/* 顶部小字排印 */}
      {org && (
        <text
          x={56}
          y={96}
          fontFamily={ctx.fonts.body}
          fontSize={ORG_FONT_SIZE}
          fill={fg}
          fillOpacity={orgOpacity}
          letterSpacing={8}
          fontWeight="600"
          dominantBaseline="alphabetic"
        >
          {org}
        </text>
      )}

      {/* 超大收尾标题 */}
      {title.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={title.truncated && i === title.lines.length - 1 ? "1" : undefined}
          x={56}
          y={TITLE_Y + i * title.lineHeight}
          fontFamily={ctx.fonts.heading}
          fontSize={title.fontSize}
          fontWeight="900"
          fill={fg}
          letterSpacing={-2}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* 满宽 accent 色带 */}
      <rect x={56} y={bandY} width={1168} height={BAND_H} fill={ctx.colors.accent} />

      {/* 副题 */}
      {subtitle.lines.map((line, i) => (
        <text
          key={i}
          x={56}
          y={subtitleY + i * subtitle.lineHeight}
          fontFamily={ctx.fonts.body}
          fontSize={subtitle.fontSize}
          fill={fg}
          fillOpacity={subtitleOpacity}
          letterSpacing={4}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* 底部 meta */}
      {metaLine && (
        <text
          data-truncated={metaLine.truncated ? "1" : undefined}
          x={56}
          y={668}
          fontFamily={ctx.fonts.body}
          fontSize={metaLine.fontSize}
          fill={fg}
          fillOpacity={metaOpacity}
          letterSpacing={3}
          dominantBaseline="alphabetic"
        >
          {metaLine.text}
        </text>
      )}
    </>
  )
}

// T1d (src domain reorg wave 1): inlined verbatim from registry.ts's former
// ENDING_LAYOUT_DEFS["fashion-ending"] entry. `CHROME` (registry.ts's private
// `readonly string[] = []` alias, "not fed by an authored component") is
// inlined here to the literal `[]` it always held, to avoid a value-import
// cycle with the registry aggregator (which value-imports this export) — see
// registry.ts's slot-`accepts` convention doc for what `[]` means.
export const layoutDef: LayoutDefinition = {
  // ending-fashion-ending.tsx: full-bleed primary block, org kicker (top),
  // giant heading ("Thank you"), accent band rule, subheading, org/date
  // meta line.
  id: "fashion-ending",
  kind: "archetype",
  slideTypes: ["ending"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "rule", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "meta", accepts: [] },
  ],
}
