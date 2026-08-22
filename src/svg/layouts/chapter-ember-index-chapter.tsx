import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { chapterNumberFor } from "../../lib/derive"
import { fitHeadingLines, scaleTypePx } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleInk } from "../ink"

/**
 * ember-index-chapter（第八波批 1，新表达）：火橙巨号章节序 + 左齐标题 +
 * 右下小楔。构图抄融资路演章节板：序数是这一页的主角，标题贴在它下面，
 * 小楔缩在角落当章尾灯，不碰字。
 *
 * pinOnly，不进 fullLayoutSet。零 theme id、零 hex。颜色只走 ctx。
 * 巨号是实色强调，不是幽灵水印，整字落在 1280×720 内。
 * branding: "none"：右下小楔占了默认 logo 盒，关掉品牌角标避免叠角。
 *
 * 服务场景：路演章节开场、pitch 段落切页。任何需要「大火号 + 左齐题 +
 * 角楔灯」而不是居中水印的主题都可以钉。
 */

const NUMBER_X = 96
const NUMBER_Y = 300
const NUMBER_SIZE = 120

const TITLE_X = 96
const TITLE_Y = 400
const TITLE_SIZE = 52
const TITLE_MIN_PT = 28
const TITLE_MAX_LINES = 2
const TITLE_MAX_W = 1088
const TITLE_LINE_HEIGHT = 64

const SUB_X = 96
const SUB_Y = 452
const SUB_SIZE = 20
const SUB_MAX_W = 1088

const WEDGE_START_X = 1120
const WEDGE_PEAK_Y = 530
const WEDGE_OPACITY = 0.9

export function EmberIndexChapter({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const defaultBg = ctx.defaultBg ?? colors.bg
  const chNum = chapterNumberFor(ir.slides, index)
  const label = String(chNum).padStart(2, "0")
  const numberPx = scaleTypePx(NUMBER_SIZE, ctx.shape?.typeScale)

  const heading = fitHeadingLines(slide.heading, {
    maxWidth: TITLE_MAX_W,
    fontSize: TITLE_SIZE,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
    lineHeightRatio: TITLE_LINE_HEIGHT / TITLE_SIZE,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
  })
  const titleLastY = TITLE_Y + Math.max(0, heading.lines.length - 1) * heading.lineHeight
  const subheading = slide.subheading
    ? fitSvgLine(slide.subheading, {
        maxWidth: SUB_MAX_W,
        fontSize: SUB_SIZE,
        minFontSize: 14,
        fontFamily: fonts.body,
      })
    : null
  const subY = Math.max(SUB_Y, titleLastY + Math.round(heading.fontSize * 0.28) + (subheading?.fontSize ?? SUB_SIZE))

  return (
    <>
      <path
        d={`M${WEDGE_START_X},720 L1280,${WEDGE_PEAK_Y} L1280,720 Z`}
        fill={colors.primary}
        opacity={WEDGE_OPACITY}
      />

      <text
        x={NUMBER_X}
        y={NUMBER_Y}
        fontFamily={fonts.heading}
        fontSize={numberPx}
        fontWeight="700"
        fill={accessibleInk(colors.accent, defaultBg, numberPx)}
        dominantBaseline="alphabetic"
      >
        {label}
      </text>

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
          data-truncated={subheading.truncated ? "1" : undefined}
          x={SUB_X}
          y={subY}
          fontFamily={fonts.body}
          fontSize={subheading.fontSize}
          fill={accessibleInk(colors.muted, defaultBg, subheading.fontSize)}
          dominantBaseline="alphabetic"
        >
          {subheading.text}
        </text>
      )}
    </>
  )
}

export const layoutDef: LayoutDefinition = {
  // chapter-ember-index-chapter.tsx: opaque accent chapter index, left
  // title, small lower-right wedge. pinOnly board lock. branding none so
  // the wedge keeps the corner.
  id: "ember-index-chapter",
  kind: "archetype",
  pinOnly: true,
  branding: "none",
  slideTypes: ["chapter"],
  slots: [
    { name: "watermark", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "decor", accepts: [] },
  ],
}
