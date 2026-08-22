import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleOpacity, readableOn } from "../ink"
import { sparseFace } from "./sparse/registry"

/**
 * 未注册的 (themeId, layoutId) 与自定义主题仍走此脸。
 *
 * mono-bleed 通用脸：满版品牌色，字当图。`pinOnly` + `chrome: "none"` +
 * `paintsOwnBackground`。整页 fill 是 `colors.primary`，字色走 `readableOn`。
 * 需要字就写 heading，容量 0。品牌页脚 / logo 不画。motif 仍画。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量（readableOn 中性黑白豁免），
 * 颜色全部来自 ctx。
 */

const CENTER_X = 640
const HEADING_MAX_W = 1000
const TITLE_Y = 260
const SUB_SIZE = 20
const SUB_GAP = 48
const SUB_OPACITY = 0.72

export function MonoBleedContent(props: SvgTemplateProps) {
  const Face = sparseFace("mono-bleed", props.ir.theme.id)
  if (Face) return Face(props)
  return GenericMonoBleedContent(props)
}

function GenericMonoBleedContent({ slide, ctx }: SvgTemplateProps) {
  const field = ctx.colors.primary
  const fg = readableOn(field)

  const heading = fitHeadingLines(slide.heading, {
    ...layoutDef.headingFit,
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

export const layoutDef = {
  // content-mono-bleed.tsx: a pinOnly full-bleed primary field with inverted
  // type. Capacity 0 (write the words in heading). paintsOwnBackground so
  // FullSlideSvg does not paint the theme bg underneath. chrome: "none"
  // skips brand footer and logo. The theme motif still paints. The
  // fifth-band decoration safe-zone does not apply — the whole canvas is
  // the layout's.
  id: "mono-bleed",
  kind: "archetype",
  pinOnly: true,
  chrome: "none",
  paintsOwnBackground: true,
  slideTypes: ["content"],
  slots: [
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "body", accepts: [], capacity: 0 },
  ],
  arrangements: ["single"],
  headingFit: {
    maxWidth: HEADING_MAX_W,
    fontSize: 80,
    maxLines: 3,
    minPt: 40,
    lineHeightRatio: 1.15,
  },
} satisfies LayoutDefinition
