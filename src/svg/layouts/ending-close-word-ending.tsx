import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleInk, metaInk } from "../ink"
import { parseEmphasis, renderEmphasisText, sliceEmphasisForLines, stripEmphasis } from "../emphasis"

/**
 * close-word-ending layout（2026-08-22 第八波批 1，新表达）：
 * **收盘两行，accent 只点 `**强调**` 词**。构图抄 insight 设计板 ending。
 * 底缘暗线归 motif，本版式不画。不致谢，不兜底 Thank you。
 *
 * **它进共享池，不是 insight 专用**。零 theme id、零 hex。强调走 tint
 * （insight 未分派 pad），没有标记就不改色。
 *
 * 服务场景：财报收口、投资备忘结尾、周报收盘。一句读完，点一个词。
 */

const TITLE_X = 96
const TITLE_Y = 320
const TITLE_SIZE = 44
const TITLE_MIN_PT = 28
const TITLE_MAX_LINES = 2
const TITLE_MAX_W = 480
const TITLE_LINE_HEIGHT = 72

const FOOT_X = 96
const FOOT_Y = 540
const FOOT_SIZE = 17
const FOOT_MAX_W = 1088

export function CloseWordEnding({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const bg = ctx.defaultBg ?? colors.bg
  const headingSource = slide.heading ?? ""
  const plainHeading = stripEmphasis(headingSource)
  const segments = parseEmphasis(headingSource)

  const title = fitHeadingLines(plainHeading, {
    maxWidth: TITLE_MAX_W,
    fontSize: TITLE_SIZE,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
    lineHeightRatio: TITLE_LINE_HEIGHT / TITLE_SIZE,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
    bold: false,
  })
  const lineSegs = sliceEmphasisForLines(segments, title.lines)
  const titleInk = accessibleInk(colors.text, bg, title.fontSize)
  const accentInk = accessibleInk(colors.accent, bg, title.fontSize)

  const org = ir.meta.organization
  const author = ir.meta.authors?.[0]
  const authorText = author ? [author.name, author.role].filter(Boolean).join(" · ") : null
  const footSource = slide.subheading?.trim() || [org, authorText].filter(Boolean).join(" · ")
  const foot = footSource
    ? fitSvgLine(footSource, {
        maxWidth: FOOT_MAX_W,
        fontSize: FOOT_SIZE,
        minFontSize: 12,
        fontFamily: fonts.body,
      })
    : null

  return (
    <>
      {title.lines.map((line, i) =>
        renderEmphasisText(
          lineSegs[i] ?? [{ text: line, emphasized: false }],
          {
            accent: accentInk,
            baseFill: titleInk,
            fontWeight: "400",
            themeId: ctx.themeId,
            measureWeight: { bold: false, fontFamily: fonts.heading },
          },
          <text
            key={i}
            data-truncated={title.truncated && i === title.lines.length - 1 ? "1" : undefined}
            x={TITLE_X}
            y={TITLE_Y + i * TITLE_LINE_HEIGHT}
            fontFamily={fonts.heading}
            fontSize={title.fontSize}
            fill={titleInk}
            dominantBaseline="alphabetic"
          />,
        ),
      )}

      {foot && (
        <text
          data-contrast-tier="meta"
          data-truncated={foot.truncated ? "1" : undefined}
          x={FOOT_X}
          y={FOOT_Y}
          fontFamily={fonts.body}
          fontSize={foot.fontSize}
          fill={metaInk(colors.muted, bg)}
          dominantBaseline="alphabetic"
        >
          {foot.text}
        </text>
      )}
    </>
  )
}

export const layoutDef = {
  // ending-close-word-ending.tsx: two-line close from heading, accent tint
  // only on **emphasis**, footer from subheading or org/author. No thank-you
  // fallback. Bottom ticker belongs to the motif. pinOnly.
  id: "close-word-ending",
  kind: "archetype",
  pinOnly: true,
  slideTypes: ["ending"],
  slots: [
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "meta", accepts: [] },
  ],
  headingFit: {
    maxWidth: TITLE_MAX_W,
    fontSize: TITLE_SIZE,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
    bold: false,
    lineHeightRatio: TITLE_LINE_HEIGHT / TITLE_SIZE,
  },
} satisfies LayoutDefinition
