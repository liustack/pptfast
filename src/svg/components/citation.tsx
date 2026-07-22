import type { Component } from "@/ir"
import {
  fitSvgLine,
  measureTextUnits,
  truncateToUnits,
} from "../../lib/svg-text-layout"
import type { SvgComponent } from "./types"

type CitationComponent = Extract<Component, { type: "citation" }>

const ROW = 28
const LABEL_FONT_SIZE = 18
const LABEL_MIN_FONT_SIZE = 13
const URL_FONT_SIZE = 14

/** Baseline y for source row `i`, relative to the component group origin. */
function baselineY(i: number): number {
  return i * ROW + 18
}

export const citation: SvgComponent<CitationComponent> = {
  measure(component) {
    return component.sources.length * ROW
  },
  render(rawComponent, box, ctx) {
    // Vertical graceful landing (P0 hardening, robustness deep-review D1,
    // family-sweep sibling of bullets.tsx): `sources` has no schema
    // ceiling and each source costs a fixed `ROW` px regardless of content
    // — the same "unbounded per-item vertical stack, no box.h awareness"
    // shape bullets.tsx had. `box.h` is only ever set on this
    // non-stretchable component by `layoutContentFit`'s overflow-defense
    // branch (`layout.ts`), so its presence always means "cap to this
    // budget" (row-cards.tsx's own precedent for the convention below).
    const truncBudget = box.h ?? Number.POSITIVE_INFINITY
    const fullCount = rawComponent.sources.length
    const naturalHeight = fullCount * ROW
    let visibleCount = fullCount
    if (naturalHeight > truncBudget) {
      // Reserve 1 ROW inside the budget for the "+N more" marker line
      // itself — same reservation shape row-cards.tsx's own
      // `truncBudget - 20` uses. Floored at 1 (row-cards.tsx's "never
      // render zero visible units" precedent).
      visibleCount = Math.max(1, Math.min(fullCount, Math.floor(truncBudget / ROW) - 1))
    }
    const hiddenCount = fullCount - visibleCount
    const component = hiddenCount > 0 ? { ...rawComponent, sources: rawComponent.sources.slice(0, visibleCount) } : rawComponent
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {component.sources.map((source, i) => {
          const fittedLabel = fitSvgLine(`[${i + 1}] ${source.label}`, {
            maxWidth: box.w * 0.6,
            fontSize: LABEL_FONT_SIZE,
            minFontSize: LABEL_MIN_FONT_SIZE,
          })
          const labelWidth =
            measureTextUnits(fittedLabel.text) * fittedLabel.fontSize
          const remainingWidth = box.w - labelWidth
          const fittedUrl = source.url
            ? truncateToUnits(source.url, remainingWidth / URL_FONT_SIZE)
            : null
          return (
            <text
              key={i}
              data-truncated={fittedLabel.truncated ? "1" : undefined}
              x="0"
              y={baselineY(i)}
              fontFamily={ctx.fonts.body}
              fontSize={fittedLabel.fontSize}
              fill={ctx.colors.text}
              dominantBaseline="alphabetic"
            >
              {fittedLabel.text}
              {fittedUrl && (
                <tspan
                  fill={ctx.colors.muted}
                  fontSize={URL_FONT_SIZE}
                >
                  {` ${fittedUrl}`}
                </tspan>
              )}
            </text>
          )
        })}
        {hiddenCount > 0 && (
          <text
            data-dropped={hiddenCount}
            x={box.w}
            y={baselineY(component.sources.length)}
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
