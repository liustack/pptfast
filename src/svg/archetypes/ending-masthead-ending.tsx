// GF/svg/archetypes/ending-masthead-ending.tsx
import type { SvgTemplateProps } from "./types"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"

/**
 * masthead-ending archetype（spec §3.2）：居中大标题 + 斜体副标题 + 底部一行
 * 元信息（机构 / 联系方式 / 日期），无边框无水印，与 masthead-chapter 呼应同
 * 一"报刊 masthead"气质。自 templates/magazine.tsx 的 `EditorialSerifEnding`
 * （383-460 行）提炼。
 * 随迁 helper：无——`fitHeadingLines`/`fitSvgLine` 是公共 layout helper，照常
 * import，不复制。
 *
 * 替换表（Step B，逐十六进制核实，对照 themes/magazine.ts 的 colors）：
 * Step A 对函数区间（383-460 行）grep 未命中任何 `#XXXXXX` 字面量或 theme id
 * 字符串——源函数体已直接消费 `ctx.colors`/`ctx.fonts`
 * （`colors.text`/`colors.muted`），无烤死颜色常量，无孤儿色。**档位
 * 一・逐字节等价**。
 *
 * 副题兜底逻辑（按当前源码实际行为原样迁移，不改语义）：
 * `slide.subheading || (slide.heading ? "" : "We appreciate your time.")`——
 * 仅当 `slide.heading` 也缺省时才兜底显示该文案；若 heading 有值但
 * subheading 缺省，则不显示副题（同 2026-07-09 consulting 去重裁决，见源码
 * 同一行注释）。测试覆盖有 heading（无兜底）与无 heading（兜底
 * "We appreciate your time."）两种 ir。defect C 修复：主标题兜底"致谢"改
 * "Thank You"，副标题兜底"谢谢。"改"We appreciate your time."——两个中文
 * 原文本就是不同措辞（正式/随意两级），译文延续这一区分，不直译成同一句
 * "Thank you." 让大小标题重复。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量。
 */
export function MastheadEnding({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx

  const HEADING_LAST_BASELINE = 340
  const heading = fitHeadingLines(slide.heading || "Thank You", {
    maxWidth: 1088,
    fontSize: 76,
    maxLines: 2,
    minPt: 36,
    fontFamily: fonts.heading,
  })
  const headingY =
    HEADING_LAST_BASELINE - Math.max(0, heading.lines.length - 1) * heading.lineHeight
  const headingLastY = HEADING_LAST_BASELINE

  // 兜底只服务完全默认的 ending 页（同 consulting 2026-07-09 去重裁决）
  const subheading = fitSvgLine(slide.subheading || (slide.heading ? "" : "We appreciate your time."), {
    maxWidth: 1088,
    fontSize: 28,
    minFontSize: 16,
  })
  const subheadingY = headingLastY + 56

  const org = ir.meta.organization
  const contact = ir.meta.contact
  const contactText = contact ? [contact.name, contact.email].filter(Boolean).join(" · ") : null
  const date = ir.meta.date
  const metaParts = [org, contactText, date].filter((v): v is string => Boolean(v))

  return (
    <>
      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x="640"
          y={headingY + i * heading.lineHeight}
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="600"
          fill={colors.text}
          textAnchor="middle"
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {subheading.text && (
        <text
          data-truncated={subheading.truncated ? "1" : undefined}
          x="640"
          y={subheadingY}
          fontFamily={fonts.heading}
          fontSize={subheading.fontSize}
          fill={colors.muted}
          fontStyle="italic"
          textAnchor="middle"
          dominantBaseline="alphabetic"
        >
          {subheading.text}
        </text>
      )}

      {metaParts.length > 0 && (
        <text
          x="640"
          y="640"
          fontFamily={fonts.body}
          fontSize="13"
          fill={colors.muted}
          letterSpacing="2"
          textAnchor="middle"
          dominantBaseline="alphabetic"
        >
          {metaParts.join("    ·    ")}
        </text>
      )}
    </>
  )
}
