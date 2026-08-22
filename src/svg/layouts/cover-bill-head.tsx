import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { trackingPx } from "./minimal-shared"
import { accessibleInk, metaInk } from "../ink"

/**
 * bill-head cover layout（2026-08-22 第七波封面保真，新表达）：
 * **左上出血巨字 + 底粗线 + 左右分置落款**。构图抄 playbill「荧光嗓门」
 * 定稿板（`theme-wave7/Playbill.dc.html` 封面）。右上日期贴片已由
 * playbill-motif 承担（`motif-playbill-motif.tsx`），本版式不重复画。
 *
 * **它进共享池，不是 playbill 专用**。零 theme id、零 hex。巨字吃 heading
 * + typeScale，底线走 primary（硬票根线），不是 accent。
 *
 * 服务场景：活动宣发封面、招募海报、节目单开场。任何需要「开演前十分钟」
 * 那种嗓门、而不是居中海报或满版反贴的主题都可以抽。
 *
 * 板上做不到、最近落地：
 *   1. 标题 900 字重与 -10px 字距。CJK 不加 letter-spacing，字重落地加粗
 *      （`fontWeight=700`）。
 *   2. 板上 `<br>` 强制「开演前 / 十分钟」。IR 没有换行字段，按宽度折。
 *      无字距时五字溢出 TITLE_MAX_W=1168，折成「开演前十 / 分钟」。
 *   3. 底线板上约 y627，落在第五带 y620-664。上收到 y610（tone-adaptive
 *      底部分隔线同款：版式的线停在第五带之上）。落款字仍在线下面。
 *   4. 左下落款板上在 x56。enterprise-motif 在 (60,626) 有一枚 16×16
 *      accent 方块（tech 会抽到这家 motif），字压上去 1.42:1。左缘收到
 *      x96，躲开那一枚方块。左落款板上 6px 字距是 CJK，引擎不加。
 *   5. 右下落款板上顶到右缘 56px，压 logo 盒。右缘收到 x1108。
 *   6. 日期贴片不在本文件。无 `meta.date` 时 motif 整片不画，版式不补空块。
 */

const TITLE_X = 56
const TITLE_TOP = 56
const TITLE_SIZE = 182
const TITLE_MIN_PT = 72
const TITLE_MAX_LINES = 2
const TITLE_MAX_W = 1168
const TITLE_LINE_HEIGHT_RATIO = 1.02

const RULE_X = 56
const RULE_Y = 610
const RULE_W = 1168
const RULE_H = 5

const FOOT_Y = 650
const FOOT_LEFT_X = 96
const FOOT_RIGHT_X = 1108
const FOOT_LEFT_SIZE = 26
const FOOT_RIGHT_SIZE = 16
const FOOT_LEFT_TRACKING = 6
const FOOT_RIGHT_TRACKING_EM = 0.3

function hasCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text)
}

export function BillHeadCover({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const bg = ctx.defaultBg ?? colors.bg
  const org = ir.meta.organization
  const venue = slide.subheading

  const title = fitHeadingLines(slide.heading, {
    maxWidth: TITLE_MAX_W,
    fontSize: TITLE_SIZE,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
    lineHeightRatio: TITLE_LINE_HEIGHT_RATIO,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
  })
  const bandCenter = (TITLE_TOP + RULE_Y) / 2
  const blockSpan = Math.max(0, title.lines.length - 1) * title.lineHeight
  const titleY = Math.round(bandCenter - blockSpan / 2 + 0.35 * title.fontSize)

  const leftTracking = org && !hasCjk(org) ? FOOT_LEFT_TRACKING : undefined
  const left = org
    ? fitSvgLine(org, {
        maxWidth: 720,
        fontSize: FOOT_LEFT_SIZE,
        minFontSize: 16,
        letterSpacing: leftTracking,
        fontFamily: fonts.heading,
        bold: true,
      })
    : null

  const rightTracking = venue && !hasCjk(venue) ? trackingPx(FOOT_RIGHT_SIZE, FOOT_RIGHT_TRACKING_EM) : undefined
  const right = venue
    ? fitSvgLine(venue, {
        maxWidth: 420,
        fontSize: FOOT_RIGHT_SIZE,
        minFontSize: 12,
        letterSpacing: rightTracking,
        fontFamily: fonts.heading,
        bold: true,
      })
    : null

  return (
    <>
      {title.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={title.truncated && i === title.lines.length - 1 ? "1" : undefined}
          x={TITLE_X}
          y={titleY + i * title.lineHeight}
          fontFamily={fonts.heading}
          fontSize={title.fontSize}
          fontWeight="700"
          fill={accessibleInk(colors.text, bg, title.fontSize)}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      <rect x={RULE_X} y={RULE_Y} width={RULE_W} height={RULE_H} fill={colors.primary} />

      {left && (
        <text
          data-contrast-tier="meta"
          data-truncated={left.truncated ? "1" : undefined}
          x={FOOT_LEFT_X}
          y={FOOT_Y}
          fontFamily={fonts.heading}
          fontSize={left.fontSize}
          fontWeight="700"
          fill={metaInk(colors.text, bg)}
          letterSpacing={leftTracking}
          dominantBaseline="alphabetic"
        >
          {left.text}
        </text>
      )}
      {right && (
        <text
          data-contrast-tier="meta"
          data-truncated={right.truncated ? "1" : undefined}
          x={FOOT_RIGHT_X}
          y={FOOT_Y}
          textAnchor="end"
          fontFamily={fonts.heading}
          fontSize={right.fontSize}
          fontWeight="700"
          fill={metaInk(colors.text, bg)}
          letterSpacing={rightTracking}
          dominantBaseline="alphabetic"
        >
          {right.text}
        </text>
      )}
    </>
  )
}

export const layoutDef: LayoutDefinition = {
  // cover-bill-head.tsx: left-bleed display type, thick primary baseline,
  // split footer (org left, venue/subheading right). Event-bill grammar.
  // Does not draw the date chip — that belongs to a theme motif.
  id: "bill-head",
  kind: "archetype",
  slideTypes: ["cover"],
  slots: [
    { name: "heading", accepts: [] },
    { name: "rule", accepts: [] },
    { name: "meta", accepts: [] },
  ],
}
