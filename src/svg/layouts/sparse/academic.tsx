import type { SvgTemplateProps } from "../types"
import { sectionNameFor } from "../../../lib/derive"
import { renderEmphasisTspans } from "../../emphasis"
import { heroCaption, heroSource, heroValue, pullQuoteAttribution } from "../minimal-shared"
import { fitHeroLine, fitSparseHeading, splitTrailingPercent } from "./shared"

/** academic 稀排脸：脚注引文、百分号巨数、命题格言。不画点轨和角标。 */

export function pullQuote({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: 1000,
    fontSize: 46,
    maxLines: 2,
    minPt: 26,
    lineHeightRatio: 76 / 46,
    fontFamily: fonts.heading,
    bold: false,
  })
  const attr = pullQuoteAttribution(slide)
  const last = heading.lines.length - 1
  return (
    <>
      <rect x={96} y={240} width={6} height={220} fill={colors.primary} />
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x={160}
          y={330 + i * heading.lineHeight}
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
          {attr && i === last && (
            <tspan fontSize={24} fill={colors.accent} dy={-18}>
              [1]
            </tspan>
          )}
        </text>
      ))}
      {attr && (
        <text x={160} y={540} fontFamily={fonts.heading} fontSize={18} fill={colors.muted} dominantBaseline="alphabetic">
          {`[1] ${attr}`}
        </text>
      )}
    </>
  )
}

export function statHero({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const { body, percent } = splitTrailingPercent(heroValue(slide))
  const fitted = fitHeroLine(body, { maxWidth: 1100, fontSize: 300, fontFamily: fonts.heading, bold: false })
  const caption = heroCaption(slide)
  const source = heroSource(slide)
  return (
    <>
      <text
        x={640}
        y={392}
        textAnchor="middle"
        fontFamily={fonts.heading}
        fontSize={fitted.fontSize}
        fontWeight="400"
        fill={colors.primary}
        dominantBaseline="alphabetic"
      >
        {fitted.text}
        {percent && <tspan fontSize={Math.round(fitted.fontSize * (190 / 300))}>%</tspan>}
      </text>
      <line x1={470} y1={448} x2={810} y2={448} stroke={colors.accent} strokeWidth={1.5} />
      {caption && (
        <text
          x={640}
          y={508}
          textAnchor="middle"
          fontFamily={fonts.body}
          fontSize={23}
          fill={colors.text}
          dominantBaseline="alphabetic"
        >
          {caption}
        </text>
      )}
      {source && (
        <text
          x={640}
          y={548}
          textAnchor="middle"
          fontFamily={fonts.body}
          fontSize={17}
          fill={colors.muted}
          dominantBaseline="alphabetic"
        >
          {source}
        </text>
      )}
    </>
  )
}

export function statement({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const section = sectionNameFor(ir.slides, index)
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: 1100,
    fontSize: 48,
    maxLines: 1,
    minPt: 28,
    lineHeightRatio: 1.2,
    fontFamily: fonts.heading,
    bold: false,
  })
  return (
    <>
      {section && (
        <text
          x={640}
          y={200}
          textAnchor="middle"
          fontFamily={fonts.heading}
          fontSize={18}
          fill={colors.primary}
          dominantBaseline="alphabetic"
        >
          {section}
        </text>
      )}
      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated ? "1" : undefined}
          x={640}
          y={360}
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
      <circle cx={616} cy={430} r={3} fill={colors.accent} />
      <circle cx={640} cy={430} r={3} fill={colors.accent} />
      <circle cx={664} cy={430} r={3} fill={colors.accent} />
      <text
        x={640}
        y={500}
        textAnchor="middle"
        fontFamily={fonts.heading}
        fontSize={19}
        fontStyle="italic"
        fill={colors.muted}
        dominantBaseline="alphabetic"
      >
        证明见后三页。
      </text>
    </>
  )
}
