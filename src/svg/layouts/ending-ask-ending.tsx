import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine, measureTextUnits } from "../../lib/svg-text-layout"
import { accessibleInk, readableOn } from "../ink"
import { parseEmphasis, renderEmphasisText, sliceEmphasisForLines, stripEmphasis } from "../emphasis"

/**
 * ask-ending（第八波批 1，新表达）：募资句当标题 + 火橙钮。构图抄融资
 * 路演收束板：开口要钱，不致谢。强调词走 `**…**` 的 tint（未分派 pad 的
 * 主题逐字节仍是变色）。钮是这一页唯一的色块。
 *
 * pinOnly，不进 fullLayoutSet。零 theme id、零 hex。颜色只走 ctx。
 * 公开面英文：缺省标题 "We're raising."，钮文 "Let's talk"。
 *
 * 服务场景：路演收束、pitch 要下一步。任何需要「开口要资源 + 一枚色钮」
 * 而不是 Thank you 的主题都可以钉。
 */

const TITLE_X = 96
const TITLE_Y = 270
const TITLE_SIZE = 56
const TITLE_MIN_PT = 32
const TITLE_MAX_LINES = 2
const TITLE_MAX_W = 1088
const TITLE_LINE_HEIGHT = 90

const SUB_X = 96
const SUB_Y = 470
const SUB_SIZE = 19
const SUB_MAX_W = 1088

const CTA_X = 96
const CTA_Y = 540
const CTA_H = 60
const CTA_MIN_W = 280
const CTA_PAD_X = 36
const CTA_SIZE = 22
const CTA_LABEL = "Let's talk"
const FALLBACK_HEADING = "We're raising."

export function AskEnding({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const defaultBg = ctx.defaultBg ?? colors.bg
  const headingSource = slide.heading || FALLBACK_HEADING
  const plainHeading = stripEmphasis(headingSource)
  const segments = parseEmphasis(headingSource)

  const heading = fitHeadingLines(plainHeading, {
    maxWidth: TITLE_MAX_W,
    fontSize: TITLE_SIZE,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
    lineHeightRatio: TITLE_LINE_HEIGHT / TITLE_SIZE,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
  })
  const lineSegs = sliceEmphasisForLines(segments, heading.lines)
  const titleInk = accessibleInk(colors.text, defaultBg, heading.fontSize)
  const accentInk = accessibleInk(colors.accent, defaultBg, heading.fontSize)

  const headingLastY = TITLE_Y + Math.max(0, heading.lines.length - 1) * heading.lineHeight
  const subheading = slide.subheading
    ? fitSvgLine(slide.subheading, {
        maxWidth: SUB_MAX_W,
        fontSize: SUB_SIZE,
        minFontSize: 14,
        fontFamily: fonts.body,
      })
    : null
  const subY = Math.max(SUB_Y, headingLastY + Math.round(heading.fontSize * 0.36) + (subheading?.fontSize ?? SUB_SIZE))

  const ctaLabel = fitSvgLine(CTA_LABEL, {
    maxWidth: 640,
    fontSize: CTA_SIZE,
    minFontSize: 16,
    fontFamily: fonts.heading,
  })
  const ctaWidth = Math.max(
    CTA_MIN_W,
    Math.round(measureTextUnits(ctaLabel.text, { bold: true, fontFamily: fonts.heading }) * ctaLabel.fontSize + CTA_PAD_X * 2),
  )
  const ctaFill = colors.primary
  const ctaInk = accessibleInk(readableOn(ctaFill), ctaFill, ctaLabel.fontSize)
  const ctaTextY = Math.round(CTA_Y + CTA_H / 2 + ctaLabel.fontSize * 0.35)

  return (
    <>
      {heading.lines.map((line, i) =>
        renderEmphasisText(
          lineSegs[i] ?? [{ text: line, emphasized: false }],
          {
            accent: accentInk,
            padFill: colors.accent,
            baseFill: titleInk,
            fontWeight: "700",
            themeId: ctx.themeId,
            measureWeight: { bold: true, fontFamily: fonts.heading },
          },
          <text
            key={i}
            data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
            x={TITLE_X}
            y={TITLE_Y + i * heading.lineHeight}
            fontFamily={fonts.heading}
            fontSize={heading.fontSize}
            fontWeight="700"
            fill={titleInk}
            dominantBaseline="alphabetic"
          />,
        ),
      )}

      {subheading && (
        <text
          data-truncated={subheading.truncated ? "1" : undefined}
          x={SUB_X}
          y={subY}
          fontFamily={fonts.body}
          fontSize={subheading.fontSize}
          fill={accessibleInk(colors.muted, defaultBg, subheading.fontSize)}
          dominantBaseline="alphabetic"
        >
          {subheading.text}
        </text>
      )}

      <rect x={CTA_X} y={CTA_Y} width={ctaWidth} height={CTA_H} fill={ctaFill} />
      <text
        x={CTA_X + ctaWidth / 2}
        y={ctaTextY}
        textAnchor="middle"
        fontFamily={fonts.heading}
        fontSize={ctaLabel.fontSize}
        fontWeight="700"
        fill={ctaInk}
        dominantBaseline="alphabetic"
      >
        {ctaLabel.text}
      </text>
    </>
  )
}

export const layoutDef: LayoutDefinition = {
  // ending-ask-ending.tsx: fundraising ask as the heading, one primary
  // CTA block. pinOnly board lock. No thank-you fallback.
  id: "ask-ending",
  kind: "archetype",
  pinOnly: true,
  slideTypes: ["ending"],
  slots: [
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "meta", accepts: [] },
  ],
}
