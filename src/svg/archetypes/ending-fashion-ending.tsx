import type { SvgTemplateProps } from "./types"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { readableOn } from "../ink"

/**
 * fashion-ending archetype（2026-07-10 时尚 runway 专属表达，纯新写）：
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

  // ending 家族兜底纪律：仅 heading 缺省时兜底（模型填了 heading 时兜底
  // 必然语义重复——2026-07-09 用户裁决先例）。
  const headingText = slide.heading || "谢谢"
  const title = fitHeadingLines(headingText, {
    maxWidth: 1168,
    fontSize: 130,
    maxLines: 2,
    minPt: 64,
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

  const metaParts = [org, date].filter((v): v is string => Boolean(v))
  const metaLine =
    metaParts.length > 0
      ? fitSvgLine(metaParts.join("    ·    "), { maxWidth: 1100, fontSize: 19, minFontSize: 14 })
      : null

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
          fontSize={20}
          fill={fg}
          fillOpacity={0.72}
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
          fillOpacity={0.72}
          letterSpacing={4}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* 底部 meta */}
      {metaLine && (
        <text
          x={56}
          y={668}
          fontFamily={ctx.fonts.body}
          fontSize={metaLine.fontSize}
          fill={fg}
          fillOpacity={0.6}
          letterSpacing={3}
          dominantBaseline="alphabetic"
        >
          {metaLine.text}
        </text>
      )}
    </>
  )
}
