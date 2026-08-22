import type { SvgTemplateProps } from "../types"
import { pickEvidence } from "../../component-traits"
import { renderEmphasisTspans } from "../../emphasis"
import { heroCaption, heroSource, heroValue } from "../minimal-shared"
import { fitSvgLine } from "../../../lib/svg-text-layout"
import { renderFittedEvidence, textColumnMaxWidth } from "../fitted-evidence"
import { evidenceSource, fitHeroLine, fitSparseHeading, pad2 } from "./shared"

/** terra 稀排脸：等高线格言、橄榄横线巨数、样点卡。不画 motif 左下线和右缘点。 */

export function statement({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: 1088,
    fontSize: 54,
    maxLines: 2,
    minPt: 32,
    lineHeightRatio: 88 / 54,
    fontFamily: fonts.heading,
    bold: true,
  })
  return (
    <>
      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x={96}
          y={330 + i * heading.lineHeight}
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="700"
          fill={colors.primary}
          dominantBaseline="alphabetic"
        >
          {renderEmphasisTspans(heading.lineSegs[i] ?? [{ text: line, emphasized: false }], {
            accent: colors.accent,
            baseFill: colors.primary,
            fontWeight: "700",
          })}
        </text>
      ))}
      <path d="M 60 610 q 220 -40 430 0 t 430 0" fill="none" stroke={colors.border} strokeWidth={1.5} />
      <path d="M 20 650 q 260 -34 500 0 t 500 0" fill="none" stroke={colors.border} strokeWidth={1.5} />
    </>
  )
}

export function statHero({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const fitted = fitHeroLine(heroValue(slide), { maxWidth: 1100, fontSize: 300, fontFamily: fonts.heading, bold: true })
  const caption = heroCaption(slide)
  const source = heroSource(slide)
  return (
    <>
      <text
        x={96}
        y={460}
        fontFamily={fonts.heading}
        fontSize={fitted.fontSize}
        fontWeight="700"
        fill={colors.accent}
        dominantBaseline="alphabetic"
      >
        {fitted.text}
      </text>
      <rect x={104} y={504} width={430} height={2} fill={colors.primary} />
      {caption && (
        <text x={96} y={570} fontFamily={fonts.body} fontSize={24} fill={colors.primary} dominantBaseline="alphabetic">
          {caption}
        </text>
      )}
      {source && (
        <text x={96} y={612} fontFamily={fonts.body} fontSize={17} fill={colors.muted} dominantBaseline="alphabetic">
          {source}
        </text>
      )}
    </>
  )
}

export function oneEvidence({ slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const evidence = pickEvidence(slide.components)
  const evidenceRect = { x: 600, y: 230, w: 480, h: 250 }
  const textX = 224
  const textW = evidence ? textColumnMaxWidth(textX, evidenceRect.x) : 880
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: textW,
    fontSize: 42,
    maxLines: 2,
    minPt: 24,
    lineHeightRatio: 1.2,
    fontFamily: fonts.heading,
    bold: false,
  })
  const note = slide.subheading
    ? evidence
      ? fitSvgLine(slide.subheading, { maxWidth: textW, fontSize: 21, minFontSize: 14, fontFamily: fonts.body })
      : { text: slide.subheading, fontSize: 21 }
    : null
  const sourceRaw = evidenceSource(slide)
  const source = sourceRaw
    ? evidence
      ? fitSvgLine(sourceRaw, { maxWidth: textW, fontSize: 16, minFontSize: 12, fontFamily: fonts.body })
      : { text: sourceRaw, fontSize: 16 }
    : null
  return (
    <>
      <rect x={160} y={190} width={960} height={320} fill={colors.surface} stroke={colors.border} strokeWidth={1} />
      <circle cx={238} cy={282} r={7} fill={colors.accent} />
      <text x={262} y={290} fontFamily={fonts.body} fontSize={21} fill={colors.primary} dominantBaseline="alphabetic">
        {`样点 ${pad2(index + 1)}`}
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
        <text x={224} y={430} fontFamily={fonts.body} fontSize={note.fontSize} fill={colors.muted} dominantBaseline="alphabetic">
          {note.text}
        </text>
      )}
      {source && (
        <text x={224} y={480} fontFamily={fonts.body} fontSize={source.fontSize} fill={colors.muted} dominantBaseline="alphabetic">
          {source.text}
        </text>
      )}
      {evidence && renderFittedEvidence(evidence, evidenceRect, ctx)}
    </>
  )
}
