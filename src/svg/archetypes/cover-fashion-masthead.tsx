import type { SvgTemplateProps } from "./types"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { CONF_LABEL } from "../../lib/conf-labels"
import { readableOn } from "./cover-split-diagonal"

/**
 * fashion-masthead cover archetype（2026-07-10 时尚 runway 专属表达，
 * 纯新写）：**满版 primary 色块 + 超大报头排印**——检索结论（Dazed/NYLON/
 * 大胆现代风）：时尚杂志的视觉冲击力来自排印尺度（极粗字重、极大字号、
 * 大小极端对比）与满版色块。二轮返工（用户裁决「封面不能白底」）：白底
 * 版升级为满版 primary 底（runway 纯黑 → 黑色大片封面），前景经
 * readableOn(primary) 自适应（黑→白字，其他浅 primary 主题借用时同样
 * 安全），满宽 accent 粗色带保持。页面节奏：黑封面→红章节→白内容→黑
 * 结尾，满版-留白交替是杂志语法。
 * 纪律：零 theme id、零 hex（readableOn 中性黑白豁免），颜色全部来自 ctx。
 */
export function FashionMastheadCover({ ir, slide, ctx }: SvgTemplateProps) {
  const org = ir.meta.organization
  const date = ir.meta.date
  const conf = ir.meta.confidentiality
  const confLabel = conf ? CONF_LABEL[conf] : null
  const version = ir.meta.version
  const fg = readableOn(ctx.colors.primary)

  const title = fitHeadingLines(slide.heading, {
    maxWidth: 1168,
    fontSize: 150,
    maxLines: 2,
    minPt: 72,
  })
  const TITLE_Y = 330
  const titleLastY = TITLE_Y + Math.max(0, title.lines.length - 1) * title.lineHeight

  // 满宽粗色带：报头下的「大而鲜艳」元素
  const bandY = titleLastY + 52
  const BAND_H = 20

  const subtitle = layoutSvgText(slide.subheading || "", {
    maxWidth: 1168,
    fontSize: 30,
    maxLines: 2,
    lineHeightRatio: 1.3,
  })
  const subtitleY = bandY + BAND_H + 58

  const metaParts = [org, confLabel, date, version].filter((v): v is string => Boolean(v))
  const metaLine =
    metaParts.length > 0
      ? fitSvgLine(metaParts.join("    ·    "), { maxWidth: 1100, fontSize: 19, minFontSize: 14 })
      : null

  return (
    <>
      {/* 满版 primary 色块（黑色大片封面底） */}
      <rect x={0} y={0} width={1280} height={720} fill={ctx.colors.primary} />

      {/* 顶部刊头信息行：时装刊小字排印（大 letterSpacing） */}
      {org && (
        <text
          x={640}
          y={86}
          fontFamily={ctx.fonts.body}
          fontSize={20}
          fill={fg}
          textAnchor="middle"
          letterSpacing={10}
          fontWeight="600"
          dominantBaseline="alphabetic"
        >
          {org}
        </text>
      )}
      {/* 报头上方规则线（刊头惯例） */}
      <line x1={56} y1={116} x2={1224} y2={116} stroke={fg} strokeWidth={3} />

      {/* 超大报头 */}
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

      {/* 满宽粗色带（accent 正红压黑底） */}
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
          x={640}
          y={668}
          fontFamily={ctx.fonts.body}
          fontSize={metaLine.fontSize}
          fill={fg}
          fillOpacity={0.6}
          textAnchor="middle"
          letterSpacing={3}
          dominantBaseline="alphabetic"
        >
          {metaLine.text}
        </text>
      )}
    </>
  )
}
