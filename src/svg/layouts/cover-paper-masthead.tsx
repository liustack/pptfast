import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { trackingPx } from "./minimal-shared"
import { accessibleInk, metaInk } from "../ink"
import { showsDocumentMeta } from "../document-meta"
import { parseEmphasis, renderEmphasisText, sliceEmphasisForLines, stripEmphasis } from "../emphasis"

/**
 * paper-masthead cover layout（2026-08-22 封面还原第一波，新表达）：
 * **纸底左对齐巨号标题 + 右缘年份一字一行**。构图抄 runway 封面样例
 * （`audit19/covers/runway.html`）：没有满版 primary，绯红只给强调词。
 *
 * **它进共享池，不是 runway 专用**。零 theme id、零 hex。runway 没有 motif，
 * 本版式不发明一份。
 *
 * 服务场景：时装刊开场、排印至上的评审封面、纸面超大标题。任何需要「卡纸上
 * 的巨字加右缘年份」而不是满版反贴的主题都可以抽。
 *
 * 板上做不到、最近落地：
 *   1. 板上 `writing-mode="tb"` 作用在拉丁数字 `2026 · 07`。引擎禁 Latin
 *      竖排。年份改成一字一行横排字，跟 ink 落款列同一写法。读不懂的日期
 *      整列不画。
 *   2. 板上 CJK 标题 -2px 字距，导出会丢字，引擎不加。
 *   3. 右缘年份 x1216、起 y120，停在 logo 盒 (1120,630,96×40) 之上。
 *   4. 本版式不设 `paintsOwnBackground`，不画满版 primary 底。
 */

const TITLE_X = 96
const TITLE_Y = 330
const TITLE_SIZE = 132
const TITLE_MIN_PT = 64
const TITLE_MAX_LINES = 2
const TITLE_MAX_W = 1000
const TITLE_LINE_HEIGHT = 140

const KICKER_X = 96
const KICKER_Y = 86
const KICKER_SIZE = 15
const KICKER_TRACKING_EM = 0.4

const YEAR_X = 1216
const YEAR_Y = 120
const YEAR_SIZE = 20
const YEAR_STEP = 28

const SUBTITLE_Y = 560
const SUBTITLE_SIZE = 22
const FOOT_X = 96
const FOOT_Y = 688
const FOOT_SIZE = 16

const CJK_DIGITS = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"]

function hasCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text)
}

/**
 * `meta.date` → 一字一行的年月。只认「四位年 + 非数字分隔 + 一到两位月」。
 * 读不懂就整列不画。抄 `motif-ink-motif.tsx` 的 `colophonDateGlyphs`。
 */
function yearGlyphs(date: string | undefined): string[] {
  const m = /^(\d{4})\D+(\d{1,2})(?:\D|$)/.exec(date ?? "")
  if (!m) return []
  const month = Number(m[2])
  if (month < 1 || month > 12) return []
  const monthGlyphs =
    month < 10 ? [CJK_DIGITS[month]!] : month === 10 ? ["十"] : ["十", CJK_DIGITS[month - 10]!]
  return [...[...m[1]!].map((d) => CJK_DIGITS[Number(d)]!), "年", ...monthGlyphs, "月"]
}

export function PaperMastheadCover({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const bg = ctx.defaultBg ?? colors.bg
  const org = ir.meta.organization
  const author = ir.meta.authors?.[0]
  const authorText = author ? [author.name, author.role].filter(Boolean).join(" · ") : null
  const version = ir.meta.version
  const date = showsDocumentMeta(ir) ? ir.meta.date : undefined
  const glyphs = yearGlyphs(date)

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

  const kickerTracking = org && !hasCjk(org) ? trackingPx(KICKER_SIZE, KICKER_TRACKING_EM) : undefined
  const kicker = org
    ? fitSvgLine(org, {
        maxWidth: 1000,
        fontSize: KICKER_SIZE,
        minFontSize: 11,
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

  const yearLast = YEAR_Y + Math.max(0, glyphs.length - 1) * YEAR_STEP
  const yearFits = yearLast < 630

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

      {title.lines.map((line, i) =>
        renderEmphasisText(
          lineSegs[i] ?? [{ text: line, emphasized: false }],
          {
            accent: colors.accent,
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
            y={TITLE_Y + i * TITLE_LINE_HEIGHT}
            fontFamily={fonts.heading}
            fontSize={title.fontSize}
            fontWeight="700"
            fill={titleInk}
            dominantBaseline="alphabetic"
          />,
        ),
      )}

      {yearFits &&
        glyphs.map((ch, i) => (
          <text
            key={`year-${i}`}
            data-contrast-tier="meta"
            x={YEAR_X}
            y={YEAR_Y + i * YEAR_STEP}
            textAnchor="middle"
            fontFamily={fonts.heading}
            fontSize={YEAR_SIZE}
            fill={metaInk(colors.text, bg)}
            dominantBaseline="alphabetic"
          >
            {ch}
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

export const layoutDef: LayoutDefinition = {
  // cover-paper-masthead.tsx: paper-bg left giant title, right-edge year as
  // one-character-per-line (no Latin writing-mode=tb). Emphasized run uses
  // accent. Does not paint a full-bleed primary field.
  id: "paper-masthead",
  kind: "archetype",
  slideTypes: ["cover"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "meta", accepts: [] },
  ],
}
