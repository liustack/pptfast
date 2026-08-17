import type { Component } from "@/ir"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { accessibleInk } from "../ink"
import type { RenderDef, SvgComponent } from "./types"

type QuoteComponent = Extract<Component, { type: "quote" }>

/**
 * Vertical space reserved above the first body line for the decorative
 * open-quote mark.
 *
 * The mark is set at {@link MARK_FONT_SIZE} on a baseline of
 * {@link MARK_BASELINE}, and a quotation glyph carries its ink high in the
 * em box — visible ink runs roughly from the top of the box down to a third
 * of the way to the baseline, so the mark stops well above its own
 * baseline. Reserving the *baseline* plus a gap (the pre-2026-08-15
 * behaviour: zone 60 against a baseline of 44) therefore left the mark
 * floating far above the text it opens, which the visual review flagged on
 * every quote page it saw.
 *
 * Sized off the mark's ink rather than its baseline: the ink ends near
 * `MARK_BASELINE - MARK_FONT_SIZE * 0.42`, and this leaves a deliberate
 * ~14px of air under it before the first line's ascender.
 */
const MARK_FONT_SIZE = 64
const MARK_BASELINE = 40
const QUOTE_ZONE = 34
const BODY_FONT_SIZE = 26
const BODY_LINE_RATIO = 1.35
const BODY_INDENT = 20
const ATTR_FONT_SIZE = 20
const ATTR_MIN_FONT_SIZE = 13
const ATTR_GAP = 8
const BOTTOM_PAD = 12

function layBody(text: string, w: number) {
  return layoutSvgText(text, {
    maxWidth: w - BODY_INDENT * 2,
    fontSize: BODY_FONT_SIZE,
    maxLines: 99,
    lineHeightRatio: BODY_LINE_RATIO,
  })
}

export const quote: SvgComponent<QuoteComponent> = {
  measure(component, w, _ctx) {
    const l = layBody(component.text, w)
    const bodyHeight = l.lines.length * l.lineHeight
    const attrHeight = component.attribution ? l.lineHeight + ATTR_GAP : 0
    return QUOTE_ZONE + bodyHeight + attrHeight + BOTTOM_PAD
  },

  render(component, box, ctx) {
    const l = layBody(component.text, box.w)

    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {/* decorative open-quote mark. Bench-driven fix round, defect B:
            this component paints no card of its own, so the mark sits
            directly on the page's ambient default background —
            `ctx.defaultBg ?? colors.bg`, same fallback every other
            card-less component in this codebase uses. `colors.accent`
            unwrapped measured well under the 3:1 large-text floor on
            several themes once actually re-measured against a real render
            (heritage 2.61:1, consulting 1.45:1 — the latter already a
            known, pinned pre-existing case; the fix clears both the same
            way) — `accessibleInk` keeps `colors.accent` on every theme
            that already passed, byte-identical. */}
        <text
          x={0}
          y={MARK_BASELINE}
          fontSize={MARK_FONT_SIZE}
          fill={accessibleInk(ctx.colors.accent, ctx.defaultBg ?? ctx.colors.bg, MARK_FONT_SIZE)}
          fontFamily={ctx.fonts.body}
          dominantBaseline="alphabetic"
        >
          {"“"}
        </text>

        {/* body lines (italic) */}
        {l.lines.map((line, i) => (
          <text
            key={i}
            x={BODY_INDENT}
            y={QUOTE_ZONE + i * l.lineHeight + l.fontSize}
            fontFamily={ctx.fonts.body}
            fontSize={l.fontSize}
            fontStyle="italic"
            fill={ctx.colors.text}
            dominantBaseline="alphabetic"
          >
            {line}
          </text>
        ))}

        {/* attribution: single line, shrunk/truncated to the box width — a
            narrow theme column (e.g. magazine's 880 content column)
            can't fit an unbounded "— {attribution}" at fixed size. */}
        {component.attribution && (() => {
          const attr = fitSvgLine(`— ${component.attribution}`, {
            maxWidth: box.w - BODY_INDENT * 2,
            fontSize: ATTR_FONT_SIZE,
            minFontSize: ATTR_MIN_FONT_SIZE,
          })
          return (
            <text
              data-truncated={attr.truncated ? "1" : undefined}
              x={BODY_INDENT}
              y={QUOTE_ZONE + l.lines.length * l.lineHeight + ATTR_GAP + ATTR_FONT_SIZE}
              fontFamily={ctx.fonts.body}
              fontSize={attr.fontSize}
              fill={ctx.colors.muted}
              dominantBaseline="alphabetic"
            >
              {attr.text}
            </text>
          )
        })()}
      </g>
    )
  },
}

export const renderDef: RenderDef<QuoteComponent> = { type: "quote", measure: quote.measure, render: quote.render }
