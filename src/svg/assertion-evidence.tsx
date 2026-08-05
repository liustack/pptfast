import { Fragment } from "react"
import type { Component } from "@/ir"
import type { ComponentCtx } from "./components/types"
import { EVIDENCE_TYPES } from "./component-traits"
import { renderComponent, measureComponent } from "./components"
import { BLOCK_GAP, layoutContentFit, type ContentRect } from "./layout"

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

  // Find the first evidence component by priority.
  let evidence: Component | undefined
  for (const t of EVIDENCE_TYPES) {
    evidence = components.find((b) => b.type === t)
    if (evidence) break
  }

  // No recognised evidence type — fall back to normal single-column layout.
  if (!evidence) {
    const { placed, dropped } = layoutContentFit("single", components, rect, ctx)
    return (
      <>
        {placed.map((p, i) => (
          <Fragment key={i}>{renderComponent(p.component, p.box, ctx)}</Fragment>
        ))}
        {dropped > 0 && (
          <text
            data-dropped={dropped}
            x={rect.x + rect.w}
            y={rect.y + rect.h - 6}
            textAnchor="end"
            fontSize={14}
            fill={ctx.colors.muted}
            fontFamily={ctx.fonts.body}
            dominantBaseline="alphabetic"
          >
            {`+${dropped} more`}
          </text>
        )}
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
  // Evidence can be taller than the space its own budget left after
  // reserving room for the support stack — several EVIDENCE_TYPES members
  // carry a fixed or capped natural height regardless of width
  // (device_mockup/image's shared 340px MAX_*_H cap, a chart with
  // axis-title/legend bands added on top of its own fixed plot height), so
  // `evidenceH` is measured, never assumed to fit. When it doesn't,
  // evidence keeps its full measured height (top-aligned, same as the
  // already-existing `others.length === 0` branch above never shrinks
  // evidence either) and the support stack is pushed down to evidence's
  // true bottom edge instead of the smaller budget originally set aside for
  // it — the same "reflow when one region needs more than its original
  // share" precedent `content-asymmetric-triptych.tsx`'s `bottomStarved`
  // branch and `content-image-lead-split.tsx`'s `starved` branch already
  // use elsewhere in this codebase for this exact class of defect. The
  // support stack's own shrink/gap-tighten/drop safety net
  // (`layoutContentFit`, its "+N more" pill already rendered below) absorbs
  // whatever space is left — no new layout machinery.
  const evidenceOverflows = evidenceH > availableForEvidence
  const centredY = evidenceOverflows
    ? rect.y
    : rect.y + Math.max(0, (availableForEvidence - evidenceH) / 2)

  const supportY = evidenceOverflows
    ? centredY + evidenceH + SUPPORT_GAP
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
      {renderComponent(evidence, { x: rect.x, y: centredY, w: rect.w }, ctx)}
      {placed.map((p, i) => (
        <Fragment key={i}>{renderComponent(p.component, p.box, ctx)}</Fragment>
      ))}
      {dropped > 0 && (
        <text
          x={rect.x + rect.w}
          y={rect.y + rect.h - 6}
          textAnchor="end"
          fontSize={14}
          fill={ctx.colors.muted}
          fontFamily={ctx.fonts.body}
          dominantBaseline="alphabetic"
        >
          {`+${dropped} more`}
        </text>
      )}
    </>
  )
}
