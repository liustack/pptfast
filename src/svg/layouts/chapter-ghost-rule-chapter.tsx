import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { chapterNumberFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleInk, metaInk, readableOn } from "../ink"

/**
 * ghost-rule-chapter（第八波 pinOnly）：藏青满版上的左齐章首。6% 幽灵序号
 * 沉右下，整字落在 1280×720 内。左黄杠起手，标题左齐。底色走主题
 * `defaultBackgrounds.chapter`，本文件不自绘满版。
 *
 * 构图抄 consulting 设计板章节样例：杠 96×8 在 y300，标题基线 y392 /
 * 58px，副题 y446。序号 "02" 在 x1170 / y560 / 440px / opacity 0.06，
 * text-anchor end。
 *
 * 纪律：零 theme id、零 baked hex。颜色只走 ctx。黄杠是标题起手，不是
 * 漂在角落的孤立 tick。幽灵序号显式 `data-depth="mid"`，opacity 0.06
 * 低于审计 DECORATIVE_ALPHA，不按正文对比门槛收。
 */

const TITLE_X = 96
const TITLE_Y = 392
const TITLE_SIZE = 58
const TITLE_MIN_PT = 32
const TITLE_MAX_LINES = 2
const TITLE_MAX_W = 1088
const TITLE_LINE_HEIGHT = 70

const SUB_SIZE = 20
const SUB_DROP = 54

const BAR_X = 96
const BAR_Y = 300
const BAR_W = 96
const BAR_H = 8

const GHOST_X = 1170
const GHOST_Y = 560
const GHOST_SIZE = 440
const GHOST_OPACITY = 0.06

export function GhostRuleChapter({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const defaultBg = ctx.defaultBg ?? colors.bg
  const label = String(chapterNumberFor(ir.slides, index)).padStart(2, "0")
  const ghostInk = readableOn(defaultBg)

  const heading = fitHeadingLines(slide.heading, {
    maxWidth: TITLE_MAX_W,
    fontSize: TITLE_SIZE,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
    lineHeightRatio: TITLE_LINE_HEIGHT / TITLE_SIZE,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
  })
  const headingLastY = TITLE_Y + Math.max(0, heading.lines.length - 1) * TITLE_LINE_HEIGHT
  const subheading = slide.subheading
    ? fitSvgLine(slide.subheading, {
        maxWidth: TITLE_MAX_W,
        fontSize: SUB_SIZE,
        minFontSize: 14,
        fontFamily: fonts.body,
      })
    : null

  return (
    <>
      <text
        data-depth="mid"
        x={GHOST_X}
        y={GHOST_Y}
        fontFamily={fonts.heading}
        fontSize={GHOST_SIZE}
        fontWeight="700"
        fill={ghostInk}
        opacity={GHOST_OPACITY}
        textAnchor="end"
        dominantBaseline="alphabetic"
      >
        {label}
      </text>
      <rect x={BAR_X} y={BAR_Y} width={BAR_W} height={BAR_H} fill={colors.accent} />
      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x={TITLE_X}
          y={TITLE_Y + i * TITLE_LINE_HEIGHT}
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="700"
          fill={accessibleInk(colors.bg, defaultBg, heading.fontSize)}
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
          y={headingLastY + SUB_DROP}
          fontFamily={fonts.body}
          fontSize={subheading.fontSize}
          fill={metaInk(colors.muted, defaultBg)}
          dominantBaseline="alphabetic"
        >
          {subheading.text}
        </text>
      )}
    </>
  )
}

export const layoutDef: LayoutDefinition = {
  // chapter-ghost-rule-chapter.tsx: pinOnly left-aligned chapter open.
  // Ghost numeral sinks to the lower right inside the canvas. Accent bar
  // starts the title cluster. Theme paints the chapter field.
  id: "ghost-rule-chapter",
  kind: "archetype",
  pinOnly: true,
  branding: "none",
  slideTypes: ["chapter"],
  slots: [
    { name: "watermark", accepts: [] },
    { name: "rule", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
  ],
}
