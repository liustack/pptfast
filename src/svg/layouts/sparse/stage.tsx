import type { SvgTemplateProps } from "../types"
import { sectionNameFor } from "../../../lib/derive"
import { renderEmphasisTspans } from "../../emphasis"
import { fitSvgLine } from "../../../lib/svg-text-layout"
import { hasCjk, heroCaption, heroValue, pullQuoteAttribution, statementAttribution } from "../minimal-shared"
import { fitHeroLine, fitSparseHeading, splitTrailingPercent } from "./shared"

/** stage 稀排脸：居中细字、巨数、双发丝引文。 */

export function statement({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: 920,
    fontSize: 64,
    maxLines: 2,
    minPt: 36,
    lineHeightRatio: 90 / 64,
    fontFamily: fonts.heading,
    bold: false,
  })
  const attr = statementAttribution(slide)
  return (
    <>
      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x={640}
          y={330 + i * heading.lineHeight}
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
      <line x1={616} y1={484} x2={664} y2={484} stroke={colors.border} strokeWidth={2} />
      {attr && (
        <text
          x={640}
          y={540}
          textAnchor="middle"
          fontFamily={fonts.body}
          fontSize={20}
          fill={colors.muted}
          dominantBaseline="alphabetic"
        >
          {attr}
        </text>
      )}
    </>
  )
}

export function statHero({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const section = sectionNameFor(ir.slides, index)
  const tracking = section && !hasCjk(section) ? 14 : undefined
  const kicker = section
    ? fitSvgLine(section, { maxWidth: 920, fontSize: 20, minFontSize: 14, letterSpacing: tracking, fontFamily: fonts.body })
    : null
  const { body, percent } = splitTrailingPercent(heroValue(slide))
  const fitted = fitHeroLine(body, { maxWidth: 1100, fontSize: 300, fontFamily: fonts.heading, bold: false })
  const caption = heroCaption(slide)
  return (
    <>
      {kicker && (
        <text
          x={640}
          y={196}
          textAnchor="middle"
          fontFamily={fonts.body}
          fontSize={kicker.fontSize}
          fill={colors.muted}
          letterSpacing={tracking}
          dominantBaseline="alphabetic"
        >
          {kicker.text}
        </text>
      )}
      <text
        x={640}
        y={480}
        textAnchor="middle"
        fontFamily={fonts.heading}
        fontSize={fitted.fontSize}
        fontWeight="400"
        fill={colors.text}
        dominantBaseline="alphabetic"
      >
        {fitted.text}
        {percent && (
          <tspan fontSize={Math.round(fitted.fontSize * 0.5)} fill={colors.accent}>
            %
          </tspan>
        )}
      </text>
      {caption && (
        <text
          x={640}
          y={580}
          textAnchor="middle"
          fontFamily={fonts.body}
          fontSize={22}
          fill={colors.muted}
          dominantBaseline="alphabetic"
        >
          {caption}
        </text>
      )}
    </>
  )
}

export function pullQuote({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: 800,
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
      <line x1={240} y1={230} x2={1040} y2={230} stroke={colors.border} strokeWidth={1.5} />
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x={640}
          y={360 + i * heading.lineHeight}
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
      <line x1={240} y1={420} x2={1040} y2={420} stroke={colors.border} strokeWidth={1.5} />
      {attr && (
        <text
          x={1040}
          y={474}
          textAnchor="end"
          fontFamily={fonts.body}
          fontSize={20}
          fill={colors.muted}
          dominantBaseline="alphabetic"
        >
          {attr}
        </text>
      )}
    </>
  )
}
