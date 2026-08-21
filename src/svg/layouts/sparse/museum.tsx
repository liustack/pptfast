import type { SvgTemplateProps } from "../types"
import { sectionNameFor } from "../../../lib/derive"
import { pickEvidence } from "../../component-traits"
import { renderEmphasisTspans } from "../../emphasis"
import { heroCaption, heroValue } from "../minimal-shared"
import { renderFittedEvidence } from "../fitted-evidence"
import { evidenceSource, fitHeroLine, fitSparseHeading, pad2 } from "./shared"

/** museum 稀排脸：展签格言、衬板单证据、铜金巨数。 */

export function statement({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const section = sectionNameFor(ir.slides, index)
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: 1000,
    fontSize: 56,
    maxLines: 2,
    minPt: 32,
    lineHeightRatio: 86 / 56,
    fontFamily: fonts.heading,
    bold: false,
  })
  const footer = [ir.meta.organization, ir.meta.date].filter((v): v is string => Boolean(v && v.trim())).join(" · ")
  return (
    <>
      {section && (
        <text
          x={640}
          y={200}
          textAnchor="middle"
          fontFamily={fonts.body}
          fontSize={18}
          fill={colors.accent}
          dominantBaseline="alphabetic"
        >
          {section}
        </text>
      )}
      {section && <line x1={600} y1={222} x2={680} y2={222} stroke={colors.accent} strokeWidth={1} />}
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
      {footer && (
        <text x={640} y={580} textAnchor="middle" fontFamily={fonts.body} fontSize={17} fill={colors.muted} dominantBaseline="alphabetic">
          {footer}
        </text>
      )}
    </>
  )
}

export function oneEvidence({ slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const evidence = pickEvidence(slide.components)
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: 720,
    fontSize: 44,
    maxLines: 2,
    minPt: 24,
    lineHeightRatio: 1.28,
    fontFamily: fonts.heading,
    bold: false,
  })
  const note = slide.subheading
  const source = evidenceSource(slide)
  return (
    <>
      <rect x={240} y={170} width={800} height={330} fill={colors.surface} stroke={colors.border} strokeWidth={1} />
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x={640}
          y={300 + i * heading.lineHeight}
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
      {note && (
        <text x={640} y={366} textAnchor="middle" fontFamily={fonts.body} fontSize={22} fill={colors.muted} dominantBaseline="alphabetic">
          {note}
        </text>
      )}
      {evidence && renderFittedEvidence(evidence, { x: 280, y: 390, w: 720, h: 90 }, ctx)}
      <rect x={560} y={540} width={160} height={40} fill="none" stroke={colors.accent} strokeWidth={1} />
      <text x={640} y={566} textAnchor="middle" fontFamily={fonts.body} fontSize={15} fill={colors.accent} dominantBaseline="alphabetic">
        {`展品 № ${pad2(index + 1)}`}
      </text>
      {source && (
        <text x={640} y={620} textAnchor="middle" fontFamily={fonts.body} fontSize={14} fill={colors.muted} dominantBaseline="alphabetic">
          {source}
        </text>
      )}
    </>
  )
}

export function statHero({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const fitted = fitHeroLine(heroValue(slide), { maxWidth: 1100, fontSize: 290, fontFamily: fonts.heading, bold: false })
  const caption = heroCaption(slide)
  return (
    <>
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
      <line x1={480} y1={530} x2={800} y2={530} stroke={colors.border} strokeWidth={1} />
      {caption && (
        <text x={640} y={580} textAnchor="middle" fontFamily={fonts.body} fontSize={21} fill={colors.muted} dominantBaseline="alphabetic">
          {caption}
        </text>
      )}
    </>
  )
}
