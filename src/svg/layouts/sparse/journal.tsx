import type { SvgTemplateProps } from "../types"
import { sectionNameFor } from "../../../lib/derive"
import { renderEmphasisTspans } from "../../emphasis"
import { heroCaption, heroValue, pullQuoteAttribution } from "../minimal-shared"
import { fitHeroLine, fitSparseHeading, pad2 } from "./shared"

/** journal 稀排脸：巨引号、期号巨数、报头格言。不画 motif 报头双线。 */

export function pullQuote({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: 880,
    fontSize: 46,
    maxLines: 2,
    minPt: 26,
    lineHeightRatio: 76 / 46,
    fontFamily: fonts.heading,
    bold: false,
  })
  const attr = pullQuoteAttribution(slide)
  return (
    <>
      <text
        x={150}
        y={300}
        fontFamily={fonts.heading}
        fontSize={200}
        fill={colors.accent}
        opacity={0.9}
        dominantBaseline="alphabetic"
      >
        {"\u201C"}
      </text>
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x={300}
          y={360 + i * heading.lineHeight}
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="400"
          fill={colors.primary}
          dominantBaseline="alphabetic"
        >
          {renderEmphasisTspans(heading.lineSegs[i] ?? [{ text: line, emphasized: false }], {
            accent: colors.accent,
            baseFill: colors.primary,
            fontWeight: "400",
          })}
        </text>
      ))}
      {attr && (
        <text x={300} y={540} fontFamily={fonts.heading} fontSize={19} fill={colors.muted} dominantBaseline="alphabetic">
          {`\u2014\u2014 ${attr}`}
        </text>
      )}
    </>
  )
}

export function statHero({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const section = sectionNameFor(ir.slides, index)
  const kicker = [`№ ${pad2(index + 1)}`, section].filter((v): v is string => Boolean(v && v.trim())).join(" · ")
  const fitted = fitHeroLine(heroValue(slide), { maxWidth: 1100, fontSize: 300, fontFamily: fonts.heading, bold: false })
  const caption = heroCaption(slide)
  return (
    <>
      <text
        x={640}
        y={190}
        textAnchor="middle"
        fontFamily={fonts.heading}
        fontSize={19}
        fill={colors.accent}
        dominantBaseline="alphabetic"
      >
        {kicker}
      </text>
      <text
        x={640}
        y={480}
        textAnchor="middle"
        fontFamily={fonts.heading}
        fontSize={fitted.fontSize}
        fontWeight="400"
        fill={colors.primary}
        dominantBaseline="alphabetic"
      >
        {fitted.text}
      </text>
      <line x1={500} y1={540} x2={780} y2={540} stroke={colors.primary} strokeWidth={1.5} />
      {caption && (
        <text
          x={640}
          y={592}
          textAnchor="middle"
          fontFamily={fonts.heading}
          fontSize={20}
          fill={colors.muted}
          dominantBaseline="alphabetic"
        >
          {caption}
        </text>
      )}
    </>
  )
}

export function statement({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: 1100,
    fontSize: 50,
    maxLines: 1,
    minPt: 28,
    lineHeightRatio: 1.2,
    fontFamily: fonts.heading,
    bold: false,
  })
  return (
    <>
      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated ? "1" : undefined}
          x={640}
          y={350}
          textAnchor="middle"
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="400"
          fill={colors.primary}
          dominantBaseline="alphabetic"
        >
          {renderEmphasisTspans(heading.lineSegs[i] ?? [{ text: line, emphasized: false }], {
            accent: colors.accent,
            baseFill: colors.primary,
            fontWeight: "400",
          })}
        </text>
      ))}
      <rect x={565} y={400} width={150} height={3} fill={colors.accent} />
      <text
        x={640}
        y={470}
        textAnchor="middle"
        fontFamily={fonts.heading}
        fontSize={20}
        fontStyle="italic"
        fill={colors.muted}
        dominantBaseline="alphabetic"
      >
        The Operations Review
      </text>
    </>
  )
}
