import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import { chapterNumberFor } from "../../lib/derive"
import { fitHeadingLines, scaleTypePx } from "../heading-fit"
import { fitSvgLine, measureTextUnits } from "../../lib/svg-text-layout"
import { accessibleOpacity, readableOn } from "../ink"
import { underlineYFromBaseline } from "./underline"

/**
 * banner-chapter layout（spec §3.2）：巨幅居中章节号水印 + 主标题/副
 * 标题，压在整页通栏色块上（色块由 FullSlideSvg 按 theme 的
 * `defaultBackgrounds.chapter` 绘制，本文件不画背景），末行文字下方一条
 * accent 色下划线。自 templates/consulting.tsx 的 `MckinseyNavyChapter`（184-265
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
    fontFamily: ctx.fonts.heading,
    typeScale: ctx.shape?.typeScale,
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
  // The accent rule underlines the line the chapter block ends with —
  // the subheading when there is one, the last heading line otherwise.
  //
  // Two earlier shapes, both wrong. It was first pinned at
  // `headingLastY + 48` unconditionally, which is 8px *above* the
  // subheading's own baseline (+56), so on any chapter page carrying a
  // subheading a 160px rule ran straight through the middle of that text
  // and read as a strikethrough (visual review 2026-08-16: "客户洞察怎么画了
  // 个黄色删除线"). Moving it to `subheadingY + 30` cleared the ink but left
  // a fixed-width dash floating under the block — the same 160px whether
  // the line above it was a 141px 「客户洞察」 or a 168px "Customers" (both
  // ink widths measured off an 8x raster), near enough the text to read as
  // an underline and too far below it to be one: 23.3px of air under the
  // CJK line, 28.6px under the Latin one, because the offset was counted
  // from the baseline while the ink below a baseline is script-dependent.
  // The 2026-08-20 review read exactly that: 「这个线是不你想放文字下方的
  // 啊？？？」
  //
  // So it is now an underline in fact: as wide as the line it belongs to,
  // and offset from that line's baseline in units of its own font size, so
  // zh/en/mixed all get the same optical air.
  const underlined = subheading
    ? {
        text: subheading.text,
        fontSize: subheading.fontSize,
        baseline: subheadingY,
        weight: { fontFamily: ctx.fonts.body, bold: false },
      }
    : {
        text: heading.lines[heading.lines.length - 1] ?? "",
        fontSize: heading.fontSize,
        baseline: headingLastY,
        // Matches `fitHeadingLines`'s own default for this call and the
        // `fontWeight="600"` the heading actually renders at.
        weight: { fontFamily: ctx.fonts.heading, bold: true },
      }
  const underlineHalfWidth = Math.round(
    (measureTextUnits(underlined.text, underlined.weight) * underlined.fontSize) / 2,
  )
  const underlineY = underlineYFromBaseline(
    underlined.baseline,
    underlined.fontSize,
    underlined.text,
  )

  return (
    <>
      {/* Large semi-transparent chapter number */}
      <text
        x="1224"
        y="650"
        fontFamily={ctx.fonts.heading}
        fontSize={scaleTypePx(260, ctx.shape?.typeScale)}
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
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
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

      {/* Accent underline for the line the block ends with. A chapter page
          with no text to underline gets no rule — a mark that belongs to
          nothing is the decoration-for-decoration's-sake this layout is
          being pulled back from. */}
      {underlineHalfWidth > 0 && (
        <line
          x1={640 - underlineHalfWidth}
          y1={underlineY}
          x2={640 + underlineHalfWidth}
          y2={underlineY}
          stroke={ctx.colors.accent}
          strokeWidth="1.6"
          opacity="0.6"
        />
      )}
    </>
  )
}

// T1d (src domain reorg wave 1): inlined verbatim from registry.ts's former
// CHAPTER_LAYOUT_DEFS["banner-chapter"] entry. Slot `accepts: []` means the slot is not fed by an authored
// component. That empty array used to live as a private alias in registry.ts
// and is inlined here as the literal `[]` it always held, to avoid a value-import
// cycle with the registry aggregator (which value-imports this export) — see
// registry.ts's slot-`accepts` convention doc for what `[]` means.
export const layoutDef: LayoutDefinition = {
  // chapter-banner-chapter.tsx: translucent watermark numeral, centered
  // white heading/subheading over the primary color block, accent underline
  // beneath the line the block ends with.
  id: "banner-chapter",
  kind: "archetype",
  slideTypes: ["chapter"],
  slots: [
    { name: "watermark", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "rule", accepts: [] },
  ],
}
