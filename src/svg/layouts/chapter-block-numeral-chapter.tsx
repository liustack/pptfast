import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { chapterNumberFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleInk, readableOn } from "../ink"
import { stripEmphasis } from "../emphasis"

/**
 * block-numeral-chapter（第八波制度章节）：浅底上的 primary 方号块，号在块
 * 正中，块为正方形（宽=高，板上 132）。标题左齐贴块右侧，底缘刻度线中景
 * 示进度。构图抄 `.issues/design-boards/wave8/b1/Enterprise.dc.html` 章节：
 * 方块 (96,264,132)、号 y352、题 y330、副题 y382、刻度 y560。
 *
 * 进共享池，不是 enterprise 专用。零 theme id、零 baked hex。进度按本章
 * 在 deck 里的章节序号映射到四段刻度，motif 不读章节号。
 *
 * 板上做不到、最近落地：
 *   1. 号色走 `readableOn(primary)`，块外标题走浅底 `accessibleInk`。
 *   2. 刻度进 `data-depth="mid"`，不与前景抢。
 *   3. CJK 标题不加 letter-spacing。
 */

const BLOCK_X = 96
const BLOCK_Y = 264
const BLOCK = 132
const NUM_SIZE = 56
const NUM_BASELINE = 352

const TITLE_X = 272
const TITLE_Y = 330
const TITLE_SIZE = 54
const TITLE_MIN_PT = 32
const TITLE_MAX_LINES = 2
const TITLE_MAX_W = 880

const SUB_GAP = 52
const SUB_SIZE = 20
const SUB_MAX_W = 880

const TICK_X = [96, 368, 640, 912, 1184] as const
const SEGMENTS = 4
const RULE_Y = 560
const TICK_Y1 = 556
const TICK_Y2 = 564

function chapterCount(slides: SvgTemplateProps["ir"]["slides"]): number {
  return Math.max(1, slides.filter((s) => s.type === "chapter").length)
}

function progressedSegments(chNum: number, total: number): number {
  const raw = Math.round((Math.max(1, chNum) / total) * SEGMENTS)
  return Math.min(SEGMENTS, Math.max(1, raw))
}

export function BlockNumeralChapter({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const pageBg = ctx.defaultBg ?? colors.bg
  const field = colors.primary
  const numInk = readableOn(field)
  const rule = colors.border ?? colors.muted
  const chNum = chapterNumberFor(ir.slides, index)
  const label = String(Math.max(1, chNum)).padStart(2, "0")
  const progressed = progressedSegments(chNum, chapterCount(ir.slides))
  const progressX = TICK_X[progressed]!

  const plainHeading = stripEmphasis(slide.heading ?? "")
  const heading = fitHeadingLines(plainHeading, {
    maxWidth: TITLE_MAX_W,
    fontSize: TITLE_SIZE,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
  })
  const titleLastY = TITLE_Y + Math.max(0, heading.lines.length - 1) * heading.lineHeight
  const titleInk = accessibleInk(colors.text, pageBg, heading.fontSize)

  const subheading = slide.subheading
    ? fitSvgLine(stripEmphasis(slide.subheading), {
        maxWidth: SUB_MAX_W,
        fontSize: SUB_SIZE,
        minFontSize: 14,
        fontFamily: fonts.body,
      })
    : null
  const subY = titleLastY + SUB_GAP

  return (
    <>
      <rect x={BLOCK_X} y={BLOCK_Y} width={BLOCK} height={BLOCK} fill={field} />
      <text
        x={BLOCK_X + BLOCK / 2}
        y={NUM_BASELINE}
        textAnchor="middle"
        fontFamily={fonts.heading}
        fontSize={NUM_SIZE}
        fontWeight="700"
        fill={numInk}
        dominantBaseline="alphabetic"
      >
        {label}
      </text>

      {plainHeading.trim() &&
        heading.lines.map((line, i) => (
          <text
            key={i}
            data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
            x={TITLE_X}
            y={TITLE_Y + i * heading.lineHeight}
            fontFamily={fonts.heading}
            fontSize={heading.fontSize}
            fontWeight="700"
            fill={titleInk}
            dominantBaseline="alphabetic"
          >
            {line}
          </text>
        ))}

      {subheading && (
        <text
          data-truncated={subheading.truncated ? "1" : undefined}
          x={TITLE_X}
          y={subY}
          fontFamily={fonts.body}
          fontSize={subheading.fontSize}
          fill={accessibleInk(colors.muted, pageBg, subheading.fontSize)}
          dominantBaseline="alphabetic"
        >
          {subheading.text}
        </text>
      )}

      <g data-depth="mid">
        <line x1={TICK_X[0]} y1={RULE_Y} x2={TICK_X[SEGMENTS]} y2={RULE_Y} stroke={rule} strokeWidth={1} />
        <line x1={TICK_X[0]} y1={RULE_Y} x2={progressX} y2={RULE_Y} stroke={field} strokeWidth={2} />
        {TICK_X.map((x, i) => (
          <line
            key={x}
            x1={x}
            y1={TICK_Y1}
            x2={x}
            y2={TICK_Y2}
            stroke={i <= progressed ? field : rule}
            strokeWidth={1}
          />
        ))}
      </g>
    </>
  )
}

export const layoutDef = {
  // chapter-block-numeral-chapter.tsx: square primary numeral block, title
  // to its right, midground tick rule showing chapter progress. Light page
  // ground comes from the theme. No body slot (chapter pages never render
  // components).
  id: "block-numeral-chapter",
  kind: "archetype",
  pinOnly: true,
  branding: "none",
  slideTypes: ["chapter"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "rule", accepts: [] },
  ],
  headingFit: {
    maxWidth: TITLE_MAX_W,
    fontSize: TITLE_SIZE,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
  },
} satisfies LayoutDefinition
