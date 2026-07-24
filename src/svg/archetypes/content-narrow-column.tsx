// GF/svg/archetypes/content-narrow-column.tsx
import type { SvgTemplateProps } from "./types"
import { SvgContent } from "../svg-content"
import { sectionNameFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { fitEmphasisLine, renderEmphasisTspans } from "../emphasis"
import { accessibleInk } from "../ink"

/**
 * narrow-column content archetype（spec §3.2，Wave 3 Task 17）：trades the
 * usual full-width component stack for a magazine-style narrow column (w=880 of
 * the page's 1088 content width), leaving a deliberate 208px whitespace
 * gutter on the right that carries only a large muted serif page number.
 * Kicker (section name) sits italic+accent above the heading; an optional
 * accent-italic subheading slots in below it. Extracted from
 * templates/magazine.tsx 的 `EditorialSerifContent`（212-380 行）。
 * 随迁 helper：无——本函数消费的 `SvgContent`/`sectionNameFor`/
 * `fitHeadingLines`/`fitSvgLine`/`fitEmphasisLine`/`renderEmphasisTspans`
 * 均是 svg 或 pptx-preview 下的公共 helper（经 import 消费，非
 * templates 文件私有），照常 import，不复制。
 *
 * 替换表（Step B，逐十六进制核实，对照 themes/magazine.ts 的 colors）：
 * Step A 对函数区间（212-380 行）grep 未命中任何 `#XXXXXX` 字面量或 theme id
 * 字符串——源函数体已直接消费 `ctx.colors`/`ctx.fonts`
 * （`colors.border ?? colors.muted`/`colors.accent`/`colors.text`/
 * `colors.muted`），无烤死颜色常量，无孤儿色。**档位一・逐字节等价**。
 *
 * 对比度自适应修复（W4 fix round，Important I1「content archetype 的
 * subheading 出现同类回声」台账）：subheading 原样消费 `colors.accent`——
 * 这个 token 是为装饰性强调（小面积图标/分隔线）校准的，不保证在正文尺寸
 * 下达标（consulting/bloom/classroom/heritage/academic 均实测 1.45-2.92:1，
 * 该 archetype 在这些主题 pre-W4 策展集里都不存在，是全集放开新暴露）。改用
 * `accessibleInk(colors.accent, ctx.defaultBg, fontSize)`——通过校验的主题
 * 原样返回、逐字节不变。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量。
 */
export function NarrowColumnContent({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const section = sectionNameFor(ir.slides, index)

  const TOP_HAIRLINE_Y = 88
  const KICKER_Y = 124
  const HEADING_BASELINE = 190
  // Deliberately narrow: 880 of the page's usual 1088 content width, leaving
  // a 208px right-hand whitespace gutter (x 1000-1184) that carries nothing
  // but the big page number below.
  const COLUMN_X = 96
  const COLUMN_W = 880
  const COLUMN_BOTTOM = 640

  const heading = fitHeadingLines(slide.heading, {
    maxWidth: COLUMN_W,
    fontSize: 60,
    maxLines: 2,
    minPt: 32,
    fontFamily: fonts.heading,
  })
  const headingLastY =
    HEADING_BASELINE + Math.max(0, heading.lines.length - 1) * heading.lineHeight

  // Subheading (Task 5): a 22px accent, italic so-what sentence below the
  // heading (matching the kicker's own italic+accent treatment above it).
  // Occupies a slot added to the narrow column's own y *only* when
  // `slide.subheading` is set, so a slide without one gets byte-identical
  // geometry to before this feature existed.
  //
  // S3b spacing fix, corrected (2026-07-07): this theme's subheading uses
  // the *heading* font (`fonts.heading` = "SimSun, Songti SC, STSong,
  // serif"), not the sans body font the other four generic-formula themes
  // use — the six-theme formula's 0.12*fontSize glyph-descent assumption
  // (calibrated against those sans-body subheadings) badly underestimates
  // real SimSun-family CJK descent. A first pass landed on +44
  // (22+14+round(0.12*60)) and *looked* separated for a short/no-wrap
  // heading, but real getBBox measurement of an actually-wrapped 2-line
  // heading (a real-world repro, not a synthetic worst case) showed the
  // title's real glyph descent is ~0.34*fontSize (~20px at nominal 60,
  // ~15.5px at the 46px this specific heading shrinks to) — 3x the generic
  // assumption — leaving the subheading touching/overlapping the title at
  // +44 (measured ~0-5px real gap, confirmed in a Chromium 104 render, not
  // just estimated). Recalibrated from real measurements: subheading's own
  // real ascent ≈24px, title's real descent ≈round(0.34*60)=20px at the
  // (worst-case, largest) nominal 60px size, +18px target gap (a few px
  // above the six-theme 14px floor for headroom against per-character
  // descent variance, e.g. glyphs with low-reaching strokes) ⇒
  // 24+18+20=62, rounded to +64. Verified via getBBox: ~20-25px real gap
  // across both the nominal-60 and shrunk-46 cases. Slot grows by the same
  // +34 the baseline grew (30->64) so the subheading-to-column gap doesn't
  // shrink.
  const subheading = fitEmphasisLine(slide.subheading, {
    maxWidth: COLUMN_W,
    fontSize: 22,
    minFontSize: 16,
  })
  const subheadingY = headingLastY + 64
  const subheadingBudget = subheading ? 68 : 0
  // W4 fix round: keeps colors.accent when it already clears the
  // size-appropriate ratio, falls back to readableOn's neutral ink
  // otherwise (see file header). Fallback value is never rendered when
  // `subheading` is null. `ctx.defaultBg` is optional (`ComponentCtx`'s own
  // doc comment: a hand-built ctx in a test may omit it) — falls back to
  // the same `colors.bg` `buildCtx` itself defaults to.
  const subheadingFill = subheading
    ? accessibleInk(colors.accent, ctx.defaultBg ?? colors.bg, subheading.fontSize)
    : colors.accent

  const columnY = headingLastY + 40 + subheadingBudget
  const columnH = Math.max(0, COLUMN_BOTTOM - columnY)

  const pageLabel = String(index + 1).padStart(2, "0")

  const kicker = section
    ? fitSvgLine(section, { maxWidth: COLUMN_W, fontSize: 16, minFontSize: 12 })
    : null

  // 980 = conservative left edge of the page-number digits (1112) minus the
  // footnote's own start x (96) minus a 36px safety gap, so a
  // maximally-fitted footnote never runs into the large muted page number in
  // the right gutter.
  const footnote = slide.footnote
    ? fitSvgLine(slide.footnote, { maxWidth: 980, fontSize: 20, minFontSize: 13 })
    : null

  return (
    <>
      <line
        x1="96"
        y1={TOP_HAIRLINE_Y}
        x2="1184"
        y2={TOP_HAIRLINE_Y}
        stroke={colors.border ?? colors.muted}
        strokeWidth="1.2"
      />

      {kicker && (
        <text
          data-truncated={kicker.truncated ? "1" : undefined}
          x="96"
          y={KICKER_Y}
          fontFamily={fonts.heading}
          fontSize={kicker.fontSize}
          fill={colors.accent}
          fontStyle="italic"
          dominantBaseline="alphabetic"
        >
          {kicker.text}
        </text>
      )}

      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x="96"
          y={HEADING_BASELINE + i * heading.lineHeight}
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="600"
          fill={colors.text}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* Subheading: accent italic so-what sentence below the heading (Task 5) */}
      {subheading && (
        <text
          x="96"
          y={subheadingY}
          fontFamily={fonts.heading}
          fontSize={subheading.fontSize}
          fill={subheadingFill}
          fontStyle="italic"
          dominantBaseline="alphabetic"
        >
          {renderEmphasisTspans(subheading.segments, { accent: colors.text, baseFill: subheadingFill, fontWeight: "700" })}
        </text>
      )}

      <SvgContent
        arrangement={slide.arrangement}
        components={slide.components}
        rect={{ x: COLUMN_X, y: columnY, w: COLUMN_W, h: columnH }}
        ctx={ctx}
      />

      {/* Right-hand whitespace gutter: nothing but the large muted page
          number lives here, anchored to the page's right content margin. */}
      <text
        x="1184"
        y="628"
        fontFamily={fonts.heading}
        fontSize="64"
        fill={colors.muted}
        opacity="0.3"
        textAnchor="end"
        dominantBaseline="alphabetic"
      >
        {pageLabel}
      </text>

      {footnote && (
        <text
          data-truncated={footnote.truncated ? "1" : undefined}
          x="96"
          y="652"
          fontFamily={fonts.body}
          fontSize={footnote.fontSize}
          fill={colors.muted}
          fontStyle="italic"
          dominantBaseline="alphabetic"
        >
          {footnote.text}
        </text>
      )}
    </>
  )
}
