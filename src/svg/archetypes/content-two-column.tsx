import type { SvgTemplateProps } from "./types"
import { SvgContent } from "../svg-content"
import { sectionNameFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleInk } from "../ink"

/**
 * two-column content archetype（P3 Item ②，spec §3.2/§3.4）：跨主题通用的
 * 双栏内容页——顶部 kicker + heading + accent 短条 + 贯穿细线，下方内容区用
 * SvgContent 的 `two_column` 版式把 components 分左右两栏铺排。这是 Item ② 轮换
 * 需要的「第二种 content 版式」：与各主题原生 content archetype（bento 拼盘/
 * 海报堆叠/横幅/编号导轨/窄栏）的单栏语法明显不同，故同一 deck 内相邻
 * content 页轮换到它时视觉分化明显。
 *
 * 纯新写（非提炼），token 驱动（颜色/字体只来自 ctx），零 theme id、零主题色
 * hex。强制走 two_column 铺排、不透传 slide.arrangement 是本 archetype 的
 * 语义（components<2 时 SvgContent 的 two_column 自动回落单栏，安全）。
 *
 * 对比度自适应修复（W4 fix round，全矩阵扫描发现——与 content-banner-
 * heading.tsx/content-rail-numbered.tsx 同一枚"substitutes colors.primary
 * for accent"缺陷模式，副题固定消费 `colors.primary` 未检查是否真的对当前
 * content 默认背景达标）：classroom（3.09:1）、campaign（3.49:1）均未过
 * 22px 副题所需的 4.5:1。改用 `accessibleInk(colors.primary, ctx.defaultBg,
 * fontSize)`——通过校验的主题原样返回、逐字节不变。
 */
export function TwoColumnContent({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const section = sectionNameFor(ir.slides, index)
  const kicker = section
    ? fitSvgLine(section, { maxWidth: 900, fontSize: 17, minFontSize: 13 })
    : null

  const KICKER_Y = 96
  const HEADING_BASELINE = 150

  const heading = fitHeadingLines(slide.heading, {
    maxWidth: 1088,
    fontSize: 46,
    maxLines: 2,
    minPt: 30,
    fontFamily: fonts.heading,
  })
  const headingLastY =
    HEADING_BASELINE + Math.max(0, heading.lines.length - 1) * heading.lineHeight

  // subheading 槽位（2026-07-10 深度自查修复：上线版静默丢 slide.subheading，
  // 轮换进本版式的页面副题信息丢失）。有副题时其余元素整体下移。
  const subheading = slide.subheading
    ? fitSvgLine(slide.subheading, { maxWidth: 1088, fontSize: 22, minFontSize: 16 })
    : null
  const subheadingFill = subheading
    ? accessibleInk(colors.primary, ctx.defaultBg ?? colors.bg, subheading.fontSize)
    : colors.primary
  const subheadingY = headingLastY + 42
  const accentY = (subheading ? subheadingY : headingLastY) + 22
  const ruleY = accentY + 22
  const contentY = ruleY + 34
  const contentH = 640 - contentY

  return (
    <>
      {/* kicker：章节名（accent 方块 + muted 文字） */}
      {kicker && (
        <>
          <rect x={96} y={KICKER_Y - 13} width={13} height={13} fill={colors.accent} />
          <text
            data-truncated={kicker.truncated ? "1" : undefined}
            x={120}
            y={KICKER_Y}
            fontFamily={fonts.body}
            fontSize={17}
            fill={colors.muted}
            letterSpacing={2}
            dominantBaseline="alphabetic"
          >
            {kicker.text}
          </text>
        </>
      )}

      {/* heading */}
      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x={96}
          y={HEADING_BASELINE + i * heading.lineHeight}
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="700"
          fill={colors.text}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* subheading：primary 强调（与 banner-heading 的副题语义一致） */}
      {subheading && (
        <text
          data-truncated={subheading.truncated ? "1" : undefined}
          x={96}
          y={subheadingY}
          fontFamily={fonts.body}
          fontSize={subheading.fontSize}
          fill={subheadingFill}
          dominantBaseline="alphabetic"
        >
          {subheading.text}
        </text>
      )}

      {/* accent 短条 + 贯穿细线 */}
      <rect x={96} y={accentY} width={72} height={4} fill={colors.accent} />
      <line x1={96} y1={ruleY} x2={1184} y2={ruleY} stroke={colors.border ?? colors.muted} strokeWidth={1} />

      {/* 双栏内容区 */}
      <SvgContent
        arrangement="two_column"
        components={slide.components}
        rect={{ x: 96, y: contentY, w: 1088, h: Math.max(120, contentH) }}
        ctx={ctx}
      />
    </>
  )
}
