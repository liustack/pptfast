// GF/svg/archetypes/chapter-poster-chapter.tsx
import type { SvgTemplateProps } from "./types"
import { chapterNumberFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"

/**
 * poster-chapter archetype（spec §3.2）：左对齐巨幅章节数字（accent 红）+
 * 800-weight 大标题，上下各一条 hairline 分隔线，右上角组织名。自
 * templates/creative.tsx 的 `EditorialDarkChapter`（179-266 行，非计划原文
 * 估计的 179-346——Step A 用 Read 精确定位函数起止，346 行落在紧随其后的
 * Content 页型模块注释区间内，不属于本函数体）提炼。
 *
 * 随迁 helper：**无**。计划原文列了 `AccentBar`（49-69 行），但 Step A 复核
 * 确认 `EditorialDarkChapter` 函数体内并未调用 `AccentBar`——该 helper 只
 * 被 Cover（142 行）、Content（627 行）、Ending（773 行）引用，Chapter 走的
 * 是自己的左对齐大数字构图，没有短横条装饰。故本文件不内联 `AccentBar`，
 * 避免引入死代码。
 *
 * 替换表（对照 GF/themes/creative.ts 的 `colors` 逐字符核实，全部精确
 * 匹配，无孤儿色——档位一。十六进制值本身不抄进本注释，避免污染本文件的
 * grep 清零门，同 chapter-banner-chapter.tsx / chapter-rail-chapter.tsx 先例）：
 *   RED → ctx.colors.primary（逐字节等于 creative 的 `primary`，**不是**
 *   `accent`——`accent` 是另一个完全不同的暖棕色，沿用 P1
 *   cover-poster-center.tsx 已订正的映射结论，不重犯"RED→accent"的误判）。
 *   FG → ctx.colors.text（逐字节匹配）。
 *   MUTED → ctx.colors.muted（逐字节匹配）。
 *   BORDER → ctx.colors.border（逐字节匹配，creative token 表本身有 border
 *   字段，无需 `?? muted` 兜底）。
 *   函数体内未出现 `META_MUTED`，无需归并。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量。
 */
export function PosterChapter({ ir, slide, index, ctx }: SvgTemplateProps) {
  const chNum = chapterNumberFor(ir.slides, index)
  const label = String(chNum).padStart(2, "0")
  const org = ir.meta.organization

  const heading = fitHeadingLines(slide.heading, {
    maxWidth: 1168,
    fontSize: 56,
    maxLines: 2,
    minPt: 28,
  })
  // 章节数字基线 400、字号 224，下伸部至 ~463px。标题起点须留出
  // 显式间距（含导出 ascent 近似 ±20px 缓冲），否则数字与标题叠压。
  const headingY = heading.lines.length > 1 ? 500 : 532
  const headingLastY =
    headingY + Math.max(0, heading.lines.length - 1) * heading.lineHeight
  const dividerY = headingLastY + 110

  return (
    <>
      {/* Top right: organization */}
      {org && (
        <text
          x="1224"
          y="56"
          fontFamily={ctx.fonts.body}
          fontSize="22"
          fill={ctx.colors.muted}
          textAnchor="end"
          letterSpacing="4"
          dominantBaseline="alphabetic"
        >
          {org}
        </text>
      )}

      {/* Top divider */}
      <line
        x1="56"
        y1="80"
        x2="1224"
        y2="80"
        stroke={ctx.colors.border}
        strokeWidth="1.6"
      />

      {/* Large chapter number */}
      <text
        x="56"
        y="400"
        fontFamily={ctx.fonts.heading}
        fontSize="224"
        fontWeight="800"
        fill={ctx.colors.primary}
        letterSpacing="-8"
        dominantBaseline="alphabetic"
      >
        {label}
      </text>

      {/* Chapter heading */}
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x="56"
          y={headingY + i * heading.lineHeight}
          fontFamily={ctx.fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="800"
          fill={ctx.colors.text}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* Bottom divider */}
      <line
        x1="56"
        y1={dividerY}
        x2="1224"
        y2={dividerY}
        stroke={ctx.colors.border}
        strokeWidth="1.6"
      />
    </>
  )
}
