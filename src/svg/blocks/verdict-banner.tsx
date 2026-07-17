import type { Block } from "@/ir"
import { layoutSvgText } from "../../lib/svg-text-layout"
import {
  parseEmphasis,
  renderEmphasisTspans,
  sliceEmphasisForLines,
  stripEmphasis,
  truncateEmphasisSegments,
  type EmphasisSegment,
} from "../emphasis"
import { Icon } from "../icons"
import type { BlockCtx, SvgBlock } from "./types"

type VerdictBannerBlock = Extract<Block, { type: "verdict_banner" }>

/* ── Geometry ──
 * A full-width, more-prominent sibling of callout.tsx's left-bar treatment:
 * a bordered, tinted rounded strip instead of a surface card + accent bar —
 * "page-level conclusion", not "margin note" (mirrors the ppt-master green
 * verdict banner this task's brief describes — one full-bleed strip stating
 * the page's takeaway, vs. callout's smaller margin-note treatment).
 */
const RX = 10
const PAD_X = 24
const ICON_SIZE = 20
const GAP_ICON_TEXT = 12
const STROKE_WIDTH = 1.5
const FILL_OPACITY = 0.08

const FONT_SIZE = 18
const MAX_LINES = 2
// Bar height is a literal 2-state lookup (64 / 88px), not a grow-with-content
// measurement like callout's — chosen so the gap between the two states
// (88-64=24) is exactly one line box, i.e. PAD_Y(20)*2 + n*LINE_HEIGHT(24):
// 1 line -> 40+24=64, 2 lines -> 40+48=88.
const LINE_HEIGHT = 24
const PAD_Y = 20
const HEIGHT_ONE_LINE = PAD_Y * 2 + LINE_HEIGHT // 64
const HEIGHT_TWO_LINE = PAD_Y * 2 + 2 * LINE_HEIGHT // 88

/** tone -> hex color. Only positive/warning have a light/dark pair here —
 * neutral deliberately bypasses this table (see `toneColor`) and reuses
 * whatever `muted` the active theme already resolved, so it never needs its
 * own light/dark variant. */
const TONE_COLORS: Record<
  "positive" | "warning",
  { base: string; dark: string }
> = {
  positive: { base: "#2E9E6B", dark: "#4FBF8B" },
  warning: { base: "#D9822B", dark: "#E8A159" },
}

/**
 * Perceived brightness (0-255) of a `#RRGGBB` hex color — a simple weighted-RGB
 * relative luminance. `StyleColors` (themes/tokens.ts) has no explicit
 * dark/light flag, and no luminance/brightness utility exists elsewhere in the
 * repo (checked before writing this), so this is the "relative luminance 简式"
 * fallback the brief calls for. Only used to pick the tone's light/dark variant
 * below — not exported, not a general-purpose color utility.
 */
