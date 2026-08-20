import type { Component } from "@/ir"
import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "./registry"
import type { ContentRect } from "../layout"
import type { ComponentCtx } from "../components/types"
import { SvgContent } from "../svg-content"
import { SCALABLE_TYPES } from "../component-traits"
import { measureComponent, renderComponent } from "../components"
import { sectionNameFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { fitEmphasisLine, renderEmphasisTspans } from "../emphasis"
import { accessibleInk } from "../ink"
import { footnoteBaselineFor } from "../chrome-geometry"

/**
 * image-lead-split content layout (content-layout expansion wave, task
 * T1 — `.issues/2026-07-26-content-archetypes/plan.md`): an *unconditional*
 * 60/40 unequal split — a wide `visual` column (image/chart/decorative
 * block) beside a narrow `body` column — the one composition none of the
 * pool's other 10 content layouts make (the wave's own measured baseline:
 * 7 of 10 pin the body's left edge at x=96 with the same 40px header band,
 * differing only in body *width*; `two-column` is equal-width;
 * `side-highlight` is body-plus-accent-rail, not two co-equal columns).
 *
 * Composition sketch (geometry, written before this file per the task
 * contract): text column x=96 w=435 (kicker/heading/subheading, then a
 * narrow `SvgContent` single-stack body) — visual column x=571 w=613,
 * y=72..640 (h=568, matching `side-highlight`'s own panel vertical span;
 * on a header-only page that band tightens onto the height its component
 * actually paints, keeping the same top edge — see `textOnlyHeader`).
 * The 40px gap between them (571 - 96 - 435) keeps the two regions from
 * ever touching regardless of either one's own internal padding. This
 * geometry only holds when a real scalable component leads (see "Starved
 * case" below `STARVED_TEXT_W`'s declaration for the imageless variant,
 * where the text column widens to 788px and the visual column shrinks to a
 * 260px accent panel).
 *
 * Unlike `stacked-poster` (whose hero/strip poster grammar only activates
 * for <=2 fitting components and degrades to a full-width stack otherwise)
 * this split never degrades — the 60/40 geometry is unconditional, present
 * whether the slide carries 0, 1, or 5 components. That is the whole point
 * of this layout (research note §3.1: "填补'图/表固定占多数版面、不依赖
 * 组件数量判断是否启用'这个空白"), so there is deliberately no `fits` gate
 * here the way `content-stacked-poster.tsx`'s `componentFitsSlot` has one.
 *
 * Component placement: `components[0]` feeds the `visual` column *only*
 * when it is a `SCALABLE_TYPES` member (image/chart — the same set
 * `content-stacked-poster.tsx`/`content-bento-panel.tsx` already classify
 * by); every other component (including `components[0]` itself when it is
 * *not* scalable) stacks in the narrow `body` column instead. When there is
 * no scalable lead component at all (0 components, or a first component
 * that isn't image/chart), the visual column still renders — never an empty
 * hole — as a drawn, token-only decorative composition (a rounded card +
 * a faint accent circle + a short accent bar), the "全出血色块" alternative
 * plan.md's own composition line names alongside image/chart.
 *
 * Missing-asset degradation (iron rule: the only rasterization exit is
 * `<image>` backed by a real resolved asset): when `components[0]` is an
 * `image` component whose `asset_id` has no resolved `ctx.images[...].src`,
 * this file never touches `<image>` itself — the scalable component is
 * always handed to the shared `renderComponent` dispatcher
 * (`../components`), and `image.tsx`'s own `render` is what decides
 * `<image>` vs. a drawn `colors.surface` rect + "Image missing" text
 * placeholder (same fallback `image-pages.tsx`'s `ImageSplitPage`/
 * `ImageTopPage` already rely on for their own bleed images). This file
 * draws zero `<image>` elements on its own; every one that appears in this
 * layout's output comes from a component's own render, gated on a real
 * `src`.
 *
 * Scaling technique (reused, not reinvented, from
 * `content-stacked-poster.tsx`'s `renderPosterSlot`: measure the component
 * at the slot's width, scale uniformly, translate+scale group, dual
 * `data-audit-box`/`data-audit-rect` annotation) — but with a *different*
 * cap. Stacked-poster's hero sits centered on the page with ~55px of spare
 * margin on both sides, so it can safely scale *up* to 1.3x and bleed into
 * that margin. This layout's visual column has no such margin: it is
 * flush against the page's right content edge on one side and a 40px gap
 * from the text column on the other, so scaling up would either bleed past
 * the canvas or straight into the heading/body text. `VISUAL_SCALE_CAP` is
 * therefore 1 (shrink-to-fit only, horizontally centered and top-flush
 * within the slot, never enlarged) — the same measure-and-scale math, a
 * narrower cap chosen for a column with no bleed room, not a rewritten
 * technique.
 *
 * Beat/strategy tendency assignment (decided in the plan's T3 integration
 * task, once `split-band` also landed; the beat rationale was strengthened
 * in the wave's final review round after a reviewer found the original
 * column-width analogy underargued): this layout is a `breathing`
 * `BEAT_TENDENCIES` member (`layout-selection.ts`) under *both* of its
 * geometries — with a scalable lead, a single-stack 435px text column beside
 * one generously shrink-to-fit-only visual subject; without one, the text
 * column widens to 788px (mirroring `narrow-column`'s own "spacious
 * single-stack column" case directly) beside a decorative accent panel
 * carrying zero information content. Neither geometry ever splits into
 * multiple competing regions (unlike `dense`'s members) or makes one loud,
 * bold-colored assertion (unlike `anchor`'s) — see that table's own doc
 * comment for the full "single flow + single quiet companion" argument.
 * Deliberately *not* an `anchor` member for the same reason: this file's own
 * "two co-equal protagonists" framing above is a calmer register than
 * `stacked-poster`'s single hero or `split-band`'s full-bleed banner. It
 * also stays out of every strategy's `layoutTendencies` (`@/narrative`) —
 * deliberately neutral, the same "万金油" treatment `tone-adaptive-content`
 * gets: its defining trait (an unconditional visual/text split) is an
 * asset-availability signal, not an argument-style one — any strategy's
 * deck can equally have (or lack) a chart/photo worth leading with, so no
 * single strategy's rhetorical register owns this composition.
 * Reconsidered specifically against `showcase` in the same final-review
 * round (once `split-band` moved into `showcase.layoutTendencies` on the
 * opposite finding — see `@/narrative`'s own doc comment): showcase's
 * register is visual *punch* (bold, opaque color blocks), not visual
 * *presence*, so merely having an image to lead with still doesn't map onto
 * showcase's membership criterion the way a full-bleed color band does. It
 * stays neutral on reconsideration, not by default.
 *
 * Discipline: no theme id, no hex literal — every color is a token or an
 * `../ink` call.
 */

const TEXT_X = 96
const COLUMN_GAP = 40
const VISUAL_RIGHT = 1184
const VISUAL_Y = 72
const VISUAL_BOTTOM = 640
const VISUAL_H = VISUAL_BOTTOM - VISUAL_Y // 568
const VISUAL_RADIUS = 20

// Co-equal case: a real scalable (image/chart) lead component fills the
// visual column, so the unconditional 60/40 split holds at its full ratio.
const LEAD_TEXT_W = 435
const LEAD_VISUAL_X = TEXT_X + LEAD_TEXT_W + COLUMN_GAP // 571
const LEAD_VISUAL_W = VISUAL_RIGHT - LEAD_VISUAL_X // 613

/**
 * Starved case (controller-probed defect, follow-up fix round — mirrors
 * `content-asymmetric-triptych.tsx`'s own `bottomStarved` precedent): there
 * is no scalable lead component at all (0 components, or every component
 * non-scalable — e.g. a kpi_cards-only page), so the visual column has
 * nothing real to show, only the drawn decorative placeholder (see
 * `renderVisualPlaceholder`). Keeping the text column pinned at
 * `LEAD_TEXT_W` in that case buys nothing — it squeezes real content into
 * 435px purely to leave room beside a decorative void (this is exactly what
 * made a kpi_cards-only page truncate a label at 435px). The text column
 * reclaims most of the freed width instead; the visual column shrinks to a
 * slim accent panel (still flush against the page's right content edge, same
 * vertical span) rather than disappearing outright, so the layout keeps a
 * recognizable "text beside a visual accent" identity even with no asset to
 * lead with — just no longer a co-equal 60/40 split, since there is no
 * second protagonist to be co-equal *with*.
 *
 * `STARVED_TEXT_W` (788) is deliberately chosen to land clear of every other
 * content layout's own (x=96, width) region class the pool's skeleton-
 * diversity acceptance test (`audit/content-skeleton-diversity.test.tsx`)
 * already tracks — `two-column`'s 528px half-columns, `asymmetric-
 * triptych`'s 632px `lead`, `narrow-column`/`side-highlight`'s shared 880px
 * column, `banner-heading`/`rail-numbered`'s full 1088px — every one of
 * those is >=90px away from 788, well outside that test's own 10px
 * quantization step, so a starved imageless page keeps its own distinct
 * skeleton rather than quietly collapsing into an existing layout's.
 */
const STARVED_VISUAL_W = 260
const STARVED_VISUAL_X = VISUAL_RIGHT - STARVED_VISUAL_W // 924
const STARVED_TEXT_W = STARVED_VISUAL_X - COLUMN_GAP - TEXT_X // 788

const KICKER_Y = 96
const HEADING_BASELINE = 150

const SUBHEADING_FONT_SIZE = 22
const SUBHEADING_MIN_FONT_SIZE = 16
const SUBHEADING_SLOT = 46

/** Shrink-to-fit only — see file header's "Scaling technique" section on why
 * this differs from stacked-poster's 1.3x fill-and-bleed cap. */
const VISUAL_SCALE_CAP = 1

/** Render `component` (already known to be a `SCALABLE_TYPES` member) into
 * `rect`, uniformly scaled to fit *within* it — horizontally centered,
 * vertically flush with the slot's top edge — and never enlarged, so the
 * scaled footprint can never cross into the adjacent text column or past
 * the page edge. Missing-asset degradation for an `image` component happens
 * inside `renderComponent`'s own dispatch (see file header) — this function
 * never renders a bare `<image>` itself.
 *
 * Top-flush, not vertically centered (2026-08-20 vertical-gravity ruling —
 * "页面的下方可以空，但不要上方空"): a shrink-to-fit-only visual routinely
 * measures short of its 568px slot, and centering that shortfall hung the
 * page's one picture below a band of nothing while the text column beside
 * it started at the top. Horizontal centering stays — gravity has a
 * direction, and it is not sideways.
 *
 * `preMeasured` is the caller's own measurement of the same component at the
 * same `rect.w` — the header-only band below sizes itself off that number, so
 * it hands it over rather than letting the band and the thing standing in it
 * come from two separate measurements. */
function renderVisualComponent(
  component: Component,
  rect: ContentRect,
  ctx: ComponentCtx,
  preMeasured?: number,
) {
  const auditRect = `${rect.x},${rect.y},${rect.w},${rect.h}`
  const measured = preMeasured ?? measureComponent(component, rect.w, ctx)
  const scale = measured > 0 ? Math.min(rect.h / measured, VISUAL_SCALE_CAP) : 1
  const scaledW = rect.w * scale
  const scaledH = measured * scale
  const offsetX = rect.x + (rect.w - scaledW) / 2
  const offsetY = rect.y
  return (
    <g data-audit-rect={auditRect}>
      <g data-audit-box={`${offsetX},${offsetY},${scaledW},${scaledH}`}>
        <g transform={`translate(${offsetX},${offsetY}) scale(${scale})`}>
          {renderComponent(component, { x: 0, y: 0, w: rect.w }, ctx)}
        </g>
      </g>
    </g>
  )
}

/** The visual column's unconditional fallback when there is no scalable
 * lead component to show (0 components, or a first component that isn't
 * image/chart) — a drawn, token-only composition so the column always reads
 * as a deliberate choice, never a broken hole. No text at all (deliberately
 * — a purely decorative shape needs no contrast guard). */
function renderVisualPlaceholder(rect: ContentRect, ctx: ComponentCtx) {
  const { colors } = ctx
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const r = Math.min(rect.w, rect.h) * 0.22
  return (
    <g data-audit-rect={`${rect.x},${rect.y},${rect.w},${rect.h}`}>
      <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={VISUAL_RADIUS} fill={colors.surface} />
      <rect
        x={rect.x + 0.5}
        y={rect.y + 0.5}
        width={rect.w - 1}
        height={rect.h - 1}
        rx={VISUAL_RADIUS}
        fill="none"
        stroke={colors.border ?? colors.muted}
        strokeWidth={1}
      />
      <circle cx={cx} cy={cy} r={r} fill={colors.primary} fillOpacity={0.1} />
      <rect x={cx - 32} y={cy + r + 28} width={64} height={4} rx={2} fill={colors.accent} />
    </g>
  )
}

export function ImageLeadSplitContent({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const section = sectionNameFor(ir.slides, index)

  // See file header "Component placement" — components[0] only ever leaves
  // the body stack when it is itself a scalable (image/chart) lead. Computed
  // up front (rather than after heading/body layout, as it used to be) since
  // the "starved" branch below now feeds TEXT_W, which every text-fitting
  // call below depends on.
  const [first, ...rest] = slide.components
  const visualComponent = first && SCALABLE_TYPES.has(first.type) ? first : undefined
  const bodyComponents = visualComponent ? rest : slide.components

  // Starved: no scalable lead to justify the narrow 435px column — see file
  // header "Starved case" section above `STARVED_TEXT_W`'s derivation.
  const starved = !visualComponent
  const TEXT_W = starved ? STARVED_TEXT_W : LEAD_TEXT_W

  // The mirror of the starved case (visual review 2026-08-15): a real
  // scalable lead, but *nothing* in the body — a single-chart page is the
  // common shape. The 60/40 geometry is right here (that is the layout's
  // whole premise), and the page's leftover height is real either way. The
  // only question this flag settles is what the visual column *declares*.
  //
  // Two earlier answers, both since overruled. The first pushed the text
  // block down to share a center line with the visual column. The second
  // kept that line but tightened the declared band onto the ink it paints.
  // The 2026-08-20 vertical-gravity ruling ("页面的下方可以空，但不要上方
  // 空") takes the centering back out: on ember p05 the pair of them left
  // the top ~220px of the text column and ~140px of the visual column
  // empty, with the whole page's content bunched around its middle. Both
  // columns now start at the content area's top and the dead strip lands
  // under them, where the ruling puts it.
  //
  // What survives from the second pass is the part that was never about
  // centering: a shrink-to-fit-only visual measures short of the 568px
  // band, and declaring 568 while painting 288 tells an auditor reading
  // `data-audit-rect` there is a half-empty region here. With an empty body
  // the band tightens onto what it paints — see `visualBandH`.
  const textOnlyHeader = !starved && bodyComponents.length === 0 && !slide.footnote

  const kicker = section
    ? fitSvgLine(section, { maxWidth: TEXT_W, fontSize: 17, minFontSize: 13, letterSpacing: 2 })
    : null

  // Narrower than every other content layout's nominal heading size
  // (42-46 at 880-1088px) to match this column's own narrower width —
  // `fitHeadingLines`'s own shrink/wrap/truncate safety net (bold-aware:
  // `fontFamily` passed through, `bold` left at its default `true`) still
  // guarantees zero overflow regardless of content length, same as every
  // sibling layout; maxLines raised to 3 (vs. the pool's usual 2) since
  // 435px wraps more eagerly than 880-1088px — the narrow `ImageSplitPage`
  // takeover (`image-pages.tsx`, 564px text column) already sets this same
  // precedent at maxLines=3.
  const heading = fitHeadingLines(slide.heading, {
    maxWidth: TEXT_W,
    fontSize: 38,
    maxLines: 3,
    minPt: 22,
    fontFamily: fonts.heading,
  })
  const headingLastY =
    HEADING_BASELINE + Math.max(0, heading.lines.length - 1) * heading.lineHeight

  const subheading = slide.subheading
    ? fitEmphasisLine(slide.subheading, {
        maxWidth: TEXT_W,
        fontSize: SUBHEADING_FONT_SIZE,
        minFontSize: SUBHEADING_MIN_FONT_SIZE,
      })
    : null
  const subheadingY = headingLastY + 42

  const subheadingBudget = subheading ? SUBHEADING_SLOT : 0
  const subheadingFill = subheading
    ? accessibleInk(colors.accent, ctx.defaultBg ?? colors.bg, subheading.fontSize)
    : colors.accent

  // Follows the text block it hangs under. One coordinate on every path now
  // that nothing shifts the heading block vertically — the header-only case
  // used to need its own term here, and the rect drifting out from under
  // its own heading was the bug that term existed to prevent.
  const bodyY = headingLastY + 40 + subheadingBudget
  const bodyBottom = slide.footnote ? 616 : 632
  const bodyRect: ContentRect = { x: TEXT_X, y: bodyY, w: TEXT_W, h: Math.max(120, bodyBottom - bodyY) }

  const footnote = slide.footnote
    ? fitSvgLine(slide.footnote, { maxWidth: TEXT_W, fontSize: 14, minFontSize: 11 })
    : null

  // Header-only: the visual can only ever shrink to fit (VISUAL_SCALE_CAP),
  // so a component that measures short of the full 568px band leaves the rest
  // of it declared but never painted — 280px of it for a typical chart, a
  // region `data-audit-rect` claims and no ink reaches. Hand the column the
  // band it actually paints instead. Both bands start at `VISUAL_Y`, and the
  // component inside is top-flush, so the declared band and the painted one
  // now share an edge rather than a midpoint.
  const visualMeasured =
    textOnlyHeader && visualComponent ? measureComponent(visualComponent, LEAD_VISUAL_W, ctx) : undefined
  const visualBandH =
    visualMeasured !== undefined && visualMeasured > 0 ? Math.min(visualMeasured, VISUAL_H) : VISUAL_H

  const visualRect: ContentRect = starved
    ? { x: STARVED_VISUAL_X, y: VISUAL_Y, w: STARVED_VISUAL_W, h: VISUAL_H }
    : { x: LEAD_VISUAL_X, y: VISUAL_Y, w: LEAD_VISUAL_W, h: visualBandH }

  return (
    <>
      {kicker && (
        <text
          data-truncated={kicker.truncated ? "1" : undefined}
          x={TEXT_X}
          y={KICKER_Y}
          fontFamily={fonts.body}
          fontSize={kicker.fontSize}
          fill={colors.muted}
          letterSpacing={2}
          dominantBaseline="alphabetic"
        >
          {kicker.text}
        </text>
      )}

      {heading.lines.map((line, i) => (
        <text
          key={i}
          data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
          x={TEXT_X}
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
          x={TEXT_X}
          y={subheadingY}
          fontFamily={fonts.body}
          fontSize={subheading.fontSize}
          fill={subheadingFill}
          dominantBaseline="alphabetic"
        >
          {renderEmphasisTspans(subheading.segments, { accent: colors.text, baseFill: subheadingFill, fontWeight: "700" })}
        </text>
      )}

      {/* Text column body: slide.arrangement passed straight through — the
          60/40 visual/text split is this layout's own *page* grammar, but
          the text column itself is a single ordinary rect (unlike bento-
          panel/two-column/asymmetric-triptych, none of which has a lone
          rect at all), so it honors arrangement the same way narrow-column/
          side-highlight/quiet-frame do. This also matters for correctness,
          not just consistency: a slide authored with `arrangement:
          "two_column"` (e.g. two sibling `steps` lists meant to split
          side by side) must still split here — hardcoding "single" would
          instead stack both full lists in one column, doubling the height
          budget each was sized for and overflowing (found via
          audit-baseline.test.ts's `new_components_stress` fixture while
          building this file, fixed here rather than by tuning the fixture,
          per the wave's global constraint). */}
      <SvgContent arrangement={slide.arrangement} components={bodyComponents} rect={bodyRect} ctx={ctx} />

      {footnote && (
        <text
          data-truncated={footnote.truncated ? "1" : undefined}
          x={TEXT_X}
          y={footnoteBaselineFor(footnote.fontSize)}
          fontFamily={fonts.body}
          fontSize={footnote.fontSize}
          fill={colors.muted}
          fontStyle="italic"
          dominantBaseline="alphabetic"
        >
          {footnote.text}
        </text>
      )}

      {/* Visual column: unconditional, present regardless of slide.components
          (see file header) — a real scaled image/chart when the lead
          component supports it, a drawn placeholder otherwise. */}
      {visualComponent
        ? renderVisualComponent(visualComponent, visualRect, ctx, visualMeasured)
        : renderVisualPlaceholder(visualRect, ctx)}
    </>
  )
}

export const layoutDef: LayoutDefinition = {
  // content-image-lead-split.tsx: narrow (435px) text column — kicker/
  // heading/subheading/single-stack SvgContent body — beside an
  // unconditional 613px visual column, when a real scalable (image/chart)
  // lead is present. Without one (0 components, or every component
  // non-scalable), the text column widens to 788px and the visual column
  // shrinks to a 260px accent panel instead — see file header's "Starved
  // case". `visual` only ever actually receives a live component (capacity
  // 1, components[0], gated on SCALABLE_TYPES); otherwise it renders a
  // persistent decorative placeholder instead — see file header. `body`
  // capacity is 4, the pool's flat single-stack default (registry.ts's
  // CONTENT_LAYOUT_DEFS header derivation), unaffected by the narrower 435px
  // width — narrower than every other layout's own single-stack column
  // but still wider than the pool's already-audited narrowest single-stack
  // region (asymmetric-triptych's 424px `top`/`bottom` panels), so no
  // capacity.ts floor needs tightening (the starved 788px case is wider
  // still, so it doesn't tighten that floor either). The visual
  // column reuses `SlotName`'s existing "hero" word (stacked-poster's own
  // "a single, possibly-scaled dominant component" slot) rather than
  // growing the 16-word vocabulary — this file's own prose calls it
  // "visual" for readability, the registry slot name stays within the
  // existing vocabulary.
  id: "image-lead-split",
  kind: "archetype",
  slideTypes: ["content"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "hero", accepts: "any", capacity: 1 },
    { name: "body", accepts: "any", capacity: 4 },
    { name: "meta", accepts: [] },
  ],
  // The text column is a lone ordinary rect (unlike bento-panel/two-column/
  // asymmetric-triptych's bespoke multi-region splits) and honors every
  // arrangement, same as narrow-column/side-highlight/quiet-frame/
  // rail-numbered/banner-heading — see the render function's own comment.
  arrangements: "all",
}
