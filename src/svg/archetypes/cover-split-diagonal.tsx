import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "../layouts/registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { CONF_LABEL } from "../../lib/conf-labels"
import { readableOn } from "../ink"

/**
 * split-diagonal cover archetype（P3 Item ①，spec §3.2）：左侧 primary 色块以
 * 斜切线收边，org 竖排压在色块上、标题在右侧净空区跨近斜切线。这是 P3「新
 * 表达一次全主题生效」的流程验收对象——纯新写（无源模板可提炼），从零按
 * archetype 纪律（零 theme id、零 baked 主题色 hex，颜色只来自 ctx）实现。
 *
 * 与 P1/P2 六个 cover archetype 的新问题：色块上的文字色不能像其余六个那样
 * 假设固定（它们的文字都画在页型默认底色上），色块用 ctx.colors.primary、
 * 而 primary 的明暗随主题/override 变（academic 深绿 → 浅字，tech 亮青 →
 * 深字）。故引入 `readableOn(primary)` 按相对明度自适应选前景色（W4 fix
 * round：提炼进 `../ink` 单一共享实现——`chapter-fashion-chapter.tsx`/
 * `ending-fashion-ending.tsx`/`cover-fashion-masthead.tsx` 与本文件同款
 * 消费，本文件不再是它唯一的物理归属地）。
 */

/** 斜切色块几何：顶宽 560、底宽 460（向下内收，形成右倾斜切线）。 */
const BLOCK_TOP_W = 560
const BLOCK_BOTTOM_W = 460
const BLOCK_PATH = `M 0,0 L ${BLOCK_TOP_W},0 L ${BLOCK_BOTTOM_W},720 L 0,720 Z`
/** 标题净空区左缘：躲开斜切线在标题基线高度的 x（约 500），留 96 边距。 */
const TITLE_X = 596
const TITLE_MAX_W = 1280 - TITLE_X - 96

export function SplitDiagonalCover({ ir, slide, ctx }: SvgTemplateProps) {
  const org = ir.meta.organization
  const date = ir.meta.date
  const conf = ir.meta.confidentiality
  const confLabel = conf ? CONF_LABEL[conf] : null
  const author = ir.meta.authors?.[0]
  const authorText = author ? [author.name, author.role].filter(Boolean).join(" · ") : null
  const version = ir.meta.version

  const onBlock = readableOn(ctx.colors.primary)

  const title = fitHeadingLines(slide.heading, {
    maxWidth: TITLE_MAX_W,
    fontSize: 76,
    maxLines: 3,
    minPt: 44,
    fontFamily: ctx.fonts.heading,
  })
  const TITLE_Y = 300
  const titleLastY = TITLE_Y + Math.max(0, title.lines.length - 1) * title.lineHeight

  const accentY = titleLastY + 40

  const subtitle = layoutSvgText(slide.subheading || "", {
    maxWidth: TITLE_MAX_W,
    fontSize: 26,
    maxLines: 2,
    lineHeightRatio: 1.25,
  })
  const subtitleY = accentY + 44

  const metaParts = [org, confLabel, date, authorText, version].filter(
    (v): v is string => Boolean(v),
  )
  const metaLine =
    metaParts.length > 0
      ? fitSvgLine(metaParts.join("    ·    "), {
          maxWidth: TITLE_MAX_W,
          fontSize: 19,
          minFontSize: 14,
        })
      : null

  return (
    <>
      {/* 斜切色块 */}
      <path d={BLOCK_PATH} fill={ctx.colors.primary} />

      {/* org 标签压在色块上（readableOn 自适应前景色） */}
      {org && (
        <text
          x={96}
          y={128}
          fontFamily={ctx.fonts.body}
          fontSize={22}
          fill={onBlock}
          fillOpacity={0.92}
          letterSpacing={2}
          dominantBaseline="alphabetic"
        >
          {org}
        </text>
      )}

      {/* 色块上的大留白装饰点（accent 强调，避 logo 带位置） */}
      <circle cx={96} cy={620} r={10} fill={onBlock} fillOpacity={0.92} />

      {/* 标题：右侧净空区，跨近斜切线，用页型默认文字色 */}
      {title.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={title.truncated && i === title.lines.length - 1 ? "1" : undefined}
          x={TITLE_X}
          y={TITLE_Y + i * title.lineHeight}
          fontFamily={ctx.fonts.heading}
          fontSize={title.fontSize}
          fontWeight="700"
          fill={ctx.colors.text}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* accent 短条 */}
      <rect x={TITLE_X} y={accentY} width={72} height={5} fill={ctx.colors.primary} />

      {/* 副题 */}
      {subtitle.lines.map((line, i) => (
        <text
          key={i}
          x={TITLE_X}
          y={subtitleY + i * subtitle.lineHeight}
          fontFamily={ctx.fonts.body}
          fontSize={subtitle.fontSize}
          fill={ctx.colors.muted}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* meta 行：右下 */}
      {metaLine && (
        <text
          data-truncated={metaLine.truncated ? "1" : undefined}
          x={TITLE_X}
          y={662}
          fontFamily={ctx.fonts.body}
          fontSize={metaLine.fontSize}
          fill={ctx.colors.muted}
          dominantBaseline="alphabetic"
        >
          {metaLine.text}
        </text>
      )}
    </>
  )
}

// T1d (src domain reorg wave 1): inlined verbatim from registry.ts's former
// COVER_LAYOUTS["split-diagonal"] entry. `CHROME` (registry.ts's private
// `readonly string[] = []` alias, "not fed by an authored component") is
// inlined here to the literal `[]` it always held, to avoid a value-import
// cycle with the registry aggregator (which value-imports this export) — see
// registry.ts's slot-`accepts` convention doc for what `[]` means.
export const layoutDef: LayoutDefinition = {
  // cover-split-diagonal.tsx: diagonal-cut primary block carries an org
  // kicker + decorative accent dot (decor); heading/rule/subheading/meta
  // sit in the right clear zone.
  id: "split-diagonal",
  kind: "archetype",
  slideTypes: ["cover"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "decor", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "rule", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "meta", accepts: [] },
  ],
}
