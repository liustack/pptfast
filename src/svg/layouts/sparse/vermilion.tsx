import type { SvgTemplateProps } from "../types"
import { pickEvidence } from "../../component-traits"
import { renderEmphasisTspans } from "../../emphasis"
import { heroCaption, heroValue } from "../minimal-shared"
import { fitSvgLine } from "../../../lib/svg-text-layout"
import { renderFittedEvidence, textColumnMaxWidth } from "../fitted-evidence"
import { evidenceSource, fitHeroLine, fitSparseHeading, pad2 } from "./shared"

/** vermilion 稀排脸：金双线批示、金菱巨数、案卷卡。不画顶缘金双线、金芒、底菱。 */

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

export function statement({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: 1000,
    fontSize: 56,
    maxLines: 1,
    minPt: 28,
    lineHeightRatio: 1.2,
    fontFamily: fonts.heading,
    bold: true,
  })
  const meta = [ir.meta.organization, ir.meta.date]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(" · ")
  return (
    <>
      <InkDouble x={240} width={800} yThick={150} yThin={156} stroke={colors.accent} />
      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated ? "1" : undefined}
          x={640}
          y={360}
          textAnchor="middle"
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="700"
          fill={colors.primary}
          dominantBaseline="alphabetic"
        >
          {renderEmphasisTspans(heading.lineSegs[i] ?? [{ text: line, emphasized: false }], {
            accent: colors.primary,
            baseFill: colors.primary,
            fontWeight: "700",
          })}
        </text>
      ))}
      <InkDouble x={240} width={800} yThick={564} yThin={560} stroke={colors.accent} />
      {meta && (
        <text
          x={1040}
          y={620}
          textAnchor="end"
          fontFamily={fonts.body}
          fontSize={18}
          fill={colors.muted}
          dominantBaseline="alphabetic"
        >
          {meta}
        </text>
      )}
    </>
  )
}

export function statHero({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const fitted = fitHeroLine(heroValue(slide), { maxWidth: 1100, fontSize: 300, fontFamily: fonts.heading, bold: true })
  const caption = heroCaption(slide)
  return (
    <>
      <text
        x={640}
        y={460}
        textAnchor="middle"
        fontFamily={fonts.heading}
        fontSize={fitted.fontSize}
        fontWeight="700"
        fill={colors.primary}
        dominantBaseline="alphabetic"
      >
        {fitted.text}
      </text>
      <path d="M 640 520 l 8 14 l -8 14 l -8 -14 z" fill={colors.accent} />
      {caption && (
        <text
          x={640}
          y={600}
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
  const evidenceRect = { x: 600, y: 230, w: 480, h: 250 }
  const textX = 234
  const textW = evidence ? textColumnMaxWidth(textX, evidenceRect.x) : 860
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
      ? fitSvgLine(slide.subheading, { maxWidth: textW, fontSize: 20, minFontSize: 14, fontFamily: fonts.body })
      : { text: slide.subheading, fontSize: 20 }
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
      <rect x={160} y={190} width={10} height={320} fill={colors.primary} />
      <text x={234} y={288} fontFamily={fonts.body} fontSize={22} fill={colors.primary} dominantBaseline="alphabetic">
        {`案卷 · ${pad2(index + 1)}`}
      </text>
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x={234}
          y={366 + i * heading.lineHeight}
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="400"
          fill={colors.text}
          dominantBaseline="alphabetic"
        >
          {renderEmphasisTspans(heading.lineSegs[i] ?? [{ text: line, emphasized: false }], {
            accent: colors.text,
            baseFill: colors.text,
            fontWeight: "400",
          })}
        </text>
      ))}
      {note && (
        <text x={234} y={428} fontFamily={fonts.body} fontSize={note.fontSize} fill={colors.muted} dominantBaseline="alphabetic">
          {note.text}
        </text>
      )}
      {source && (
        <text x={234} y={478} fontFamily={fonts.body} fontSize={source.fontSize} fill={colors.muted} dominantBaseline="alphabetic">
          {source.text}
        </text>
      )}
      {evidence && renderFittedEvidence(evidence, evidenceRect, ctx)}
    </>
  )
}
