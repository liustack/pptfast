import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { CONF_LABEL } from "../../lib/conf-labels"
import { showsDocumentMeta } from "../document-meta"
import { accessibleInk } from "../ink"
import { hasCjk, latinUpper, trackingPx } from "./minimal-shared"

/**
 * editorial-masthead cover layout（spec §3.2）：居中报头式标题 + 短下划线
 * + 斜体副标题 + 底部一行 meta（组织/日期/密级）。自 templates/magazine.tsx 的
 * `EditorialSerifCover`（23-110 行）提炼，无随迁 helper——Step A 复核该函数
 * 区间未发现任何模块级私有常量被消费（`HAIRLINE_STROKE`〔20 行〕/
 * `ORNAMENT_*`〔475-477 行〕均只在 Chapter/Ending/CornerOrnament 里使用，
 * 与本 Cover 函数无关，不随迁）。
 *
 * 替换表（Step B，逐十六进制核实，对照 themes/magazine.ts 的 colors）：
 * Step A 对函数区间（23-110 行）复核 grep 未命中任何 `#XXXXXX` 字面量或
 * theme id 字符串——源函数体已直接消费 `ctx.colors`/`ctx.fonts`
 * （`colors.text`/`colors.accent`/`colors.muted`），无烤死颜色常量，无孤儿色。
 * **档位一・逐字节等价**。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量。
 */
const KICKER_SIZE = 16
const KICKER_TRACKING_EM = 0.22
const KICKER_PREFERRED_Y = 252

export function EditorialMastheadCover({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const cover = ctx.shape?.cover
  const textAnchor = cover?.textAnchor ?? "middle"
  const centered = textAnchor === "middle"
  const titleX = centered ? 640 : 96
  const underlineX1 = centered ? 560 : 96
  const underlineX2 = centered ? 720 : 240
  const showKicker = cover?.showKicker === true
  const pageBg = ctx.defaultBg ?? colors.bg
  const org = ir.meta.organization
  const conf = showsDocumentMeta(ir) ? ir.meta.confidentiality : undefined
  const confLabel = conf ? CONF_LABEL[conf] : null
  const date = showsDocumentMeta(ir) ? ir.meta.date : undefined
  const metaParts = [showKicker ? undefined : org, date, confLabel].filter((v): v is string => Boolean(v))

  // Last-line-anchored: whether the title wraps to 1 or 2 lines, its final
  // baseline always lands on 340 so the underline/subtitle/meta stack below
  // never shifts.
  const HEADING_LAST_BASELINE = 340
  const title = fitHeadingLines(slide.heading, {
    maxWidth: 1040,
    fontSize: 92,
    maxLines: 2,
    minPt: 48,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
  })
  const titleY =
    HEADING_LAST_BASELINE - Math.max(0, title.lines.length - 1) * title.lineHeight
  const headingLastY = HEADING_LAST_BASELINE

  const underlineY = headingLastY + 56
  const subtitleY = underlineY + 52

  const subtitle = slide.subheading
    ? fitSvgLine(slide.subheading, { maxWidth: 900, fontSize: 28, minFontSize: 16 })
    : null

  const kickerSrc = showKicker && org ? (hasCjk(org) ? org : latinUpper(org)) : null
  const kickerTracking = kickerSrc && !hasCjk(kickerSrc) ? trackingPx(KICKER_SIZE, KICKER_TRACKING_EM) : undefined
  const kicker = kickerSrc
    ? fitSvgLine(kickerSrc, {
        maxWidth: 900,
        fontSize: KICKER_SIZE,
        minFontSize: 12,
        letterSpacing: kickerTracking,
        fontFamily: fonts.body,
      })
    : null
  const titleGlyphTop = titleY - Math.round(title.fontSize * 0.75)
  const kickerY =
    kicker && KICKER_PREFERRED_Y + 2 < titleGlyphTop ? KICKER_PREFERRED_Y : titleGlyphTop - 16
  const kickerFill = accessibleInk(colors.accent, pageBg, KICKER_SIZE)

  return (
    <>
      {kicker && (
        <text
          data-truncated={kicker.truncated ? "1" : undefined}
          x={titleX}
          y={kickerY}
          fontFamily={fonts.body}
          fontSize={kicker.fontSize}
          fill={kickerFill}
          letterSpacing={kickerTracking}
          textAnchor={textAnchor}
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
          fontFamily={fonts.heading}
          fontSize={title.fontSize}
          fontWeight="600"
          fill={colors.text}
          textAnchor={textAnchor}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      <line
        x1={underlineX1}
        y1={underlineY}
        x2={underlineX2}
        y2={underlineY}
        stroke={colors.accent}
        strokeWidth="1.6"
      />

      {subtitle && (
        <text
          data-truncated={subtitle.truncated ? "1" : undefined}
          x={titleX}
          y={subtitleY}
          fontFamily={fonts.heading}
          fontSize={subtitle.fontSize}
          fill={colors.muted}
          fontStyle="italic"
          textAnchor={textAnchor}
          dominantBaseline="alphabetic"
        >
          {subtitle.text}
        </text>
      )}

      {metaParts.length > 0 && (
        <text
          x={titleX}
          y="656"
          fontFamily={fonts.body}
          fontSize="13"
          fill={colors.muted}
          letterSpacing="2"
          textAnchor={textAnchor}
          dominantBaseline="alphabetic"
        >
          {metaParts.join("    ·    ")}
        </text>
      )}
    </>
  )
}

// T1d (src domain reorg wave 1): inlined verbatim from registry.ts's former
// COVER_LAYOUT_DEFS["editorial-masthead"] entry. `CHROME` (registry.ts's private
// `readonly string[] = []` alias, "not fed by an authored component") is
// inlined here to the literal `[]` it always held, to avoid a value-import
// cycle with the registry aggregator (which value-imports this export) — see
// registry.ts's slot-`accepts` convention doc for what `[]` means.
export const layoutDef: LayoutDefinition = {
  // cover-editorial-masthead.tsx: masthead heading + short underline +
  // italic subheading + merged org/date/conf meta. Optional kicker and
  // textAnchor knobs. Default: middle, no kicker.
  id: "editorial-masthead",
  kind: "archetype",
  slideTypes: ["cover"],
  slots: [
    { name: "heading", accepts: [] },
    { name: "rule", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "meta", accepts: [] },
  ],
}
