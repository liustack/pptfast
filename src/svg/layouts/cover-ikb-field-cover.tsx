import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { accessibleInk, metaInk, readableOn } from "../ink"
import { hasCjk } from "./minimal-shared"
import { stripEmphasis } from "../emphasis"

/**
 * ikb-field-cover（第八波企业制度封面）：满版 primary 场，左齐反白标题，
 * 题下一条短杠收题。构图抄 `.issues/design-boards/wave8/b1/Enterprise.dc.html`
 * 封面：kicker y132、标题两行约 y348/440、白杠 y496、底句 y662。
 *
 * 进共享池，不是 enterprise 专用。零 theme id、零 baked hex。方块阶归
 * motif，本版式不重画。满版色场由本文件自己铺（`paintsOwnBackground`），
 * 主题 `defaultBackgrounds.cover` 保持浅底，避免 `assertContrastFloor`
 * 拿深字压深底判红。
 *
 * 板上做不到、最近落地：
 *   1. CJK 标题与 kicker 不加 letter-spacing。
 *   2. 字色走 `readableOn` / `metaInk` 相对本场 primary，不烤白字。
 *   3. 空 heading 不编造封面句，也不画那条收题杠。
 */

const TITLE_X = 96
const TITLE_Y = 348
const TITLE_SIZE = 64
const TITLE_MIN_PT = 36
const TITLE_MAX_LINES = 2
const TITLE_MAX_W = 960
const TITLE_LINE_HEIGHT = 92

const KICKER_X = 96
const KICKER_Y = 132
const KICKER_SIZE = 17
const KICKER_TRACKING = 6
const KICKER_MAX_W = 960

const SUBTITLE_X = 96
const SUBTITLE_Y = 662
const SUBTITLE_SIZE = 17
const SUBTITLE_MAX_W = 960

const BAR_X = 96
const BAR_W = 120
const BAR_H = 8
const BAR_GAP = 56

export function IkbFieldCover({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const field = colors.primary
  const ink = readableOn(field)
  const org = ir.meta.organization
  const headingSource = slide.heading ?? ""
  const plainHeading = stripEmphasis(headingSource)

  const title = fitHeadingLines(plainHeading, {
    maxWidth: TITLE_MAX_W,
    fontSize: TITLE_SIZE,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
    lineHeightRatio: TITLE_LINE_HEIGHT / TITLE_SIZE,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
  })
  const titleInk = accessibleInk(ink, field, title.fontSize)
  const titleLastY = TITLE_Y + Math.max(0, title.lines.length - 1) * title.lineHeight
  const barY = titleLastY + BAR_GAP
  const showTitle = plainHeading.trim().length > 0

  const kickerTracking = org && !hasCjk(org) ? KICKER_TRACKING : undefined
  const kicker = org
    ? fitSvgLine(org, {
        maxWidth: KICKER_MAX_W,
        fontSize: KICKER_SIZE,
        minFontSize: 12,
        letterSpacing: kickerTracking,
        fontFamily: fonts.body,
      })
    : null

  const subtitle = layoutSvgText(slide.subheading || "", {
    maxWidth: SUBTITLE_MAX_W,
    fontSize: SUBTITLE_SIZE,
    maxLines: 2,
    lineHeightRatio: 1.25,
    fontFamily: fonts.body,
  })

  return (
    <>
      <rect x={0} y={0} width={1280} height={720} fill={field} />

      {kicker && (
        <text
          data-contrast-tier="meta"
          data-truncated={kicker.truncated ? "1" : undefined}
          x={KICKER_X}
          y={KICKER_Y}
          fontFamily={fonts.body}
          fontSize={kicker.fontSize}
          fill={metaInk(colors.muted, field)}
          letterSpacing={kickerTracking}
          dominantBaseline="alphabetic"
        >
          {kicker.text}
        </text>
      )}

      {showTitle &&
        title.lines.map((line, i) => (
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
          >
            {line}
          </text>
        ))}

      {showTitle && (
        <rect x={BAR_X} y={barY} width={BAR_W} height={BAR_H} fill={ink} />
      )}

      {subtitle.lines.map((line, i) => (
        <text
          key={`sub-${i}`}
          data-contrast-tier="meta"
          data-truncated={subtitle.truncated && i === subtitle.lines.length - 1 ? "1" : undefined}
          x={SUBTITLE_X}
          y={SUBTITLE_Y + i * subtitle.lineHeight}
          fontFamily={fonts.body}
          fontSize={subtitle.fontSize}
          fill={metaInk(colors.muted, field)}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}
    </>
  )
}

export const layoutDef = {
  // cover-ikb-field-cover.tsx: full-bleed primary field, left-aligned
  // inverted title, short rule under the last title line. Motif owns the
  // square steps. Empty heading draws no title and no rule.
  id: "ikb-field-cover",
  kind: "archetype",
  pinOnly: true,
  branding: "none",
  paintsOwnBackground: true,
  slideTypes: ["cover"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "rule", accepts: [] },
  ],
  headingFit: {
    maxWidth: TITLE_MAX_W,
    fontSize: TITLE_SIZE,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
    lineHeightRatio: TITLE_LINE_HEIGHT / TITLE_SIZE,
  },
} satisfies LayoutDefinition
