// GF/svg/archetypes/content-stacked-poster.tsx
import type { Block } from "@/ir"
import type { SvgTemplateProps } from "./types"
import type { ContentRect } from "../layout"
import type { BlockCtx } from "../blocks/types"
import { SvgContent } from "../SvgContent"
import { measureBlock, renderBlock } from "../blocks"
import { chapterNumberFor, sectionNameFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { fitEmphasisLine, renderEmphasisTspans } from "../emphasis"

/**
 * stacked-poster content archetype（spec §3.2，Wave 3 Task 20）：creative
 * 主题 content 页型的"换骨"语法——不是「kicker + 标题 + 分隔线 +
 * 满宽内容」，而是全居中"海报"：共享的居中 kicker（88 行小号 muted 章节标签 +
 * 104 行 accent 短横条）+ 800-weight 居中大标题，随 block 数分三档：
 *   - 1 块：单个居中"主视觉" rect（x=190 w=900），从标题一路延伸到 y=640。
 *   - 2 块：同一主视觉 rect 在 y=520 让位，hairline 分隔线，第二块进
 *     "标注条" rect（x=190 w=900，y=532→640）。
 *   - ≥3 块 / 0 块 / 主视觉或标注条放不下的块：整页降级为该主题*原始*的
 *     左对齐 kicker/标题 + 满宽 SvgContent 堆叠构图，逐字节原样保留（见
 *     `renderStackedContent`）。
 * 自 templates/creative.tsx 的 `EditorialDarkContent`（522-694 行，Step A
 * 用 `grep -n` 实测边界——比 brief 给出的 522-696 短，695 行为空行，696 行
 * 起是紧随其后的 Ending 页型模块注释，不属于本函数体）提炼，随迁其消费的
 * 三个私有 helper：
 *   - `renderPosterSlot`（347-365 行）：把单个 block 渲染进一个海报"槽位"
 *     （主视觉或标注条），chart/image 类走 bento 同款的等比缩放到填满槽位
 *     （额外允许放大，封顶 1.3x），其余类型走 `SvgContent`。
 *   - `blockFitsSlot`（374-377 行）：判断某个 block 是否能不溢出地放进给定
 *     槽位——可缩放类型恒真，其余类型比较其在槽位宽度下的自然高度与槽位
 *     高度。
 *   - `renderStackedContent`（383-520 行）：Step A 复核确认本函数（≥3 块等
 *     降级路径 `if (!fits) return renderStackedContent(props)`）确实调用
 *     它，随迁为本文件私有函数，逐字节保留其构图（含它自己消费的
 *     RED/FG/BORDER/META_MUTED 烤死常量，一并按下方替换表映射）。
 *   - `AccentBar`（49-60 行）：Step A 复核确认 `EditorialDarkContent` 的海报
 *     路径调用了它（源 627 行 `<AccentBar y={ACCENT_Y} />`）——内联为一个裸
 *     `<rect>` 字面量（同 cover-poster-center.tsx / ending-poster-ending.tsx
 *     对同一 helper 的处理方式，不额外包一层组件函数）。`renderStackedContent`
 *     降级路径不调用 `AccentBar`，故降级路径没有短横条装饰。
 *
 * 替换表（Step B，逐十六进制核对 GF/themes/creative.ts 的 `colors`，
 * 十六进制值本身不抄进本注释——避免污染本文件的 grep 清零门，同
 * chapter-poster-chapter.tsx / ending-poster-ending.tsx 先例）：
 *   RED → ctx.colors.primary（逐字节精确匹配——**不是** `accent`，`accent`
 *   是另一个完全不同的暖棕色值，沿用 P1 cover-poster-center.tsx 已订正的
 *   映射结论，不重犯"RED→accent"的误判）。本函数区间内 RED 只有两个消费点：
 *   `renderStackedContent` 的顶部 section label、`AccentBar`（海报路径的
 *   accent 短横条）。
 *   FG → ctx.colors.text（逐字节精确匹配，两条路径的标题都消费它）。
 *   MUTED → ctx.colors.muted（逐字节精确匹配，仅海报路径的居中 kicker
 *   消费它——`renderStackedContent` 降级路径不消费 MUTED）。
 *   BORDER → ctx.colors.border（逐字节精确匹配，creative token 表本身有
 *   `border` 字段，无需 `?? muted` 兜底，同 chapter-poster-chapter.tsx /
 *   ending-poster-ending.tsx 先例——两条路径各有一条分隔线消费它）。
 *   函数体内已直接消费 `ctx.colors.accent`/`ctx.colors.text`（subheading
 *   强调段落，两条路径都有），本就是 token 而非烤死常量，原样保留不进
 *   替换表。
 *
 * 孤儿色处理（**档位二・观感等价**，唯一孤儿色，沿用 P1
 * cover-poster-center.tsx / ending-poster-ending.tsx 已核实过的同一结论）：
 * `META_MUTED` 在 creative token 表里没有精确匹配（既不等于 `muted` 也不
 * 等于任何其它字段），语义上与 `MUTED` 是同一"次要文本"角色的两级深浅，
 * 不是对比性装饰色——并入 `ctx.colors.muted`。该函数区间内 `META_MUTED`
 * 有两个消费点（海报路径与降级路径各自的 footnote），均随之改为
 * `ctx.colors.muted`，接受 creative 下观感等价而非逐字节一致。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量。
 */

/** Center-x of the 1280-wide canvas — every poster-mode element anchors here. */
const CENTER_X = 640

/** Accent short hairline (AccentBar helper inlined): the *only* place accent
 * primary red is used outside the degrade path's section label — a pure
 * decoration, never a text color, per the poster grammar. */
const ACCENT_BAR_W = 60
const ACCENT_BAR_H = 4

const SECTION_LABEL_Y = 88
const ACCENT_Y = 104
const TITLE_Y = 184
const HERO_X = 190
const HERO_W = 900
const HERO_TITLE_GAP = 48
// Full-budget poster bottom edge (1-block hero rect's floor, and 2-block
// caption strip's floor) — every value below that used to be a bare `640`
// keys off this single constant, so the footnote shrink (see `posterBottom`
// below) only has one spot to touch.
const POSTER_BOTTOM_BASE = 640
// When `slide.footnote` is set, the poster/strip floor pulls up by this much
// so the footnote (rendered at y=656, per the old stacked path's 420-vs-460
// contentH precedent) gets clear room instead of the full-budget block
// running straight into it.
const POSTER_BOTTOM_FOOTNOTE_SHRINK = 40
const HERO_BOTTOM_HALF = 520 // 2-block: hero gives up the bottom 120px
const STRIP_DIVIDER_Y = 520
const STRIP_Y = 532

// Subheading: a 22px accent "so-what" sentence below the title, on both the
// poster and degrade paths. Occupies a slot (22px line + gap) added to
// whichever y a path's content region already derives *only* when
// `slide.subheading` is set, so a slide without one gets byte-identical
// geometry to before this feature existed. The two paths' `subheadingY`
// baselines don't move by the same amount, so they don't share one slot
// constant — `SUBHEADING_SLOT` is the poster path's own slot,
// `SUBHEADING_SLOT_STACKED` is the degrade path's.
const SUBHEADING_FONT_SIZE = 22
const SUBHEADING_MIN_FONT_SIZE = 16
const SUBHEADING_SLOT = 34
const SUBHEADING_SLOT_STACKED = 46

// Block types whose content is a rendered graphic (chart/image) rather than
// reflowable text — safe to uniformly scale to *fill* a poster slot (both
// enlarging and shrinking), unlike text blocks which can't scale without
// becoming illegible. Poster mode additionally allows scaling *up* (bento
// only ever shrinks) since the hero is meant to read as a dominant image,
// capped at 1.3x so it stays close to the page's usual safe margin.
const SCALABLE_TYPES = new Set(["chart", "image"])
const HERO_SCALE_MAX = 1.3

/**
 * Render a single block into `rect` as one poster "slot" (hero or caption
 * strip). Scalable blocks (chart/image) get bento's uniform-scale-to-fit
 * technique, generalized to also scale *up* to HERO_SCALE_MAX so the slot is
 * always filled; everything else goes through `SvgContent`, which already
 * vertically centers a lone block — so every slot gets exactly one
 * `data-audit-rect` wrapper either way.
 */
function renderPosterSlot(block: Block, rect: ContentRect, ctx: BlockCtx) {
  if (!SCALABLE_TYPES.has(block.type)) {
    return <SvgContent variant="single" blocks={[block]} rect={rect} ctx={ctx} />
  }
  const auditRect = `${rect.x},${rect.y},${rect.w},${rect.h}`
  const measured = measureBlock(block, rect.w, ctx)
  const scale = measured > 0 ? Math.min(rect.h / measured, HERO_SCALE_MAX) : 1
  const scaledW = rect.w * scale
  const offsetX = rect.x + (rect.w - scaledW) / 2
  return (
    <g data-audit-rect={auditRect}>
      <g data-audit-box={`${offsetX},${rect.y},${scaledW}`}>
        <g transform={`translate(${offsetX},${rect.y}) scale(${scale})`}>
          {renderBlock(block, { x: 0, y: 0, w: rect.w }, ctx)}
        </g>
      </g>
    </g>
  )
}

/** Whether `block` will fit `rect` without overflowing. Scalable types always
 * "fit" (they scale to the slot by construction); everything else needs its
 * natural height, at the slot's width, to stay within budget. */
function blockFitsSlot(block: Block, rect: ContentRect, ctx: BlockCtx): boolean {
  if (SCALABLE_TYPES.has(block.type)) return true
  return measureBlock(block, rect.w, ctx) <= rect.h
}

/** The original (pre-poster) left-aligned content construction — the
 * degrade path (>=3 blocks, no blocks, or a hero/strip block too tall for its
 * slot), kept byte-identical (modulo the token replacement table above) so
 * its geometry is unaffected by this theme's grammar change. */
function renderStackedContent({ ir, slide, index, ctx }: SvgTemplateProps) {
  const section = sectionNameFor(ir.slides, index)
  const chNum = chapterNumberFor(ir.slides, index)
  const rawSectionLabel = section
    ? `章节 ${String(chNum).padStart(2, "0")} · ${section}`
    : null
  const sectionLabel = rawSectionLabel
    ? fitSvgLine(rawSectionLabel, {
        maxWidth: 1168,
        fontSize: 20,
        minFontSize: 12,
        letterSpacing: 4,
      })
    : null
  const contentH = slide.footnote ? 420 : 460

  const heading = fitHeadingLines(slide.heading, {
    maxWidth: 1168,
    fontSize: 50,
    maxLines: 2,
    minPt: 26,
  })
  const headingExtra = Math.max(0, heading.lines.length - 1) * heading.lineHeight
  const headingLastY = 150 + headingExtra

  const subheading = fitEmphasisLine(slide.subheading, {
    maxWidth: 1168,
    fontSize: SUBHEADING_FONT_SIZE,
    minFontSize: SUBHEADING_MIN_FONT_SIZE,
  })
  const subheadingY = headingLastY + 50
  const subheadingBudget = subheading ? SUBHEADING_SLOT_STACKED : 0

  const contentRectY = 180 + headingExtra + subheadingBudget
  const contentRectH = Math.max(120, contentH - headingExtra - subheadingBudget)

  return (
    <>
      {/* Top section label */}
      {sectionLabel && (
        <text
          x="56"
          y="56"
          fontFamily={ctx.fonts.body}
          fontSize={sectionLabel.fontSize}
          fontWeight="600"
          fill={ctx.colors.primary}
          letterSpacing="4"
          dominantBaseline="alphabetic"
        >
          {sectionLabel.text}
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

      {/* Heading */}
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x="56"
          y={150 + i * heading.lineHeight}
          fontFamily={ctx.fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="500"
          fill={ctx.colors.text}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* Subheading: accent so-what sentence below the heading */}
      {subheading && (
        <text
          x="56"
          y={subheadingY}
          fontFamily={ctx.fonts.heading}
          fontSize={subheading.fontSize}
          fill={ctx.colors.accent}
          dominantBaseline="alphabetic"
        >
          {renderEmphasisTspans(subheading.segments, { accent: ctx.colors.text, baseFill: ctx.colors.accent, fontWeight: "700" })}
        </text>
      )}

      {/* Content blocks (was a foreignObject) */}
      <SvgContent
        variant={slide.variant}
        blocks={slide.blocks}
        rect={{ x: 56, y: contentRectY, w: 1168, h: contentRectH }}
        ctx={ctx}
      />

      {/* Footnote */}
      {slide.footnote && (
        <text
          x="56"
          y="688"
          fontFamily={ctx.fonts.body}
          fontSize="20"
          fill={ctx.colors.muted}
          letterSpacing="4"
          fontStyle="italic"
          dominantBaseline="alphabetic"
        >
          {slide.footnote}
        </text>
      )}
    </>
  )
}

export function StackedPosterContent(props: SvgTemplateProps) {
  const { ir, slide, index, ctx } = props

  const heading = fitHeadingLines(slide.heading, {
    maxWidth: 1000,
    fontSize: 64,
    maxLines: 2,
    minPt: 36,
  })
  const titleLastY = TITLE_Y + Math.max(0, heading.lines.length - 1) * heading.lineHeight

  const subheading = fitEmphasisLine(slide.subheading, {
    maxWidth: 1000,
    fontSize: SUBHEADING_FONT_SIZE,
    minFontSize: SUBHEADING_MIN_FONT_SIZE,
  })
  const subheadingY = titleLastY + 46
  const heroY = titleLastY + HERO_TITLE_GAP + (subheading ? SUBHEADING_SLOT : 0)
  const isPair = slide.blocks.length === 2
  // Mirrors the stacked degrade path's `contentH = footnote ? 420 : 460`:
  // shrink the poster's full-budget floor when a footnote is present so it
  // doesn't run straight into the footnote rendered at y=656.
  const posterBottom = slide.footnote
    ? POSTER_BOTTOM_BASE - POSTER_BOTTOM_FOOTNOTE_SHRINK
    : POSTER_BOTTOM_BASE
  const heroBottom = isPair ? HERO_BOTTOM_HALF : posterBottom
  const heroRect: ContentRect = {
    x: HERO_X,
    y: heroY,
    w: HERO_W,
    h: Math.max(0, heroBottom - heroY),
  }
  const stripRect: ContentRect = {
    x: HERO_X,
    y: STRIP_Y,
    w: HERO_W,
    h: Math.max(0, posterBottom - STRIP_Y),
  }

  // Poster grammar only ever applies to exactly 1 or 2 blocks that actually
  // fit their hero/strip slot — >=3 blocks, 0 blocks, or a slot-busting block
  // (e.g. a many-item bullets list too tall for the 108px caption strip) all
  // fall back to the original full-width stack, which has its own, much more
  // generous, content rect.
  const fits =
    slide.blocks.length > 0 &&
    slide.blocks.length <= 2 &&
    blockFitsSlot(slide.blocks[0], heroRect, ctx) &&
    (!isPair || blockFitsSlot(slide.blocks[1], stripRect, ctx))
  if (!fits) return renderStackedContent(props)

  const section = sectionNameFor(ir.slides, index)
  const chNum = chapterNumberFor(ir.slides, index)
  const rawSectionLabel = section
    ? `章节 ${String(chNum).padStart(2, "0")} · ${section}`
    : null
  const sectionLabel = rawSectionLabel
    ? fitSvgLine(rawSectionLabel, {
        maxWidth: 900,
        fontSize: 16,
        minFontSize: 11,
        letterSpacing: 3,
      })
    : null

  const footnote = slide.footnote
    ? fitSvgLine(slide.footnote, { maxWidth: 1000, fontSize: 20, minFontSize: 14 })
    : null

  return (
    <>
      {/* Kicker: small centered section label (no accent color — see below) */}
      {sectionLabel && (
        <text
          x={CENTER_X}
          y={SECTION_LABEL_Y}
          textAnchor="middle"
          fontFamily={ctx.fonts.body}
          fontSize={sectionLabel.fontSize}
          fill={ctx.colors.muted}
          letterSpacing="3"
          dominantBaseline="alphabetic"
        >
          {sectionLabel.text}
        </text>
      )}

      {/* Kicker: accent hairline (AccentBar helper inlined) — pure
          decoration, replaces the old text kicker's accent color entirely
          (accent red is used nowhere else on this poster path). */}
      <rect
        x={CENTER_X - ACCENT_BAR_W / 2}
        y={ACCENT_Y}
        width={ACCENT_BAR_W}
        height={ACCENT_BAR_H}
        rx="2"
        fill={ctx.colors.primary}
      />

      {/* Centered 800-weight title */}
      {heading.lines.map((line, i) => (
        <text
          key={i}
          x={CENTER_X}
          y={TITLE_Y + i * heading.lineHeight}
          textAnchor="middle"
          fontFamily={ctx.fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="800"
          fill={ctx.colors.text}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* Subheading: centered accent so-what sentence below the title */}
      {subheading && (
        <text
          x={CENTER_X}
          y={subheadingY}
          textAnchor="middle"
          fontFamily={ctx.fonts.heading}
          fontSize={subheading.fontSize}
          fill={ctx.colors.accent}
          dominantBaseline="alphabetic"
        >
          {renderEmphasisTspans(subheading.segments, { accent: ctx.colors.text, baseFill: ctx.colors.accent, fontWeight: "700" })}
        </text>
      )}

      {/* Hero slot */}
      {renderPosterSlot(slide.blocks[0], heroRect, ctx)}

      {isPair && (
        <>
          <line
            x1={HERO_X}
            y1={STRIP_DIVIDER_Y}
            x2={HERO_X + HERO_W}
            y2={STRIP_DIVIDER_Y}
            stroke={ctx.colors.border}
            strokeWidth="1.4"
          />
          {renderPosterSlot(slide.blocks[1], stripRect, ctx)}
        </>
      )}

      {footnote && (
        <text
          x={CENTER_X}
          y="656"
          textAnchor="middle"
          fontFamily={ctx.fonts.body}
          fontSize={footnote.fontSize}
          fill={ctx.colors.muted}
          fontStyle="italic"
          dominantBaseline="alphabetic"
        >
          {footnote.text}
        </text>
      )}
    </>
  )
}
