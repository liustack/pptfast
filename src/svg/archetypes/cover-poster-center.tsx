// GF/svg/archetypes/cover-poster-center.tsx
import type { SvgTemplateProps } from "./types"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { CONF_LABEL } from "../../lib/conf-labels"

/**
 * poster-center cover archetype（spec §3.2）：全居中"海报"式封面——超大居中标题、
 * 短横条、斜体副标题、底部单行合并 meta。自 templates/creative.tsx 的
 * EditorialDarkCover 提炼，baked 常量全部换 ctx.colors（替换表见 P1 计划
 * Task 5）。纪律：本文件禁 theme id、禁颜色 hex 字面量。
 *
 * 与 Task 4（banner-title）的差异：creative 源文件里 Cover 的底部 meta 行用了
 * 一个比 MUTED 更深的次要灰（META_MUTED），在 token 表里没有对应项——两者若
 * 都映射到 ctx.colors.muted，会在 creative 主题下产生与旧模板不同的输出（旧
 * 模板两种灰各异，token 化后合一）。这是本任务裁决的语义收窄：META_MUTED 并
 * 入 muted，接受 creative 下观感等价而非逐字节一致（旧模板中两者只是同一
 * "次要文本"语义的两级深浅，不值得为其单开一个 token）。
 *
 * 映射订正（审查修复）：源文件的 RED 常量与 creative token 表的 `primary`
 * 逐字节相同，与 `accent`（暖棕，另一个不同的色值）不同——RED 实际语义是
 * "主强调色"而非"accent 语义位"，故短横条 fill 映射到 `ctx.colors.primary`
 * 而非 `ctx.colors.accent`，才能满足「creative tokens 下逐字节观感等价」的
 * 锚点（P1 计划替换表原写 RED→accent 系笔误）。
 *
 * 全黑全居中"海报"式主视觉：超大标题、短横条、斜体副标题、底部单行合并
 * meta——取代了旧版散落四角的元信息（原本还挤在 BrandChrome 的 logo 条带
 * x 64-160/1120-1216, y 48-88 内）。把每个元素都居中在 CENTER_X 上，能让
 * 其 x 延伸范围稳定落在 [190,1090]，无论 y 是多少都避开四个 logo 条带。
 */

/** Center-x of the 1280-wide canvas — every poster-mode element anchors here. */
const CENTER_X = 640

/** Short hairline under the title: the *only* decorative accent-weight
 * element on this page — a pure decoration, never a text color, per the
 * poster grammar. */
const ACCENT_BAR_W = 60
const ACCENT_BAR_H = 4

export function PosterCenterCover({ ir, slide, ctx }: SvgTemplateProps) {
  const org = ir.meta.organization
  const date = ir.meta.date
  const conf = ir.meta.confidentiality
  const confLabel = conf ? CONF_LABEL[conf] : null
  const author = ir.meta.authors?.[0]
  const authorText = author
    ? [author.name, author.role].filter(Boolean).join(" · ")
    : null
  const version = ir.meta.version

  const title = fitHeadingLines(slide.heading, {
    maxWidth: 1100,
    fontSize: 100,
    maxLines: 2,
    minPt: 52,
  })
  // Fixed first-line baseline regardless of 1 vs. 2 lines: at fontSize 100 a
  // 2-line title's first glyph top (baseline - ~0.75*fontSize ≈ 205) still
  // clears y=0 comfortably, and the accent bar below is positioned off the
  // *last* line so it never depends on this choice. This archetype only
  // covers Cover (no shared Content-page `TITLE_Y` in this file), so
  // `COVER_TITLE_Y` is simply this page's own baseline, not disambiguating
  // against a sibling constant the way the source module needed to.
  const COVER_TITLE_Y = 280
  const titleLastY = COVER_TITLE_Y + Math.max(0, title.lines.length - 1) * title.lineHeight

  // +56→+70（2026-07-10 导出审计：导出端字体回退行高更高，56 时字底压线）
  const accentY = titleLastY + 70

  const subtitle = layoutSvgText(slide.subheading || "", {
    maxWidth: 900,
    fontSize: 32,
    maxLines: 2,
    lineHeightRatio: 1.2,
  })
  const subtitleY = accentY + 64
  const subtitleLastY =
    subtitleY + Math.max(0, subtitle.lines.length - 1) * subtitle.lineHeight

  const metaParts = [org, confLabel, date, authorText, version].filter(
    (v): v is string => Boolean(v),
  )
  const metaLine =
    metaParts.length > 0
      ? fitSvgLine(metaParts.join("    ·    "), {
          maxWidth: 900,
          fontSize: 20,
          minFontSize: 14,
        })
      : null
  // Bottom meta line: fixed at 650 for the common case, pushed down only if a
  // long (2-line) title + 2-line subtitle combo would otherwise run into it.
  const metaY = Math.max(650, subtitleLastY + 56)

  return (
    <>
      {title.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={title.truncated && i === title.lines.length - 1 ? "1" : undefined}
          x={CENTER_X}
          y={COVER_TITLE_Y + i * title.lineHeight}
          textAnchor="middle"
          fontFamily={ctx.fonts.heading}
          fontSize={title.fontSize}
          fontWeight="800"
          fill={ctx.colors.text}
          letterSpacing="-1"
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      <rect
        x={CENTER_X - ACCENT_BAR_W / 2}
        y={accentY}
        width={ACCENT_BAR_W}
        height={ACCENT_BAR_H}
        rx="2"
        fill={ctx.colors.primary}
      />

      {subtitle.lines.map((line, i) => (
        <text
          key={i}
          x={CENTER_X}
          y={subtitleY + i * subtitle.lineHeight}
          textAnchor="middle"
          fontFamily={ctx.fonts.heading}
          fontSize={subtitle.fontSize}
          fill={ctx.colors.muted}
          fontStyle="italic"
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {metaLine && (
        <text
          data-truncated={metaLine.truncated ? "1" : undefined}
          x={CENTER_X}
          y={metaY}
          textAnchor="middle"
          fontFamily={ctx.fonts.body}
          fontSize={metaLine.fontSize}
          fill={ctx.colors.muted}
          letterSpacing="2"
          dominantBaseline="alphabetic"
        >
          {metaLine.text}
        </text>
      )}
    </>
  )
}
