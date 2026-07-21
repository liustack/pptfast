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
// `ctx.fonts.mono`, which `resolveFontFace` (fonts.ts) resolves to Consolas
// for all 13 themes today (explicit for tech/journal, role-default fallback
// for the other 11 — none declare a `fonts.mono` stack of their own).
//
// Recalibrated 2026-07-21 (borrow-wave Task 3) against the real Consolas
// binary, not a stand-in: the previous comment's "~5-6% wider" figure came
// from Menlo (the Mac preview-fallback face `resolveFontStack` made
// reachable in the SVG preview), never the actual exported Consolas — a
// methodology gap flagged by the fact-finding audit this task closes.
// Method: read Consolas's own `hmtx` advance-width table directly (via
// fontTools, an independent, mature sfnt parser — not this estimator, not a
// rendering pipeline) from the genuine Consolas.ttf Microsoft ships inside
// Office for Mac's private font bundle. Identity confirmed both by that
// file's own `name` table (family/postscript name literally read "Consolas")
// and by every sampled character landing on the exact same advance width
// (0.5498 em) — the defining, unfakeable signature of a monospace font.
// Cross-checked against a second, independent method (real Chromium canvas
// `measureText`, loaded from the identical file via `@font-face`) for the
// two other calibration targets this task measured (Georgia, Microsoft
// YaHei): both methods agreed to 4 decimal places on every sample, so the
// same method's Consolas numbers are trusted without needing a second
// browser reading (Chrome's OTS sanitizer rejects this particular binary's
// `prep` table when loaded via `@font-face`, independent of the metrics
// question — see task-3-report.md).
//
// Real per-character-class deviation (10-string corpus spanning plain
// identifiers, operators/brackets, JSON, and deep indentation — positive =
// real wider than `measureTextUnits` assumes = dangerous, since `wrap:false`
// on export means an underestimate renders as visible horizontal overflow
// past the code block's background rect, not a caught/wrapped line):
// space +57.1%, "other"/punctuation +19.5%, uppercase -16.7% (safe),
// lowercase+digit -1.8% (safe). Realistic *whole-line* aggregates (what
// actually drives `resolveLayout`'s fit, since fontSize is set by whichever
// line `measureTextUnits` scores longest) ranged +0.0% to +18.5%, with the
// densest sample (an `if`/`&&`/`||` conditional — ordinary code, not a
// contrived edge case) at that +18.5% ceiling. The prior 0.9 factor (11.1%
// headroom) does not comfortably cover that ceiling. 0.82 budgets ~22%
// headroom — clears the observed +18.5% ceiling with margin for corpus
// variance beyond these 10 samples, without shrinking typical
// (lower-punctuation-density) code any further than necessary.
const MONO_WIDTH_SAFETY = 0.82

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
