import type { SvgTemplateProps } from "../types"
import type { EmphasisSegment } from "../../emphasis"
import { renderEmphasisTspans } from "../../emphasis"
import { hasCjk, heroCaption, heroValue, pullQuoteAttribution } from "../minimal-shared"
import { fitHeroLine, fitSparseHeading } from "./shared"

/** ink 稀排脸：竖排格言、验印巨数、侧标引文。不画右缘落款列。 */

function VerticalRun({
  segments,
  x,
  y,
  size,
  baseFill,
  accent,
  fontFamily,
}: {
  segments: EmphasisSegment[]
  x: number
  y: number
  size: number
  baseFill: string
  accent: string
  fontFamily: string
}) {
  let i = 0
  return segments.flatMap((seg) =>
    Array.from(seg.text).flatMap((ch) => {
      if (/[，。；、]/.test(ch)) return []
      const el = (
        <text
          key={`${x}-${i}`}
          x={x}
          y={y + i * size}
          textAnchor="middle"
          fontFamily={fontFamily}
          fontSize={size}
          fill={seg.emphasized ? accent : baseFill}
          dominantBaseline="alphabetic"
        >
          {ch}
        </text>
      )
      i += 1
      return [el]
    }),
  )
}

export function statement({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const source = slide.heading ?? ""
  const latin = !hasCjk(source)
  if (latin) {
    const heading = fitSparseHeading(source, {
      maxWidth: 1000,
      fontSize: 52,
      maxLines: 2,
      minPt: 28,
      lineHeightRatio: 1.25,
      fontFamily: fonts.heading,
      bold: false,
    })
    return (
      <>
        <rect x={1042} y={110} width={18} height={66} fill={colors.accent} />
        {heading.lines.map((line, i) => (
          <text
            key={i}
            x={640}
            y={380 + i * heading.lineHeight}
            textAnchor="middle"
            fontFamily={fonts.heading}
            fontSize={heading.fontSize}
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
        <rect x={163} y={600} width={34} height={34} fill="none" stroke={colors.accent} strokeWidth={2} />
      </>
    )
  }

  const heading = fitSparseHeading(source, {
    maxWidth: 52 * 10,
    fontSize: 52,
    maxLines: 2,
    minPt: 52,
    lineHeightRatio: 1,
    fontFamily: fonts.heading,
    bold: false,
  })
  const columns = heading.lines.slice(0, 2)
  const xs = [1000, 880]
  const org = ir.meta.organization?.trim()
  return (
    <>
      <rect x={1042} y={110} width={18} height={66} fill={colors.accent} />
      {columns.map((line, col) => (
        <g key={col}>
          <VerticalRun
            segments={heading.lineSegs[col] ?? [{ text: line, emphasized: false }]}
            x={xs[col]}
            y={150}
            size={heading.fontSize}
            baseFill={colors.primary}
            accent={colors.accent}
            fontFamily={fonts.heading}
          />
        </g>
      ))}
      {org && (
        <VerticalRun
          segments={[{ text: org, emphasized: false }]}
          x={180}
          y={440}
          size={20}
          baseFill={colors.muted}
          accent={colors.accent}
          fontFamily={fonts.heading}
        />
      )}
      <rect x={163} y={600} width={34} height={34} fill="none" stroke={colors.accent} strokeWidth={2} />
    </>
  )
}

export function statHero({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const fitted = fitHeroLine(heroValue(slide), { maxWidth: 1080, fontSize: 300, fontFamily: fonts.heading, bold: false })
  const caption = heroCaption(slide)
  return (
    <>
      <text
        x={140}
        y={480}
        fontFamily={fonts.heading}
        fontSize={fitted.fontSize}
        fontWeight="400"
        fill={colors.primary}
        dominantBaseline="alphabetic"
      >
        {fitted.text}
      </text>
      <rect x={700} y={392} width={56} height={56} fill={colors.accent} />
      <text
        x={728}
        y={430}
        textAnchor="middle"
        fontFamily={fonts.heading}
        fontSize={24}
        fill={colors.bg}
        dominantBaseline="alphabetic"
      >
        验
      </text>
      {caption && (
        <text x={140} y={570} fontFamily={fonts.body} fontSize={22} fill={colors.muted} dominantBaseline="alphabetic">
          {caption}
        </text>
      )}
    </>
  )
}

export function pullQuote({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: 960,
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
      <rect x={150} y={270} width={4} height={160} fill={colors.accent} />
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x={200}
          y={330 + i * heading.lineHeight}
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
        <text x={200} y={530} fontFamily={fonts.body} fontSize={19} fill={colors.muted} dominantBaseline="alphabetic">
          {attr}
        </text>
      )}
    </>
  )
}
