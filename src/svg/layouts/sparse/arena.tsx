import type { SvgTemplateProps } from "../types"
import { pickEvidence } from "../../component-traits"
import { renderEmphasisTspans } from "../../emphasis"
import { heroCaption, heroValue } from "../minimal-shared"
import { fitSvgLine } from "../../../lib/svg-text-layout"
import { renderFittedEvidence, textColumnMaxWidth } from "../fitted-evidence"
import { evidenceSource, fitHeroLine, fitSparseHeading, pad2 } from "./shared"

/** arena 稀排脸：内缩 HUD、量能条、对角亮括弧。不画页角 12px 括弧和底带能量条。 */

const ENERGY = [
  { x: 96, opacity: 1 },
  { x: 134, opacity: 0.7 },
  { x: 172, opacity: 0.45 },
  { x: 210, opacity: 0.22 },
] as const

export function statHero({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const fitted = fitHeroLine(heroValue(slide), { maxWidth: 1100, fontSize: 330, fontFamily: fonts.heading, bold: true })
  const caption = heroCaption(slide)
  return (
    <>
      <path d="M 100 100 l 0 -24 l 24 0" fill="none" stroke={colors.border} strokeWidth={2} />
      <path d="M 1180 100 l 0 -24 l -24 0" fill="none" stroke={colors.border} strokeWidth={2} />
      <path d="M 100 620 l 0 24 l 24 0" fill="none" stroke={colors.border} strokeWidth={2} />
      <path d="M 1180 620 l 0 24 l -24 0" fill="none" stroke={colors.border} strokeWidth={2} />
      <text
        x={640}
        y={470}
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
          y={570}
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

export function statement({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: 1088,
    fontSize: 58,
    maxLines: 2,
    minPt: 32,
    lineHeightRatio: 92 / 58,
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
      {ENERGY.map((bar) => (
        <rect key={bar.x} x={bar.x} y={540} width={30} height={8} fill={colors.accent} opacity={bar.opacity} />
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
      <path d="M 160 190 l 0 -14 l 14 0" fill="none" stroke={colors.accent} strokeWidth={2} />
      <path d="M 1120 510 l 0 14 l -14 0" fill="none" stroke={colors.accent} strokeWidth={2} />
      <text x={224} y={288} fontFamily={fonts.mono} fontSize={20} fill={colors.accent} dominantBaseline="alphabetic">
        {`STAT / ${pad2(index + 1)}`}
      </text>
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x={224}
          y={366 + i * heading.lineHeight}
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
        <text x={224} y={428} fontFamily={fonts.body} fontSize={note.fontSize} fill={colors.muted} dominantBaseline="alphabetic">
          {note.text}
        </text>
      )}
      {source && (
        <text x={224} y={478} fontFamily={fonts.body} fontSize={source.fontSize} fill={colors.muted} dominantBaseline="alphabetic">
          {source.text}
        </text>
      )}
      {evidence && renderFittedEvidence(evidence, evidenceRect, ctx)}
    </>
  )
}
