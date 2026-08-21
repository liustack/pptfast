import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { sectionNameFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { accessibleInk } from "../ink"
import { latinUpper, pullQuoteAttribution, pullQuoteBody, trackingPx } from "./minimal-shared"
import { sparseFace } from "./sparse/registry"

/**
 * 待第二批设计稿锁定
 *
 * pull-quote 通用脸：居中引言页。章节眉 + 大引言 + 出处小字 + 一段散文。
 * `pinOnly` + `chrome: "none"`。不自己铺暗底，暗不暗由主题 `colors.bg` /
 * `slide.background` 决定。品牌页脚 / logo 不画。motif 仍画。
 *
 * 出处优先 quote 组件的 attribution，否则 subheading。正文只接受一个
 * paragraph，走 layoutSvgText，不走 SvgContent 卡片。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量，颜色 / 字体全部来自 ctx。
 */

const CENTER_X = 640
const HEADING_MAX_W = 920
const BODY_MAX_W = 760
const KICKER_Y = 100
const TITLE_Y = 240
const KICKER_SIZE = 12
const ATTR_SIZE = 13
const BODY_SIZE = 17
const KICKER_TRACKING_EM = 0.42
const ATTR_TRACKING_EM = 0.2
const ATTR_GAP = 36
const BODY_GAP = 50
const BODY_MAX_LINES = 6
const BODY_LINE_RATIO = 1.8

export function PullQuoteContent(props: SvgTemplateProps) {
  const Face = sparseFace("pull-quote", props.ir.theme.id)
  if (Face) return Face(props)
  return GenericPullQuoteContent(props)
}

function GenericPullQuoteContent({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const defaultBg = ctx.defaultBg ?? colors.bg

  const section = sectionNameFor(ir.slides, index)
  const kickerTracking = trackingPx(KICKER_SIZE, KICKER_TRACKING_EM)
  const kicker = section
    ? fitSvgLine(latinUpper(section), {
        maxWidth: HEADING_MAX_W,
        fontSize: KICKER_SIZE,
        minFontSize: 10,
        letterSpacing: kickerTracking,
      })
    : null

  const heading = fitHeadingLines(slide.heading, {
    ...layoutDef.headingFit,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
  })
  const titleLastY = TITLE_Y + Math.max(0, heading.lines.length - 1) * heading.lineHeight

  const attrSource = pullQuoteAttribution(slide)
  const attrTracking = trackingPx(ATTR_SIZE, ATTR_TRACKING_EM)
  const attribution = attrSource
    ? fitSvgLine(latinUpper(attrSource), {
        maxWidth: HEADING_MAX_W,
        fontSize: ATTR_SIZE,
        minFontSize: 10,
        letterSpacing: attrTracking,
      })
    : null
  const attrY = titleLastY + ATTR_GAP

  const bodySource = pullQuoteBody(slide)
  const bodyLayout = bodySource
    ? layoutSvgText(bodySource, {
        maxWidth: BODY_MAX_W,
        fontSize: BODY_SIZE,
        maxLines: BODY_MAX_LINES,
        minPt: 14,
        lineHeightRatio: BODY_LINE_RATIO,
        fontFamily: fonts.body,
      })
    : null
  const bodyStartY = (attribution ? attrY : titleLastY) + BODY_GAP

  return (
    <>
      {kicker && (
        <text
          data-truncated={kicker.truncated ? "1" : undefined}
          x={CENTER_X}
          y={KICKER_Y}
          textAnchor="middle"
          fontFamily={fonts.body}
          fontSize={kicker.fontSize}
          fill={accessibleInk(colors.accent, defaultBg, kicker.fontSize)}
          letterSpacing={kickerTracking}
          dominantBaseline="alphabetic"
        >
          {kicker.text}
        </text>
      )}

      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x={CENTER_X}
          y={TITLE_Y + i * heading.lineHeight}
          textAnchor="middle"
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="400"
          fontStyle="italic"
          fill={accessibleInk(colors.text, defaultBg, heading.fontSize)}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {attribution && (
        <text
          data-truncated={attribution.truncated ? "1" : undefined}
          x={CENTER_X}
          y={attrY}
          textAnchor="middle"
          fontFamily={fonts.body}
          fontSize={attribution.fontSize}
          fill={accessibleInk(colors.accent, defaultBg, attribution.fontSize)}
          letterSpacing={attrTracking}
          dominantBaseline="alphabetic"
        >
          {attribution.text}
        </text>
      )}

      {bodyLayout &&
        bodyLayout.lines.map((line, i) => (
          <text
            key={`body-${i}`}
            data-truncated={bodyLayout.truncated && i === bodyLayout.lines.length - 1 ? "1" : undefined}
            x={CENTER_X}
            y={bodyStartY + i * bodyLayout.lineHeight}
            textAnchor="middle"
            fontFamily={fonts.body}
            fontSize={bodyLayout.fontSize}
            fill={accessibleInk(colors.muted, defaultBg, bodyLayout.fontSize)}
            dominantBaseline="alphabetic"
          >
            {line}
          </text>
        ))}
    </>
  )
}

export const layoutDef = {
  // content-pull-quote.tsx: a pinOnly centered-quote page. Kicker (section
  // name) + italic heading + accent attribution + one muted paragraph.
  // chrome: "none" skips brand footer, logo, and page numbers. The theme
  // motif still paints. The fifth-band decoration safe-zone does not apply
  // — the whole canvas is the layout's.
  id: "pull-quote",
  kind: "archetype",
  pinOnly: true,
  chrome: "none",
  slideTypes: ["content"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "body", accepts: ["paragraph", "quote", "citation"], capacity: 1 },
    { name: "meta", accepts: [] },
  ],
  arrangements: ["single"],
  headingFit: {
    maxWidth: HEADING_MAX_W,
    fontSize: 40,
    maxLines: 4,
    minPt: 22,
    bold: false,
    lineHeightRatio: 1.32,
  },
} satisfies LayoutDefinition
