import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { latinUpper, trackingPx } from "./minimal-shared"
import { accessibleInk, metaInk, readableOn } from "../ink"

/**
 * horizon-wedge cover layout（2026-08-22 封面还原第一波，新表达）：
 * **满宽底缘缓坡楔，标题留在楔上纸面**。构图抄 pulse 封面样例
 * （`audit19/covers/pulse.html`）：楔从左 y600 铺到右 y440，楔面走一条折线。
 *
 * **它进共享池，不是 pulse 专用**。零 theme id、零 hex。细胞圈和顶缘心电线
 * 是主题 motif 的事。版式若在楔面再走一条折线，motif 在封面要让开顶缘那条，
 * 避免两条心搏。
 *
 * 服务场景：诊疗季报封面、地平线式开场、底缘缓坡而不是侧栏斜切。任何需要
 * 「标题在坡上、色楔在坡下」的主题都可以抽。
 *
 * 板上做不到、最近落地：
 *   1. 现有 `split-diagonal` 是全高侧栏，铺不出这条地平线。
 *   2. 楔面折线是 1.5px 毛发线，第五带豁免。
 *   3. 楔内 meta 从板上 x1232 收到 x1108，躲开 logo 盒。
 *   4. 本版式不设 `paintsOwnBackground`：楔画在 `Background` 上面。
 */

const WEDGE_PATH = "M0,720 L0,600 L1280,440 L1280,720 Z"
const POLYLINE_POINTS = "120,668 400,632 520,618 552,586 584,650 616,610 1160,542"
const POLYLINE_STROKE = 1.5
const POLYLINE_OPACITY = 0.7

const TITLE_X = 96
const TITLE_Y = 370
const TITLE_SIZE = 64
const TITLE_MIN_PT = 36
const TITLE_MAX_LINES = 2
const TITLE_MAX_W = 1088
const TITLE_LINE_HEIGHT = 80

const KICKER_X = 96
const KICKER_Y = 278
const KICKER_SIZE = 19
const KICKER_TRACKING_EM = 0.26

const SUBTITLE_Y = 510
const SUBTITLE_SIZE = 23

const META_X = 1108
const META_Y = 700
const META_SIZE = 16

function hasCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text)
}

export function HorizonWedgeCover({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const bg = ctx.defaultBg ?? colors.bg
  const onWedge = readableOn(colors.primary)
  const org = ir.meta.organization
  const author = ir.meta.authors?.[0]
  const authorText = author ? [author.name, author.role].filter(Boolean).join(" · ") : null

  const title = fitHeadingLines(slide.heading, {
    maxWidth: TITLE_MAX_W,
    fontSize: TITLE_SIZE,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
    lineHeightRatio: TITLE_LINE_HEIGHT / TITLE_SIZE,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
  })
  const titleInk = accessibleInk(colors.text, bg, title.fontSize)

  const kickerSrc = org ? (hasCjk(org) ? org : latinUpper(org)) : null
  const kickerTracking = kickerSrc && !hasCjk(kickerSrc) ? trackingPx(KICKER_SIZE, KICKER_TRACKING_EM) : undefined
  const kicker = kickerSrc
    ? fitSvgLine(kickerSrc, {
        maxWidth: TITLE_MAX_W,
        fontSize: KICKER_SIZE,
        minFontSize: 12,
        letterSpacing: kickerTracking,
        fontFamily: fonts.body,
      })
    : null

  const subtitle = layoutSvgText(slide.subheading || "", {
    maxWidth: TITLE_MAX_W,
    fontSize: SUBTITLE_SIZE,
    maxLines: 2,
    lineHeightRatio: 1.25,
    fontFamily: fonts.body,
  })

  const meta = authorText
    ? fitSvgLine(authorText, {
        maxWidth: 720,
        fontSize: META_SIZE,
        minFontSize: 12,
        fontFamily: fonts.body,
      })
    : null

  return (
    <>
      <path d={WEDGE_PATH} fill={colors.primary} />
      <polyline
        points={POLYLINE_POINTS}
        fill="none"
        stroke={onWedge}
        strokeWidth={POLYLINE_STROKE}
        opacity={POLYLINE_OPACITY}
      />

      {kicker && (
        <text
          data-truncated={kicker.truncated ? "1" : undefined}
          x={KICKER_X}
          y={KICKER_Y}
          fontFamily={fonts.body}
          fontSize={kicker.fontSize}
          fill={accessibleInk(colors.primary, bg, kicker.fontSize)}
          letterSpacing={kickerTracking}
          dominantBaseline="alphabetic"
        >
          {kicker.text}
        </text>
      )}

      {title.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={title.truncated && i === title.lines.length - 1 ? "1" : undefined}
          x={TITLE_X}
          y={TITLE_Y + i * TITLE_LINE_HEIGHT}
          fontFamily={fonts.heading}
          fontSize={title.fontSize}
          fontWeight="700"
          fill={titleInk}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {subtitle.lines.map((line, i) => (
        <text
          key={`sub-${i}`}
          x={TITLE_X}
          y={SUBTITLE_Y + i * subtitle.lineHeight}
          fontFamily={fonts.body}
          fontSize={subtitle.fontSize}
          fill={metaInk(colors.muted, bg)}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {meta && (
        <text
          data-contrast-tier="meta"
          data-truncated={meta.truncated ? "1" : undefined}
          x={META_X}
          y={META_Y}
          textAnchor="end"
          fontFamily={fonts.body}
          fontSize={meta.fontSize}
          fill={metaInk(onWedge, colors.primary)}
          dominantBaseline="alphabetic"
        >
          {meta.text}
        </text>
      )}
    </>
  )
}

export const layoutDef: LayoutDefinition = {
  // cover-horizon-wedge.tsx: full-width bottom ramp wedge. Title stays on
  // paper above the wedge. Optional polyline on the wedge face. Meta
  // reversed in the wedge, pulled left of the logo box.
  id: "horizon-wedge",
  kind: "archetype",
  slideTypes: ["cover"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "meta", accepts: [] },
  ],
}
