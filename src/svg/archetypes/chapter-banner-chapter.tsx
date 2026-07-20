// GF/svg/archetypes/chapter-banner-chapter.tsx
import type { SvgTemplateProps } from "./types"
import { chapterNumberFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleOpacity, readableOn } from "../ink"

/**
 * banner-chapter archetype（spec §3.2）：巨幅居中章节号水印 + 主标题/副
 * 标题，压在整页通栏色块上（色块由 FullSlideSvg 按 theme 的
 * `defaultBackgrounds.chapter` 绘制，本文件不画背景），底部一条 accent 色短
 * 装饰线。自 templates/consulting.tsx 的 `MckinseyNavyChapter`（184-265
 * 行，非计划原文估计的 184-324——已按 Step A 用 `awk` 精确定位函数起止）
 * 提炼。无随迁 helper。
 *
 * 替换表（沿用 P1 已验证的 consulting 替换表，先例 cover-banner-title.tsx，
 * 十六进制值本身不抄进本注释，避免污染本文件的 grep 清零门，同
 * chapter-rail-chapter.tsx 先例）：
 *   YELLOW → ctx.colors.accent（逐字符核对 themes/consulting.ts 的
 *   accent 字段值，精确匹配）。函数区间内未出现 NAVY/MUTED/DIVIDER。
 *
 * 对比度自适应修复（W4 fix round，Critical C1——与 chapter-rail-chapter.tsx
 * 同一根因、同一处置，见该文件头详述）：主标题/副标题原先写死纯白，假设章节
 * 默认背景总是深色，全集放开后对 bloom/enterprise/heritage/ink/journal/
 * runway 六个浅底章节主题不成立。改用 `readableOn(ctx.defaultBg)`——对本来
 * 就深色的七个章节底算出的仍是白色，字面量不变。章节号水印（0.05 透明度）
 * 保留原样纯白——低透明度装饰，不在本次缺陷范围内。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量——唯一豁免是章节号水印的纯白
 * 字面量，grep 清零门预期恰好命中这 1 处（heading/subheading 两处已改为
 * `readableOn` 调用，不再是字面量）。
 *
 * 副题透明度修正（W4 fix round，全矩阵扫描发现——与 chapter-rail-
 * chapter.tsx 同一根因）：副题固定 0.7 透明度，classroom 的章节默认背景
 * （`#6E8E9E`）让 `ink` 满不透明度时只有 3.48:1（十三主题里最紧的余量），
 * 0.7 透明度混合后实际约 2.53:1。改用 `accessibleOpacity` 按混合后的真实
 * 对比度验证，不达标时落回满不透明度。
 */
export function BannerChapter({ ir, slide, index, ctx }: SvgTemplateProps) {
  const chNum = chapterNumberFor(ir.slides, index)
  const label = String(chNum).padStart(2, "0")
  // `ctx.defaultBg` is optional (ComponentCtx's own doc comment: a
  // hand-built ctx in a test may omit it) — falls back to the same
  // `colors.bg` `buildCtx` itself defaults to.
  const defaultBg = ctx.defaultBg ?? ctx.colors.bg
  const ink = readableOn(defaultBg)

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
  const subheadingOpacity = subheading
    ? accessibleOpacity(ink, defaultBg, subheading.fontSize, 0.7)
    : 0.7
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

      {/* Chapter heading (adaptive ink, centered) */}
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x="640"
          y={headingY + i * heading.lineHeight}
          fontFamily={ctx.fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="600"
          fill={ink}
          textAnchor="middle"
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* Optional subheading */}
      {subheading && (
        <text
          data-truncated={subheading.truncated ? "1" : undefined}
          x="640"
          y={subheadingY}
          fontFamily={ctx.fonts.body}
          fontSize={subheading.fontSize}
          fill={ink}
          opacity={subheadingOpacity}
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
