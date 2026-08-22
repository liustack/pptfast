import type { Component } from "@/ir"
import { layoutSvgText } from "../../lib/svg-text-layout"
import {
  parseEmphasis,
  renderEmphasisText,
  sliceEmphasisForLines,
  stripEmphasis,
  truncateEmphasisSegments,
  type EmphasisSegment,
} from "../emphasis"
import { Icon } from "../icons"
import type { ComponentCtx, RenderDef, SvgComponent } from "./types"

type VerdictBannerComponent = Extract<Component, { type: "verdict_banner" }>

/* ── Editorial conclusion geometry ──
 * A page verdict is editorial hierarchy, not an application alert. The
 * component therefore uses a short semantic-color mark over a quiet rule and
 * lets typography carry the conclusion. Width controls the rhythm: a wide
 * page row gets larger type and a longer mark, while a column-width slot stays
 * compact without reverting to a rounded notification card.
 */
const WIDE_BREAKPOINT = 760
const RULE_HEIGHT = 4
const ICON_SIZE = 22
const ICON_GAP = 16
const MAX_LINES = 2

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

interface Geometry {
  fontSize: number
  lineHeight: number
  markWidth: number
  verticalGap: number
}

function geometry(w: number, bodyFontPx: number): Geometry {
  if (w >= WIDE_BREAKPOINT) {
    return {
      fontSize: clamp(bodyFontPx + 2, 24, 28),
      lineHeight: clamp(bodyFontPx + 2, 24, 28) + 8,
      markWidth: 64,
      verticalGap: 16,
    }
  }
  return {
    fontSize: clamp(bodyFontPx, 22, 24),
    lineHeight: clamp(bodyFontPx, 22, 24) + 7,
    markWidth: 48,
    verticalGap: 14,
  }
}

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
function toneColor(tone: VerdictBannerComponent["tone"], ctx: ComponentCtx): string {
  if (tone === "neutral") return ctx.colors.muted
  const entry = TONE_COLORS[tone]
  return isDarkTheme(ctx.colors) ? entry.dark : entry.base
}

/** Text stays flush with the editorial rule unless an authored icon leads it. */
function textX(hasIcon: boolean): number {
  return hasIcon ? ICON_SIZE + ICON_GAP : 0
}

interface Laid {
  lineSegments: EmphasisSegment[][]
  /** Per-line: did `truncateEmphasisSegments` actually cut this line (bench-
   *  driven fix round, defect E — the verdict_banner ellipsis the benchmark
   *  caught by eyeballing)? Parallel to `lineSegments`. */
  lineTruncated: boolean[]
  height: number
  geometry: Geometry
}

/**
 * Shared measure/render layout: wraps `component.text` (strip-emphasis'd) to at
 * most `MAX_LINES` via `layoutSvgText`, then maps emphasis back onto those
 * *pre-truncation* lines and truncates each one — in that order, per Task 1's
 * established contract (see `emphasis.ts`'s `sliceEmphasisForLines` docstring:
 * slice-for-lines first, `truncateEmphasisSegments` after, never the reverse).
 *
 * The chosen responsive size is fixed for one width/body-scale pair. A line
 * `layoutSvgText` had to loosen past its natural per-line budget can therefore
 * still be too wide at that size. `truncateEmphasisSegments` against the same
 * geometry catches that case.
 */
