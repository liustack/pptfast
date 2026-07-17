import type { Component } from "@/ir"
import {
  measureTextUnits,
  truncateToUnits,
} from "../../lib/svg-text-layout"
import type { SvgComponent } from "./types"

type CodeComponent = Extract<Component, { type: "code" }>

const BASE_FONT_SIZE = 15
const BASE_LINE_HEIGHT = 22
const PADDING = 14
const LINE_NUM_COL = 40
const MIN_FONT_SIZE = 9
const BG_COLOR = "#1E1E1E"
const TEXT_COLOR = "#D4D4D4"
const LINE_NUM_COLOR = "#6A737D"
const BORDER_RADIUS = 6
const LINE_HEIGHT_RATIO = 1.45
// `measureTextUnits` per-character weights (0.46-0.66 by character class) were
// calibrated against proportional (variable-width) fonts. Code renders in
// `ctx.fonts.mono` — a real monospace face (Menlo on the Mac audit rig, once
// the font-stack fallback in fonts.ts made it reachable) whose fixed advance
// width per character runs ~5-6% wider than that average for typical
// identifier-heavy code (more lowercase/underscore/digit characters than the
// heuristic's mixed-case assumption). Shave the fitting budget by the same
// margin so the shrink-to-fit and truncate-at-floor math stay accurate for
// the font that's actually rendering, not just the estimator's model of it.
const MONO_WIDTH_SAFETY = 0.9

function resolveLayout(lines: string[], w: number) {
  const contentW = (w - 2 * PADDING - LINE_NUM_COL) * MONO_WIDTH_SAFETY
  const longestUnits = Math.max(...lines.map(measureTextUnits), 0)

  let fontSize = BASE_FONT_SIZE
  let lineHeight = BASE_LINE_HEIGHT

  if (longestUnits * fontSize > contentW && longestUnits > 0) {
    fontSize = Math.max(MIN_FONT_SIZE, Math.floor(contentW / longestUnits))
    lineHeight = Math.round(fontSize * LINE_HEIGHT_RATIO)
  }

  // Shrinking alone bottoms out at MIN_FONT_SIZE. A single unbroken token
  // (no spaces to wrap on, e.g. a long identifier) can still be wider than
  // the box at that floor — truncate per line instead of letting it escape.
  // Code lines must not re-wrap mid-token, so truncation (not wrapping) is
  // the code-appropriate degradation here.
  const maxUnitsAtFloor = contentW / fontSize
  const renderLines = lines.map((line) =>
    measureTextUnits(line) > maxUnitsAtFloor
      ? truncateToUnits(line, maxUnitsAtFloor)
      : line,
  )

  const textStartX = PADDING + LINE_NUM_COL
  const height = lines.length * lineHeight + 2 * PADDING

  return { fontSize, lineHeight, textStartX, height, renderLines }
}

export const code: SvgComponent<CodeComponent> = {
  measure(component, w) {
    const lines = component.code.split("\n")
    const { height } = resolveLayout(lines, w)
    return height
  },
  render(component, box, ctx) {
    const lines = component.code.split("\n")
    const { fontSize, lineHeight, textStartX, height, renderLines } =
      resolveLayout(lines, box.w)

    return (
      <g transform={`translate(${box.x},${box.y})`}>
        <rect
          x={0}
          y={0}
          width={box.w}
          height={height}
          rx={BORDER_RADIUS}
          fill={BG_COLOR}
        />
        {renderLines.map((line, i) => (
          <g key={i}>
            <text
              x={PADDING + LINE_NUM_COL - 8}
              y={PADDING + i * lineHeight + fontSize}
              fontFamily={ctx.fonts.mono}
              fontSize={fontSize}
              fill={LINE_NUM_COLOR}
              dominantBaseline="alphabetic"
              textAnchor="end"
            >
              {i + 1}
            </text>
            <text
              x={textStartX}
              y={PADDING + i * lineHeight + fontSize}
              fontFamily={ctx.fonts.mono}
              fontSize={fontSize}
              fill={TEXT_COLOR}
              dominantBaseline="alphabetic"
              xmlSpace="preserve"
            >
              {line}
            </text>
          </g>
        ))}
      </g>
    )
  },
}
