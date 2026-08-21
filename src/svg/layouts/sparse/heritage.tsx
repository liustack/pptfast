import type { SvgTemplateProps } from "../types"
import { renderEmphasisTspans } from "../../emphasis"
import { heroCaption, heroValue, pullQuoteAttribution } from "../minimal-shared"
import { fitHeroLine, fitSparseHeading } from "./shared"

/** heritage 稀排脸：文武线引文、L 角花格言、夹心巨数。不画 motif 顶缘双线和顶角金菱。 */

function InkDouble({
  x,
  width,
  yThick,
  yThin,
  stroke,
}: {
  x: number
  width: number
  yThick: number
  yThin: number
  stroke: string
}) {
  return (
    <>
      <line x1={x} y1={yThick} x2={x + width} y2={yThick} stroke={stroke} strokeWidth={2} />
      <line x1={x} y1={yThin} x2={x + width} y2={yThin} stroke={stroke} strokeWidth={1} />
    </>
  )
}

export function pullQuote({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: 1000,
    fontSize: 48,
    maxLines: 2,
    minPt: 28,
    lineHeightRatio: 1.28,
    fontFamily: fonts.heading,
    bold: false,
  })
  const attr = pullQuoteAttribution(slide)
  return (
    <>
      <InkDouble x={96} width={1088} yThick={80} yThin={88} stroke={colors.primary} />
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x={640}
          y={340 + i * heading.lineHeight}
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
      <rect x={568} y={392} width={144} height={3} fill={colors.accent} />
      {attr && (
        <text
          x={640}
          y={470}
          textAnchor="middle"
          fontFamily={fonts.heading}
          fontSize={19}
          fill={colors.muted}
          dominantBaseline="alphabetic"
        >
          {attr}
        </text>
      )}
    </>
  )
}

export function statement({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: 1088,
    fontSize: 56,
    maxLines: 2,
    minPt: 32,
    lineHeightRatio: 90 / 56,
    fontFamily: fonts.heading,
    bold: false,
  })
  return (
    <>
      <path d="M 96 120 l 40 0 M 96 120 l 0 40" fill="none" stroke={colors.accent} strokeWidth={2} />
      <path d="M 1184 600 l -40 0 M 1184 600 l 0 -40" fill="none" stroke={colors.accent} strokeWidth={2} />
      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x={96}
          y={350 + i * heading.lineHeight}
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
    </>
  )
}

export function statHero({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const fitted = fitHeroLine(heroValue(slide), { maxWidth: 800, fontSize: 280, fontFamily: fonts.heading, bold: false })
  const caption = heroCaption(slide)
  return (
    <>
      <InkDouble x={240} width={800} yThick={180} yThin={186} stroke={colors.primary} />
      <text
        x={640}
        y={470}
        textAnchor="middle"
        fontFamily={fonts.heading}
        fontSize={fitted.fontSize}
        fontWeight="400"
        fill={colors.primary}
        dominantBaseline="alphabetic"
      >
        {fitted.text}
      </text>
      <InkDouble x={240} width={800} yThick={534} yThin={530} stroke={colors.primary} />
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
