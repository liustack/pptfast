import type { SvgTemplateProps } from "../types"
import { sectionNameFor } from "../../../lib/derive"
import { pickEvidence } from "../../component-traits"
import { renderEmphasisTspans } from "../../emphasis"
import { heroCaption, heroValue } from "../minimal-shared"
import { renderFittedEvidence } from "../fitted-evidence"
import { evidenceSource, fitHeroLine, fitSparseHeading, pad2 } from "./shared"

/** campaign 稀排脸：洋红收尾杠、侧幕卡。不画纸屑场。 */

export function statement({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: 1100,
    fontSize: 60,
    maxLines: 2,
    minPt: 32,
    lineHeightRatio: 96 / 60,
    fontFamily: fonts.heading,
    bold: true,
  })
  return (
    <>
      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x={640}
          y={340 + i * heading.lineHeight}
          textAnchor="middle"
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="700"
          fill={colors.text}
          dominantBaseline="alphabetic"
        >
          {renderEmphasisTspans(heading.lineSegs[i] ?? [{ text: line, emphasized: false }], {
            accent: colors.accent,
            baseFill: colors.text,
            fontWeight: "700",
          })}
        </text>
      ))}
      <rect x={576} y={490} width={128} height={6} fill={colors.accent} />
    </>
  )
}

export function statHero({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const section = sectionNameFor(ir.slides, index)
  const fitted = fitHeroLine(heroValue(slide), { maxWidth: 1100, fontSize: 320, fontFamily: fonts.heading, bold: true })
  const caption = heroCaption(slide)
  return (
    <>
      {section && (
        <text
          x={640}
          y={200}
          textAnchor="middle"
          fontFamily={fonts.body}
          fontSize={20}
          fill={colors.muted}
          dominantBaseline="alphabetic"
        >
          {section}
        </text>
      )}
      <text
        x={640}
        y={480}
        textAnchor="middle"
        fontFamily={fonts.heading}
        fontSize={fitted.fontSize}
        fontWeight="700"
        fill={colors.accent}
        dominantBaseline="alphabetic"
      >
        {fitted.text}
      </text>
      {caption && (
        <text
          x={640}
          y={580}
          textAnchor="middle"
          fontFamily={fonts.body}
          fontSize={23}
          fill={colors.muted}
          dominantBaseline="alphabetic"
        >
          {caption}
        </text>
      )}
    </>
  )
}

export function oneEvidence({ slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const evidence = pickEvidence(slide.components)
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: 880,
    fontSize: 42,
    maxLines: 2,
    minPt: 24,
    lineHeightRatio: 1.2,
    fontFamily: fonts.heading,
    bold: false,
  })
  const note = slide.subheading
  const source = evidenceSource(slide)
  return (
    <>
      <rect x={160} y={190} width={960} height={320} fill={colors.surface} stroke={colors.border} strokeWidth={1} />
      <rect x={160} y={502} width={960} height={8} fill={colors.accent} />
      {/* 板上 21px。accent 压 surface 3.78:1，21px 走 4.5:1 会红，24px 走大字 3:1。 */}
      <text x={224} y={292} fontFamily={fonts.body} fontSize={24} fill={colors.accent} dominantBaseline="alphabetic">
        {`实测 · ${pad2(index + 1)}`}
      </text>
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x={224}
          y={368 + i * heading.lineHeight}
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
      {note && (
        <text x={224} y={430} fontFamily={fonts.body} fontSize={21} fill={colors.muted} dominantBaseline="alphabetic">
          {note}
        </text>
      )}
      {source && (
        <text x={224} y={480} fontFamily={fonts.body} fontSize={16} fill={colors.muted} dominantBaseline="alphabetic">
          {source}
        </text>
      )}
      {evidence && renderFittedEvidence(evidence, { x: 600, y: 230, w: 480, h: 250 }, ctx)}
    </>
  )
}
