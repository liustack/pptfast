import type { SvgTemplateProps } from "../types"
import { pickEvidence } from "../../component-traits"
import { renderEmphasisTspans } from "../../emphasis"
import { heroCaption, heroSource, heroValue } from "../minimal-shared"
import { fitSvgLine } from "../../../lib/svg-text-layout"
import { renderFittedEvidence, textColumnMaxWidth } from "../fitted-evidence"
import { evidenceSource, fitHeroLine, fitSparseHeading, pad2 } from "./shared"

/** swiss 稀排脸：左对齐超黑。不画顶边红条（motif 已画）。 */

export function statHero({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const fitted = fitHeroLine(heroValue(slide), { maxWidth: 1100, fontSize: 360, fontFamily: fonts.heading, bold: true })
  const caption = heroCaption(slide)
  const source = heroSource(slide)
  const page = `${pad2(index + 1)} / ${pad2(ir.slides.length)}`
  return (
    <>
      <text
        x={88}
        y={480}
        fontFamily={fonts.heading}
        fontSize={fitted.fontSize}
        fontWeight="700"
        fill={colors.text}
        dominantBaseline="alphabetic"
      >
        {fitted.text}
      </text>
      {caption && (
        <text x={92} y={560} fontFamily={fonts.heading} fontSize={26} fontWeight="700" fill={colors.text} dominantBaseline="alphabetic">
          {caption}
        </text>
      )}
      {source && (
        <text x={92} y={600} fontFamily={fonts.body} fontSize={18} fill={colors.muted} dominantBaseline="alphabetic">
          {source}
        </text>
      )}
      <text x={1188} y={600} textAnchor="end" fontFamily={fonts.body} fontSize={16} fill={colors.muted} dominantBaseline="alphabetic">
        {page}
      </text>
    </>
  )
}

export function statement({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: 1100,
    fontSize: 84,
    maxLines: 2,
    minPt: 44,
    lineHeightRatio: 110 / 84,
    fontFamily: fonts.heading,
    bold: true,
  })
  return (
    <>
      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x={88}
          y={330 + i * heading.lineHeight}
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
      <rect x={88} y={490} width={120} height={6} fill={colors.text} />
    </>
  )
}

export function oneEvidence({ slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const evidence = pickEvidence(slide.components)
  const evidenceRect = { x: 520, y: 220, w: 560, h: 260 }
  const textX = 220
  const textW = evidence ? textColumnMaxWidth(textX, evidenceRect.x) : 880
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: textW,
    fontSize: 42,
    maxLines: 2,
    minPt: 24,
    lineHeightRatio: 1.2,
    fontFamily: fonts.heading,
    bold: true,
  })
  const note = slide.subheading
    ? evidence
      ? fitSvgLine(slide.subheading, { maxWidth: textW, fontSize: 22, minFontSize: 14, fontFamily: fonts.body })
      : { text: slide.subheading, fontSize: 22 }
    : null
  const sourceRaw = evidenceSource(slide)
  const source = sourceRaw
    ? evidence
      ? fitSvgLine(sourceRaw, { maxWidth: textW, fontSize: 16, minFontSize: 12, fontFamily: fonts.body })
      : { text: sourceRaw, fontSize: 16 }
    : null
  return (
    <>
      <rect x={160} y={180} width={960} height={340} fill={colors.surface} stroke={colors.border} strokeWidth={1} />
      <text x={220} y={278} fontFamily={fonts.heading} fontSize={30} fontWeight="700" fill={colors.accent} dominantBaseline="alphabetic">
        {pad2(index + 1)}
      </text>
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x={220}
          y={352 + i * heading.lineHeight}
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
      {note && (
        <text x={220} y={410} fontFamily={fonts.body} fontSize={note.fontSize} fill={colors.muted} dominantBaseline="alphabetic">
          {note.text}
        </text>
      )}
      {source && (
        <text x={220} y={472} fontFamily={fonts.body} fontSize={source.fontSize} fill={colors.muted} dominantBaseline="alphabetic">
          {source.text}
        </text>
      )}
      {evidence && renderFittedEvidence(evidence, evidenceRect, ctx)}
    </>
  )
}
