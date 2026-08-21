import { Fragment } from "react"
import type { Component } from "@/ir"
import type { ComponentCtx } from "./components/types"
import { pickEvidence } from "./component-traits"
import { renderComponent, measureComponent } from "./components"
import { BLOCK_GAP, layoutContentFit, type ContentRect } from "./layout"
import { DroppedContentMarker } from "./drop-marker"

/**
 * Render `component` scaled uniformly (never enlarged) to fit within
 * `budgetH` — the exact measure→scale→center technique
 * `content-image-lead-split.tsx`'s `renderVisualComponent` and
 * `content-stacked-poster.tsx`'s `renderPosterSlot` already use for the same
 * "this component's own natural height might exceed its box, and it has no
 * box.h-awareness of its own to shrink itself" problem (confirmed by
 * inspection: none of `image.tsx`/`chart.tsx`/`device-mockup.tsx` — the
 * `EVIDENCE_TYPES` members with a fixed/capped natural height — read
 * `box.h` at all; `chart.tsx`'s own comment says so explicitly, and all
 * three are `stretchable: false`, so `layoutContentFit`'s own box.h-grow
 * machinery never touches them either). `scale <= 1` always, so the
 * rendered footprint can never exceed `budgetH` — this is what makes the
 * caller's own downstream budget (the support stack's floor, see
 * `SUPPORT_FLOOR` below) a *hard* guarantee instead of a best-effort one.
 * `data-audit-rect`/`data-audit-box` describe the true (post-scale)
 * footprint, same convention the two precedents use, so `pptfast audit`'s
 * overflow walker (`svg-audit.ts`) checks reality, not the pre-scale intent.
 */
function renderFittedEvidence(
  component: Component,
  x: number,
  y: number,
  w: number,
  budgetH: number,
  ctx: ComponentCtx,
) {
  const measured = measureComponent(component, w, ctx)
  const scale = measured > 0 ? Math.min(budgetH / measured, 1) : 1
  const scaledW = w * scale
  const scaledH = measured * scale
  const offsetX = x + (w - scaledW) / 2
  const offsetY = y + Math.max(0, (budgetH - scaledH) / 2)
  return (
    <g data-audit-rect={`${x},${y},${w},${budgetH}`}>
      <g data-audit-box={`${offsetX},${offsetY},${scaledW},${scaledH}`}>
        <g transform={`translate(${offsetX},${offsetY}) scale(${scale})`}>
          {renderComponent(component, { x: 0, y: 0, w }, ctx)}
        </g>
      </g>
    </g>
  )
}

/**
 * `assertion_evidence` arrangement — "full-sentence heading + single enlarged evidence".
 *
 * The slide heading (rendered by the template layer) states an assertion. The
 * content area picks the single strongest evidence component (chart > image >
 * comparison > kpi_cards > first component) and renders it enlarged, vertically
 * centred in the available rect. Any remaining components are stacked compactly
 * below it in a smaller supporting region.
 */
