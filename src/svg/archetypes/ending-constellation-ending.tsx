// GF/svg/archetypes/ending-constellation-ending.tsx
import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "../layouts/registry"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"

/**
 * constellation-ending archetype（spec §3.2）：底部收束的大号"Thank you."式
 * 标题（末尾句号单独染 accent 色）+ 可选副题 + 短 accent 签名条 + 居中机构/联系
 * 方式/日期元信息，呼应 constellation cover/chapter 同一"星座科技"气质。自
 * templates/tech.tsx 的 `BentoTechEnding`（实测边界 1183-1339 行，brief 给的
 * 1183-1404 含了其后的 Decor 注释块，Step A 复核后收窄）提炼。
 *
 * 随迁 helper：`splitTrailingPeriod`（tech.tsx 1174-1180 行，私有复制，函数
 * 体本身与颜色无关，纯字符串处理，逐字符原样迁移，未改一处逻辑；defect C 修复
 * 时泛化为同时识别 ASCII "."，理由见函数自己的注释）——用于把结束标题末尾的
 * 句号拆出来单独渲染为 accent 色的 tspan。
 *
 * 星座/光晕模块常量随迁核查（同 cover-constellation.tsx 先例的检查项）：
 * Step A 对函数体逐行核查，`BentoTechEnding` **未引用**任何模块级私有常量
 * （`COVER_MOTIF_POINTS`/`COVER_MOTIF_HERO_POINT`/`BENTO_KPI_GLOW_RING*_OPACITY`
 * /`BENTO_CARD_STROKE_WIDTH`/`ENDING_MOTIF_POINTS` 等均属于 `BentoTechCover`
 * 或 `BentoTechDecor`，不属于本函数）——本函数体内没有星座点位/光晕环渲染，
 * 因此本任务无常量需要随迁，仅 `splitTrailingPeriod` 一项。
 *
 * 替换表（Step B，逐十六进制核实，对照 themes/tech.ts 的 colors）：
 * Step A 对函数区间（1174-1339 行）grep 未命中任何 `#XXXXXX` 字面量或 theme
 * id 字符串——源函数体已直接消费 `ctx.colors`/`ctx.fonts`
 * （`colors.text`/`colors.accent`/`colors.muted`），无烤死颜色常量，无孤儿
 * 色。**档位一・逐字节等价**。
 *
 * 副题兜底语义（同 W2-11 masthead-ending 的裁决，按当前源码实际行为原样迁
 * 移，不改语义）：源码是 `slide.subheading ? fitSvgLine(...) : null`——**没有
 * 兜底文案**，subheading 缺省时整块副题（包括其占位间距）直接不渲染，与
 * masthead-ending「heading 缺省才兜底副题文案」的语义不同，这里是纯粹的
 * "有就渲染、没有就不渲染"，无兜底分支。heading 本身有兜底："Thank you."
 * （`slide.heading || "Thank you."`，defect C 修复：原兜底文案"谢谢。"改为
 * 英文，公共渲染表面英文铁律）。测试覆盖有 heading（不触发 heading 兜底，
 * 因此不含分裂的句号 tspan 逻辑触发点也不同）与无 heading（触发"Thank you."
 * 兜底，句号被拆分渲染为 accent 色）两种 ir。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量。
 */

// Ported from templates/tech.tsx（1174-1180 行）— pure string helper, no
// color/theme dependency. Splits a trailing period off a line of text so the
// Ending heading's closing punctuation can render in accent color while the
// rest of the line stays `colors.text`. Generalized (defect C fix) to
// recognize the ASCII "." alongside the original CJK full stop "。" — the
// fallback heading text this feeds is now English ("Thank you."), and the
// accent-colored-trailing-punctuation signature detail must survive that
// translation instead of silently stopping at the CJK-only check.
function splitTrailingPeriod(line: string): {
  rest: string
  period: string | null
} {
  if (line.endsWith("。") || line.endsWith(".")) {
    return { rest: line.slice(0, -1), period: line.slice(-1) }
  }
  return { rest: line, period: null }
}

