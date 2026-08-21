import type { SvgTemplateProps } from "../types"
import { renderEmphasisTspans } from "../../emphasis"
import { hasCjk, heroCaption, heroValue, pullQuoteAttribution, trackingPx } from "../minimal-shared"
import { fitHeroLine, fitSparseHeading, rotateRectPolygon } from "./shared"

/** luxe 稀排脸：金菱引文、发丝巨数、一行金字。不画金框。 */

const DIAMOND = rotateRectPolygon(640, 180, 14, 14, 45)

export function pullQuote({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: 1000,
    fontSize: 48,
    maxLines: 2,
    minPt: 28,
    lineHeightRatio: 80 / 48,
    fontFamily: fonts.heading,
    bold: false,
  })
  const attr = pullQuoteAttribution(slide)
  const attrTracking = attr && !hasCjk(attr) ? trackingPx(17, 0.35) : undefined
  return (
    <>
      <polygon points={DIAMOND} fill={colors.accent} />
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x={640}
          y={340 + i * heading.lineHeight}
          textAnchor="middle"
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="400"
          fill={colors.accent}
          dominantBaseline="alphabetic"
        >
          {renderEmphasisTspans(heading.lineSegs[i] ?? [{ text: line, emphasized: false }], {
            accent: colors.accent,
            baseFill: colors.accent,
            fontWeight: "400",
          })}
        </text>
      ))}
      {attr && (
        <text
          x={640}
          y={560}
          textAnchor="middle"
          fontFamily={fonts.body}
          fontSize={17}
          fill={colors.muted}
          letterSpacing={attrTracking}
          dominantBaseline="alphabetic"
        >
          {attr}
        </text>
      )}
    </>
  )
}

export function statHero({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const fitted = fitHeroLine(heroValue(slide), { maxWidth: 1100, fontSize: 270, fontFamily: fonts.heading, bold: false })
  const caption = heroCaption(slide)
  return (
    <>
      <line x1={360} y1={200} x2={920} y2={200} stroke={colors.border} strokeWidth={1} />
      <text
        x={640}
        y={470}
        textAnchor="middle"
        fontFamily={fonts.heading}
        fontSize={fitted.fontSize}
        fontWeight="400"
        fill={colors.accent}
        dominantBaseline="alphabetic"
      >
        {fitted.text}
      </text>
      <line x1={360} y1={524} x2={920} y2={524} stroke={colors.border} strokeWidth={1} />
      {caption && (
        <text x={640} y={580} textAnchor="middle" fontFamily={fonts.body} fontSize={19} fill={colors.muted} dominantBaseline="alphabetic">
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
          x={640}
          y={380}
          textAnchor="middle"
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="400"
          fill={colors.accent}
          dominantBaseline="alphabetic"
        >
          {renderEmphasisTspans(heading.lineSegs[i] ?? [{ text: line, emphasized: false }], {
            accent: colors.accent,
            baseFill: colors.accent,
            fontWeight: "400",
          })}
        </text>
      ))}
    </>
  )
}
