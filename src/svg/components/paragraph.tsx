import type { Component } from "@/ir"
import { Fragment } from "react"
import { layoutSvgText } from "../../lib/svg-text-layout"
import { parseEmphasis, renderEmphasisLine, sliceEmphasisForLines, stripEmphasis } from "../emphasis"
import type { RenderDef, SvgComponent } from "./types"

type ParagraphComponent = Extract<Component, { type: "paragraph" }>

const LINE_RATIO = 1.4

/**
 * `fontSize` is `ctx.bodyFontPx` (W4 task 3, design decision 9) — the
 * pacing-tier body baseline, not a fixed constant. `lineHeightRatio`
 * stays fixed (`LINE_RATIO`), so line height scales automatically with
 * whatever baseline the caller passes.
 */
function lay(text: string, w: number, fontSize: number) {
  return layoutSvgText(stripEmphasis(text), {
    maxWidth: w,
    fontSize,
    maxLines: 99, // wrap freely; never shrink/truncate a body paragraph
    lineHeightRatio: LINE_RATIO,
  })
}

export const paragraph: SvgComponent<ParagraphComponent> = {
  measure(component, w, ctx) {
    const l = lay(component.text, w, ctx.bodyFontPx)
    return l.lines.length * l.lineHeight
  },
  render(component, box, ctx) {
    const l = lay(component.text, box.w, ctx.bodyFontPx)
    const lineSegments = sliceEmphasisForLines(parseEmphasis(component.text), l.lines)

    // Truncation budget (visual review 2026-08-15). `layoutContentFit`'s
    // last-resort branch — a single component too tall for its rect, kept
    // rather than dropped so the slide isn't left empty — hands the block a
    // `box.h` *smaller* than its measured height and expects the block to
    // truncate itself into it. `row_cards` and `bullets` already honor that
    // contract; this one did not, so an over-long paragraph in a short slot
    // (an image takeover's text column, quote-stage's capacity-1 annotation
    // slot) painted straight off the bottom of the canvas and over the
    // footer. Now it stops at the budget and marks itself truncated, which
    // is also what makes `deck-audit.ts` report it instead of the reader
    // discovering it.
    const measuredH = l.lines.length * l.lineHeight
    const overBudget = box.h != null && box.h < measuredH
    const maxLines = overBudget ? Math.max(1, Math.floor(box.h! / l.lineHeight)) : lineSegments.length
    const visible = lineSegments.slice(0, maxLines)
    const truncated = visible.length < lineSegments.length

    return (
      <g transform={`translate(${box.x},${box.y})`} data-truncated={truncated ? "1" : undefined}>
        {visible.map((segments, i) => {
          const baselineY = i * l.lineHeight + l.fontSize
          const emphasis = renderEmphasisLine(segments, {
            accent: ctx.colors.accent,
            baseFill: ctx.colors.text,
            fontSize: l.fontSize,
            x: 0,
            baselineY,
            themeId: ctx.themeId,
          })
          return (
            <Fragment key={i}>
              {emphasis.pads}
              <text
                x="0"
                y={baselineY}
                fontFamily={ctx.fonts.body}
                fontSize={l.fontSize}
                fill={ctx.colors.text}
                dominantBaseline="alphabetic"
              >
                {emphasis.tspans}
                {/* The ellipsis is not decoration: `data-truncated` means "cut
                    short with an ellipsis" to both `deck-audit.ts`'s own message
                    and `docs/cli.md`, and without a visible mark the reader has
                    no way to know the tail is missing. Appended as its own run
                    on the last visible line so it survives whatever emphasis
                    spans that line happens to end with. */}
                {truncated && i === visible.length - 1 ? <tspan fill={ctx.colors.text}>…</tspan> : null}
              </text>
            </Fragment>
          )
        })}
      </g>
    )
  },
}

export const renderDef: RenderDef<ParagraphComponent> = { type: "paragraph", measure: paragraph.measure, render: paragraph.render }
