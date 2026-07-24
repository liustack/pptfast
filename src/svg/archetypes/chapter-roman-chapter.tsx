// GF/svg/archetypes/chapter-roman-chapter.tsx
import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "../layouts/registry"
import { chapterNumberFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { cachedDeckSeed, pickBySeed } from "../variety"
import { accessibleInk } from "../ink"

/**
 * roman-chapter archetype（2026-07-12 借鉴财经简报章节页，新表达非提炼）：
 * 左侧巨幅罗马数字（primary 色带句点）+ 大标题 + 可选斜体副题，右侧
 * 圆弧意象装饰。
 * v2（用户两连裁决）：①霓虹光晕环被裁「不好看」——改细线质感（参考
 * 页是日食弧/唱片密纹，不是发光甜甜圈）。②固定装饰章节间千篇一律——
 * 同一圆弧语法做三构图变体，**按章节序号轮换**（deck 内章章不同），
 * deck 间起点由 seed 决定：variant = (seedBase + 章节号) % 3。
 *   A 日食弧：大圆细亮边只亮 3/4 弧 + 端点高光
 *   B 同心细环组：4 圈不等距细圆（唱片密纹）+ 单段 accent 短弧
 *   C 页缘切弧：更大的圆右缘出血只露左弧，弦切构图
 * 共享 archetype——manifest 决定谁用（先挂 insight）。
 *
 * 对比度自适应修复（W4 fix round，本轮扩大排查——同 chapter-poster-
 * chapter.tsx 一样不在 Important I1 原文窄口径扫描内）：巨幅罗马数字 +
 * 句点、org 标签、标题、副标题四处消费 `colors.primary`/`colors.muted`/
 * `colors.text`，对 academic/classroom/consulting 三个 chapter 页型另开
 * 一档默认背景的主题同 chapter-poster-chapter.tsx 先例失败（罗马数字与
 * `colors.primary` 恰好等于三主题各自的 `defaultBackgrounds.chapter`，精确
 * 1.00:1）。四处统一改用 `accessibleInk(..., ctx.defaultBg, fontSize)`。
 * pre-W4 三主题均未策展 roman-chapter（仅 insight 策展过，其 chapter 默认
 * 背景与「均匀」默认背景同色调，不受影响），是全集放开新暴露的组合。圆弧
 * 装饰（`colors.border`/`colors.muted`/`accent` 描边，非文字）不受 WCAG
 * 文字对比度检查约束，原样保留不改。
 *
 * 句点透明度修正（W4 fix round，全矩阵扫描发现）：罗马数字末尾句点原以
 * `fillOpacity={0.85}` 略微调淡（纯排印修饰，无设计文档记录必须如此）。
 * `accessibleInk` 按满不透明度验证 `romanInk` 达标，但句点渲染在 0.85
 * 透明度下与背景混合后实际对比度会低于验证值——campaign（3.49→2.90）、
 * classroom（3.58→2.98，均计算自渲染态而非估算）两个新可达组合因此跌破
 * 3:1。改为满不透明度：句点观感几乎不变（0.85 本就是极轻微的调淡），且
 * 与已验证的 `romanInk` 对比度保持一致，不再需要为透明度混合单独验证。
 *
 * 纪律：零 theme id、零 hex（描边全部 ctx 色）。
 */
/** 标准减法记数罗马数字转换（1-3999），非查表——章节数不设上限假设。
 * 越界（≤0 或 ≥4000，实际 deck 不可能出现）回落阿拉伯数字。 */
const ROMAN_PAIRS: [number, string][] = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
  [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
]

export function toRoman(n: number): string {
  if (!Number.isInteger(n) || n <= 0 || n >= 4000) return String(n)
  let rest = n
  let out = ""
  for (const [value, glyph] of ROMAN_PAIRS) {
    while (rest >= value) {
      out += glyph
      rest -= value
    }
  }
  return out
}

/** 圆弧上 (cx,cy,r) 从 a0 到 a1（度，0=右 90=下）的弧 path。 */
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const rad = (d: number) => (d * Math.PI) / 180
  const x0 = cx + r * Math.cos(rad(a0))
  const y0 = cy + r * Math.sin(rad(a0))
  const x1 = cx + r * Math.cos(rad(a1))
  const y1 = cy + r * Math.sin(rad(a1))
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`
}

export function RomanChapter({ ir, slide, index, ctx }: SvgTemplateProps) {
  const chNum = chapterNumberFor(ir.slides, index)
  const org = ir.meta.organization

  const heading = fitHeadingLines(slide.heading, {
    maxWidth: 620,
    fontSize: 60,
    maxLines: 2,
    minPt: 32,
    fontFamily: ctx.fonts.heading,
  })
  const headingY = 388
  const headingLastY = headingY + Math.max(0, heading.lines.length - 1) * heading.lineHeight
  const subY = headingLastY + 52

  // 装饰构图：deck 级 seed 定起点，章节号步进——deck 内章章不同
  const seedBase = pickBySeed(cachedDeckSeed(ir), "roman-chapter-decor", [0, 1, 2])
  const variant = (["eclipse", "grooves", "chord"] as const)[(seedBase + chNum - 1) % 3]
  const accent = ctx.colors.primary
  // `ctx.defaultBg` is optional (ComponentCtx's own doc comment: a
  // hand-built ctx in a test may omit it) — falls back to the same
  // `colors.bg` `buildCtx` itself defaults to.
  const defaultBg = ctx.defaultBg ?? ctx.colors.bg
  // 巨幅罗马数字满不透明度、非水印豁免——同 chapter-poster-chapter.tsx 先例，
  // 需要对比度自适应而非固定 colors.primary（见文件头）。
  const romanInk = accessibleInk(ctx.colors.primary, defaultBg, 176)

  return (
    <>
      {/* 右侧圆弧意象装饰（细线质感，三构图按章节轮换） */}
      {variant === "eclipse" && (
        <>
          {/* 日食弧：3/4 细亮弧 + 端点高光 + 内侧极淡整圆 */}
          <circle cx={990} cy={392} r={218} fill="none" stroke={ctx.colors.border} strokeWidth={0.8} strokeOpacity={0.35} />
          <path d={arcPath(990, 392, 246, -160, 65)} fill="none" stroke={accent} strokeWidth={2} strokeOpacity={0.85} strokeLinecap="round" />
          <path d={arcPath(990, 392, 246, 65, 88)} fill="none" stroke={accent} strokeWidth={1} strokeOpacity={0.3} strokeLinecap="round" />
          <circle cx={990 + 246 * Math.cos((65 * Math.PI) / 180)} cy={392 + 246 * Math.sin((65 * Math.PI) / 180)} r={5} fill={accent} />
        </>
      )}
      {variant === "grooves" && (
        <>
          {/* 同心细环组（唱片密纹）+ 单段 accent 短弧 */}
          <circle cx={1000} cy={392} r={252} fill="none" stroke={ctx.colors.border} strokeWidth={0.8} strokeOpacity={0.4} />
          <circle cx={1000} cy={392} r={224} fill="none" stroke={ctx.colors.border} strokeWidth={0.8} strokeOpacity={0.3} />
          <circle cx={1000} cy={392} r={206} fill="none" stroke={ctx.colors.muted} strokeWidth={0.6} strokeOpacity={0.25} />
          <circle cx={1000} cy={392} r={162} fill="none" stroke={ctx.colors.border} strokeWidth={0.8} strokeOpacity={0.35} />
          <path d={arcPath(1000, 392, 238, -74, -18)} fill="none" stroke={accent} strokeWidth={2.5} strokeOpacity={0.9} strokeLinecap="round" />
        </>
      )}
      {variant === "chord" && (
        <>
          {/* 页缘切弧：大圆右缘出血只露左弧，双细线 + accent 弧段 */}
          <path d={arcPath(1385, 392, 360, 128, 232)} fill="none" stroke={ctx.colors.border} strokeWidth={1} strokeOpacity={0.45} />
          <path d={arcPath(1385, 392, 322, 132, 228)} fill="none" stroke={ctx.colors.muted} strokeWidth={0.7} strokeOpacity={0.3} />
          <path d={arcPath(1385, 392, 360, 154, 176)} fill="none" stroke={accent} strokeWidth={2.2} strokeOpacity={0.85} strokeLinecap="round" />
        </>
      )}

      {/* 右上组织名（圆环顶部之上留白区） */}
      {org && (
        <text
          x="1224"
          y="56"
          fontFamily={ctx.fonts.body}
          fontSize="22"
          fill={accessibleInk(ctx.colors.muted, defaultBg, 22)}
          textAnchor="end"
          letterSpacing="4"
          dominantBaseline="alphabetic"
        >
          {org}
        </text>
      )}

      {/* 巨幅罗马数字 + 句点 */}
      <text
        x="56"
        y="264"
        fontFamily={ctx.fonts.heading}
        fontSize="176"
        fontWeight="800"
        fill={romanInk}
        dominantBaseline="alphabetic"
      >
        {toRoman(chNum)}
        <tspan fill={romanInk}>.</tspan>
      </text>

      {/* 大标题 */}
      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x="56"
          y={headingY + i * heading.lineHeight}
          fontFamily={ctx.fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="800"
          fill={accessibleInk(ctx.colors.text, defaultBg, heading.fontSize)}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* 可选副题（斜体，财经简报的双语排印感） */}
      {slide.subheading && (
        <>
          <text
            x="56"
            y={subY}
            fontFamily={ctx.fonts.body}
            fontSize="24"
            fontStyle="italic"
            fill={accessibleInk(ctx.colors.muted, defaultBg, 24)}
            dominantBaseline="alphabetic"
          >
            {slide.subheading}
          </text>
          <line
            x1="56"
            y1={subY + 34}
            x2="216"
            y2={subY + 34}
            stroke={ctx.colors.border}
            strokeWidth="1.4"
          />
        </>
      )}
    </>
  )
}

// T1d (src domain reorg wave 1): inlined verbatim from registry.ts's former
// CHAPTER_LAYOUTS["roman-chapter"] entry. `CHROME` (registry.ts's private
// `readonly string[] = []` alias, "not fed by an authored component") is
// inlined here to the literal `[]` it always held, to avoid a value-import
// cycle with the registry aggregator (which value-imports this export) — see
// registry.ts's slot-`accepts` convention doc for what `[]` means.
export const layoutDef: LayoutDefinition = {
  // chapter-roman-chapter.tsx: top-right org kicker, giant roman-numeral
  // watermark, heading + italic subheading with its own short rule, and a
  // seed/chapter-rotated arc ornament (eclipse/grooves/chord) → decor.
  id: "roman-chapter",
  kind: "archetype",
  slideTypes: ["chapter"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "watermark", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "rule", accepts: [] },
    { name: "decor", accepts: [] },
  ],
}
