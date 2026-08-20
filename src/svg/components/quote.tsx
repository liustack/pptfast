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
 * em box — visible ink runs roughly from the top of the box down to
 * halfway to the baseline, so the mark stops well above its own baseline.
 * Reserving the *baseline* plus a gap (the pre-2026-08-15 behaviour: zone
 * 60 against a baseline of 44) therefore left the mark floating far above
 * the text it opens, which the visual review flagged on every quote page
 * it saw.
 *
 * The zone is sized off the mark's ink rather than its baseline, and the
 * mark's baseline is derived from that same ink (see
 * {@link MARK_INK_DEPTH_RATIO}) rather than hand-tuned.
 */
const MARK_FONT_SIZE = 64
const QUOTE_ZONE = 34
const BODY_FONT_SIZE = 26

/**
 * Where the open-quote glyph's ink stops above its own baseline, as a
 * fraction of {@link MARK_FONT_SIZE}.
 *
 * Measured, not guessed — the earlier 0.42 in this comment was a guess and
 * was wrong by half a line. Rasterizing U+201C at 64px on every registered
 * theme's resolved body stack and reading back the ink rows gives 0.48 on
 * the serif stack (Georgia) and 0.55 on the CJK-first stacks (Microsoft
 * YaHei falling back to PingFang SC), with a Chromium render of the real
 * quote page reading 0.50 at whole-pixel resolution. 0.49 is that spread's
 * middle.
 */
const MARK_INK_DEPTH_RATIO = 0.49

/**
 * Where a body line's ink starts above its baseline, as a fraction of
 * {@link BODY_FONT_SIZE}. Measured the same way: a 26px italic body line
 * puts its ink top 21px above the baseline.
 */
const BODY_INK_ASCENT_RATIO = 0.81

/** Optical air left between the mark's ink and the first body line's ink. */
const MARK_TO_BODY_AIR = 14

/**
 * Ink-derived, so changing either font size can no longer leave the mark
 * hanging: from the first body line's ink top, walk up the air, then down
 * to where the mark's own ink stops. Lands on 56 at today's sizes — the
 * per-font spread above puts the real air at 15px on the serif stack and
 * 18px on the CJK-first ones, both well inside the one line it used to be.
 * Whole pixels only: `measure()` and every body/attribution baseline are
 * integers, and a fractional mark baseline would be the only non-integer
 * coordinate this component emits.
 */
const MARK_BASELINE = Math.round(
  QUOTE_ZONE + BODY_FONT_SIZE * (1 - BODY_INK_ASCENT_RATIO) - MARK_TO_BODY_AIR + MARK_FONT_SIZE * MARK_INK_DEPTH_RATIO,
)
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
