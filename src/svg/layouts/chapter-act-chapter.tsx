import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { chapterNumberFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine, measureTextUnits } from "../../lib/svg-text-layout"
import { accessibleInk } from "../ink"
import { formatChapterLabel, headingIsCjk } from "../heading-treatments/labels"
import { trackingPx } from "./minimal-shared"

/**
 * act-chapter layout（第八波批 1，新表达）：对镜居中。洋红对杠夹幕次，
 * 幕次来自 `chapterNumberFor`（CJK「第N幕」/ Latin「ACT N」），标题与副题
 * 落在同一中轴。构图抄 campaign 板章节页，进共享池，零 theme id、零 hex。
 *
 * `pinOnly` + `branding: "none"`。无 body 槽。无水印巨号。对杠依附幕次，
 * 不是漂在角落的孤立小件。
 */

const CENTER_X = 640
const CONTENT_MAX_W = 920
const ACT_Y = 298
const ACT_SIZE = 17
const ACT_TRACKING_CJK = 8
const ACT_TRACKING_LATIN_EM = 0.22
const BAR_W = 28
const BAR_H = 4
const BAR_Y = 286
const BAR_GAP = 48
const TITLE_Y = 392
const SUB_SIZE = 20
const SUB_GAP = 54

export function ActChapter({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const defaultBg = ctx.defaultBg ?? colors.bg
  const chNum = chapterNumberFor(ir.slides, index)
  const cjk = headingIsCjk(slide.heading)
  const actLabel = formatChapterLabel("act", Math.max(1, chNum), cjk)
  const actTracking = cjk ? ACT_TRACKING_CJK : trackingPx(ACT_SIZE, ACT_TRACKING_LATIN_EM)
  const act = fitSvgLine(actLabel, {
    maxWidth: CONTENT_MAX_W,
    fontSize: ACT_SIZE,
    minFontSize: 12,
    letterSpacing: actTracking,
    fontFamily: fonts.body,
  })
  const glyphCount = Array.from(act.text).length
  const labelW =
    measureTextUnits(act.text, { fontFamily: fonts.body }) * act.fontSize +
    actTracking * Math.max(0, glyphCount - 1)
  const halfSpan = Math.round(labelW / 2 + BAR_GAP)
  const leftBarX = CENTER_X - halfSpan - BAR_W
  const rightBarX = CENTER_X + halfSpan

  const heading = fitHeadingLines(slide.heading, {
    ...layoutDef.headingFit,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
  })
  const titleLastY = TITLE_Y + Math.max(0, heading.lines.length - 1) * heading.lineHeight
  const subheading = slide.subheading
    ? fitSvgLine(slide.subheading, {
        maxWidth: CONTENT_MAX_W,
        fontSize: SUB_SIZE,
        minFontSize: 14,
        fontFamily: fonts.body,
      })
    : null
  const subY = titleLastY + SUB_GAP
  const barFill = colors.accent

  return (
    <>
      <rect x={leftBarX} y={BAR_Y} width={BAR_W} height={BAR_H} fill={barFill} />
      <rect x={rightBarX} y={BAR_Y} width={BAR_W} height={BAR_H} fill={barFill} />
      <text
        data-truncated={act.truncated ? "1" : undefined}
        x={CENTER_X}
        y={ACT_Y}
        textAnchor="middle"
        fontFamily={fonts.body}
        fontSize={act.fontSize}
        fill={accessibleInk(colors.muted, defaultBg, act.fontSize)}
        letterSpacing={actTracking}
        dominantBaseline="alphabetic"
      >
        {act.text}
      </text>

      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x={CENTER_X}
          y={TITLE_Y + i * heading.lineHeight}
          textAnchor="middle"
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="700"
          fill={accessibleInk(colors.text, defaultBg, heading.fontSize)}
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
          fontFamily={fonts.body}
          fontSize={subheading.fontSize}
          fill={accessibleInk(colors.muted, defaultBg, subheading.fontSize)}
          dominantBaseline="alphabetic"
        >
          {subheading.text}
        </text>
      )}
    </>
  )
}

export const layoutDef = {
  // chapter-act-chapter.tsx: pinOnly mirrored act-open. Accent bars
  // clamp the act kicker. Centered heading and optional subheading.
  // No body slot. branding none: the canvas is the layout's.
  id: "act-chapter",
  kind: "archetype",
  pinOnly: true,
  branding: "none",
  slideTypes: ["chapter"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
  ],
  headingFit: {
    maxWidth: CONTENT_MAX_W,
    fontSize: 54,
    maxLines: 2,
    minPt: 32,
    bold: true,
    lineHeightRatio: 1.18,
  },
} satisfies LayoutDefinition
