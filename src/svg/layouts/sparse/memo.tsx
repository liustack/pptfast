import type { SvgTemplateProps } from "../types"
import { renderEmphasisTspans } from "../../emphasis"
import { hasCjk, heroCaption, heroValue, pullQuoteAttribution, trackingPx } from "../minimal-shared"
import { firstEmphasisRun, fitHeroLine, fitSparseHeading } from "./shared"

/** memo 稀排脸：打字机引文、文武夹巨数、宋体格言+印章。不画 MEMORANDUM / 顶缘红双线。 */

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
    maxWidth: 1088,
    fontSize: 44,
    maxLines: 2,
    minPt: 26,
    lineHeightRatio: 74 / 44,
    fontFamily: fonts.mono,
    bold: false,
  })
  const run = firstEmphasisRun(heading.lineSegs, {
    originX: 96,
    firstY: 330,
    lineHeight: heading.lineHeight,
    fontSize: heading.fontSize,
    fontFamily: fonts.mono,
    bold: false,
  })
  const attr = pullQuoteAttribution(slide)
  const from = attr ? `FROM:  ${attr}` : null
  const fromTracking = from && !hasCjk(from) ? trackingPx(19, 0.2) : undefined
  return (
    <>
      <InkDouble x={96} width={1088} yThick={96} yThin={102} stroke={colors.text} />
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x={96}
          y={330 + i * heading.lineHeight}
          fontFamily={fonts.mono}
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
      {run && (
        <line
          x1={run.x}
          y1={run.y + 20}
          x2={run.x + run.w}
          y2={run.y + 20}
          stroke={colors.accent}
          strokeWidth={3}
        />
      )}
      {from && (
        <text
          x={96}
          y={560}
          fontFamily={fonts.mono}
          fontSize={19}
          fill={colors.muted}
          letterSpacing={fromTracking}
          dominantBaseline="alphabetic"
        >
          {from}
        </text>
      )}
      <InkDouble x={96} width={1088} yThick={624} yThin={620} stroke={colors.text} />
    </>
  )
}

export function statHero({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const fitted = fitHeroLine(heroValue(slide), { maxWidth: 1088, fontSize: 280, fontFamily: fonts.heading, bold: false })
  const caption = heroCaption(slide)
  return (
    <>
      <InkDouble x={96} width={1088} yThick={170} yThin={176} stroke={colors.text} />
      <text
        x={640}
        y={460}
        textAnchor="middle"
        fontFamily={fonts.heading}
        fontSize={fitted.fontSize}
        fontWeight="400"
        fill={colors.text}
        dominantBaseline="alphabetic"
      >
        {fitted.text}
      </text>
      <InkDouble x={96} width={1088} yThick={534} yThin={530} stroke={colors.text} />
      {caption && (
        <text x={96} y={590} fontFamily={fonts.mono} fontSize={19} fill={colors.muted} dominantBaseline="alphabetic">
          {`RE:  ${caption}`}
        </text>
      )}
    </>
  )
}

export function statement({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: 960,
    fontSize: 54,
    maxLines: 1,
    minPt: 28,
    lineHeightRatio: 1.2,
    fontFamily: fonts.heading,
    bold: false,
  })
  return (
    <>
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x={96}
          y={350}
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
      <rect x={1076} y={520} width={108} height={108} fill="none" stroke={colors.accent} strokeWidth={3} />
      <text x={1130} y={562} textAnchor="middle" fontFamily={fonts.heading} fontSize={30} fill={colors.accent} dominantBaseline="alphabetic">
        已阅
      </text>
      <text x={1130} y={604} textAnchor="middle" fontFamily={fonts.heading} fontSize={30} fill={colors.accent} dominantBaseline="alphabetic">
        存档
      </text>
    </>
  )
}
