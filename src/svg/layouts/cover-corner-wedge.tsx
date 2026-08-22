import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { latinUpper, trackingPx } from "./minimal-shared"
import { accessibleInk, metaInk, readableOn } from "../ink"

/**
 * corner-wedge cover layout（2026-08-22 封面还原第一波，新表达）：
 * **右下三角楔 + 更亮的叠加斜带**。构图抄 arena / ember 两家封面样例：
 * 同一只角楔，arena 是居中海报加小楔，ember 是左齐标题加大楔。标题对齐与
 * 楔的峰点由 `style.shape.cover` 参数化。
 *
 * **它进共享池，不是 arena / ember 专用**。零 theme id、零 hex。HUD 括弧
 * 和火星点列是各自主题 motif 的事，本版式不重画。现有 `split-diagonal`
 * 是全高侧栏，左右对调仍画不出从底边长出来的三角。
 *
 * 服务场景：电竞开赛封面、路演角楔开场。任何需要「右下角切入一块色」而不是
 * 左侧通栏色块的主题都可以抽。
 *
 * 板上做不到、最近落地：
 *   1. 叠加斜带从斜边内缩，不烤 arena / ember 的 hex。
 *   2. ember 的 meta 反白入楔，收到 x1108，躲开 logo 盒。
 *   3. CJK 标题不加 letter-spacing（板上 arena 给了 2px）。
 *   4. 本版式不设 `paintsOwnBackground`：楔画在 `Background` 上面。
 */

const DEFAULT_PEAK_Y = 340
const DEFAULT_START_X = 980
const OUTER_INSET = 60
const INNER_INSET = 100
const OVERLAY_OPACITY = 0.7

const TITLE_SIZE_CENTER = 80
const TITLE_SIZE_START = 64
const TITLE_MIN_PT = 36
const TITLE_MAX_LINES = 2
const TITLE_CENTER_X = 640
const TITLE_CENTER_Y = 360
const TITLE_START_X = 96
const TITLE_START_Y = 356
const TITLE_LINE_HEIGHT_CENTER = 86
const TITLE_LINE_HEIGHT_START = 80

const KICKER_SIZE = 19
const KICKER_TRACKING_EM = 0.32
const SUBTITLE_SIZE = 23
const META_X = 1108
const META_Y = 700
const META_SIZE = 16
const FOOT_X = 96
const FOOT_Y = 700
const FOOT_SIZE = 16

function hasCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text)
}

function wedgePath(startX: number, peakY: number): string {
  return `M${startX},720 L1280,${peakY} L1280,720 Z`
}

function overlayPath(startX: number, peakY: number): string {
  const outerStart = startX + OUTER_INSET
  const innerStart = startX + INNER_INSET
  const slope = (peakY - 720) / (1280 - startX)
  const yAt = (fromX: number) => Math.round(720 + slope * (1280 - fromX))
  return `M${outerStart},720 L1280,${yAt(outerStart)} L1280,${yAt(innerStart)} L${innerStart},720 Z`
}

