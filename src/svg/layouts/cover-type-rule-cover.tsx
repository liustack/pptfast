import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { accessibleInk, metaInk } from "../ink"
import { hasCjk } from "./minimal-shared"
import {
  parseEmphasis,
  renderEmphasisText,
  sliceEmphasisForLines,
  stripEmphasis,
} from "../emphasis"

/**
 * type-rule-cover（第八波 tech 板，新 pinOnly）：纯排印封面。kicker / 标题 /
 * 副题 / 题下短规线 / 落款，没有星座、没有碎点。青光只走标题或副题里的
 * `**强调**`（tint），没有标记就不点亮。规线取 `colors.border`，永不亮色。
 *
 * 构图抄 `.issues/design-boards/wave8/b1/Tech.dc.html` 封面：kicker y150、
 * 标题末行 y348 / 62px、副题 y428 / 30px、短规线 y486 x96→380、落款 y662。
 * 两行标题末行仍钉在 348，首行上让。零 theme id、零 hex。
 */

const TITLE_X = 96
const TITLE_Y = 348
const TITLE_SIZE = 62
const TITLE_MIN_PT = 36
const TITLE_MAX_LINES = 2
const TITLE_MAX_W = 1088
const TITLE_LINE_HEIGHT = 78

const KICKER_X = 96
const KICKER_Y = 150
const KICKER_SIZE = 17
const KICKER_TRACKING = 6

const SUBTITLE_GAP = 80
const SUBTITLE_SIZE = 30
const SUBTITLE_MAX_W = 1088

const RULE_X1 = 96
const RULE_X2 = 380
const RULE_AFTER_SUB = 58
const RULE_AFTER_TITLE = 138
const RULE_STROKE = 1.5

const FOOT_X = 96
const FOOT_Y = 662
const FOOT_SIZE = 17

export function TypeRuleCover({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const bg = ctx.defaultBg ?? colors.bg
  const org = ir.meta.organization
  const author = ir.meta.authors?.[0]
  const authorText = author ? [author.name, author.role].filter(Boolean).join(" · ") : null
  const version = ir.meta.version
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
  const titleY = TITLE_Y - Math.max(0, title.lines.length - 1) * title.lineHeight
  const titleLastY = TITLE_Y
  const lineSegs = sliceEmphasisForLines(headingSegs, title.lines)
  const titleInk = accessibleInk(colors.text, bg, title.fontSize)
  const titleAccentInk = accessibleInk(colors.accent, bg, title.fontSize)

  const kickerTracking = org && !hasCjk(org) ? KICKER_TRACKING : undefined
  const kicker = org
    ? fitSvgLine(org, {
        maxWidth: TITLE_MAX_W,
        fontSize: KICKER_SIZE,
        minFontSize: 12,
        letterSpacing: kickerTracking,
        fontFamily: fonts.body,
      })
    : null

  const subSource = slide.subheading || ""
  const subPlain = stripEmphasis(subSource)
  const subSegs = parseEmphasis(subSource)
  const subtitle = layoutSvgText(subPlain, {
    maxWidth: SUBTITLE_MAX_W,
    fontSize: SUBTITLE_SIZE,
    maxLines: 2,
    lineHeightRatio: 1.25,
    fontFamily: fonts.body,
  })
  const subLineSegs = sliceEmphasisForLines(subSegs, subtitle.lines)
  const subAccentInk = accessibleInk(colors.accent, bg, subtitle.fontSize)
  const subtitleY = titleLastY + SUBTITLE_GAP
  const subtitleLastY =
    subtitle.lines.length > 0
      ? subtitleY + Math.max(0, subtitle.lines.length - 1) * subtitle.lineHeight
      : titleLastY
  const ruleY = subtitle.lines.length > 0 ? subtitleLastY + RULE_AFTER_SUB : titleLastY + RULE_AFTER_TITLE
  const ruleStroke = colors.border ?? colors.muted

  const footParts = [authorText, version].filter((v): v is string => Boolean(v))
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
      {kicker && (
        <text
          data-contrast-tier="meta"
          data-truncated={kicker.truncated ? "1" : undefined}
          x={KICKER_X}
          y={KICKER_Y}
          fontFamily={fonts.body}
          fontSize={kicker.fontSize}
          fill={metaInk(colors.muted, bg)}
          letterSpacing={kickerTracking}
          dominantBaseline="alphabetic"
        >
          {kicker.text}
        </text>
      )}

      {plainHeading
        ? title.lines.map((line, i) =>
            renderEmphasisText(
              lineSegs[i] ?? [{ text: line, emphasized: false }],
              {
                accent: titleAccentInk,
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
                y={titleY + i * title.lineHeight}
                fontFamily={fonts.heading}
                fontSize={title.fontSize}
                fontWeight="700"
                fill={titleInk}
                dominantBaseline="alphabetic"
              />,
            ),
          )
        : null}

      {subtitle.lines.map((line, i) =>
        renderEmphasisText(
          subLineSegs[i] ?? [{ text: line, emphasized: false }],
          {
            accent: subAccentInk,
            padFill: colors.accent,
            baseFill: metaInk(colors.muted, bg),
            fontWeight: "600",
            themeId: ctx.themeId,
            measureWeight: { fontFamily: fonts.body },
          },
          <text
            key={`sub-${i}`}
            data-contrast-tier="meta"
            data-truncated={subtitle.truncated && i === subtitle.lines.length - 1 ? "1" : undefined}
            x={TITLE_X}
            y={subtitleY + i * subtitle.lineHeight}
            fontFamily={fonts.body}
            fontSize={subtitle.fontSize}
            fill={metaInk(colors.muted, bg)}
            dominantBaseline="alphabetic"
          />,
        ),
      )}

      <g data-depth="mid" data-decor-piece="title-rule">
        <line
          x1={RULE_X1}
          y1={ruleY}
          x2={RULE_X2}
          y2={ruleY}
          stroke={ruleStroke}
          strokeWidth={RULE_STROKE}
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
  // cover-type-rule-cover.tsx: left-aligned type cover, short border rule
  // under the title block, cyan only on **emphasis**. pinOnly board lock.
  id: "type-rule-cover",
  kind: "archetype",
  pinOnly: true,
  slideTypes: ["cover"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "rule", accepts: [] },
    { name: "meta", accepts: [] },
  ],
} satisfies LayoutDefinition
