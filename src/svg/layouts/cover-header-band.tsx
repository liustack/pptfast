import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine, layoutSvgText, measureTextUnits } from "../../lib/svg-text-layout"
import { accessibleInk, blendOver, metaInk, readableOn } from "../ink"
import { CONF_LABEL } from "../../lib/conf-labels"
import { showsDocumentMeta } from "../document-meta"
import { parseEmphasis, renderEmphasisTspans, sliceEmphasisForLines, stripEmphasis } from "../emphasis"

/**
 * header-band cover layout（2026-08-22 封面还原第一波，新表达）：
 * **顶栏色带只承 meta，标题落在带下卡纸上**。强调词走 accent，可在词下衬一条
 * 波浪。构图抄 crayon 封面样例（`audit19/covers/crayon.html`）：蓝带底边
 * y=152（caption 写 y170 是错的），标题黑字在带下面。
 *
 * **它进共享池，不是 crayon 专用**。零 theme id、零 hex。蜡笔涂边、太阳、
 * 彩虹、星贴纸、圆贴纸是主题 motif 的事，本版式不重画。
 *
 * 服务场景：低龄教育开场、卡纸手工封面、顶栏色块把 meta 和标题分成两层的
 * 讲义。任何需要「色带只到顶、题目写在纸上」而不是把标题塞进带里的主题都
 * 可以抽。
 *
 * 板上做不到、最近落地：
 *   1. 带高按 SVG 几何 152，不跟 caption 的 y170。
 *   2. 带内 meta 的 0.85 透明度折进 `metaInk`，不留 fillOpacity。
 *   3. 没有 `**` 就不画强调色，也不画波浪。
 *   4. CJK 标题不加 letter-spacing。
 */

const BAND_H = 152
const META_LEFT_X = 64
const META_RIGHT_X = 1216
const META_Y = 62
const META_SIZE = 16
const META_ALPHA = 0.85

const TITLE_X = 96
const TITLE_Y = 330
const TITLE_SIZE = 64
const TITLE_MIN_PT = 36
const TITLE_MAX_LINES = 2
const TITLE_MAX_W = 1088
const TITLE_LINE_HEIGHT = 90

const WAVE_DY = 28
const SUBTITLE_Y = 502
const SUBTITLE_SIZE = 23
const BYLINE_Y = 546
const BYLINE_SIZE = 17

export function HeaderBandCover({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const bg = ctx.defaultBg ?? colors.bg
  const onBand = readableOn(colors.primary)
  const metaFill = metaInk(blendOver(onBand, colors.primary, META_ALPHA), colors.primary)

  const org = ir.meta.organization
  const date = showsDocumentMeta(ir) ? ir.meta.date : undefined
  const conf = showsDocumentMeta(ir) ? ir.meta.confidentiality : undefined
  const confLabel = conf ? CONF_LABEL[conf] : null
  const author = ir.meta.authors?.[0]
  const authorText = author ? [author.name, author.role].filter(Boolean).join(" · ") : null

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
  })
  const lineSegs = sliceEmphasisForLines(segments, title.lines)
  const titleInk = accessibleInk(colors.text, bg, title.fontSize)
  const accent = colors.accent

  let waveX: number | null = null
  let waveY: number | null = null
  lineSegs.forEach((segs, i) => {
    if (waveX !== null) return
    let x = TITLE_X
    for (const seg of segs) {
      if (seg.emphasized && seg.text.length > 0) {
        waveX = x
        waveY = TITLE_Y + i * TITLE_LINE_HEIGHT + WAVE_DY
        return
      }
      x += measureTextUnits(seg.text, { bold: true, fontFamily: fonts.heading }) * title.fontSize
    }
  })

  const leftMeta = org
    ? fitSvgLine(org, {
        maxWidth: 720,
        fontSize: META_SIZE,
        minFontSize: 12,
        fontFamily: fonts.body,
      })
    : null
  const rightParts = [confLabel, date].filter((v): v is string => Boolean(v))
  const rightMeta =
    rightParts.length > 0
      ? fitSvgLine(rightParts.join(" · "), {
          maxWidth: 420,
          fontSize: META_SIZE,
          minFontSize: 12,
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
  const byline = authorText
    ? fitSvgLine(authorText, {
        maxWidth: TITLE_MAX_W,
        fontSize: BYLINE_SIZE,
        minFontSize: 12,
        fontFamily: fonts.body,
      })
    : null

  return (
    <>
      <rect x={0} y={0} width={1280} height={BAND_H} fill={colors.primary} />
      {leftMeta && (
        <text
          data-contrast-tier="meta"
          data-truncated={leftMeta.truncated ? "1" : undefined}
          x={META_LEFT_X}
          y={META_Y}
          fontFamily={fonts.body}
          fontSize={leftMeta.fontSize}
          fill={metaFill}
          dominantBaseline="alphabetic"
        >
          {leftMeta.text}
        </text>
      )}
      {rightMeta && (
        <text
          data-contrast-tier="meta"
          data-truncated={rightMeta.truncated ? "1" : undefined}
          x={META_RIGHT_X}
          y={META_Y}
          textAnchor="end"
          fontFamily={fonts.body}
          fontSize={rightMeta.fontSize}
          fill={metaFill}
          dominantBaseline="alphabetic"
        >
          {rightMeta.text}
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
          {renderEmphasisTspans(lineSegs[i] ?? [{ text: line, emphasized: false }], {
            accent,
            baseFill: titleInk,
            fontWeight: "700",
          })}
        </text>
      ))}

      {waveX !== null && waveY !== null && (
        <path
          d={`M${waveX},${waveY} q45,14 90,0 q45,-14 90,0 q45,14 90,0`}
          fill="none"
          stroke={accent}
          strokeWidth={4}
          strokeLinecap="round"
        />
      )}

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

      {byline && (
        <text
          data-contrast-tier="meta"
          data-truncated={byline.truncated ? "1" : undefined}
          x={TITLE_X}
          y={BYLINE_Y}
          fontFamily={fonts.body}
          fontSize={byline.fontSize}
          fill={metaInk(colors.muted, bg)}
          dominantBaseline="alphabetic"
        >
          {byline.text}
        </text>
      )}
    </>
  )
}

export const layoutDef: LayoutDefinition = {
  // cover-header-band.tsx: top tone band carries meta only. Title sits on
  // paper below the band. Emphasized run uses accent, optional q-curve
  // under that run.
  id: "header-band",
  kind: "archetype",
  slideTypes: ["cover"],
  slots: [
    { name: "meta", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
  ],
}
