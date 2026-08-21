import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { trackingPx } from "./minimal-shared"
import { accessibleInk, metaInk } from "../ink"

/**
 * board-head cover layout（2026-08-22 第七波封面保真，新表达）：
 * **左轴板书**——宽字距小眉行、细衬线巨字、标题下强调色手绘弧、右下斜体
 * 落款。构图抄 lecture「黑板夜校」定稿板（`theme-wave7/Lecture.dc.html`
 * 封面）。粉笔槽细框是主题 motif 的事，本版式不画。
 *
 * **它进共享池，不是 lecture 专用**。零 theme id、零 hex。黄粉笔弧跟标题
 * 走，所以画在版式里（motif 恒位红线不许内容感知，wave7-common 已把弧
 * 从 motif 里拿掉）。弧的形状写死，只把整段 path 锚在标题末行下面。
 *
 * 服务场景：大学/成人课程开场、技术分享封面、夜校板书式演讲。任何需要
 * 「灯灭之后的黑板」而不是白日讲义纸的主题都可以抽。
 *
 * 板上做不到、最近落地：
 *   1. 标题字重 300。导出只有粗/不粗，落地不加粗（`fontWeight=400`）。
 *   2. CJK 标题 4px 字距、副题 8px 字距都不做（导出会丢字）。
 *   3. 板上右下斜体落款压在 logo 盒上。收到 x1108、y688，让开
 *      (1120,630,96×40)。
 *   4. 板上副题嵌在标题 div 里当第二行较小字。IR 副题是独立字段，排在
 *      标题块下面，弧夹在标题与副题之间。
 */

const KICKER_X = 110
const KICKER_Y = 118
const KICKER_SIZE = 13
const KICKER_TRACKING_EM = 0.5

const TITLE_X = 106
const TITLE_TOP = 210
const TITLE_SIZE = 126
const TITLE_MIN_PT = 52
const TITLE_MAX_LINES = 2
const TITLE_MAX_W = 1100
const TITLE_LINE_HEIGHT_RATIO = 1.2

const SUBTITLE_SIZE = 44
const SUBTITLE_MAX_W = 1100

const ARC_DY = 8
/** 弧 path 的局部 y 大约 12-24，再加 5px 笔画，副题要整段让开。 */
const ARC_CLEAR = 52
const BYLINE_X = 1108
const BYLINE_Y = 688
const BYLINE_SIZE = 20

function hasCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text)
}

function hangingBaseline(top: number, fontSize: number): number {
  return top + Math.round(fontSize * 0.8)
}

export function BoardHeadCover({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const bg = ctx.defaultBg ?? colors.bg
  const org = ir.meta.organization
  const author = ir.meta.authors?.[0]
  const authorText = author ? [author.name, author.role].filter(Boolean).join(" · ") : null

  const title = fitHeadingLines(slide.heading, {
    maxWidth: TITLE_MAX_W,
    fontSize: TITLE_SIZE,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
    lineHeightRatio: TITLE_LINE_HEIGHT_RATIO,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
    bold: false,
  })
  const titleY = hangingBaseline(TITLE_TOP, title.fontSize)
  const titleLastY = titleY + Math.max(0, title.lines.length - 1) * title.lineHeight

  const kickerTracking = org && !hasCjk(org) ? trackingPx(KICKER_SIZE, KICKER_TRACKING_EM) : undefined
  const kicker = org
    ? fitSvgLine(org, {
        maxWidth: TITLE_MAX_W,
        fontSize: KICKER_SIZE,
        minFontSize: 11,
        letterSpacing: kickerTracking,
        fontFamily: fonts.heading,
      })
    : null

  const subtitleY = titleLastY + ARC_DY + ARC_CLEAR + Math.round(SUBTITLE_SIZE * 0.8)
  const subtitle = slide.subheading
    ? fitSvgLine(slide.subheading, {
        maxWidth: SUBTITLE_MAX_W,
        fontSize: SUBTITLE_SIZE,
        minFontSize: 22,
        fontFamily: fonts.heading,
      })
    : null

  const arcY = titleLastY + ARC_DY
  const byline = authorText
    ? fitSvgLine(authorText, { maxWidth: 420, fontSize: BYLINE_SIZE, minFontSize: 14, fontFamily: fonts.body })
    : null

  return (
    <>
      {kicker && (
        <text
          data-contrast-tier="meta"
          data-truncated={kicker.truncated ? "1" : undefined}
          x={KICKER_X}
          y={KICKER_Y}
          fontFamily={fonts.heading}
          fontSize={kicker.fontSize}
          fill={metaInk(colors.muted, bg)}
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
          y={titleY + i * title.lineHeight}
          fontFamily={fonts.heading}
          fontSize={title.fontSize}
          fontWeight="400"
          fill={accessibleInk(colors.text, bg, title.fontSize)}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      <path
        d={`M ${TITLE_X + 2} ${arcY + 20} q 120 12 260 4 q 140 -8 292 -2`}
        fill="none"
        stroke={colors.accent}
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.85"
      />

      {subtitle && (
        <text
          data-truncated={subtitle.truncated ? "1" : undefined}
          x={TITLE_X}
          y={subtitleY}
          fontFamily={fonts.heading}
          fontSize={subtitle.fontSize}
          fontWeight="400"
          fill={accessibleInk(colors.muted, bg, subtitle.fontSize)}
          dominantBaseline="alphabetic"
        >
          {subtitle.text}
        </text>
      )}

      {byline && (
        <text
          data-contrast-tier="meta"
          data-truncated={byline.truncated ? "1" : undefined}
          x={BYLINE_X}
          y={BYLINE_Y}
          textAnchor="end"
          fontFamily={fonts.body}
          fontSize={byline.fontSize}
          fontStyle="italic"
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
  // cover-board-head.tsx: left-axis chalkboard cover — tracked kicker,
  // light-weight serif heading, accent chalk stroke under the title,
  // italic byline bottom-right. Lecture-hall grammar.
  id: "board-head",
  kind: "archetype",
  slideTypes: ["cover"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "rule", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "meta", accepts: [] },
  ],
}
