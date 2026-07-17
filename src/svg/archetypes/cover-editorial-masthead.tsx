// GF/svg/archetypes/cover-editorial-masthead.tsx
import type { SvgTemplateProps } from "./types"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { CONF_LABEL } from "../../lib/conf-labels"

/**
 * editorial-masthead cover archetype（spec §3.2）：居中报头式标题 + 短下划线
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
export function EditorialMastheadCover({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const org = ir.meta.organization
  const conf = ir.meta.confidentiality
  const confLabel = conf ? CONF_LABEL[conf] : null
  const date = ir.meta.date
  const metaParts = [org, date, confLabel].filter((v): v is string => Boolean(v))

  // Last-line-anchored: whether the title wraps to 1 or 2 lines, its final
  // baseline always lands on 340 so the underline/subtitle/meta stack below
  // never shifts.
  const HEADING_LAST_BASELINE = 340
  const title = fitHeadingLines(slide.heading, {
    maxWidth: 1040,
    fontSize: 92,
    maxLines: 2,
    minPt: 48,
  })
  const titleY =
    HEADING_LAST_BASELINE - Math.max(0, title.lines.length - 1) * title.lineHeight
  const headingLastY = HEADING_LAST_BASELINE

  const underlineY = headingLastY + 56
  const subtitleY = underlineY + 52

  const subtitle = slide.subheading
    ? fitSvgLine(slide.subheading, { maxWidth: 900, fontSize: 28, minFontSize: 16 })
    : null

  return (
    <>
      {title.lines.map((line, i) => (
        <text
          key={i}
          x="640"
          y={titleY + i * title.lineHeight}
          fontFamily={fonts.heading}
          fontSize={title.fontSize}
          fontWeight="600"
          fill={colors.text}
          textAnchor="middle"
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      <line
        x1="560"
        y1={underlineY}
        x2="720"
        y2={underlineY}
        stroke={colors.accent}
        strokeWidth="1.6"
      />

      {subtitle && (
        <text
          x="640"
          y={subtitleY}
          fontFamily={fonts.heading}
          fontSize={subtitle.fontSize}
          fill={colors.muted}
          fontStyle="italic"
          textAnchor="middle"
          dominantBaseline="alphabetic"
        >
          {subtitle.text}
        </text>
      )}

      {metaParts.length > 0 && (
        <text
          x="640"
          y="656"
          fontFamily={fonts.body}
          fontSize="13"
          fill={colors.muted}
          letterSpacing="2"
          textAnchor="middle"
          dominantBaseline="alphabetic"
        >
          {metaParts.join("    ·    ")}
        </text>
      )}
    </>
  )
}
