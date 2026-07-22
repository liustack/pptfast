import type { Component } from "@/ir"
import { fitSvgLine } from "../../lib/svg-text-layout"
import type { SvgComponent } from "./types"

type ArchitectureComponent = Extract<Component, { type: "architecture" }>

const LAYER_H = 72
const GAP = 12
const TITLE_X = 16
const TITLE_FONT_SIZE = 18
const ITEMS_FONT_SIZE = 16
const TITLE_BASELINE_Y = 42
const ITEMS_BASELINE_Y = 44
/** Approximate width reserved for the title label before items text starts. */
const ITEMS_X = 180
const SEPARATOR = " · "
/** Right-edge padding matching the 6px padding budget used on the left. */
const PAD = 6
const MIN_FONT_SIZE = 10

export const architecture: SvgComponent<ArchitectureComponent> = {
  measure(component) {
    return component.layers.length * (LAYER_H + GAP) - GAP
  },
  render(rawComponent, box, ctx) {
    const layerFill = ctx.colors.panel ?? ctx.colors.surface
    // Vertical graceful landing (P0 hardening, robustness deep-review D1,
    // family-sweep sibling of bullets.tsx): `layers` has no schema ceiling
    // and each layer costs a fixed `LAYER_H + GAP` px regardless of
    // content. `box.h` is only ever set on this non-stretchable component
    // by `layoutContentFit`'s overflow-defense branch (`layout.ts`), so its
    // presence always means "cap to this budget" (row-cards.tsx's own
    // precedent for the convention below).
    const truncBudget = box.h ?? Number.POSITIVE_INFINITY
    const fullCount = rawComponent.layers.length
    const naturalHeight = fullCount * (LAYER_H + GAP) - GAP
    let visibleCount = fullCount
    if (naturalHeight > truncBudget) {
      // Reserve room for the "+N more" marker line itself, one LAYER_H
      // worth, inside the budget — same reservation shape row-cards.tsx's
      // own `truncBudget - 20` uses. Floored at 1 (row-cards.tsx's "never
      // render zero visible units" precedent).
      visibleCount = Math.max(
        1,
        Math.min(fullCount, Math.floor((truncBudget - LAYER_H + GAP) / (LAYER_H + GAP))),
      )
    }
    const hiddenCount = fullCount - visibleCount
    const component =
      hiddenCount > 0 ? { ...rawComponent, layers: rawComponent.layers.slice(0, visibleCount) } : rawComponent
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {component.layers.map((layer, i) => {
          const layerY = i * (LAYER_H + GAP)
          const title = fitSvgLine(layer.title, {
            maxWidth: ITEMS_X - TITLE_X - PAD,
            fontSize: TITLE_FONT_SIZE,
            minFontSize: MIN_FONT_SIZE,
          })
          const items = fitSvgLine(layer.items.join(SEPARATOR), {
            maxWidth: box.w - ITEMS_X - PAD,
            fontSize: ITEMS_FONT_SIZE,
            minFontSize: MIN_FONT_SIZE,
          })
          return (
            <g key={i}>
              <rect
                x={0}
                y={layerY}
                width={box.w}
                height={LAYER_H}
                rx={ctx.shape?.radius ?? 6}
                fill={layerFill}
              />
              <text
                data-truncated={title.truncated ? "1" : undefined}
                x={TITLE_X}
                y={layerY + TITLE_BASELINE_Y}
                fontSize={title.fontSize}
                fontWeight="bold"
                fontFamily={ctx.fonts.heading}
                fill={ctx.colors.primary}
                dominantBaseline="alphabetic"
              >
                {title.text}
              </text>
              <text
                data-truncated={items.truncated ? "1" : undefined}
                x={ITEMS_X}
                y={layerY + ITEMS_BASELINE_Y}
                fontSize={items.fontSize}
                fontFamily={ctx.fonts.body}
                fill={ctx.colors.text}
                dominantBaseline="alphabetic"
              >
                {items.text}
              </text>
            </g>
          )
        })}
        {hiddenCount > 0 && (
          <text
            data-dropped={hiddenCount}
            x={box.w}
            y={component.layers.length * (LAYER_H + GAP) - GAP + 20}
            textAnchor="end"
            fontSize={13}
            fill={ctx.colors.muted}
            fontFamily={ctx.fonts.body}
            dominantBaseline="alphabetic"
          >
            {`+${hiddenCount} more`}
          </text>
        )}
      </g>
    )
  },
}
