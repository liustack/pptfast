import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { chapterNumberFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleInk } from "../ink"
import { chapterIndexKicker, latinUpper, trackingPx } from "./minimal-shared"

/**
 * verse-chapter layout（极简版式波）：居中诗行章首。chapter 页本来就不画
 * Branding 页脚。缺的是居中诗行，不是再做一个左对齐大章号。`pinOnly` +
 * `branding: "none"`——品牌页脚 / logo 关掉，motif 仍画。无水印数字，无罗马圆弧，无 body 槽
 * （chapter 页不渲 components / footnote，validate-core 既有门照旧）。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量，颜色 / 字体全部来自 ctx。
 */

const CENTER_X = 640
const CONTENT_MAX_W = 920
const KICKER_Y = 90
const TITLE_Y = 280
const KICKER_SIZE = 12
const SUB_SIZE = 20
const KICKER_TRACKING_EM = 0.42
const SUB_GAP = 48

export function VerseChapter({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const defaultBg = ctx.defaultBg ?? colors.bg

  const chNum = chapterNumberFor(ir.slides, index)
  const kickerTracking = trackingPx(KICKER_SIZE, KICKER_TRACKING_EM)
  const kickerSource = latinUpper(chapterIndexKicker(chNum, slide.heading))
  const kicker = fitSvgLine(kickerSource, {
    maxWidth: CONTENT_MAX_W,
    fontSize: KICKER_SIZE,
    minFontSize: 10,
    letterSpacing: kickerTracking,
  })

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
      })
    : null
  const subY = titleLastY + SUB_GAP

  return (
    <>
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

      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x={CENTER_X}
          y={TITLE_Y + i * heading.lineHeight}
          textAnchor="middle"
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="500"
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
          fontFamily={fonts.heading}
          fontSize={subheading.fontSize}
          fill={accessibleInk(colors.muted, defaultBg, subheading.fontSize)}
          fontStyle="italic"
          dominantBaseline="alphabetic"
        >
          {subheading.text}
        </text>
      )}
    </>
  )
}

export const layoutDef = {
  // chapter-verse-chapter.tsx: a pinOnly centered verse-as-chapter-open.
  // Tracking chapter-index kicker, 2-line heading, optional italic
  // subheading. No watermark numeral, no body slot (chapter pages never
  // render components or footnote). branding: "none" skips logo (chapter
  // pages already omit the brand footer). The theme motif still paints. The
  // fifth-band decoration safe-zone does not apply — the whole canvas is
  // the layout's.
  id: "verse-chapter",
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
    fontSize: 52,
    maxLines: 2,
    minPt: 32,
    bold: false,
    lineHeightRatio: 1.18,
  },
} satisfies LayoutDefinition
