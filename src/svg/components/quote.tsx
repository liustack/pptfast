import type { Component } from "@/ir"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import { accessibleInk } from "../ink"
import type { SvgComponent } from "./types"

type QuoteComponent = Extract<Component, { type: "quote" }>

/** Height of the decorative open-quote region (character baseline at 44, plus gap). */
const QUOTE_ZONE = 60
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
          y={44}
          fontSize={64}
          fill={accessibleInk(ctx.colors.accent, ctx.defaultBg ?? ctx.colors.bg, 64)}
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
