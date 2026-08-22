import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import type { ContentRect } from "../layout"
import { SvgContent } from "../svg-content"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { footnoteBaselineFor } from "../chrome-geometry"

/**
 * quote-stage content layout（quote-stage 波，Task T2 ——
 * `.issues/2026-07-28-quote-stage/plan.md` 裁定 3）：pptfast 第一个
 * `pinOnly` 版式（`registry.ts` 的 `LayoutDefinition.pinOnly`，T1 落地的机制）
 * ——只能被模型显式钉住（`slide.layout: "quote-stage"`），永不进入任何主题
 * 的自动选型池。
 *
 * 语义：整页就是一句「金句」——heading 是页面唯一的超大主视觉（复用
 * `fitHeadingLines`，同 stacked-poster（居中 800-weight 大标题）/
 * fashion-masthead（超大报头）的大字排印先例，未发明新的拟合机制）。body
 * 容量 1：至多一个短组件，渲染为标题下方的小字附注位（引文出处/一句补充），
 * 不是常规 content layout 里"承重"的正文区；0 组件同样合法（纯金句）。
 * subheading 若存在同样降格为附注（`colors.muted` 小字，不是其它
 * layout 里 accent 强调的"so-what"句）——因此本文件不需要
 * `accessibleInk`：`colors.text`/`colors.muted` 两个 token 在全部内置主题
 * 上已经过既有 `colors.muted contrast` 回归网校验，直接消费即可，不必再包
 * 一层自适应 ink。没有 kicker、没有 rule、没有 watermark——留白与超大标题就
 * 是整个构图，故意不像其它 content layout 那样带章节标签（"金句"页应是
 * 不被打断的单一论断）。
 *
 * 容量超限（>1 组件）与金句超长（缩到 minPt 仍放不下）都不是本文件的职责——
 * 前者是 `ir-quality.ts` 的 `pin_only_over_capacity` 硬错误（裁定 2，pinOnly
 * 专属，普通钉住版式维持今天的 density warn 不变），后者是
 * `pinned_heading_overflow` 硬错误（同文件，T2 fix round 起改为读本文件
 * `layoutDef.headingFit` 这份声明式元数据，不再钉死 `slide.layout ===
 * "quote-stage"` 这一支具体分支；T3 收尾把错误码本身也从
 * `quote_stage_heading_overflow` 改名为 `pinned_heading_overflow`，跟检查早已
 * metadata-driven 的事实对齐——见 `LayoutDefinition.headingFit` 自己的注释,
 * registry.ts）。本文件自己只管渲染：
 * `fitHeadingLines` 的 graceful truncate + `data-truncated="1"` 标记（既有
 * 机制，同每个 layout 的 heading 处理）是渲染层最后一道防线，不是把关口
 * ——真正的把关在 validate。
 *
 * 纪律：本文件禁 theme id、禁颜色 hex 字面量，颜色全部来自 ctx.colors。
 */

const CENTER_X = 640

// Quote-page anchor: a short centered accent hairline above the heading —
// the page's only decoration, same idiom as stacked-poster/fashion-masthead's
// own accent bars (a short primary-filled rect, never a text color).
// ACCENT_BAR_Y sits a full 160px above TITLE_Y's baseline (not just a
// nominal gap): a real render at layoutDef.headingFit.fontSize found CJK
// glyphs with a tall upper element (e.g. "终") reach noticeably above the generic
// ascender estimate, close enough to a tighter gap to visibly clip through
// the bar — this value is empirically verified clear (`.e2e-out/quote-stage`
// human-check renders, quote-stage wave task T2), not just calculated.
const ACCENT_BAR_Y = 140
const ACCENT_BAR_W = 56
const ACCENT_BAR_H = 4

const TITLE_Y = 300 // first-line baseline anchor
const HEADING_LINE_HEIGHT_RATIO = 1.25

