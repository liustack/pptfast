import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { chapterNumberFor } from "../../lib/derive"
import { fitHeadingLines, scaleTypePx } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleInk, metaInk } from "../ink"

/**
 * stroke-index-chapter（第八波 tech 板，新 pinOnly）：描边空心序号 + 底规线
 * 青段示进度。装饰计数 = 2（空心序号一件，底规线与青段共一件）。
 *
 * 构图抄 `.issues/design-boards/wave8/b1/Tech.dc.html` 章节：序号 y316 /
 * 110px 描边序号、标题 y414 / 52px、副题 y466 / 20px、底规 y560 通栏，
 * 青段长度 = 章节序号 / 章节总数。fill 与 stroke 同走 `accessibleInk`，
 * 不写 `fill="none"`（审计会把缺 fill 当黑墨）。零 theme id、零 hex。
 * 章节序号不出血：110px 钉在 x96，字形盒整字落在 1280×720 内。
 */

const NUMBER_X = 96
const NUMBER_Y = 316
const NUMBER_SIZE = 110
const NUMBER_STROKE = 1.5

const TITLE_X = 96
const TITLE_Y = 414
const TITLE_SIZE = 52
const TITLE_MIN_PT = 28
const TITLE_MAX_LINES = 2
const TITLE_MAX_W = 1088
const TITLE_LINE_HEIGHT = 64

const SUB_GAP = 52
const SUB_SIZE = 20

const RULE_X1 = 96
const RULE_X2 = 1184
const RULE_Y = 560
const RULE_STROKE = 1
const PROGRESS_STROKE = 2

export function StrokeIndexChapter({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const defaultBg = ctx.defaultBg ?? colors.bg
  const chNum = chapterNumberFor(ir.slides, index)
  const label = String(chNum).padStart(2, "0")
  const totalChapters = Math.max(
    1,
    ir.slides.filter((s) => s.type === "chapter").length,
  )
  const progressX2 = RULE_X1 + ((RULE_X2 - RULE_X1) * chNum) / totalChapters
  const numberPx = scaleTypePx(NUMBER_SIZE, ctx.shape?.typeScale)
  const numberStroke = accessibleInk(colors.accent, defaultBg, numberPx)
  const ruleStroke = colors.border ?? colors.muted

  const heading = fitHeadingLines(slide.heading, {
    maxWidth: TITLE_MAX_W,
    fontSize: TITLE_SIZE,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
    lineHeightRatio: TITLE_LINE_HEIGHT / TITLE_SIZE,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
  })
  const headingLastY = TITLE_Y + Math.max(0, heading.lines.length - 1) * heading.lineHeight
  const subheading = slide.subheading
    ? fitSvgLine(slide.subheading, {
        maxWidth: TITLE_MAX_W,
        fontSize: SUB_SIZE,
        minFontSize: 12,
        fontFamily: fonts.body,
      })
    : null
  const subheadingY = headingLastY + SUB_GAP

  return (
    <>
      <g data-decor-piece="stroke-index">
        <text
          x={NUMBER_X}
          y={NUMBER_Y}
          fontFamily={fonts.heading}
          fontSize={numberPx}
          fontWeight="700"
          fill={numberStroke}
          stroke={numberStroke}
          strokeWidth={NUMBER_STROKE}
          dominantBaseline="alphabetic"
        >
          {label}
        </text>
      </g>

      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x={TITLE_X}
          y={TITLE_Y + i * heading.lineHeight}
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="700"
          fill={accessibleInk(colors.text, defaultBg, heading.fontSize)}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {subheading && (
        <text
          data-contrast-tier="meta"
          data-truncated={subheading.truncated ? "1" : undefined}
          x={TITLE_X}
          y={subheadingY}
          fontFamily={fonts.body}
          fontSize={subheading.fontSize}
          fill={metaInk(colors.muted, defaultBg)}
          dominantBaseline="alphabetic"
        >
          {subheading.text}
        </text>
      )}

      <g data-decor-piece="progress-rule">
        <g data-depth="mid">
          <line
            x1={RULE_X1}
            y1={RULE_Y}
            x2={RULE_X2}
            y2={RULE_Y}
            stroke={ruleStroke}
            strokeWidth={RULE_STROKE}
          />
        </g>
        <line
          x1={RULE_X1}
          y1={RULE_Y}
          x2={progressX2}
          y2={RULE_Y}
          stroke={colors.accent}
          strokeWidth={PROGRESS_STROKE}
        />
      </g>
    </>
  )
}

export const layoutDef = {
  // chapter-stroke-index-chapter.tsx: hollow stroked chapter index, title
  // below, progress rule with an accent segment. pinOnly board lock.
  id: "stroke-index-chapter",
  kind: "archetype",
  pinOnly: true,
  slideTypes: ["chapter"],
  slots: [
    { name: "watermark", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "rule", accepts: [] },
  ],
} satisfies LayoutDefinition
