// GF/svg/archetypes/chapter-masthead-chapter.tsx
import type { SvgTemplateProps } from "./types"
import { chapterNumberFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleInk } from "../ink"

/**
 * masthead-chapter archetype（spec §3.2）：顶/底两条 hairline 夹住左对齐大标
 * 题 + 斜体副标题，右下角是巨大的半透明章节序号水印。自
 * templates/magazine.tsx 的 `EditorialSerifChapter`（113-209 行）提炼。
 * 随迁 helper：无——`chapterNumberFor` 是 `../../lib/derive` 的公共
 * derive helper（经 import 消费，非 templates 文件私有），照常 import，不复制。
 *
 * 替换表（Step B，逐十六进制核实，对照 themes/magazine.ts 的 colors）：
 * Step A 对函数区间（113-209 行）grep 未命中任何 `#XXXXXX` 字面量或 theme id
 * 字符串——源函数体已直接消费 `ctx.colors`/`ctx.fonts`
 * （`colors.border ?? colors.muted`/`colors.accent`/`colors.text`/
 * `colors.muted`），无烤死颜色常量，无孤儿色。**档位一・逐字节等价**。
 *
 * 对比度自适应修复（W4 fix round，design decision 8 台账 #1 的根因处置）：
 * 标题/副标题原样消费 `colors.text`/`colors.muted`——这两个 token 是为该
 * 主题「均匀」的默认背景校准的，对 chapter 页型自己另开一档默认背景的三个
 * 主题（academic 深绿、classroom 雾蓝、consulting 深藏青）不成立，
 * consulting 的 `colors.text` 恰与自己的 chapter 默认背景同色（1:1，此前
 * 靠策展排除 `CHAPTER_WITHOUT_MASTHEAD` 处理）。改用
 * `accessibleInk(colors.text, ctx.defaultBg, fontSize)`：`colors.text`/
 * `colors.muted` 通过校验就原样返回（其余十主题的 chapter 默认背景与主题
 * 「均匀」默认背景同色调，逐字节不变），未通过时才落回 `readableOn` 的中性
 * 墨色——不发明新的取色策略。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量。
 */
export function MastheadChapter({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  // `ctx.defaultBg` is optional (ComponentCtx's own doc comment: a
  // hand-built ctx in a test may omit it) — falls back to the same
  // `colors.bg` `buildCtx` itself defaults to.
  const defaultBg = ctx.defaultBg ?? colors.bg
  const chNum = chapterNumberFor(ir.slides, index)
  const label = String(chNum).padStart(2, "0")

  const TOP_HAIRLINE_Y = 200
  const BOTTOM_HAIRLINE_Y = 520
  const HEADING_X = 96
  const HEADING_BASELINE = 380
  // Upper bound on the title's wrap width keeps its right edge (96 + 720 =
  // 816) clear of the watermark digit's left edge — "08" at 220px is the
  // widest 2-digit label (~2 * 0.56 * 220 ≈ 246px), so the digit starts no
  // earlier than 1184 - 246 = 938, well past 816.
  const HEADING_MAX_WIDTH = 720
  const NUMBER_BASELINE = 640

  const heading = fitHeadingLines(slide.heading, {
    maxWidth: HEADING_MAX_WIDTH,
    fontSize: 64,
    maxLines: 2,
    minPt: 36,
  })
  const headingLastY =
    HEADING_BASELINE + Math.max(0, heading.lines.length - 1) * heading.lineHeight
  const subheading = slide.subheading
    ? fitSvgLine(slide.subheading, { maxWidth: HEADING_MAX_WIDTH, fontSize: 24, minFontSize: 14 })
    : null
  const subheadingY = headingLastY + 48

  return (
    <>
      <line
        x1="96"
        y1={TOP_HAIRLINE_Y}
        x2="1184"
        y2={TOP_HAIRLINE_Y}
        stroke={colors.border ?? colors.muted}
        strokeWidth="1.4"
      />

      {/* Bottom-right watermark digit, kept clear of the title by
          HEADING_MAX_WIDTH above. Baseline 640 + ~0.22 * 220 ≈ 688px descent
          stays inside the 712px safe bottom margin. */}
      <text
        x="1184"
        y={NUMBER_BASELINE}
        fontFamily={fonts.heading}
        fontSize="220"
        fontWeight="700"
        fill={colors.accent}
        opacity="0.12"
        textAnchor="end"
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
          fontFamily={fonts.heading}
          fontSize={subheading.fontSize}
          fill={accessibleInk(colors.muted, defaultBg, subheading.fontSize)}
          fontStyle="italic"
          dominantBaseline="alphabetic"
        >
          {subheading.text}
        </text>
      )}

      <line
        x1="96"
        y1={BOTTOM_HAIRLINE_Y}
        x2="1184"
        y2={BOTTOM_HAIRLINE_Y}
        stroke={colors.border ?? colors.muted}
        strokeWidth="1.4"
      />
    </>
  )
}
