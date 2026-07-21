import type { Component } from "@/ir"
import {
  measureMonoTextUnits,
  truncateToMonoUnits,
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
// Mono-role width math (borrow-wave Task 3 fix round, 2026-07-21):
// `resolveLayout` below sizes code text with `measureMonoTextUnits`
// (svg-text-layout.ts) — an *exact* per-glyph model (Consolas's own hmtx
// advance, 0.5498 em/char, uniform across every character class because
// Consolas is a monospace face — full arithmetic, dual independent
// verification, and the CJK exception live in that function's own
// derivation comment), not a proportional estimate to be corrected with a
// safety factor after the fact.
//
// That replaces this same task's first-round approach (same day): run
// `measureTextUnits`'s *proportional* per-character-class weights —
// calibrated for variable-width faces — through a single fixed
// `MONO_WIDTH_SAFETY` multiplier (0.82) meant to cover the gap between
// that estimate and Consolas's real width. Task 3's review proved that
// approach has a hole with no ceiling: deep indentation is almost entirely
// the single most-underestimated character class (space, +57.1% real-vs-
// assumed), so the gap widens as indentation gets deeper and a fixed
// factor can't chase it. An 8/16/24/32-space-indented closer (e.g.
// `"        });"`) deviates +44.69% / +49.66% / +51.79% / +52.97% from the
// proportional estimate — every one of those blows through the 0.82
// factor's ~22% headroom (`1/0.82 - 1 ≈ 21.95%`), and 24-32-space
// indentation (6-8 levels of 4-space nesting) is not a contrived depth in
// real code. Confirmed red: rendering that family through the old
// proportional-weights + 0.82 pipeline at a narrow (200px) box overflows
// the box at indent 16 and 24 (the old estimate is confident enough that
// truncation never even engages), and still overflows at indent 32 even
// though truncation *does* engage there — the old approach's own
// character-budget for "how much to keep" is derived from the same
// underestimating formula, so cutting the line short doesn't fix it. The
// exact model below never overflows, at any of the four depths (see
// MONO_DEEP_INDENT_FIXTURES in code.test.tsx, a permanent regression, and
// task-3-review.md's Important-2 finding, borrow-wave scratchpad, not
// shipped in this repo). The exact model has no proportional estimate
// left to under-shoot, so there's nothing left for a safety factor to
// correct for *width-estimation error*.
//
// `MONO_WIDTH_SAFETY` therefore no longer budgets estimation-error
// headroom. The only distinct risk a residual could still budget for is
// *font-substitution* variance — but this task's export target is a stock
// Windows/PowerPoint install, where `fonts.ts`'s SAFE_FONTS membership is
// specifically designed to guarantee Consolas itself is present there, not
// a substitute. The only substitution actually measured in this task hit a
// *different* pipeline stage — this macOS dev rig's in-browser SVG
// preview, where bare-name "Consolas" resolution silently falls back to
// the OS generic monospace face (task-3-report.md §2.2) — and that one
// data point (16.2368 em vs Consolas's real 21.4424 em for the same
// 39-character sample) runs narrower, i.e. safe-direction, not dangerous.
// Real Windows-rig substitution risk for the actual export target was an
// explicitly disclosed, unmeasured gap (task-3-report.md §7), not a
// measured safe-direction one — so unlike the preview-fallback data point,
// there's no data at all to size a dangerous-direction residual from
// either. Per this task's controlling ruling (no residual without data
// behind it): no multiplier.
const MONO_WIDTH_SAFETY = 1.0

function resolveLayout(lines: string[], w: number) {
  const contentW = (w - 2 * PADDING - LINE_NUM_COL) * MONO_WIDTH_SAFETY
  const longestUnits = Math.max(...lines.map(measureMonoTextUnits), 0)

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
    measureMonoTextUnits(line) > maxUnitsAtFloor
      ? truncateToMonoUnits(line, maxUnitsAtFloor)
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
