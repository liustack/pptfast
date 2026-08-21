import type { SvgTemplateProps } from "../types"
import { renderEmphasisTspans } from "../../emphasis"
import { heroCaption, heroSource, heroValue, pullQuoteAttribution } from "../minimal-shared"
import { fitHeroLine, fitSparseHeading, yearQuarter } from "./shared"

/** insight 稀排脸：行情格言、幽灵季度、折线引文。不画顶缘刻度尺和底缘面积线。 */

export function statement({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: 1088,
    fontSize: 52,
    maxLines: 1,
    minPt: 28,
    lineHeightRatio: 1.2,
    fontFamily: fonts.heading,
    bold: false,
  })
  const verse = heading.lines[0] ?? ""
  const session = yearQuarter(ir.meta.date)
  return (
    <>
      <text
        x={96}
        y={380}
        fontFamily={fonts.heading}
        fontSize={heading.fontSize}
        fontWeight="400"
        fill={colors.accent}
        dominantBaseline="alphabetic"
      >
        <tspan fill={colors.muted}>{">"}</tspan>
        <tspan dx={24} fill={colors.accent}>
          {verse}
        </tspan>
      </text>
      <rect x={96} y={420} width={26} height={6} fill={colors.accent} />
      <line x1={96} y1={620} x2={1184} y2={620} stroke={colors.border} strokeWidth={1} />
      {session && (
        <text x={96} y={662} fontFamily={fonts.mono} fontSize={16} fill={colors.muted} dominantBaseline="alphabetic">
          {`SESSION ${session.year}-${session.quarter} · LIVE`}
        </text>
      )}
    </>
  )
}

export function statHero({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const quarter = yearQuarter(ir.meta.date)
  const fitted = fitHeroLine(heroValue(slide), { maxWidth: 1100, fontSize: 290, fontFamily: fonts.heading, bold: false })
  const caption = heroCaption(slide)
  const source = heroSource(slide)
  return (
    <>
      {quarter && (
        <text
          x={1180}
          y={560}
          textAnchor="end"
          fontFamily={fonts.heading}
          fontSize={430}
          fontWeight="400"
          fill={colors.surface}
          dominantBaseline="alphabetic"
        >
          {quarter.quarter}
        </text>
      )}
      <text
        x={96}
        y={470}
        fontFamily={fonts.heading}
        fontSize={fitted.fontSize}
        fontWeight="400"
        fill={colors.accent}
        dominantBaseline="alphabetic"
      >
        {fitted.text}
      </text>
      {caption && (
        <text x={96} y={560} fontFamily={fonts.body} fontSize={24} fill={colors.muted} dominantBaseline="alphabetic">
          {caption}
        </text>
      )}
      {source && (
        <text x={96} y={602} fontFamily={fonts.mono} fontSize={16} fill={colors.muted} dominantBaseline="alphabetic">
          {source}
        </text>
      )}
    </>
  )
}

export function pullQuote({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: 1000,
    fontSize: 46,
    maxLines: 2,
    minPt: 28,
    lineHeightRatio: 1.32,
    fontFamily: fonts.heading,
    bold: false,
  })
  const attr = pullQuoteAttribution(slide)
  return (
    <>
      <polyline
        points="96,150 240,142 390,158 540,138 700,150 860,132 1010,144 1184,128"
        fill="none"
        stroke={colors.border}
        strokeWidth={2}
      />
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x={640}
          y={370 + i * heading.lineHeight}
          textAnchor="middle"
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="400"
          fill={colors.text}
          dominantBaseline="alphabetic"
        >
          {renderEmphasisTspans(heading.lineSegs[i] ?? [{ text: line, emphasized: false }], {
            accent: colors.accent,
            baseFill: colors.text,
            fontWeight: "400",
          })}
        </text>
      ))}
      {attr && (
        <text
          x={640}
          y={470}
          textAnchor="middle"
          fontFamily={fonts.heading}
          fontSize={18}
          fill={colors.accent}
          dominantBaseline="alphabetic"
        >
          {attr}
        </text>
      )}
    </>
  )
}
