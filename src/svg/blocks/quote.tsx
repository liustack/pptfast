import type { Block } from "@/ir"
import { fitSvgLine, layoutSvgText } from "../../lib/svg-text-layout"
import type { SvgBlock } from "./types"

type QuoteBlock = Extract<Block, { type: "quote" }>

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

export const quote: SvgBlock<QuoteBlock> = {
  measure(block, w, _ctx) {
    const l = layBody(block.text, w)
    const bodyHeight = l.lines.length * l.lineHeight
    const attrHeight = block.attribution ? l.lineHeight + ATTR_GAP : 0
    return QUOTE_ZONE + bodyHeight + attrHeight + BOTTOM_PAD
  },

  render(block, box, ctx) {
    const l = layBody(block.text, box.w)

    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {/* decorative open-quote mark */}
        <text
          x={0}
          y={44}
          fontSize={64}
          fill={ctx.colors.accent}
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
        {block.attribution && (() => {
          const attr = fitSvgLine(`— ${block.attribution}`, {
            maxWidth: box.w - BODY_INDENT * 2,
            fontSize: ATTR_FONT_SIZE,
            minFontSize: ATTR_MIN_FONT_SIZE,
          })
          return (
            <text
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
