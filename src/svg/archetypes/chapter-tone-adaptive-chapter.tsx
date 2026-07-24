// GF/svg/archetypes/chapter-tone-adaptive-chapter.tsx
import type { SvgTemplateProps } from "./types"
import { chapterNumberFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { accessibleInk } from "../ink"

/**
 * tone-adaptive-chapter archetype（spec §3.2）：整页居中版式——右下角巨幅半
 * 透明章节序号水印 + 居中章节标题（1-2 行自适应）。有背景图时叠加黑色半透明
 * 幕布并整体切换为白字。自 templates/custom.tsx 的 `CustomChapter`
 * （251-320 行）提炼，随迁 helper `hasBgImage`（36-44 行，私有复制，签名/
 * 实现原样不变）。
 *
 * 替换表（Step B，逐十六进制核实，对照 themes/custom.ts 的
 * colors）：
 *   - 源文件私有常量 `INK` —— 与 custom token 表当前的 `primary`、`text`
 *     两个字段精确匹配（同 cover-tone-adaptive-header.tsx 已核实的现状：
 *     custom.ts 里二者尚未拆分，仍是同一个值）。与 cover 那个函数不同，本
 *     函数体内 `INK`／派生变量 `fg` **只在一种语境下被消费**——两处都是
 *     `fill={fg}`（章节号水印、章节标题），没有任何描边/stroke 用法，因此
 *     没有语境歧义，统一映射到「文字填色」语境 → `ctx.colors.text`（下方
 *     `textFg`）。**若 custom 主题未来把 text/primary 拆开，这里不需要回
 *     来重新判断语境——本函数天然只有一种语境**，这点与 cover 版本的长期
 *     盯防点不同，特此记录以免误用 cover 文件头的双语境结论直接套用本文件。
 *   - 本函数不消费 `MUTED`／`BORDER`（CustomChapter 源码本就没有引用这两个
 *     模块级常量），替换表到此为止。
 *
 * withBg 白字/黑幕豁免（Global Constraints 产品逻辑白字豁免，同
 * cover-tone-adaptive-header.tsx 先例）：`hasBgImage` 为真时 `textFg` 固定
 * 切到纯白，不随主题变化——背景图上强制白字的结构性产品逻辑，不进上面的替
 * 换表。整页黑色半透明幕布（scrim for bg-image readability，替代原
 * linearGradient）同属此类：不是任何主题 token 的烤色，是固定可读性遮罩，
 * 原样保留（同 cover 版本引用的 full-slide-svg.tsx `isDesignTheme` 排除逻
 * 辑，custom 主题维持裸背景 + 局部 scrim 直通）。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量（除上述白字/黑幕两类豁免——
 * grep 清零门预期命中的 hex 全部落在文件头点名的豁免范围内，逐行可核对）。
 *
 * 对比度自适应修复（W4 fix round，Important I1「tone-adaptive-chapter（无 bg
 * 分支）」台账）：`!withBg` 分支的 `textFg` 原样消费 `colors.text`，对
 * academic/classroom/consulting 三个 chapter 页型另开一档默认背景的主题
 * 不成立。改用 `accessibleInk(colors.text, ctx.defaultBg, heading.fontSize)`
 * ——`withBg` 分支的强制白字豁免不变（背景图上的产品逻辑白字，与 chapter
 * 默认背景无关）。
 */

/** Check whether the slide has a valid background image asset. Ported
 * verbatim from templates/custom.tsx（36-44 行），私有复制，签名/实现不变。*/
function hasBgImage(
  ir: SvgTemplateProps["ir"],
  slide: SvgTemplateProps["slide"],
): boolean {
  if (slide.background?.kind !== "asset") return false
  const assetId = slide.background.asset_id
  const asset = ir.assets.images[assetId]
  return !!(asset?.src && !asset.error)
}

export function ToneAdaptiveChapter({ ir, slide, index, ctx }: SvgTemplateProps) {
  const withBg = hasBgImage(ir, slide)
  const chNum = chapterNumberFor(ir.slides, index)
  const label = String(chNum).padStart(2, "0")

  const heading = fitHeadingLines(slide.heading, {
    maxWidth: 1152,
    fontSize: 88,
    maxLines: 2,
    minPt: 40,
    fontFamily: ctx.fonts.heading,
  })
  const headingY = heading.lines.length > 1 ? 368 : 408

  // INK 语境映射（见文件头「替换表」）：本函数唯一语境是文字填色 → text。
  // 对比度自适应修复（见文件头）：!withBg 分支落 accessibleInk，withBg 分支
  // 的强制白字豁免不变。`ctx.defaultBg` 可选（ComponentCtx 自己的文档：
  // 测试手搭的 ctx 可能缺省），兜底同 `buildCtx` 自身的缺省值。
  const textFg = withBg
    ? "#FFFFFF"
    : accessibleInk(ctx.colors.text, ctx.defaultBg ?? ctx.colors.bg, heading.fontSize)

  return (
    <>
      {/* Scrim for bg-image mode (replaces linearGradient) — see file
          header's withBg 白字/黑幕豁免. */}
      {withBg && (
        <rect width="1280" height="720" fill="#000000" opacity="0.32" />
      )}

      {/* Large semi-transparent chapter number. y is nudged up from the
          naive vertical center (600) — real getBBox measurement showed this
          glyph's descender reach past the 720px page bottom depending on
          which font in the heading stack actually resolves, so a fixed
          margin here is safer than the 6-8px overflow tolerance. Ported
          verbatim from templates/custom.tsx's CustomChapter comment. */}
      <text
        x="1224"
        y="610"
        fontFamily={ctx.fonts.heading}
        fontSize="260"
        fontWeight="800"
        fill={textFg}
        opacity="0.05"
        textAnchor="end"
        dominantBaseline="alphabetic"
      >
        {label}
      </text>

      {/* Chapter heading (centered) */}
      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x="640"
          y={headingY + i * heading.lineHeight}
          fontFamily={ctx.fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="700"
          fill={textFg}
          textAnchor="middle"
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}
    </>
  )
}
