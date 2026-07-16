import type { Block } from "@/ir"
import { layoutSvgText } from "../../lib/svg-text-layout"
import { parseEmphasis, renderEmphasisTspans, sliceEmphasisForLines, stripEmphasis } from "../emphasis"
import type { SvgBlock } from "./types"

type ParagraphBlock = Extract<Block, { type: "paragraph" }>

const FONT_SIZE = 20
const LINE_RATIO = 1.4

function lay(text: string, w: number) {
  return layoutSvgText(stripEmphasis(text), {
    maxWidth: w,
    fontSize: FONT_SIZE,
    maxLines: 99, // wrap freely; never shrink/truncate a body paragraph
    lineHeightRatio: LINE_RATIO,
  })
}

export const paragraph: SvgBlock<ParagraphBlock> = {
  measure(block, w) {
    const l = lay(block.text, w)
    return l.lines.length * l.lineHeight
  },
  render(block, box, ctx) {
    const l = lay(block.text, box.w)
    const lineSegments = sliceEmphasisForLines(parseEmphasis(block.text), l.lines)
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {lineSegments.map((segments, i) => (
          <text
            key={i}
            x="0"
            y={i * l.lineHeight + l.fontSize}
            fontFamily={ctx.fonts.body}
            fontSize={l.fontSize}
            fill={ctx.colors.text}
            dominantBaseline="alphabetic"
          >
            {renderEmphasisTspans(segments, { accent: ctx.colors.accent, baseFill: ctx.colors.text })}
          </text>
        ))}
      </g>
    )
  },
}