export function CornerWedgeCover({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const bg = ctx.defaultBg ?? colors.bg
  const cover = ctx.shape?.cover
  const peakY = cover?.wedgePeakY ?? DEFAULT_PEAK_Y
  const startX = cover?.wedgeStartX ?? DEFAULT_START_X
  const textAnchor = cover?.textAnchor ?? "middle"
  const metaInWedge = cover?.metaInWedge === true
  const centered = textAnchor === "middle"
  const titleX = centered ? TITLE_CENTER_X : TITLE_START_X
  const titleY = centered ? TITLE_CENTER_Y : TITLE_START_Y
  const titleSize = centered ? TITLE_SIZE_CENTER : TITLE_SIZE_START
  const lineHeightRatio = centered
    ? TITLE_LINE_HEIGHT_CENTER / TITLE_SIZE_CENTER
    : TITLE_LINE_HEIGHT_START / TITLE_SIZE_START
  // Title stays on paper. The wedge's leftmost point is startX at y=720,
  // and the hypotenuse climbs up-right, so anything left of startX cannot
  // sit on the primary field. Long CJK headings at display size would
  // otherwise spill onto the wedge and fail large-text 3:1 (academic 2.10,
  // ink 1.10, journal 1.09 on the matrix heading).
  const titleMaxW = centered
    ? Math.max(320, 2 * (startX - TITLE_CENTER_X - 24))
    : Math.max(320, startX - TITLE_START_X - 24)
  const kickerY = centered ? 248 : 262
  const designedSubtitleY = centered ? 446 : 496
  const onWedge = readableOn(colors.primary)

  const org = ir.meta.organization
  const author = ir.meta.authors?.[0]
  const authorText = author ? [author.name, author.role].filter(Boolean).join(" · ") : null
  const version = ir.meta.version

  const title = fitHeadingLines(slide.heading, {
    maxWidth: titleMaxW,
    fontSize: titleSize,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
    lineHeightRatio,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
  })
  const titleInk = accessibleInk(colors.text, bg, title.fontSize)

  const kickerSrc = org ? (hasCjk(org) ? org : latinUpper(org)) : null
  const kickerTracking = kickerSrc && !hasCjk(kickerSrc) ? trackingPx(KICKER_SIZE, KICKER_TRACKING_EM) : undefined
  const kicker = kickerSrc
    ? fitSvgLine(kickerSrc, {
        maxWidth: titleMaxW,
        fontSize: KICKER_SIZE,
        minFontSize: 12,
        letterSpacing: kickerTracking,
        fontFamily: fonts.body,
      })
    : null

  const subtitle = layoutSvgText(slide.subheading || "", {
    maxWidth: titleMaxW,
    fontSize: centered ? 34 : SUBTITLE_SIZE,
    maxLines: 2,
    lineHeightRatio: 1.25,
    fontFamily: fonts.body,
  })
  const titleLastY = titleY + Math.max(0, title.lines.length - 1) * title.lineHeight
  const subtitleY = Math.max(
    designedSubtitleY,
    titleLastY + Math.round(title.fontSize * 0.16) + subtitle.fontSize + 12,
  )

  const wedgeMeta = authorText
    ? fitSvgLine(authorText, {
        maxWidth: 720,
        fontSize: META_SIZE,
        minFontSize: 12,
        fontFamily: fonts.body,
      })
    : null
  const paperFootParts = [org, authorText, version].filter((v): v is string => Boolean(v))
  const paperFoot =
    !metaInWedge && paperFootParts.length > 0
      ? fitSvgLine(paperFootParts.join(" · "), {
          maxWidth: 720,
          fontSize: FOOT_SIZE,
          minFontSize: 12,
          fontFamily: fonts.body,
        })
      : null

  return (
    <>
      <path d={wedgePath(startX, peakY)} fill={colors.primary} />
      <path d={overlayPath(startX, peakY)} fill={colors.accent} opacity={OVERLAY_OPACITY} />

      {kicker && (
        <text
          data-truncated={kicker.truncated ? "1" : undefined}
          x={titleX}
          y={kickerY}
          textAnchor={centered ? "middle" : "start"}
          fontFamily={fonts.body}
          fontSize={kicker.fontSize}
          fill={accessibleInk(colors.accent, bg, kicker.fontSize)}
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
          x={titleX}
          y={titleY + i * title.lineHeight}
          textAnchor={centered ? "middle" : "start"}
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
          x={titleX}
          y={subtitleY + i * subtitle.lineHeight}
          textAnchor={centered ? "middle" : "start"}
          fontFamily={fonts.body}
          fontSize={subtitle.fontSize}
          fill={accessibleInk(colors.accent, bg, subtitle.fontSize)}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {metaInWedge && wedgeMeta && (
        <text
          data-contrast-tier="meta"
          data-truncated={wedgeMeta.truncated ? "1" : undefined}
          x={META_X}
          y={META_Y}
          textAnchor="end"
          fontFamily={fonts.body}
          fontSize={wedgeMeta.fontSize}
          fill={metaInk(onWedge, colors.primary)}
          dominantBaseline="alphabetic"
        >
          {wedgeMeta.text}
        </text>
      )}

      {paperFoot && (
        <text
          data-contrast-tier="meta"
          data-truncated={paperFoot.truncated ? "1" : undefined}
          x={FOOT_X}
          y={FOOT_Y}
          fontFamily={fonts.body}
          fontSize={paperFoot.fontSize}
          fill={metaInk(colors.muted, bg)}
          dominantBaseline="alphabetic"
        >
          {paperFoot.text}
        </text>
      )}
    </>
  )
}

export const layoutDef: LayoutDefinition = {
  // cover-corner-wedge.tsx: lower-right triangular wedge plus a brighter
  // overlay slash inset from the hypotenuse. Title alignment and peak come
  // from style.shape.cover. Overlay always on.
  id: "corner-wedge",
  kind: "archetype",
  slideTypes: ["cover"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "meta", accepts: [] },
  ],
}
