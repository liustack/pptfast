import type { SvgTemplateProps } from "../types"
import { sectionNameFor } from "../../../lib/derive"
import { renderEmphasisTspans } from "../../emphasis"
import { findImageComponent } from "../find-image"
import { heroCaption, heroValue } from "../minimal-shared"
import { fitHeroLine, fitSparseHeading, isNumericHero, rotateRectPolygon, splitTrailingPercent } from "./shared"

/** playbill 稀排脸：特粗三行、出血巨数+斜贴片、满版图。不画日期贴片。 */

const CHIP_POINTS = rotateRectPolygon(1100, 152, 180, 64, 4)

export function statement({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const heading = fitSparseHeading(slide.heading, {
    maxWidth: 1080,
    fontSize: 110,
    maxLines: 3,
    minPt: 52,
    lineHeightRatio: 150 / 110,
    fontFamily: fonts.heading,
    bold: true,
  })
  const kicker = sectionNameFor(ir.slides, index) || slide.subheading?.trim() || undefined
  return (
    <>
      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x={96}
          y={250 + i * heading.lineHeight}
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
      <rect x={96} y={610} width={1088} height={4} fill={colors.text} />
      {kicker && (
        <text x={96} y={662} fontFamily={fonts.heading} fontSize={20} fontWeight="700" fill={colors.text} dominantBaseline="alphabetic">
          {kicker}
        </text>
      )}
    </>
  )
}

export function statHero({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const raw = heroValue(slide)
  const numeric = isNumericHero(raw)
  const unsigned = raw.trim().replace(/^-/, "")
  const { body } = splitTrailingPercent(unsigned)
  const fitted = fitHeroLine(numeric ? body : raw, {
    maxWidth: 1200,
    fontSize: 560,
    fontFamily: fonts.heading,
    bold: true,
  })
  const chip = numeric ? (raw.includes("%") ? raw : `${raw}%`) : null
  const caption = heroCaption(slide)
  return (
    <>
      <text
        x={640}
        y={560}
        textAnchor="middle"
        fontFamily={fonts.heading}
        fontSize={fitted.fontSize}
        fontWeight="700"
        fill={colors.text}
        dominantBaseline="alphabetic"
      >
        {fitted.text}
      </text>
      {chip && (
        <>
          <polygon points={CHIP_POINTS} fill={colors.primary} />
          <text
            x={1100}
            y={164}
            textAnchor="middle"
            transform="rotate(4 1100 152)"
            fontFamily={fonts.heading}
            fontSize={34}
            fontWeight="700"
            fill={colors.bg}
            dominantBaseline="alphabetic"
          >
            {chip}
          </text>
        </>
      )}
      {caption && (
        <text x={96} y={662} fontFamily={fonts.heading} fontSize={20} fontWeight="700" fill={colors.text} dominantBaseline="alphabetic">
          {caption}
        </text>
      )}
    </>
  )
}

export function monoBleed({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const image = findImageComponent(slide)
  const src = image ? ctx.images?.[image.asset_id]?.src : undefined
  const alt = image ? ctx.images?.[image.asset_id]?.alt : undefined
  const caption = slide.heading?.trim()
  return (
    <>
      <rect x={0} y={0} width={1280} height={720} fill={colors.primary} />
      {src && (
        <image
          href={src}
          x={0}
          y={0}
          width={1280}
          height={600}
          preserveAspectRatio="xMidYMid slice"
          aria-label={alt || undefined}
        />
      )}
      {caption && (
        <text
          x={96}
          y={672}
          fontFamily={fonts.heading}
          fontSize={24}
          fontWeight="700"
          fill={colors.bg}
          dominantBaseline="alphabetic"
        >
          {caption}
        </text>
      )}
    </>
  )
}
