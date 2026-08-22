import type { Component } from "@/ir"
import type { ComponentCtx } from "../components/types"
import type { ContentRect } from "../layout"
import { GOLDEN_TOP_SHARE } from "../layout"
import { measureComponent, renderComponent } from "../components"

const SCALE_CAP = 1
const TEXT_EVIDENCE_GAP = 20

/** Width of the assertion column to the left of an evidence rect. */
export function textColumnMaxWidth(textX: number, evidenceX: number, gap = TEXT_EVIDENCE_GAP): number {
  return Math.max(80, evidenceX - textX - gap)
}

/**
 * Shrink-to-fit a single evidence component into `rect` without enlarging.
 * Shared by the generic `one-evidence` face and the sparse theme faces.
 */
export function renderFittedEvidence(component: Component, rect: ContentRect, ctx: ComponentCtx) {
  const measured = measureComponent(component, rect.w, ctx)
  const scale = measured > 0 ? Math.min(rect.h / measured, SCALE_CAP) : 1
  const scaledW = rect.w * scale
  const scaledH = measured * scale
  const offsetX = rect.x + (rect.w - scaledW) / 2
  const offsetY = rect.y + Math.max(0, rect.h - scaledH) * GOLDEN_TOP_SHARE
  return (
    <g data-audit-rect={`${rect.x},${rect.y},${rect.w},${rect.h}`}>
      <g data-audit-box={`${offsetX},${offsetY},${scaledW},${scaledH}`}>
        <g transform={`translate(${offsetX},${offsetY}) scale(${scale})`}>
          {renderComponent(component, { x: 0, y: 0, w: rect.w }, ctx)}
        </g>
      </g>
    </g>
  )
}
