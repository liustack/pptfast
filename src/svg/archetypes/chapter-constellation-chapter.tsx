// GF/svg/archetypes/chapter-constellation-chapter.tsx
import type { SvgTemplateProps } from "./types"
import { chapterNumberFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"

/**
 * constellation-chapter archetype（spec §3.2）：左侧巨大 accent 色章节序号 +
 * 右侧左对齐大标题/副标题 + 底部一条 hairline 分隔线。自
 * templates/tech.tsx 的 `BentoTechChapter`（867-957 行）提炼。随迁 helper：
 * 无——`chapterNumberFor` 是 `../../lib/derive` 的公共 derive
 * helper（经 import 消费，非 templates 文件私有），照常 import，不复制。
 *
 * 替换表（Step B，逐十六进制核实，对照 themes/tech.ts 的 colors）：
 * Step A 对函数区间（867-957 行）grep 未命中任何 `#XXXXXX` 字面量或 theme id
 * 字符串——源函数体已直接消费 `ctx.colors`/`ctx.fonts`（`colors.accent`/
 * `colors.text`/`colors.muted`/`colors.border ?? colors.muted`），无烤死颜色
 * 常量，无孤儿色。**档位一・逐字节等价**。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量。
 */
export function ConstellationChapter({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const chNum = chapterNumberFor(ir.slides, index)
  const label = String(chNum).padStart(2, "0")
  // Task 1（tech）: was accentFor(colors, chNum - 1) — cycled a hue per
  // chapter number. Single-accent redesign: every chapter number is the
  // same color.
  const numberColor = colors.accent

  const NUMBER_BASELINE = 400
  const HEADING_BASELINE = 392
  const HEADING_X = 320
  const DIVIDER_Y = 560
  // Content's right content margin (96 + 1088) so the title never runs past
  // the page's established right edge.
  const headingMaxWidth = 1184 - HEADING_X

  const heading = fitHeadingLines(slide.heading, {
    maxWidth: headingMaxWidth,
    fontSize: 56,
    maxLines: 2,
    minPt: 28,
  })
  const headingLastY =
    HEADING_BASELINE +
    Math.max(0, heading.lines.length - 1) * heading.lineHeight
  const subheading = slide.subheading
    ? fitSvgLine(slide.subheading, {
        maxWidth: headingMaxWidth,
        fontSize: 26,
        minFontSize: 16,
      })
    : null
  const subheadingY = headingLastY + 56

  return (
    <>
      {/* Left accent-colored chapter number. "08" at 160px is the widest
          2-digit label (~2 * 0.56 * 160 ≈ 180px) — 96 + 180 = 276 < 320, so
          it never collides with the title regardless of chapter count. */}
      <text
        x="96"
        y={NUMBER_BASELINE}
        fontFamily={fonts.heading}
        fontSize="160"
        fontWeight="700"
        fill={numberColor}
        dominantBaseline="alphabetic"
      >
        {label}
      </text>

      {heading.lines.map((line, i) => (
        <text
          key={i}
          x={HEADING_X}
          y={HEADING_BASELINE + i * heading.lineHeight}
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="600"
          fill={colors.text}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {subheading && (
        <text
          x={HEADING_X}
          y={subheadingY}
          fontFamily={fonts.body}
          fontSize={subheading.fontSize}
          fill={colors.muted}
          dominantBaseline="alphabetic"
        >
          {subheading.text}
        </text>
      )}

      <line
        x1="96"
        y1={DIVIDER_Y}
        x2="1184"
        y2={DIVIDER_Y}
        stroke={colors.border ?? colors.muted}
        strokeWidth="1.4"
      />
    </>
  )
}
