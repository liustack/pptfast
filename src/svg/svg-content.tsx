import type { Component } from "@/ir"
import type { ComponentCtx } from "./components/types"
import { renderComponent } from "./components"
import { asideSplit, layoutContentFit, settleToGolden, type ContentRect, type Arrangement } from "./layout"
import { SCALABLE_TYPES } from "./component-traits"
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
  // `matrix.tsx`'s own box.h-aware fill idiom) and skip both
  // `layoutContentFit`'s column-stacking and the lone-block 38% golden
  // placement below entirely — a component that fills the rect by itself
  // has no leftover to place anything in.
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
  const { placed: laidOut, dropped } = layoutContentFit(arrangement, components, rect, ctx)
  // 单块页（一张图/一张表占整页）垂直分布：38% 黄金位（2026-07-10 用户
  // 裁决，2026-08-21 复裁重申）——50% 居中时矮块在高内容区里上下各悬
  // 150px+，标题与内容断裂感明显；0%（2026-08-20 那一版顶对齐）则把块焊
  // 在标题底下，整页的空气全堆在脚下。38% 重心偏上贴近标题，底部自然
  // 留白多于顶部。第五轮（2026-08-21）补了一道上空上限：黄金位移把
  // 横幅高度算进「已占上部」之前，是把内容区自己的剩余再切 38% 垫在
  // 正文上面，单表页会在标题带和表格之间撕开 100px+ 的岛。`settleToGolden`
  // 现在把这段空气封在一个 heading-to-body beat（`goldenTopCap`，随
  // gapScale 走），多出来的剩余沉到页脚一侧。
  //
  // 多块页不走这里：`layoutContentFit` 已经把两块以上的整摞安放好了
  // （`settleToGolden`，同一套 38% + 上空上限），而它同时也在给页面的
  // 子区域排版，那里的单块必须留在区顶。一页只有一块时，这个矩形就是
  // 整页的主体区，安放它的是这一页——所以由这里安放。`settleToGolden`
  // 对已安放过的摞是空操作（首块不贴 rect 顶就原样返回），两处不会各
  // 偏移一次。
  const placed =
    laidOut.length === 1 && dropped === 0
      ? settleToGolden(laidOut, rect, ctx, {
          capTopAir: !SCALABLE_TYPES.has(laidOut[0].component.type),
        })
      : laidOut
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