const ANNOTATION_GAP = 64 // heading's last line -> subheading annotation
const CITATION_AIR = 36 // last heading ink -> citation box
const BODY_RECT_W = 760
const BODY_RECT_H = 80
const LATIN_DESCENT_RATIO = 0.22
const CITATION_BOTTOM_LIMIT = 608
const HEADING_BAR_AIR = 24

// Above the brand chrome's footer divider (`brand-chrome.tsx`, y=664), not
// below it. At the previous 676 this baseline put the footnote's ascenders
// straight through that rule and into the footer's own text row — the
// visual review caught it in Chinese and mixed-script, where the taller ink
// made the collision unmistakable. The baseline now comes from
// `footnoteBaselineFor`, which states that clearance as a gap from the rule
// rather than as a coordinate: this layout's 16px footnote used to keep
// only 12.25px of it, the smallest gap on the page by a wide margin.

export function QuoteStageContent({ slide, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx

  // `headingFit` lives on `layoutDef` (below) — the single source both this
  // call and `ir-quality.ts`'s `pinned_heading_overflow` hard-error
  // check read (that module reads it generically off `getLayout(slide
  // .layout)?.headingFit`, no cross-import of this render-chain file — see
  // `LayoutDefinition.headingFit`'s own doc comment, registry.ts). Only
  // `fontFamily` is supplied here rather than on the shared object: it comes
  // from this layout's render `ctx`, which the validate-side check has no
  // access to (and deliberately doesn't need — see that check's own comment).
  const minPt = layoutDef.headingFit.minPt ?? 36
  const fitOpts = {
    ...layoutDef.headingFit,
    lineHeightRatio: HEADING_LINE_HEIGHT_RATIO,
    fontFamily: fonts.heading,
    typeScale: ctx.shape?.typeScale,
  }
  let heading = fitHeadingLines(slide.heading, fitOpts)
  const hasBody = slide.components.length > 0
  const lastInkBottom = (h: typeof heading) => {
    const lastY = TITLE_Y + Math.max(0, h.lines.length - 1) * h.lineHeight
    return lastY + h.fontSize * LATIN_DESCENT_RATIO
  }
  const headingFits = (h: typeof heading) => {
    const emTop = TITLE_Y - h.fontSize * 0.88
    if (emTop < ACCENT_BAR_Y + ACCENT_BAR_H + HEADING_BAR_AIR) return false
    if (!hasBody) return lastInkBottom(h) <= 640
    return lastInkBottom(h) + CITATION_AIR + BODY_RECT_H <= CITATION_BOTTOM_LIMIT
  }
  let fontSize = heading.fontSize
  let maxLines = layoutDef.headingFit.maxLines ?? 4
  while (!headingFits(heading) && (fontSize > minPt || maxLines > 1)) {
    if (fontSize > minPt) fontSize = Math.max(minPt, fontSize - 4)
    else maxLines -= 1
    heading = fitHeadingLines(slide.heading, { ...fitOpts, fontSize, maxLines, minPt })
  }
  const titleLastY = TITLE_Y + Math.max(0, heading.lines.length - 1) * heading.lineHeight

  // Subheading, when present, is an annotation (small, muted) — not the
  // accent "so-what" line every other content layout gives it. Plain
  // `fitSvgLine` (not `fitEmphasisLine`/`renderEmphasisTspans`), matching
  // every other layout's *footnote*-tier single-line text rather than
  // its subheading tier: quote-stage's heading already carries the page's
  // entire emphasis, a second emphasized line would compete with it.
  const subheading = slide.subheading
    ? fitSvgLine(slide.subheading, { maxWidth: 860, fontSize: 20, minFontSize: 14 })
    : null
  const subheadingY = titleLastY + ANNOTATION_GAP

  const citationTop = lastInkBottom(heading) + CITATION_AIR
  const bodyY = Math.min(
    subheading ? subheadingY + 24 : citationTop,
    CITATION_BOTTOM_LIMIT - BODY_RECT_H,
  )
  const bodyRect: ContentRect = {
    x: CENTER_X - BODY_RECT_W / 2,
    y: bodyY,
    w: BODY_RECT_W,
    h: BODY_RECT_H,
  }

  const footnote = slide.footnote
    ? fitSvgLine(slide.footnote, { maxWidth: 900, fontSize: 16, minFontSize: 12 })
    : null

  return (
    <>
      <rect
        x={CENTER_X - ACCENT_BAR_W / 2}
        y={ACCENT_BAR_Y}
        width={ACCENT_BAR_W}
        height={ACCENT_BAR_H}
        rx={2}
        fill={colors.primary}
      />

      {/* Heading: the page's entire main visual — oversized, centered. */}
      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x={CENTER_X}
          y={TITLE_Y + i * heading.lineHeight}
          textAnchor="middle"
          fontFamily={fonts.heading}
          fontSize={heading.fontSize}
          fontWeight="800"
          fill={colors.text}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {/* Subheading annotation: small, muted, centered — never accent. */}
      {subheading && (
        <text
          data-truncated={subheading.truncated ? "1" : undefined}
          x={CENTER_X}
          y={subheadingY}
          textAnchor="middle"
          fontFamily={fonts.body}
          fontSize={subheading.fontSize}
          fill={colors.muted}
          dominantBaseline="alphabetic"
        >
          {subheading.text}
        </text>
      )}

      {/* Body: capacity-1 attribution/footnote-style annotation slot — legal
          empty (a pure quote needs no attribution). `arrangement` is always
          "single" here (`layoutDef.arrangements` below declares only that
          one) — with capacity 1 there's never more than one component for
          any other arrangement value to meaningfully split. */}
      <SvgContent arrangement="single" components={slide.components} rect={bodyRect} ctx={ctx} />

      {footnote && (
        <text
          data-truncated={footnote.truncated ? "1" : undefined}
          x={CENTER_X}
          y={footnoteBaselineFor(footnote.fontSize)}
          textAnchor="middle"
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

// `satisfies` (not a `: LayoutDefinition` annotation) deliberately keeps
// `headingFit`'s literal type non-optional here, so `QuoteStageContent`
// above can read `layoutDef.headingFit` directly without a `| undefined`
// fighting `fitHeadingLines`'s required `maxWidth`/`fontSize` params — while
// still structurally checking against `LayoutDefinition` (every consumer
// elsewhere, e.g. `registry.ts`'s `Record<string, LayoutDefinition>`, still
// sees the field as optional, correctly, since most layouts omit it).
export const layoutDef = {
  // content-quote-stage.tsx: pptfast's first pinOnly layout (quote-stage
  // wave, T1's mechanism + T2's first member) — heading as the page's
  // oversized centered main visual, capacity-1 body slot rendered as a
  // small attribution annotation below it, subheading (if present) also
  // demoted to annotation tier. No kicker, no rule, no watermark — the
  // whitespace and the oversized heading are the whole composition.
  id: "quote-stage",
  kind: "archetype",
  pinOnly: true,
  slideTypes: ["content"],
  slots: [
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "body", accepts: "any", capacity: 1 },
    { name: "meta", accepts: [] },
  ],
  arrangements: ["single"],
  // Heading-overflow hard-error params (T2 fix round — see
  // `LayoutDefinition.headingFit`'s own doc comment, registry.ts, for the
  // full rationale): `ir-quality.ts` reads this generically off
  // `getLayout(slide.layout)?.headingFit`, and `QuoteStageContent` above
  // reads the exact same object for its own `fitHeadingLines` call — one
  // declared source, not two hand-mirrored copies.
  headingFit: {
    maxWidth: 1000,
    fontSize: 92,
    maxLines: 4,
    minPt: 36,
    lineHeightRatio: HEADING_LINE_HEIGHT_RATIO,
  },
} satisfies LayoutDefinition
