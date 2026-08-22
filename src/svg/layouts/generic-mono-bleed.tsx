import type { SvgTemplateProps } from "./types"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleOpacity, readableOn } from "../ink"

/**
 * Generic mono-bleed face: full-bleed primary field, type as the image.
 * Split out of content-mono-bleed.tsx so sparse faces can fall back here
 * without an import cycle through sparse/registry.
 */
const CENTER_X = 640
const HEADING_MAX_W = 1000
const TITLE_Y = 260
const SUB_SIZE = 20
const SUB_GAP = 48
const SUB_OPACITY = 0.72

export const MONO_BLEED_HEADING_FIT = {
  maxWidth: HEADING_MAX_W,
  fontSize: 80,
  maxLines: 3,
  minPt: 40,
  lineHeightRatio: 1.15,
}

export function GenericMonoBleedContent({ slide, ctx }: SvgTemplateProps) {
  const field = ctx.colors.primary
  const fg = readableOn(field)

  const heading = fitHeadingLines(slide.heading, {
    ...MONO_BLEED_HEADING_FIT,
    fontFamily: ctx.fonts.heading,
    typeScale: ctx.shape?.typeScale,
  })
  const titleLastY = TITLE_Y + Math.max(0, heading.lines.length - 1) * heading.lineHeight

  const subSource = slide.subheading?.trim()
  const subheading = subSource
    ? fitSvgLine(subSource, {
        maxWidth: HEADING_MAX_W,
        fontSize: SUB_SIZE,
        minFontSize: 14,
      })
    : null
  const subY = titleLastY + SUB_GAP
  const subOpacity = subheading
    ? accessibleOpacity(fg, field, subheading.fontSize, SUB_OPACITY)
    : SUB_OPACITY

  return (
    <>
      <rect x={0} y={0} width={1280} height={720} fill={field} />

      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x={CENTER_X}
          y={TITLE_Y + i * heading.lineHeight}
          textAnchor="middle"
          fontFamily={ctx.fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="700"
          fill={fg}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {subheading && (
        <text
          data-truncated={subheading.truncated ? "1" : undefined}
          x={CENTER_X}
          y={subY}
          textAnchor="middle"
          fontFamily={ctx.fonts.body}
          fontSize={subheading.fontSize}
          fill={fg}
          fillOpacity={subOpacity}
          dominantBaseline="alphabetic"
        >
          {subheading.text}
        </text>
      )}
    </>
  )
}
