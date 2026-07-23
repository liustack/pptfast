import type { Component } from "@/ir"
import type { ComponentCtx } from "./components/types"
import { measureComponent, renderComponent } from "./components"
import { asideSplit, layoutContentFit, type ContentRect, type Arrangement } from "./layout"
import { AssertionEvidence } from "./AssertionEvidence"
import { BigNumber } from "./BigNumber"
import { FULL_BODY_TYPES } from "./component-traits"

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
  // `five_forces`/`heatmap`, structure-components wave 1 tasks 1/2 + wave 2
  // tasks 1-2 — `FULL_BODY_TYPES`) is meant to own the
  // *entire* content rect by itself.
  // `checkFullBodyExclusivity` (api.ts) already guarantees a slide reaching
  // here with one of these has exactly one component, so `components.length
  // === 1` is enough to identify the case without re-checking exclusivity —
  // hand the component the whole rect verbatim (`h: rect.h`, matching
  // `matrix.tsx`'s own box.h-aware fill idiom) and skip both
  // `layoutContentFit`'s column-stacking and the lone-component 38% golden
  // vertical offset below entirely. Checked *before* the `big_number`/
  // `assertion_evidence` arrangement branches so a full-body component wins
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
  // 单块页（一张图/一张表占整页）垂直分布：38% 黄金位（2026-07-10 用户
  // 裁决）——50% 居中时矮块在高内容区里上下各悬 150px+，标题与内容断裂
  // 感明显（无图矩阵真机审出的跨主题共性）。重心偏上贴近标题，底部自然
  // 留白。
  let dy = 0
  if (placed.length === 1 && dropped === 0) {
    // 黄金位偏移必须按拉伸后的实际高度算（box.h 由 growStretchables 分配）
    // ——按原始测量高算会与拉伸叠加把块底顶出 rect（2026-07-11 用户截图
    // 实锤：6 宫格/长卡单块页穿 footer 分割线）。拉满时 dy 自然归零。
    const h = placed[0].box.h ?? measureComponent(placed[0].component, placed[0].box.w, ctx)
    dy = Math.max(0, (rect.h - h) * 0.38)
  }
  // aside 版式的侧栏分隔竖线（几何与 layoutContent 同源 asideSplit）——
  // 退化条件与 layoutContent 一致（<2 块走 single 不画线）。
  const asideDivider =
    arrangement === "aside" && components.length >= 2 ? asideSplit(rect).dividerX : null
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
        <g key={i} data-audit-box={`${p.box.x},${p.box.y + dy},${p.box.w}`}>
          {renderComponent(p.component, { ...p.box, y: p.box.y + dy }, ctx)}
        </g>
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
    </g>
  )
}
