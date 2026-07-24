import type { SvgTemplateProps } from "./types"
import type { ContentRect } from "../layout"
import { SvgContent } from "../svg-content"
import { sectionNameFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { fitEmphasisLine, renderEmphasisTspans } from "../emphasis"
import { accessibleInk } from "../ink"

/**
 * asymmetric-triptych content archetype (P1 variety wave, task 4 — content-
 * pool expansion, new archetype 2 of 3): a three-region body grammar, never
 * a two-region even split — a wide LEAD column carries the first component
 * (a hero item), and a narrower RIGHT column is itself split top/bottom
 * into two framed secondary panels.
 *
 * Composition sketch (geometry, written before this file per the task
 * contract): heading chrome spans the usual full 1088px content width
 * (x=96..1184, matching `bento-panel`/`two-column`'s own convention of a
 * full-width header sitting above a split body). Below it: LEAD region
 * x=96, w=632 (58%); a persistent vertical divider hairline at the gap's
 * midpoint (x=744); RIGHT region x=760, w=424 (39% — deliberately equal to
 * `two-column`'s own worst-case half-width at the pool's narrowest 880px
 * single-stack basis, `(880-32)/2=424` — this archetype introduces no
 * width narrower than `audit/capacity.ts` already accounts for). RIGHT
 * splits vertically into a TOP and a BOTTOM sub-panel (a persistent
 * horizontal divider between them), each framed by a thin outline rect
 * drawn unconditionally — the frame exists whether or not a component
 * lands inside it.
 *
 * Component placement: `components[0]` (if any) goes to LEAD alone — a
 * single hero item at the widest column, the same "one dominant subject"
 * instinct `stacked-poster`'s capacity-1 `hero` slot already encodes, just
 * without that archetype's scale-to-fill behavior. The remainder splits
 * across TOP (first half) then BOTTOM (second half). Each region is an
 * independent `SvgContent` call with `arrangement` hardcoded to the
 * default single-stack (never `slide.arrangement` — this archetype's
 * three-region split *is* its own arrangement, the same hardcode
 * `bento-panel`/`two-column` already use for their own bespoke grammars),
 * so `layoutContentFit`'s existing gap-tier/drop safety net applies to
 * each region independently.
 *
 * Why this clears the T1 handoff's hard requirement (dense-capable
 * archetypes must be visibly different from `two-column`/`rail-numbered`
 * on a *single-component* page): the LEAD/RIGHT divider and the TOP/BOTTOM
 * frame are drawn unconditionally, not derived from `slide.components`.
 * `two-column` collapses to one full-width column below 2 components (its
 * own file comment); `rail-numbered`'s only persistent mark is a 4px rail
 * at the page's far-left edge, the content region itself staying a single
 * full-width block. A 1-component asymmetric-triptych page still shows
 * three visibly bounded regions — a genuinely different silhouette, not
 * just a narrower single column.
 *
 * Assigned `instructional` (procedural, step-by-step-breakdown strategy —
 * "one lead topic + a secondary breakdown split into two framed panels"
 * reads like a main step with sub-steps, the same "分步拆解" character
 * `rail-numbered`/`two-column` already carry for this strategy) and beat
 * `dense` (three independently-filled regions is this pool's highest
 * *structural* item count after `bento-panel`'s 6-cell grid, and unlike
 * `two-column`/`rail-numbered` its density signal survives visibly even
 * with only 1 component present — see the previous paragraph, and the T1
 * handoff note this addresses directly).
 *
 * Discipline: no theme id, no hex literal — every color is a token or an
 * `../ink` call.
 */

const HEADING_MAX_W = 1088
const HEADING_BASELINE = 150
const KICKER_Y = 96

const SUBHEADING_FONT_SIZE = 22
const SUBHEADING_MIN_FONT_SIZE = 16
const SUBHEADING_SLOT = 46

const LEAD_X = 96
const LEAD_W = 632
const COL_GAP = 32
const RIGHT_X = LEAD_X + LEAD_W + COL_GAP // 760
const RIGHT_W = 1184 - RIGHT_X // 424
const DIVIDER_X = LEAD_X + LEAD_W + COL_GAP / 2 // 744

const ROW_GAP = 24
const PANEL_RADIUS = 6

export function AsymmetricTriptychContent({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const section = sectionNameFor(ir.slides, index)
  const kicker = section
    ? fitSvgLine(section, { maxWidth: HEADING_MAX_W, fontSize: 12, minFontSize: 9, letterSpacing: 4 })
    : null

  const heading = fitHeadingLines(slide.heading, {
    maxWidth: HEADING_MAX_W,
    fontSize: 42,
    maxLines: 2,
    minPt: 26,
    fontFamily: fonts.heading,
  })
  const headingLastY =
    HEADING_BASELINE + Math.max(0, heading.lines.length - 1) * heading.lineHeight

  const subheading = slide.subheading
    ? fitEmphasisLine(slide.subheading, {
        maxWidth: HEADING_MAX_W,
        fontSize: SUBHEADING_FONT_SIZE,
        minFontSize: SUBHEADING_MIN_FONT_SIZE,
      })
    : null
  const subheadingY = headingLastY + 42
  const subheadingBudget = subheading ? SUBHEADING_SLOT : 0
  const subheadingFill = subheading
    ? accessibleInk(colors.accent, ctx.defaultBg ?? colors.bg, subheading.fontSize)
    : colors.accent

  const bodyTop = headingLastY + 36 + subheadingBudget
  const bodyBottom = slide.footnote ? 616 : 632
  const bodyH = Math.max(120, bodyBottom - bodyTop)

  const [leadComponent, ...rest] = slide.components
  const topHalfCount = Math.ceil(rest.length / 2)
  const topComponents = rest.slice(0, topHalfCount)
  const bottomComponents = rest.slice(topHalfCount)

  const leadRect: ContentRect = { x: LEAD_X, y: bodyTop, w: LEAD_W, h: bodyH }
  const rowH = Math.max(60, (bodyH - ROW_GAP) / 2)
  const topRect: ContentRect = { x: RIGHT_X, y: bodyTop, w: RIGHT_W, h: rowH }
  const dividerY = bodyTop + rowH + ROW_GAP / 2
  const bottomRect: ContentRect = { x: RIGHT_X, y: bodyTop + rowH + ROW_GAP, w: RIGHT_W, h: rowH }

  const footnote = slide.footnote
    ? fitSvgLine(slide.footnote, { maxWidth: HEADING_MAX_W, fontSize: 14, minFontSize: 11 })
    : null

  return (
    <>
      {kicker && (
        <text
          data-truncated={kicker.truncated ? "1" : undefined}
          x="96"
          y={KICKER_Y}
          fontFamily={fonts.body}
          fontSize={kicker.fontSize}
          fill={colors.muted}
          letterSpacing="4"
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
          fontWeight="700"
          fill={colors.text}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}

      {subheading && (
        <text
          x="96"
          y={subheadingY}
          fontFamily={fonts.body}
          fontSize={subheading.fontSize}
          fill={subheadingFill}
          dominantBaseline="alphabetic"
        >
          {renderEmphasisTspans(subheading.segments, { accent: colors.text, baseFill: subheadingFill, fontWeight: "700" })}
        </text>
      )}

      {/* Persistent structure: unconditional regardless of component count
          (see file header — the T1 handoff's single-component visibility
          requirement). */}
      <line
        x1={DIVIDER_X}
        y1={bodyTop}
        x2={DIVIDER_X}
        y2={bodyTop + bodyH}
        stroke={colors.border ?? colors.muted}
        strokeWidth={1}
        strokeOpacity={0.6}
      />
      <rect
        x={topRect.x}
        y={topRect.y}
        width={topRect.w}
        height={topRect.h}
        rx={PANEL_RADIUS}
        fill="none"
        stroke={colors.border ?? colors.muted}
        strokeOpacity={0.45}
        strokeWidth={1}
      />
      <rect
        x={bottomRect.x}
        y={bottomRect.y}
        width={bottomRect.w}
        height={bottomRect.h}
        rx={PANEL_RADIUS}
        fill="none"
        stroke={colors.border ?? colors.muted}
        strokeOpacity={0.45}
        strokeWidth={1}
      />
      <line
        x1={RIGHT_X}
        y1={dividerY}
        x2={RIGHT_X + RIGHT_W}
        y2={dividerY}
        stroke={colors.border ?? colors.muted}
        strokeWidth={1}
        strokeOpacity={0.3}
      />

      {leadComponent && (
        <SvgContent arrangement={undefined} components={[leadComponent]} rect={leadRect} ctx={ctx} />
      )}
      {topComponents.length > 0 && (
        <SvgContent arrangement={undefined} components={topComponents} rect={topRect} ctx={ctx} />
      )}
      {bottomComponents.length > 0 && (
        <SvgContent arrangement={undefined} components={bottomComponents} rect={bottomRect} ctx={ctx} />
      )}

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
