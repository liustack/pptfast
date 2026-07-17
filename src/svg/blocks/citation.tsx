import type { Block } from "@/ir"
import {
  fitSvgLine,
  measureTextUnits,
  truncateToUnits,
} from "../../lib/svg-text-layout"
import type { SvgBlock } from "./types"

type CitationBlock = Extract<Block, { type: "citation" }>

const ROW = 28
const LABEL_FONT_SIZE = 18
const LABEL_MIN_FONT_SIZE = 13
const URL_FONT_SIZE = 14

/** Baseline y for source row `i`, relative to the block group origin. */
function baselineY(i: number): number {
  return i * ROW + 18
}

export const citation: SvgBlock<CitationBlock> = {
  measure(block) {
    return block.sources.length * ROW
  },
  render(block, box, ctx) {
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {block.sources.map((source, i) => {
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
      </g>
    )
  },
}