export function AssertionEvidence({
  components,
  rect,
  ctx,
}: {
  components: Component[]
  rect: ContentRect
  ctx: ComponentCtx
}) {
  if (components.length === 0) {
    return <></>
  }

  const evidence = pickEvidence(components)

  // No recognised evidence type — fall back to normal single-column layout.
  if (!evidence) {
    const { placed, dropped } = layoutContentFit("single", components, rect, ctx)
    return (
      <>
        {placed.map((p, i) => (
          <Fragment key={i}>{renderComponent(p.component, p.box, ctx)}</Fragment>
        ))}
      {/* Recorded, never painted — and the export refuses to ship it.
          See `DroppedContentMarker`'s own doc comment. */}
      <DroppedContentMarker count={dropped} />
      </>
    )
  }

  const others = components.filter((b) => b !== evidence)

  // Measure the evidence component at the full content width.
  const evidenceH = measureComponent(evidence, rect.w, ctx)

  if (others.length === 0) {
    // Only the evidence component — centre it vertically in the entire rect.
    const centredY = rect.y + Math.max(0, (rect.h - evidenceH) / 2)
    return <>{renderComponent(evidence, { x: rect.x, y: centredY, w: rect.w }, ctx)}</>
  }

  // Evidence + supporting components: give evidence the majority of the rect,
  // then stack the rest below.
  const SUPPORT_FONT = 14
  const SUPPORT_GAP = 8
  // Reserve space for supporting components: at least a compact one-line-each
  // guess, but grown to fit what the components actually measure at (they render
  // at their normal component size, not SUPPORT_FONT — a fixed compact guess
  // undersizes real (e.g. wrapped paragraph/bullets) content and forces
  // layoutContentFit's last-resort "keep it anyway" branch to render an
  // overflowing component instead of cleanly dropping it). Capped so evidence
  // still keeps the majority of the rect.
  const measuredSupportH = others.reduce(
    (h, b) => h + measureComponent(b, rect.w, ctx) + BLOCK_GAP,
    -BLOCK_GAP,
  )
  const compactSupportH = others.length * (SUPPORT_FONT + SUPPORT_GAP)
  const supportH = Math.min(
    Math.max(measuredSupportH, compactSupportH),
    rect.h * 0.4,
  )
  const availableForEvidence = rect.h - supportH - SUPPORT_GAP

  // Hard floor (round-2 fix — round 1 let `supportRectH` shrink toward 0
  // whenever evidence overflowed its fair share, which just moved the
  // overlap one level down: `layoutContentFit`'s own last-resort "keep at
  // least one placed component" branch (`layout.ts`) and every box.h-aware
  // support component's own "never render zero visible units" floor
  // (`bullets.tsx`'s `visibleItemCount`, `Math.max(1, visible)`, mirrored by
  // data-table/comparison/citation/timeline/row-cards/kpi/architecture)
  // *guarantee* at least one unit renders regardless of how small a box.h
  // they're given — so a near-zero `supportRectH` didn't drop content, it
  // just let that guaranteed-minimum content spill past its own box,
  // straight into the page footer. Reviewer re-render confirmed this in all
  // three flagship pairs, not just an extreme edge.
  //
  // `SUPPORT_FLOOR` derives the exact worst case that guarantee can produce
  // for `bullets.tsx` (the support type in every reproduced case, and the
  // tightest-capacity box.h-aware type in this codebase — data-table/
  // comparison/citation/timeline/row-cards/kpi/architecture each cap their
  // own "kept" unit at 1-2 lines too, same order of magnitude): one item
  // wrapped to bullets.tsx's own hardcoded `maxLines: 2` ceiling, plus its
  // own "+N …" drop-pill immediately below it — every constant below is
  // copied from bullets.tsx's own `layoutItems`/`render` arithmetic (not
  // approximated), evaluated at `ctx.bodyFontPx` (the un-shrunk upper bound
  // bullets.tsx's own per-content font-fit starts from and can only shrink
  // *away* from toward `MIN_FONT`, never grow past — so this floor is
  // always >= bullets' actual worst case, never an underestimate). The
  // final `+ markerFontSize * 0.25` term matches `svg-audit.ts`'s own
  // v-overflow check (`ty + fontSize * 0.25 > rect bottom`), so the floor
  // covers the pill's own descent too, not just its baseline.
  const bodyFontPx = ctx.bodyFontPx
  const oneLineH = Math.round(bodyFontPx * 1.4) // bullets.tsx layoutItems(): `lineHeight = Math.round(fontSize * 1.4)`
  const firstLineY = Math.round(bodyFontPx * 1.1) // bullets.tsx layoutItems(): `y = Math.round(fontSize * 1.1)`
  const worstItemContentBottom = firstLineY + oneLineH + bodyFontPx * 0.2 // 2-line item (firstLineY + 1 more lineHeight) + 0.2em descent, bullets.tsx's own `contentBottom`
  const markerFontSize = Math.max(11, Math.round(bodyFontPx * 0.65)) // bullets.tsx render(): `markerFontSize`
  const markerBaselineY = worstItemContentBottom + Math.round(bodyFontPx * 0.9) // bullets.tsx render(): pill's own `y`
  const SUPPORT_FLOOR = Math.ceil(markerBaselineY + markerFontSize * 0.25)

  // The deficit needed to protect that floor always comes out of evidence's
  // side, never support's: `evidenceBudget` is the hard ceiling evidence is
  // scaled to fit within (see `renderFittedEvidence`) whenever it doesn't
  // fit its original fair share (`availableForEvidence`) — this guarantees
  // `supportRectH` below never drops under `SUPPORT_FLOOR`, so the support
  // stack's own guaranteed-minimum-unit rendering always lands inside its
  // box, never past `rect.y + rect.h` (and every layout that reaches
  // this arrangement already leaves real whitespace between its own content
  // rect's bottom and any footer chrome below it).
  const evidenceBudget = Math.max(0, rect.h - SUPPORT_GAP - SUPPORT_FLOOR)
  const evidenceOverflows = evidenceH > availableForEvidence

  // Non-overflow path is untouched — same computation as before either fix
  // round, byte-identical output. The overflow path never computes a
  // `centredY` of its own: `renderFittedEvidence` derives its own centering
  // from `evidenceBudget` internally (see its own doc comment).
  const centredY = rect.y + Math.max(0, (availableForEvidence - evidenceH) / 2)
  const supportY = evidenceOverflows
    ? rect.y + evidenceBudget + SUPPORT_GAP
    : rect.y + availableForEvidence + SUPPORT_GAP
  const supportRectH = evidenceOverflows
    ? Math.max(0, rect.y + rect.h - supportY)
    : supportH

  const { placed, dropped } = layoutContentFit(
    "single",
    others,
    { x: rect.x, y: supportY, w: rect.w, h: supportRectH },
    ctx,
  )

  return (
    <>
      {evidenceOverflows ? (
        renderFittedEvidence(evidence, rect.x, rect.y, rect.w, evidenceBudget, ctx)
      ) : (
        renderComponent(evidence, { x: rect.x, y: centredY, w: rect.w }, ctx)
      )}
      {placed.map((p, i) => (
        <Fragment key={i}>{renderComponent(p.component, p.box, ctx)}</Fragment>
      ))}
      {/* Same marker as the sibling branch above. This site previously
          painted "+N more" *without* a `data-dropped` attribute, so content
          lost here was visible to the reader and invisible to
          `deck-audit.ts` — exactly backwards. */}
      <DroppedContentMarker count={dropped} />
    </>
  )
}
