// GF/svg/archetypes/chapter-banner-chapter.tsx
import type { SvgTemplateProps } from "./types"
import { chapterNumberFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"

/**
 * banner-chapter archetype（spec §3.2）：巨幅居中章节号水印 + 白字主标题/副
 * 标题，压在整页通栏 `colors.primary` 色块上（色块由 FullSlideSvg 按
 * `themes/consulting.ts` 的 `defaultBackgrounds.chapter` 绘制，本文件
 * 不画背景），底部一条 accent 色短装饰线。自 templates/consulting.tsx 的
 * `MckinseyNavyChapter`（184-265 行，非计划原文估计的 184-324——已按 Step A
 * 用 `awk` 精确定位函数起止）提炼。无随迁 helper。
 *
 * 替换表（沿用 P1 已验证的 consulting 替换表，先例 cover-banner-title.tsx，
 * 十六进制值本身不抄进本注释，避免污染本文件的 grep 清零门，同
 * chapter-rail-chapter.tsx 先例）：
 *   YELLOW → ctx.colors.accent（逐字符核对 themes/consulting.ts 的
 *   accent 字段值，精确匹配）。函数区间内未出现 NAVY/MUTED/DIVIDER。
 *
 * 白字例外（同 chapter-rail-chapter.tsx 文件头记录的同一类产品逻辑，且该
 * 文件头本身已点名本函数为同款先例）：函数体内 3 处纯白字面量
 * `fill`（章节号水印 / 主标题 / 副标题，代码里能看到的那个纯白字面量）
 * 不是烤死的主题色，是画在整页不透明 `colors.primary` 色块之上的对比色
 * 文字，用于保证在任意主题的 `primary` 色值下都可读。若机械映射进
 * `colors.surface`（consulting 自己的 surface 恰好与之逐字节相同），在
 * tech/creative 等 surface 为深色的主题下会让文字在深色背景上隐形——同
 * rail-chapter.tsx 记录的"逐字节陷阱"（十六进制凑巧相等 ≠ 语义相同）。故
 * 这 3 处不进替换表，保留原样，并在测试里跨主题锁死。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量——唯一豁免是上面点名并测试锁
 * 死的纯白字面量，grep 清零门预期恰好命中这 3 处。
 */
export function BannerChapter({ ir, slide, index, ctx }: SvgTemplateProps) {
  const chNum = chapterNumberFor(ir.slides, index)
  const label = String(chNum).padStart(2, "0")

  const heading = fitHeadingLines(slide.heading, {
    maxWidth: 1088,
    fontSize: 84,
    maxLines: 2,
    minPt: 40,
  })
  const headingY = heading.lines.length > 1 ? 364 : 404
  const headingLastY =
    headingY + Math.max(0, heading.lines.length - 1) * heading.lineHeight
  const subheading = slide.subheading
    ? fitSvgLine(slide.subheading, { maxWidth: 1088, fontSize: 36, minFontSize: 18 })
    : null
  const subheadingY = headingLastY + 56
  const hairlineY = headingLastY + 48

  return (
    <>
      {/* Large semi-transparent chapter number */}
      <text
        x="1224"
        y="650"
        fontFamily={ctx.fonts.heading}
        fontSize="260"
        fontWeight="700"
        fill="#FFFFFF"
        opacity="0.05"
        textAnchor="end"
        dominantBaseline="alphabetic"
      >
        {label}
      </text>

      {/* Chapter heading (white, centered) */}
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x="640"
          y={headingY + i * heading.lineHeight}
          fontFamily={ctx.fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="600"
          fill="#FFFFFF"
          textAnchor="middle"
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* Optional subheading */}
      {subheading && (
        <text
          x="640"
          y={subheadingY}
          fontFamily={ctx.fonts.body}
          fontSize={subheading.fontSize}
          fill="#FFFFFF"
          opacity="0.7"
          textAnchor="middle"
          dominantBaseline="alphabetic"
        >
          {subheading.text}
        </text>
      )}

      {/* Decorative hairline */}
      <line
        x1="560"
        y1={hairlineY}
        x2="720"
        y2={hairlineY}
        stroke={ctx.colors.accent}
        strokeWidth="1.6"
        opacity="0.6"
      />
    </>
  )
}
