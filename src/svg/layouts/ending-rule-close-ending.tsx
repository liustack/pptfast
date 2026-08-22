import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleInk, metaInk } from "../ink"
import { showsDocumentMeta } from "../document-meta"
import {
  parseEmphasis,
  renderEmphasisText,
  sliceEmphasisForLines,
  stripEmphasis,
} from "../emphasis"

/**
 * rule-close-ending（第八波 tech 板，新 pinOnly）：收束句 + 通栏细线起端
 * 加粗青段。收束感来自线，不来自点，不致谢。
 *
 * 构图抄 `.issues/design-boards/wave8/b1/Tech.dc.html` ending：标题首行
 * y300 / 46px、次行 y376、通栏线 y480 x96→1184、起端青段 80px / 3px、
 * 落款 y580。青光只走 `**强调**`。零 theme id、零 hex。
 */

const TITLE_X = 96
const TITLE_Y = 300
const TITLE_SIZE = 46
const TITLE_MIN_PT = 28
const TITLE_MAX_LINES = 2
const TITLE_MAX_W = 1088
const TITLE_LINE_HEIGHT = 76

const RULE_X1 = 96
const RULE_X2 = 1184
const RULE_Y = 480
const RULE_STROKE = 1.5
const ACCENT_LEN = 80
const ACCENT_STROKE = 3

const FOOT_X = 96
const FOOT_Y = 580
const FOOT_SIZE = 17

export function RuleCloseEnding({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const bg = ctx.defaultBg ?? colors.bg
  const headingSource = slide.heading ?? ""
  const plainHeading = stripEmphasis(headingSource)
  const headingSegs = parseEmphasis(headingSource)

  const title = fitHeadingLines(plainHeading, {
    maxWidth: TITLE_MAX_W,
    fontSize: TITLE_SIZE,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
    lineHeightRatio: TITLE_LINE_HEIGHT / TITLE_SIZE,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
  })
  const lineSegs = sliceEmphasisForLines(headingSegs, title.lines)
  const titleInk = accessibleInk(colors.text, bg, title.fontSize)
  const accentInk = accessibleInk(colors.accent, bg, title.fontSize)
  const ruleStroke = colors.border ?? colors.muted

  const org = ir.meta.organization
  const contact = ir.meta.contact
  const contactText = contact
    ? [contact.name, contact.email].filter(Boolean).join(" · ")
    : null
  const author = ir.meta.authors?.[0]
  const authorText = author ? [author.name, author.role].filter(Boolean).join(" · ") : null
  const date = showsDocumentMeta(ir) ? ir.meta.date : undefined
  const footParts = [org, contactText, authorText, date].filter((v): v is string => Boolean(v))
  const foot =
    footParts.length > 0
      ? fitSvgLine(footParts.join(" · "), {
          maxWidth: 1000,
          fontSize: FOOT_SIZE,
          minFontSize: 12,
          fontFamily: fonts.body,
        })
      : null

  return (
    <>
      {plainHeading
        ? title.lines.map((line, i) =>
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
                data-truncated={title.truncated && i === title.lines.length - 1 ? "1" : undefined}
                x={TITLE_X}
                y={TITLE_Y + i * title.lineHeight}
                fontFamily={fonts.heading}
                fontSize={title.fontSize}
                fontWeight="700"
                fill={titleInk}
                dominantBaseline="alphabetic"
              />,
            ),
          )
        : null}

      <g data-decor-piece="close-rule">
        <g data-depth="mid">
          <line
            x1={RULE_X1}
            y1={RULE_Y}
            x2={RULE_X2}
            y2={RULE_Y}
            stroke={ruleStroke}
            strokeWidth={RULE_STROKE}
          />
        </g>
        <line
          x1={RULE_X1}
          y1={RULE_Y}
          x2={RULE_X1 + ACCENT_LEN}
          y2={RULE_Y}
          stroke={colors.accent}
          strokeWidth={ACCENT_STROKE}
        />
      </g>

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
  // ending-rule-close-ending.tsx: closing sentence, full-width border rule
  // with a short accent start. pinOnly board lock. No thank-you fallback.
  id: "rule-close-ending",
  kind: "archetype",
  pinOnly: true,
  slideTypes: ["ending"],
  slots: [
    { name: "heading", accepts: [] },
    { name: "rule", accepts: [] },
    { name: "meta", accepts: [] },
  ],
} satisfies LayoutDefinition