export function ConstellationEnding({ ir, slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx

  const HEADING_LAST_BASELINE = 330
  const heading = fitHeadingLines(slide.heading || "Thank you.", {
    maxWidth: 1088,
    fontSize: 88,
    maxLines: 2,
    minPt: 44,
    fontFamily: fonts.heading,
  })
  const headingY =
    HEADING_LAST_BASELINE -
    Math.max(0, heading.lines.length - 1) * heading.lineHeight
  const headingLastY = HEADING_LAST_BASELINE
  const lastLineIndex = heading.lines.length - 1

  const subheading = slide.subheading
    ? fitSvgLine(slide.subheading, {
        maxWidth: 1088,
        fontSize: 24,
        minFontSize: 16,
      })
    : null
  const subheadingY = headingLastY + 44

  const org = ir.meta.organization
  const contact = ir.meta.contact
  const contactText = contact
    ? [contact.name, contact.email].filter(Boolean).join(" · ")
    : null
  const date = ir.meta.date

  const metaLines: string[] = []
  if (org) metaLines.push(org)
  if (contactText) metaLines.push(contactText)
  if (metaLines.length === 0 && date) metaLines.push(date)

  const BAR_W = 60
  const BAR_H = 3
  const BAR_X = 640 - BAR_W / 2
  const BAR_Y = Math.max(
    420,
    headingLastY + 68,
    subheading ? subheadingY + 68 : 0
  )
  const META_GAP = 40
  const META_LINE_HEIGHT = 22
  const metaFirstBaselineY = BAR_Y + BAR_H + META_GAP

  return (
    <>
      {heading.lines.map((line, i) => {
        if (i !== lastLineIndex) {
          return (
            <text
              key={i}
              x="640"
              y={headingY + i * heading.lineHeight}
              fontFamily={fonts.heading}
              fontSize={heading.fontSize}
              fontWeight="700"
              fill={colors.text}
              textAnchor="middle"
              dominantBaseline="alphabetic"
            >
              {line}
            </text>
          )
        }
        // Signature detail: only the closing line's trailing "。" (if any)
        // splits into an accent-colored tspan.
        const { rest, period } = splitTrailingPeriod(line)
        return (
          <text
            key={i}
            data-truncated={heading.truncated ? "1" : undefined}
            x="640"
            y={headingY + i * heading.lineHeight}
            fontFamily={fonts.heading}
            fontSize={heading.fontSize}
            fontWeight="700"
            fill={colors.text}
            textAnchor="middle"
            dominantBaseline="alphabetic"
          >
            {rest}
            {period && <tspan fill={colors.accent}>{period}</tspan>}
          </text>
        )
      })}

      {subheading && (
        <text
          data-truncated={subheading.truncated ? "1" : undefined}
          x="640"
          y={subheadingY}
          fontFamily={fonts.body}
          fontSize={subheading.fontSize}
          fill={colors.muted}
          textAnchor="middle"
          dominantBaseline="alphabetic"
        >
          {subheading.text}
        </text>
      )}

      {/* Signature bar + meta text are omitted entirely (no orphaned bar,
          no empty card) when the deck carries no organization, contact, or
          date. */}
      {metaLines.length > 0 && (
        <>
          <rect
            x={BAR_X}
            y={BAR_Y}
            width={BAR_W}
            height={BAR_H}
            fill={colors.accent}
          />
          {metaLines.map((line, i) => (
            <text
              key={i}
              x="640"
              y={metaFirstBaselineY + i * META_LINE_HEIGHT}
              fontFamily={fonts.body}
              fontSize="13"
              fill={colors.muted}
              textAnchor="middle"
              dominantBaseline="alphabetic"
            >
              {line}
            </text>
          ))}
        </>
      )}
    </>
  )
}

// T1d (src domain reorg wave 1): inlined verbatim from registry.ts's former
// ENDING_LAYOUTS["constellation-ending"] entry. `CHROME` (registry.ts's
// private `readonly string[] = []` alias, "not fed by an authored
// component") is inlined here to the literal `[]` it always held, to avoid a
// value-import cycle with the registry aggregator (which value-imports this
// export) — see registry.ts's slot-`accepts` convention doc for what `[]`
// means.
export const layoutDef: LayoutDefinition = {
  // ending-constellation-ending.tsx: centered "Thank you." heading (accent
  // trailing period), subheading, signature accent rule bar, stacked
  // org/contact/date meta lines.
  id: "constellation-ending",
  kind: "archetype",
  slideTypes: ["ending"],
  slots: [
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "rule", accepts: [] },
    { name: "meta", accepts: [] },
  ],
}