function perceivedBrightness(hex: string): number {
  const clean = hex.replace("#", "")
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/** Dark-background themes in the current 6-theme set: tech (#060A13)
 * and creative (#0A0A0C), both far below the midpoint threshold; every
 * other theme's `bg` is a light neutral far above it (consulting #F7F7F2,
 * academic #FAFAF6, custom #FFFFFF, magazine #FAF7F2) — checked
 * against every theme token file before picking 128 as the threshold. */
function isDarkTheme(colors: { bg: string }): boolean {
  return perceivedBrightness(colors.bg) < 128
}

/** Resolve `tone` to a hex color, theme-darkness-aware for positive/warning.
 * `neutral` bypasses the table entirely — `ctx.colors.muted` is already the
 * right color for either light or dark themes, so there's nothing to switch. */
function toneColor(tone: VerdictBannerBlock["tone"], ctx: BlockCtx): string {
  if (tone === "neutral") return ctx.colors.muted
  const entry = TONE_COLORS[tone]
  return isDarkTheme(ctx.colors) ? entry.dark : entry.base
}

/** Text start x — shifts left to flush with PAD_X when there's no icon. */
function textX(hasIcon: boolean): number {
  return hasIcon ? PAD_X + ICON_SIZE + GAP_ICON_TEXT : PAD_X
}

interface Laid {
  lineSegments: EmphasisSegment[][]
  height: number
}

/**
 * Shared measure/render layout: wraps `block.text` (strip-emphasis'd) to at
 * most `MAX_LINES` via `layoutSvgText`, then maps emphasis back onto those
 * *pre-truncation* lines and truncates each one — in that order, per Task 1's
 * established contract (see `emphasis.ts`'s `sliceEmphasisForLines` docstring:
 * slice-for-lines first, `truncateEmphasisSegments` after, never the reverse).
 *
 * Deliberately ignores `layoutSvgText`'s own returned `fontSize`/`lineHeight`
 * — this block always renders at a fixed 18px (unlike icon-cards/steps, whose
 * title/text may shrink), so a line `layoutSvgText` had to loosen past its
 * natural per-line budget (to squeeze long content into MAX_LINES) can still
 * be too wide at our fixed FONT_SIZE. `truncateEmphasisSegments` against
 * `textW / FONT_SIZE` catches exactly that case — same fix bullets.tsx applies
 * at its own clamped floor font size.
 */
function lay(block: VerdictBannerBlock, w: number): Laid {
  const hasIcon = Boolean(block.icon)
  const tx = textX(hasIcon)
  const textW = Math.max(1, w - tx - PAD_X)
  const l = layoutSvgText(stripEmphasis(block.text), {
    maxWidth: textW,
    fontSize: FONT_SIZE,
    maxLines: MAX_LINES,
    lineHeightRatio: LINE_HEIGHT / FONT_SIZE,
  })
  const maxUnits = textW / FONT_SIZE
  const lineSegments = sliceEmphasisForLines(
    parseEmphasis(block.text),
    l.lines
  ).map((segs) => truncateEmphasisSegments(segs, maxUnits))
  const height = lineSegments.length <= 1 ? HEIGHT_ONE_LINE : HEIGHT_TWO_LINE
  return { lineSegments, height }
}

export const verdictBanner: SvgBlock<VerdictBannerBlock> = {
  measure(block, w) {
    return lay(block, w).height
  },
  render(block, box, ctx) {
    const { lineSegments, height } = lay(block, box.w)
    const hasIcon = Boolean(block.icon)
    const tone = toneColor(block.tone, ctx)
    const tx = textX(hasIcon)
    const textBlockH = lineSegments.length * LINE_HEIGHT
    const textTopY = (height - textBlockH) / 2
    return (
      <g
        transform={`translate(${box.x},${box.y})`}
        data-audit-box={`${box.x},${box.y},${box.w}`}
        data-audit-rect={`${box.x},${box.y},${box.w},${height}`}
      >
        <rect
          x={0}
          y={0}
          width={box.w}
          height={height}
          rx={RX}
          fill={tone}
          fillOpacity={FILL_OPACITY}
          stroke={tone}
          strokeWidth={STROKE_WIDTH}
        />
        {block.icon && (
          <Icon
            name={block.icon}
            x={PAD_X}
            y={(height - ICON_SIZE) / 2}
            size={ICON_SIZE}
            color={tone}
          />
        )}
        {lineSegments.map((segments, i) => (
          <text
            key={i}
            x={tx}
            y={textTopY + i * LINE_HEIGHT + FONT_SIZE}
            fontFamily={ctx.fonts.body}
            fontSize={FONT_SIZE}
            fontWeight="600"
            fill={ctx.colors.text}
            dominantBaseline="alphabetic"
          >
            {renderEmphasisTspans(segments, {
              accent: tone,
              baseFill: ctx.colors.text,
              fontWeight: "700",
            })}
          </text>
        ))}
      </g>
    )
  },
}
