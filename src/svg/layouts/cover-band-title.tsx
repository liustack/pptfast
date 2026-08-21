import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { latinUpper, trackingPx } from "./minimal-shared"
import { accessibleInk, metaInk, readableOn } from "../ink"
import { CONF_LABEL } from "../../lib/conf-labels"
import { showsDocumentMeta } from "../document-meta"

/**
 * band-title cover layout（2026-08-22 封面还原第一波，新表达）：
 * **通栏主色带承反白标题**。kicker 贴带上沿，meta 走顶栏。构图抄 classroom /
 * enterprise / vermilion 三家封面样例：一条色带把标题反白写进去，对齐、带的
 * y/h、带上小帽由 `style.shape.cover` 参数化。
 *
 * **它进共享池，不是某一家专用**。零 theme id、零 hex。打孔、刻度尺、金双线
 * 是各自主题 motif 的事，本版式不重画。
 *
 * 服务场景：板书式讲义封面、IKB 横幅开场、红头文件封面。任何需要「先拉一条
 * 通栏色带再把题目写进去」而不是纸面短粗条的主题都可以抽。
 *
 * 板上做不到、最近落地：
 *   1. CJK 标题不加 letter-spacing，即便板上给 Latin kicker 加了字距。
 *   2. enterprise 带上那枚方块走 `colors.accent` token，不烤 `#E85D1F`。
 *   3. classroom 带下陶土波浪是 layout 的强调件（固定 path，不跟标题宽度），
 *      打孔排仍归 motif。
 *   4. 顶栏右 meta 收到 x1108，躲开 (1120,48) 顶右 logo 带。
 *   5. 本版式不设 `paintsOwnBackground`：色带画在 `Background` 上面。
 */

const DEFAULT_BAND_Y = 260
const DEFAULT_BAND_H = 200
const BAND_W = 1280
const TITLE_SIZE = 60
const TITLE_MIN_PT = 36
const TITLE_MAX_LINES = 2
const TITLE_LINE_HEIGHT_RATIO = 76 / 60
const TITLE_PAD = 36
const KICKER_GAP = 26
const KICKER_SIZE = 18
const KICKER_TRACKING_EM = 0.22
const META_Y = 56
const META_RIGHT_X = 1108
const META_SIZE = 16
const MARK_SIZE = 26
const MARK_X = 1180
const MARK_DY = 26
const WAVE_DY = 42
const SUBTITLE_SIZE = 23
const AUTHOR_GAP = 44
const FOOT_LIMIT = 612

function hasCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text)
}

function hangingBaseline(top: number, fontSize: number): number {
  return top + Math.round(fontSize * 0.8)
}

