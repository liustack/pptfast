import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { sectionNameFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleInk } from "../ink"
import { latinUpper, statementAttribution, trackingPx } from "./minimal-shared"

/**
 * statement content layout（极简版式波）：整页就是 heading 的 2–4 行诗行 /
 * 金句。`pinOnly` + `chrome: "none"`——只能被 `slide.layout: "statement"`
 * 点名，不进自动池。品牌页脚 / logo / 页码 / 主题 motif 一律不画。
 *
 * 和 quote-stage 的差别不是「再居中一点」：字重 500 斜体（禁止 800），
 * 无短棒，标签语法（tracking 眉 + 出处小字），0 组件合法，1 个组件只渲成
 * 出处小字，不走 SvgContent 卡片。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量，颜色 / 字体全部来自 ctx。
 */

const CENTER_X = 640
const CONTENT_MAX_W = 920
const KICKER_Y = 80
const TITLE_Y = 300
const KICKER_SIZE = 12
const ATTR_SIZE = 13
const KICKER_TRACKING_EM = 0.35
const ATTR_TRACKING_EM = 0.2
const ATTR_GAP = 56

export function StatementContent({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const defaultBg = ctx.defaultBg ?? colors.bg

  const section = sectionNameFor(ir.slides, index)
  const kickerTracking = trackingPx(KICKER_SIZE, KICKER_TRACKING_EM)
  const kicker = section
    ? fitSvgLine(latinUpper(section), {
        maxWidth: CONTENT_MAX_W,
        fontSize: KICKER_SIZE,
        minFontSize: 10,
        letterSpacing: kickerTracking,
      })
    : null

  const heading = fitHeadingLines(slide.heading, {
    ...layoutDef.headingFit,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
  })
  const titleLastY = TITLE_Y + Math.max(0, heading.lines.length - 1) * heading.lineHeight

  const attrSource = statementAttribution(slide)
  const attrTracking = trackingPx(ATTR_SIZE, ATTR_TRACKING_EM)
  const attribution = attrSource
    ? fitSvgLine(latinUpper(attrSource), {
        maxWidth: CONTENT_MAX_W,
        fontSize: ATTR_SIZE,
        minFontSize: 10,
        letterSpacing: attrTracking,
      })
    : null
  const attrY = titleLastY + ATTR_GAP

  return (
    <>
      {kicker && (
        <text
          data-truncated={kicker.truncated ? "1" : undefined}
          x={CENTER_X}
          y={KICKER_Y}
          textAnchor="middle"
          fontFamily={fonts.body}
          fontSize={kicker.fontSize}
          fill={accessibleInk(colors.accent, defaultBg, kicker.fontSize)}
          letterSpacing={kickerTracking}
          dominantBaseline="alphabetic"
        >
          {kicker.text}
        </text>
      )}

      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x={CENTER_X}
          y={TITLE_Y + i * heading.lineHeight}
          textAnchor="middle"
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="500"
          fontStyle="italic"
          fill={accessibleInk(colors.text, defaultBg, heading.fontSize)}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {attribution && (
        <text
          data-truncated={attribution.truncated ? "1" : undefined}
          x={CENTER_X}
          y={attrY}
          textAnchor="middle"
          fontFamily={fonts.body}
          fontSize={attribution.fontSize}
          fill={accessibleInk(colors.accent, defaultBg, attribution.fontSize)}
          letterSpacing={attrTracking}
          dominantBaseline="alphabetic"
        >
          {attribution.text}
        </text>
      )}
    </>
  )
}

export const layoutDef = {
  // content-statement.tsx: a pinOnly editorial-verse page. Heading is the
  // whole visual (2–4 italic lines, weight 500). Capacity-1 body is an
  // attribution caption, never a card. chrome: "none" skips brand footer,
  // logo, page numbers, and the theme motif. The fifth-band decoration
  // safe-zone does not apply — the whole canvas is the layout's.
  id: "statement",
  kind: "archetype",
  pinOnly: true,
  chrome: "none",
  slideTypes: ["content"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "body", accepts: ["paragraph", "quote", "citation"], capacity: 1 },
    { name: "meta", accepts: [] },
  ],
  arrangements: ["single"],
  headingFit: {
    maxWidth: CONTENT_MAX_W,
    fontSize: 48,
    maxLines: 4,
    minPt: 28,
    bold: false,
    lineHeightRatio: 1.25,
  },
} satisfies LayoutDefinition
