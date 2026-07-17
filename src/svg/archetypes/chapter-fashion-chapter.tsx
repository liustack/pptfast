import type { SvgTemplateProps } from "./types"
import { chapterNumberFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { readableOn } from "./cover-split-diagonal"

/**
 * fashion-chapter archetype（2026-07-10 时尚 runway 专属表达，纯新写）：
 * **满版 accent 色块 + 巨型章节数字水印**——检索结论：满版型高饱和色块是
 * 时尚杂志内页冲击力的核心手法。
 *
 * 导出一致性返工（2026-07-10 用户抓到预览/导出不一致）：初版用出血
 * （x=760 溢出右缘）+ 负 letterSpacing + fillOpacity 半透明——svg2pptx 的
 * 左对齐文本框宽度止于画布右缘，520px 大字「02」在框内换行致「2」被裁；
 * 负字距无 pptx 对应。故改**导出安全实现**：右对齐贴右缘（anchor=end 的
 * 文本框从 0 到 x，宽度充裕不换行）、去负字距、水印色用 fg 与满版底的
 * **实色混合**（mixHex 22%，不依赖 transparency 的跨渲染器表现）。
 * 前景色经 readableOn(accent) 自适应（正红→白字，其他主题借用同样安全）。
 * 纪律：零 theme id、零 baked 主题色 hex（readableOn 中性黑白豁免，
 * mixHex 是两个 ctx 色的插值非字面量），颜色全部来自 ctx。
 */

/** 两个 hex 颜色的线性插值（t=0 全 a，t=1 全 b），输出实色。 */
function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.replace("#", ""), 16)
  const pb = parseInt(b.replace("#", ""), 16)
  const ch = (sa: number, sb: number) => Math.round(sa + (sb - sa) * t)
  const r = ch((pa >> 16) & 255, (pb >> 16) & 255)
  const g = ch((pa >> 8) & 255, (pb >> 8) & 255)
  const bl = ch(pa & 255, pb & 255)
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0").toUpperCase()}`
}

export function FashionChapter({ ir, slide, index, ctx }: SvgTemplateProps) {
  const chNum = chapterNumberFor(ir.slides, index)
  const label = String(chNum).padStart(2, "0")
  const org = ir.meta.organization
  const fg = readableOn(ctx.colors.accent)
  // 水印色：前景与满版底的 22% 实色混合（导出安全，无 transparency 依赖）
  const watermark = mixHex(ctx.colors.accent, fg, 0.22)

  const heading = fitHeadingLines(slide.heading, {
    maxWidth: 1100,
    fontSize: 54,
    maxLines: 2,
    minPt: 30,
  })

  return (
    <>
      {/* 满版 accent 色块（画在版式内，不依赖页背景） */}
      <rect x={0} y={0} width={1280} height={720} fill={ctx.colors.accent} />

      {/* 巨型章节数字水印：右对齐贴右缘（anchor=end 导出文本框宽度充裕，
          不换行不裁字），实色混合替代半透明 */}
      <text
        x={1224}
        y={560}
        fontFamily={ctx.fonts.heading}
        fontSize={420}
        fontWeight="900"
        fill={watermark}
        textAnchor="end"
        dominantBaseline="alphabetic"
      >
        {label}
      </text>

      {/* 章节小号（实色，与水印大号形成大小极端对比） */}
      <text
        x={56}
        y={140}
        fontFamily={ctx.fonts.body}
        fontSize={24}
        fill={fg}
        letterSpacing={8}
        fontWeight="600"
        dominantBaseline="alphabetic"
      >
        {`CHAPTER ${label}`}
      </text>

      {/* 章节标题：大字重压满版色块 */}
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x={56}
          y={420 + i * heading.lineHeight}
          fontFamily={ctx.fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="900"
          fill={fg}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* 底部细线 + org */}
      <line x1={56} y1={636} x2={1224} y2={636} stroke={fg} strokeWidth={1.5} opacity={0.5} />
      {org && (
        <text
          x={56}
          y={676}
          fontFamily={ctx.fonts.body}
          fontSize={19}
          fill={fg}
          fillOpacity={0.85}
          letterSpacing={3}
          dominantBaseline="alphabetic"
        >
          {org}
        </text>
      )}
    </>
  )
}