export function BandTitleCover({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const bg = ctx.defaultBg ?? colors.bg
  const cover = ctx.shape?.cover
  const bandY = cover?.bandY ?? DEFAULT_BAND_Y
  const bandH = cover?.bandH ?? DEFAULT_BAND_H
  const textAnchor = cover?.textAnchor ?? "start"
  const bandMark = cover?.bandMark === true
  const bandWave = cover?.bandWave === true
  const centered = textAnchor === "middle"
  const titleX = centered ? 640 : 96
  const kickerX = titleX
  const titleMaxW = centered ? 1120 : 1088
  const bandBottom = bandY + bandH
  const onBand = readableOn(colors.primary)

  const org = ir.meta.organization
  const date = showsDocumentMeta(ir) ? ir.meta.date : undefined
  const conf = showsDocumentMeta(ir) ? ir.meta.confidentiality : undefined
  const confLabel = conf ? CONF_LABEL[conf] : null
  const author = ir.meta.authors?.[0]
  const authorText = author ? [author.name, author.role].filter(Boolean).join(" · ") : null

  const title = fitHeadingLines(slide.heading, {
    maxWidth: titleMaxW,
    fontSize: TITLE_SIZE,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
    lineHeightRatio: TITLE_LINE_HEIGHT_RATIO,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
  })
  const titleY = hangingBaseline(bandY + TITLE_PAD, title.fontSize)

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

  const rightParts = [confLabel, date].filter((v): v is string => Boolean(v))
  const rightMeta =
    rightParts.length > 0
      ? fitSvgLine(rightParts.join(" · "), {
          maxWidth: 360,
          fontSize: META_SIZE,
          minFontSize: 12,
          fontFamily: fonts.body,
        })
      : null

  const subtitleY = bandBottom + (bandWave ? 88 : 52)
  const subtitle = layoutSvgText(slide.subheading || "", {
    maxWidth: titleMaxW,
    fontSize: SUBTITLE_SIZE,
    maxLines: 2,
    lineHeightRatio: 1.25,
    fontFamily: fonts.body,
  })
  const authorY = Math.min(FOOT_LIMIT, subtitleY + subtitle.lines.length * subtitle.lineHeight + (subtitle.lines.length > 0 ? AUTHOR_GAP - subtitle.lineHeight : 0))

  const paperMeta = metaInk(colors.muted, bg)
  const paperKicker = accessibleInk(colors.primary, bg, KICKER_SIZE)
  const paperSub = metaInk(colors.muted, bg)

  return (
    <>
      {/* org 只出现一次：带上沿 kicker 已承了它，顶栏左位不重复
          （2026-08-22 目检抓的重复缺陷），顶栏只留右侧密级·日期。 */}
      {rightMeta && (
        <text
          data-contrast-tier="meta"
          data-truncated={rightMeta.truncated ? "1" : undefined}
          x={META_RIGHT_X}
          y={META_Y}
          textAnchor="end"
          fontFamily={fonts.body}
          fontSize={rightMeta.fontSize}
          fill={paperMeta}
          dominantBaseline="alphabetic"
        >
          {rightMeta.text}
        </text>
      )}

      {kicker && (
        <text
          data-truncated={kicker.truncated ? "1" : undefined}
          x={kickerX}
          y={bandY - KICKER_GAP}
          textAnchor={centered ? "middle" : "start"}
          fontFamily={fonts.body}
          fontSize={kicker.fontSize}
          fill={paperKicker}
          letterSpacing={kickerTracking}
          dominantBaseline="alphabetic"
        >
          {kicker.text}
        </text>
      )}

      <rect x={0} y={bandY} width={BAND_W} height={bandH} fill={colors.primary} />
      {bandMark && (
        <rect x={MARK_X} y={bandY + MARK_DY} width={MARK_SIZE} height={MARK_SIZE} fill={colors.accent} />
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
          fill={onBand}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {bandWave && (
        <path
          d={`M96,${bandBottom + WAVE_DY} q60,10 120,0 q60,-10 120,0 q60,10 120,0`}
          fill="none"
          stroke={colors.accent}
          strokeWidth={2.5}
        />
      )}

      {subtitle.lines.map((line, i) => (
        <text
          key={`sub-${i}`}
          x={titleX}
          y={subtitleY + i * subtitle.lineHeight}
          textAnchor={centered ? "middle" : "start"}
          fontFamily={fonts.body}
          fontSize={subtitle.fontSize}
          fill={paperSub}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {authorText && (
        <text
          data-contrast-tier="meta"
          x={titleX}
          y={authorY}
          textAnchor={centered ? "middle" : "start"}
          fontFamily={fonts.body}
          fontSize={17}
          fill={paperMeta}
          dominantBaseline="alphabetic"
        >
          {authorText}
        </text>
      )}
    </>
  )
}

export const layoutDef: LayoutDefinition = {
  // cover-band-title.tsx: full-width primary band carrying reversed title.
  // kicker sits on the band's top edge. meta in the top bar. Alignment /
  // band y/h / mark / wave come from style.shape.cover.
  id: "band-title",
  kind: "archetype",
  slideTypes: ["cover"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "meta", accepts: [] },
  ],
}