function lay(
  component: VerdictBannerComponent,
  w: number,
  fontFamily: string,
  bodyFontPx: number,
): Laid {
  const hasIcon = Boolean(component.icon)
  const tx = textX(hasIcon)
  const g = geometry(w, bodyFontPx)
  const textW = Math.max(1, w - tx)
  // bold-metrics fix (2026-07-24): every line renders `fontWeight="600"` on
  // its outer `<text>` below (the *base*, non-emphasized weight — emphasis
  // spans go bolder still, 700, via `renderEmphasisText`, but that's not
  // this component's exemption case: unlike a layout subheading whose
  // *unmarked* text defaults to Regular and only `**marked**` runs go bold,
  // every character of this component's line is already bold before
  // emphasis is even considered). audit-baseline.test.ts's own "if a case
  // fails, the residual overflow is real and belongs to the renderer"
  // policy caught this the same way it caught kpi/BigNumber/steps/content-
  // bento-panel's own value/title text (see those files' identical fix).
  const l = layoutSvgText(stripEmphasis(component.text), {
    maxWidth: textW,
    fontSize: g.fontSize,
    maxLines: MAX_LINES,
    lineHeightRatio: g.lineHeight / g.fontSize,
    bold: true,
    fontFamily,
  })
  const maxUnits = textW / g.fontSize
  const sliced = sliceEmphasisForLines(parseEmphasis(component.text), l.lines)
  const lineSegments = sliced.map((segs) =>
    truncateEmphasisSegments(segs, maxUnits, { bold: true, fontFamily }),
  )
  // A line actually lost characters iff its post-truncation text differs
  // from its pre-truncation text (bench-driven fix round, defect E — see
  // bullets.tsx's identical pattern for the same reasoning).
  const lineTruncated = sliced.map(
    (before, i) => before.map((s) => s.text).join("") !== lineSegments[i].map((s) => s.text).join(""),
  )
  const height = RULE_HEIGHT + 2 * g.verticalGap + lineSegments.length * g.lineHeight
  return { lineSegments, lineTruncated, height, geometry: g }
}

export const verdictBanner: SvgComponent<VerdictBannerComponent> = {
  // bold-metrics fix (2026-07-24): `ctx` now read here (previously unused
  // by this component's `measure`) so this phase's own `lay()` call agrees
  // with `render`'s — both must resolve the same line count (1 vs 2, this
  // component's only `height` input) from the same bold/face-aware
  // estimate, or the box `render` draws into can silently disagree with
  // the height `measure` reserved for it upstream.
  measure(component, w, ctx) {
    return lay(component, w, ctx.fonts.body, ctx.bodyFontPx).height
  },
  render(component, box, ctx) {
    const { lineSegments, lineTruncated, height, geometry: g } = lay(
      component,
      box.w,
      ctx.fonts.body,
      ctx.bodyFontPx,
    )
    const hasIcon = Boolean(component.icon)
    const tone = toneColor(component.tone, ctx)
    const tx = textX(hasIcon)
    const textTopY = RULE_HEIGHT + g.verticalGap
    return (
      <g
        transform={`translate(${box.x},${box.y})`}
        data-audit-box={`${box.x},${box.y},${box.w}`}
        data-audit-rect={`${box.x},${box.y},${box.w},${height}`}
      >
        <line
          x1={g.markWidth}
          y1={RULE_HEIGHT / 2}
          x2={box.w}
          y2={RULE_HEIGHT / 2}
          stroke={ctx.colors.border ?? ctx.colors.muted}
          strokeWidth={1}
        />
        <rect x={0} y={0} width={g.markWidth} height={RULE_HEIGHT} fill={tone} />
        {component.icon && (
          <Icon
            name={component.icon}
            x={0}
            y={textTopY + (g.lineHeight - ICON_SIZE) / 2}
            size={ICON_SIZE}
            color={tone}
          />
        )}
        {lineSegments.map((segments, i) =>
          renderEmphasisText(
            segments,
            {
              accent: tone,
              padFill: ctx.colors.accent,
              baseFill: ctx.colors.text,
              fontWeight: "700",
              themeId: ctx.themeId,
              measureWeight: { bold: true, fontFamily: ctx.fonts.body },
            },
            <text
              key={i}
              data-truncated={lineTruncated[i] ? "1" : undefined}
              x={tx}
              y={textTopY + i * g.lineHeight + g.fontSize}
              fontFamily={ctx.fonts.body}
              fontSize={g.fontSize}
              fontWeight="600"
              fill={ctx.colors.text}
              dominantBaseline="alphabetic"
            />,
          ),
        )}
      </g>
    )
  },
}

export const renderDef: RenderDef<VerdictBannerComponent> = { type: "verdict_banner", measure: verdictBanner.measure, render: verdictBanner.render }
