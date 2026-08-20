import type { Component } from "@/ir"
import type { ComponentCtx } from "./components/types"
import { renderComponent } from "./components"
import { asideSplit, layoutContentFit, type ContentRect, type Arrangement } from "./layout"
import { AssertionEvidence } from "./assertion-evidence"
import { BigNumber } from "./big-number"
import { FULL_BODY_TYPES } from "./component-traits"
import { DroppedContentMarker } from "./drop-marker"

export interface SvgContentProps {
  arrangement?: Arrangement
  components: Component[]
  rect: ContentRect
  ctx: ComponentCtx
}

/**
 * The content region of a slide: lays the components out into page-coordinate boxes
 * and renders each as a positioned `<g>`. Emits pure SVG (no foreignObject) so
 * the same output drives both preview and the svg2pptx exporter.
 */
export function SvgContent({ arrangement, components, rect, ctx }: SvgContentProps) {
  const auditRect = `${rect.x},${rect.y},${rect.w},${rect.h}`
  // A full-body component (`swot`/`bmc`/`waterfall`/`gantt`/`pest`/
  // `five_forces`/`heatmap`/`sankey`, structure-components wave 1 tasks 1/2 +
  // wave 2 tasks 1-3 — `FULL_BODY_TYPES`) is meant to own the
  // *entire* content rect by itself.
  // `checkFullBodyExclusivity` (api.ts) already guarantees a slide reaching
  // here with one of these has exactly one component, so `components.length
  // === 1` is enough to identify the case without re-checking exclusivity —
  // hand the component the whole rect verbatim (`h: rect.h`, matching
  // `matrix.tsx`'s own box.h-aware fill idiom) rather than routing it
  // through `layoutContentFit`'s column-stacking — a component that fills
  // the rect by itself has no leftover for the stacking pass to place.
  // Checked *before* the `big_number`/`assertion_evidence`
  // arrangement branches so a full-body component wins
  // regardless of whatever `arrangement` a slide happens to carry (those two
  // branches assume ordinary stackable components — e.g. `big_number` hunts
  // for a `kpi_cards` sibling that will never exist on a full-body slide).
  if (components.length === 1 && FULL_BODY_TYPES.has(components[0].type)) {
    return (
      <g data-audit-rect={auditRect}>
        <g data-audit-box={`${rect.x},${rect.y},${rect.w}`}>
          {renderComponent(components[0], { x: rect.x, y: rect.y, w: rect.w, h: rect.h }, ctx)}
        </g>
      </g>
    )
  }
  // `big_number` is a bespoke hero-metric layout rather than component stacking.
  if (arrangement === "big_number") {
    return (
      <g data-audit-rect={auditRect}>
        <BigNumber components={components} rect={rect} ctx={ctx} />
      </g>
    )
  }
  // `assertion_evidence` enlarges a single evidence component to fill the content area.
  if (arrangement === "assertion_evidence") {
    return (
      <g data-audit-rect={auditRect}>
        <AssertionEvidence components={components} rect={rect} ctx={ctx} />
      </g>
    )
  }
  const { placed, dropped } = layoutContentFit(arrangement, components, rect, ctx)
  // Every placed box is rendered at the y the layout gave it. A lone block
  // on an otherwise empty content rect is no exception: it starts at the
  // rect's top and the leftover stays under it (2026-08-20 user ruling,
  // 「页面的下方可以空，但不要上方空」).
  //
  // This used to push a lone block 38% of the leftover down the rect (the
  // 2026-07-10 ruling, itself a retreat from centering it at 50% because
  // "标题与内容断裂感明显"). Same complaint, half-treated: on the
  // banner-heading layout that left 105px between the banner and heritage
  // p07's table, 122px before ink p09's quote, with ink p04 and insight p07
  // the same shape. A reader met a filled banner, then a band of nothing,
  // then the page's only block. 38% made the 50% version less bad. 0 is
  // what fixes it, and the empty strip that lands at the foot of the page
  // is the side the ruling says may be empty.
  //
  // aside 版式的侧栏分隔竖线（几何与 layoutContent 同源 asideSplit）。
  //
  // Read off the *actual* placement, not the requested arrangement: since
  // `layoutContentFit` gained its single-column fallback (layout.ts — a
  // split that would drop content retries as one full-width stack), asking
  // for `aside` no longer means the result split. Drawing the divider from
  // the request painted a vertical rule straight through the content of a
  // page that had degraded to one column.
  const laidOutColumns = new Set(placed.map((p) => p.box.x))
  const asideDivider =
    arrangement === "aside" && laidOutColumns.size >= 2 ? asideSplit(rect).dividerX : null
  return (
    <g data-audit-rect={auditRect}>
      {asideDivider != null && (
        <line
          x1={asideDivider}
          y1={rect.y + 4}
          x2={asideDivider}
          y2={rect.y + rect.h - 4}
          stroke={ctx.colors.border ?? ctx.colors.muted}
          strokeWidth={1}
          strokeOpacity={0.6}
        />
      )}
      {placed.map((p, i) => (
        <g key={i} data-audit-box={`${p.box.x},${p.box.y},${p.box.w}`}>
          {renderComponent(p.component, p.box, ctx)}
        </g>
      ))}
      {/* Recorded, never painted — and the export refuses to ship it.
          See `DroppedContentMarker`'s own doc comment. */}
      <DroppedContentMarker count={dropped} />
    </g>
  )
}
