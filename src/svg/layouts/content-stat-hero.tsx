import type { Slide } from "@/ir"
import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { sectionNameFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { accessibleInk } from "../ink"
import { latinUpper, trackingPx } from "./minimal-shared"

/**
 * stat-hero content layout（演讲极简波）：整页只落地一个数字或短语。
 * `pinOnly` + `chrome: "none"`。和 `arrangement: big_number` 的差别是这一页
 * 没有标题槽、没有下方配角、没有页脚，四周空到只剩这一件事。
 *
 * 数字优先 kpi_cards 第一项的 value（单位单独一行），否则 heading 自己就是
 * 英雄位。说明一行来自 heading（有 kpi 时）或 subheading。出处来自
 * kpi.source / footnote / citation / paragraph。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量，颜色 / 字体全部来自 ctx。
 * 单个数字用比例数字，不用等宽 tabular。
 */

const PAD_X = 160
const CONTENT_MAX_W = 960
const KICKER_Y = 80
const VALUE_Y = 388
const KICKER_SIZE = 12
const UNIT_SIZE = 22
const CAPTION_SIZE = 26
const SOURCE_SIZE = 12
const SOURCE_Y = 656
const KICKER_TRACKING_EM = 0.35
const UNIT_GAP_RATIO = 0.32
const CAPTION_GAP = 40
const CAPTION_MAX_LINES = 2
const CAPTION_LINE_RATIO = 1.25

type KpiItem = { value: string; unit?: string; label: string; source?: string }

function kpiHero(slide: Slide): KpiItem | undefined {
  const component = slide.components[0]
  if (component?.type === "kpi_cards" && component.items.length > 0) {
    return component.items[0]
  }
  return undefined
}

function heroValue(slide: Slide): string {
  const kpi = kpiHero(slide)
  const fromKpi = kpi?.value.trim()
  if (fromKpi) return fromKpi
  return slide.heading?.trim() ?? ""
}

function heroUnit(slide: Slide): string | undefined {
  const unit = kpiHero(slide)?.unit?.trim()
  return unit || undefined
}

function heroCaption(slide: Slide): string | undefined {
  const kpi = kpiHero(slide)
  if (kpi) {
    const heading = slide.heading?.trim()
    if (heading && heading !== kpi.value.trim()) return heading
    const label = kpi.label.trim()
    return label || undefined
  }
  return slide.subheading?.trim() || undefined
}

function heroSource(slide: Slide): string | undefined {
  const kpi = kpiHero(slide)
  const fromKpi = kpi?.source?.trim()
  if (fromKpi) return fromKpi
  const component = slide.components[0]
  if (!kpi && component?.type === "citation") {
    const label = component.sources[0]?.label?.trim()
    if (label) return label
  }
  if (!kpi && component?.type === "paragraph") {
    const text = component.text.trim()
    if (text) return text
  }
  const footnote = slide.footnote?.trim()
  if (footnote) return footnote
  if (kpi) {
    const sub = slide.subheading?.trim()
    if (sub) return sub
  }
  return undefined
}

export function StatHeroContent({ ir, slide, index, ctx }: SvgTemplateProps) {
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

  const value = heroValue(slide)
  const heading = fitHeadingLines(value, {
    ...layoutDef.headingFit,
    fontFamily: fonts.heading,
  })
  const titleLastY = VALUE_Y + Math.max(0, heading.lines.length - 1) * heading.lineHeight

  const unitSource = heroUnit(slide)
  const unit = unitSource
    ? fitSvgLine(unitSource, {
        maxWidth: CONTENT_MAX_W,
        fontSize: UNIT_SIZE,
        minFontSize: 14,
      })
    : null
  const unitY = titleLastY + Math.round(heading.fontSize * UNIT_GAP_RATIO)

  const captionSource = heroCaption(slide)
  const caption = captionSource
    ? layoutSvgText(captionSource, {
        maxWidth: CONTENT_MAX_W,
        fontSize: CAPTION_SIZE,
        maxLines: CAPTION_MAX_LINES,
        minPt: 16,
        lineHeightRatio: CAPTION_LINE_RATIO,
        fontFamily: fonts.body,
      })
    : null
  const captionStartY = (unit ? unitY : titleLastY) + CAPTION_GAP

  const sourceSource = heroSource(slide)
  const source = sourceSource
    ? fitSvgLine(sourceSource, {
        maxWidth: CONTENT_MAX_W,
        fontSize: SOURCE_SIZE,
        minFontSize: 10,
      })
    : null

  return (
    <>
      {kicker && (
        <text
          data-truncated={kicker.truncated ? "1" : undefined}
          x={PAD_X}
          y={KICKER_Y}
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
          x={PAD_X}
          y={VALUE_Y + i * heading.lineHeight}
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="700"
          fill={accessibleInk(colors.primary, defaultBg, heading.fontSize)}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {unit && (
        <text
          data-truncated={unit.truncated ? "1" : undefined}
          x={PAD_X}
          y={unitY}
          fontFamily={fonts.body}
          fontSize={unit.fontSize}
          fill={accessibleInk(colors.muted, defaultBg, unit.fontSize)}
          dominantBaseline="alphabetic"
        >
          {unit.text}
        </text>
      )}

      {caption &&
        caption.lines.map((line, i) => (
          <text
            key={`caption-${i}`}
            data-truncated={caption.truncated && i === caption.lines.length - 1 ? "1" : undefined}
            x={PAD_X}
            y={captionStartY + i * caption.lineHeight}
            fontFamily={fonts.body}
            fontSize={caption.fontSize}
            fill={accessibleInk(colors.text, defaultBg, caption.fontSize)}
            dominantBaseline="alphabetic"
          >
            {line}
          </text>
        ))}

      {source && (
        <text
          data-truncated={source.truncated ? "1" : undefined}
          x={PAD_X}
          y={SOURCE_Y}
          fontFamily={fonts.body}
          fontSize={source.fontSize}
          fill={accessibleInk(colors.muted, defaultBg, source.fontSize)}
          dominantBaseline="alphabetic"
        >
          {source.text}
        </text>
      )}
    </>
  )
}

export const layoutDef = {
  // content-stat-hero.tsx: a pinOnly whole-page number. Hero value from
  // kpi_cards[0] or the heading, one caption line, optional source.
  // chrome: "none" skips brand footer, logo, page numbers, and the theme
  // motif. The fifth-band decoration safe-zone does not apply — the whole
  // canvas is the layout's.
  id: "stat-hero",
  kind: "archetype",
  pinOnly: true,
  chrome: "none",
  slideTypes: ["content"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "body", accepts: ["kpi_cards", "paragraph", "citation"], capacity: 1 },
    { name: "meta", accepts: [] },
  ],
  arrangements: ["single"],
  headingFit: {
    maxWidth: CONTENT_MAX_W,
    fontSize: 180,
    maxLines: 2,
    minPt: 64,
    lineHeightRatio: 1.05,
  },
} satisfies LayoutDefinition
