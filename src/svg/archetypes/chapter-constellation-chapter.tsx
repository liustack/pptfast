// GF/svg/archetypes/chapter-constellation-chapter.tsx
import type { SvgTemplateProps } from "./types"
import { chapterNumberFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleInk } from "../ink"

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
 * 对比度自适应修复（W4 fix round，Important I1 台账 + 本轮扩大排查）：标题/
 * 副标题原样消费 `colors.text`/`colors.muted`，对 academic/classroom/
 * consulting 三个 chapter 页型另开一档默认背景的主题不成立（academic
 * 2.41:1/1.18:1 一类量级）。**左侧章节号**（`numberColor` = `colors.accent`，
 * 满不透明度，非水印豁免）同一根因下同样失败——I1 的窄口径扫描（仅匹配
 * "Sample heading"/"Sample subheading" 字面文本）未网罗到它，本轮补充实测
 * 复核（academic 2.17:1、classroom 1.48:1，同量级）。三处统一改用
 * `accessibleInk(..., ctx.defaultBg, fontSize)`——同 chapter-masthead-
 * chapter.tsx 先例，未失败的组合原样返回、逐字节不变。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量。
 */
export function ConstellationChapter({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  // `ctx.defaultBg` is optional (ComponentCtx's own doc comment: a
  // hand-built ctx in a test may omit it) — falls back to the same
  // `colors.bg` `buildCtx` itself defaults to.
  const defaultBg = ctx.defaultBg ?? colors.bg
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
        fill={accessibleInk(numberColor, defaultBg, 160)}
        dominantBaseline="alphabetic"
      >
        {label}
      </text>

      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x={HEADING_X}
          y={HEADING_BASELINE + i * heading.lineHeight}
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="600"
          fill={accessibleInk(colors.text, defaultBg, heading.fontSize)}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {subheading && (
        <text
          data-truncated={subheading.truncated ? "1" : undefined}
          x={HEADING_X}
          y={subheadingY}
          fontFamily={fonts.body}
          fontSize={subheading.fontSize}
          fill={accessibleInk(colors.muted, defaultBg, subheading.fontSize)}
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
