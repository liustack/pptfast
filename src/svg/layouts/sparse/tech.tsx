import type { SvgTemplateProps } from "../types"
import { pickEvidence } from "../../component-traits"
import { renderEmphasisTspans } from "../../emphasis"
import { heroCaption, heroSource, heroValue } from "../minimal-shared"
import { fitSvgLine } from "../../../lib/svg-text-layout"
import { renderFittedEvidence, textColumnMaxWidth } from "../fitted-evidence"
import { evidenceSource, fitHeroLine, fitSparseHeading, pad2 } from "./shared"

/** tech 稀排脸：青光巨数、轨道格言、节点证据卡。不画右缘星座链。 */

const STAR_DOTS: { cx: number; r: number }[] = [
  { cx: 110, r: 5 },
  { cx: 272, r: 3.5 },
  { cx: 436, r: 3.5 },
  { cx: 600, r: 5 },
]

export function statHero({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const fitted = fitHeroLine(heroValue(slide), { maxWidth: 1100, fontSize: 300, fontFamily: fonts.heading, bold: true })
  const caption = heroCaption(slide)
  const source = heroSource(slide)
  return (
    <>
      <text
        x={96}
        y={450}
        fontFamily={fonts.heading}
        fontSize={fitted.fontSize}
        fontWeight="700"
        fill={colors.accent}
        dominantBaseline="alphabetic"
      >
        {fitted.text}
      </text>
      <line x1={110} y1={505} x2={600} y2={505} stroke={colors.border} strokeWidth={1.5} />
      {STAR_DOTS.map((dot) => (
        <circle key={dot.cx} cx={dot.cx} cy={505} r={dot.r} fill={colors.accent} />
      ))}
      {caption && (
        <text x={96} y={574} fontFamily={fonts.body} fontSize={25} fill={colors.text} dominantBaseline="alphabetic">
          {caption}
        </text>
      )}
      {source && (
        <text x={96} y={614} fontFamily={fonts.body} fontSize={17} fill={colors.muted} dominantBaseline="alphabetic">
          {source}
        </text>
      )}
    </>
  )
}

export function statement({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: 920,
    fontSize: 58,
    maxLines: 2,
    minPt: 32,
    lineHeightRatio: 92 / 58,
    fontFamily: fonts.heading,
    bold: true,
  })
  return (
    <>
      <path d="M 1060 40 a 190 190 0 0 1 180 130" fill="none" stroke={colors.border} strokeWidth={1.5} />
      <path d="M 1120 40 a 130 130 0 0 1 122 88" fill="none" stroke={colors.border} strokeWidth={1} />
      <circle cx={1150} cy={52} r={4} fill={colors.accent} />
      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x={96}
          y={350 + i * heading.lineHeight}
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
      <circle cx={224} cy={268} r={6} fill={colors.accent} />
      <line x1={230} y1={268} x2={300} y2={268} stroke={colors.border} strokeWidth={1.5} />
      <text x={316} y={276} fontFamily={fonts.body} fontSize={20} fill={colors.accent} dominantBaseline="alphabetic">
        {`NODE ${pad2(index + 1)}`}
      </text>
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x={224}
          y={360 + i * heading.lineHeight}
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
        <text x={224} y={420} fontFamily={fonts.body} fontSize={note.fontSize} fill={colors.muted} dominantBaseline="alphabetic">
          {note.text}
        </text>
      )}
      {source && (
        <text x={224} y={470} fontFamily={fonts.body} fontSize={source.fontSize} fill={colors.muted} dominantBaseline="alphabetic">
          {source.text}
        </text>
      )}
      {evidence && renderFittedEvidence(evidence, evidenceRect, ctx)}
    </>
  )
}
