import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { chapterNumberFor } from "../../lib/derive"
import { fitHeadingLines, scaleTypePx } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleInk, metaInk } from "../ink"
import { CANVAS_H_PX } from "../../constants"

/**
 * ghost-section-chapter layout（2026-08-22 第八波批 1，新表达）：
 * **幽灵序号沉右下 + 琥珀 SECTION 眉 + 左齐标题**。构图抄 insight 设计板
 * 章节页。幽灵序号与背景几乎同明度（fill 走 surface，不走 accessibleInk），
 * 整字落在 1280×720 内，不声明 data-bleed。
 *
 * **它进共享池，不是 insight 专用**。零 theme id、零 hex。章号从
 * `chapterNumberFor` 推，不写死 02。
 *
 * `branding: "none"`：右下是幽灵序号的位置，默认 br logo 盒会整枚吃掉这层
 * 中景字（depth-contract 相交即丢叶子）。板上也没有 logo。
 *
 * 板上 y620 / 480px 按 0.25em 下伸会越过底缘。基线收到能整字落在画布内，
 * 构图仍是右下巨号，不改成居中或左置。
 */

const GHOST_X = 1180
const GHOST_SIZE = 480
const GHOST_PAD = 4
const GHOST_ASCENT = 0.75
const GHOST_DESCENT = 0.25

const KICKER_X = 96
const KICKER_Y = 330
const KICKER_SIZE = 20
const KICKER_TRACKING = 10
const KICKER_MAX_W = 720

const TITLE_X = 96
const TITLE_Y = 410
const TITLE_SIZE = 54
const TITLE_MIN_PT = 32
const TITLE_MAX_LINES = 2
const TITLE_MAX_W = 720
const TITLE_LINE_RATIO = 1.15

const SUB_SIZE = 20
const SUB_GAP = 52
const SUB_MAX_W = 720

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/** 板上 y620 在 480px 下会出血。按字形盒把基线夹进画布。 */
function ghostBaseline(fontSize: number): number {
  const minY = fontSize * GHOST_ASCENT + GHOST_PAD
  const maxY = CANVAS_H_PX - fontSize * GHOST_DESCENT - GHOST_PAD
  return Math.round(Math.min(maxY, Math.max(minY, 620)))
}

export function GhostSectionChapter({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const bg = ctx.defaultBg ?? colors.bg
  const chNum = chapterNumberFor(ir.slides, index)
  const label = pad2(chNum)
  const ghostSize = scaleTypePx(GHOST_SIZE, ctx.shape?.typeScale)
  const ghostY = ghostBaseline(ghostSize)

  const kickerSource = `SECTION ${label}`
  const kicker = fitSvgLine(kickerSource, {
    maxWidth: KICKER_MAX_W,
    fontSize: KICKER_SIZE,
    minFontSize: 12,
    letterSpacing: KICKER_TRACKING,
    fontFamily: fonts.body,
  })

  const heading = fitHeadingLines(slide.heading, {
    maxWidth: TITLE_MAX_W,
    fontSize: TITLE_SIZE,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
    lineHeightRatio: TITLE_LINE_RATIO,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
    bold: false,
  })
  const headingLastY = TITLE_Y + Math.max(0, heading.lines.length - 1) * heading.lineHeight

  const subheading = slide.subheading
    ? fitSvgLine(slide.subheading, {
        maxWidth: SUB_MAX_W,
        fontSize: SUB_SIZE,
        minFontSize: 12,
        fontFamily: fonts.body,
      })
    : null
  const subY = headingLastY + SUB_GAP

  return (
    <>
      <text
        data-depth="mid"
        x={GHOST_X}
        y={ghostY}
        textAnchor="end"
        fontFamily={fonts.heading}
        fontSize={ghostSize}
        fill={colors.surface}
        dominantBaseline="alphabetic"
      >
        {label}
      </text>

      <text
        data-truncated={kicker.truncated ? "1" : undefined}
        x={KICKER_X}
        y={KICKER_Y}
        fontFamily={fonts.body}
        fontSize={kicker.fontSize}
        fill={accessibleInk(colors.accent, bg, kicker.fontSize)}
        letterSpacing={KICKER_TRACKING}
        dominantBaseline="alphabetic"
      >
        {kicker.text}
      </text>

      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x={TITLE_X}
          y={TITLE_Y + i * heading.lineHeight}
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fill={accessibleInk(colors.text, bg, heading.fontSize)}
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
          y={subY}
          fontFamily={fonts.body}
          fontSize={subheading.fontSize}
          fill={metaInk(colors.muted, bg)}
          dominantBaseline="alphabetic"
        >
          {subheading.text}
        </text>
      )}
    </>
  )
}

export const layoutDef = {
  // chapter-ghost-section-chapter.tsx: SECTION kicker, left heading,
  // optional muted subheading, bottom-right ghost index inside the canvas.
  // branding none so the default br logo does not eat the ghost. pinOnly.
  id: "ghost-section-chapter",
  kind: "archetype",
  pinOnly: true,
  branding: "none",
  slideTypes: ["chapter"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "watermark", accepts: [] },
  ],
  headingFit: {
    maxWidth: TITLE_MAX_W,
    fontSize: TITLE_SIZE,
    maxLines: TITLE_MAX_LINES,
    minPt: TITLE_MIN_PT,
    bold: false,
    lineHeightRatio: TITLE_LINE_RATIO,
  },
} satisfies LayoutDefinition
