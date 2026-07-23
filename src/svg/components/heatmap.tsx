import type { Component } from "@/ir"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { mixHex } from "./color-mix"
import { accessibleInk, contrastRatio, readableOn } from "../ink"
import type { ComponentCtx, SvgComponent } from "./types"

type HeatmapComponent = Extract<Component, { type: "heatmap" }>

/**
 * Value-driven color grid (structure-components wave 2 task 2): shape comes
 * straight from `x_labels`/`y_labels` (cols = x_labels.length, rows =
 * y_labels.length — no separate numeric `cols`/`rows` field to drift out of
 * sync, `ir/index.ts`'s own `.refine` chain enforces `values` stays exactly
 * that rectangle). Every cell's fill is a deterministic single-hue
 * luminance interpolation from `colors.surface` toward `colors.primary`
 * (`cellFill` below) — the same `mixHex` primitive `matrix.tsx`'s `toneFill`
 * already uses, not a new color system (plan ruling 5: "禁止自造脱离主题的
 * 色系"). Optional per-cell value text (`show_values`), when on, measures
 * its ink against *that cell's own computed fill* via `accessibleInk`
 * (`contrast-system.md`'s self-painted-surface discipline) — three
 * deterministic links, value → color → ink, each independently verifiable.
 *
 * Two geometry precedents this file explicitly reuses rather than
 * reinventing:
 *  - `matrix.tsx`'s x_title (top band)/y_title (left, stacked-vertical-char
 *    column) fit machinery — ported near-verbatim (`yTitleStackHeight`/
 *    `maxYTitleChars`/`fitYTitleStack` below are the identical arithmetic,
 *    renamed only to avoid a cross-file name collision) together with its
 *    hard-won gutter lesson: reserve a band's height only when the field is
 *    actually present, and subtract it from whichever one of
 *    measure()'s-own-fallback/box.h *actually includes it* — never both
 *    (matrix.tsx's own `render` doc comment has the full incident writeup).
 *    `x_title`/`y_title` here describe the *whole* axis (optional, e.g.
 *    "Quarter") — a distinct field from `x_labels`/`y_labels`, which are the
 *    mandatory per-column/per-row headers themselves.
 *  - `chart.tsx`/`chart-svg.tsx`'s box.h-independent category-label
 *    treatment: `x_labels`/`y_labels` render with `colors.muted` (the same
 *    token `chart-svg.tsx`'s category ticks use) directly on the ambient
 *    page background — pre-verified 4.5:1-safe in every theme
 *    (`MUTED_SURFACE_CLASS`'s "page-bg" class) — while the *cell* value text
 *    is the one surface here that actually needs a fresh `accessibleInk`
 *    measurement, because unlike a category tick it sits on a self-painted,
 *    per-cell computed fill, not the page background.
 *
 * Degenerate domain (`domain.min === domain.max`, either explicit or every
 * value in `values` happening to be equal): `valueT` returns a flat 0.5 for
 * every cell instead of dividing by a zero range — deterministic, no
 * NaN/Infinity, matching the "provably non-degenerate domain floor"
 * discipline `gantt.tsx`'s `axisBounds`/`chart-svg.tsx`'s `renderDumbbell`
 * `vx()` fix already established for this codebase's other value→geometry
 * mappings. Values feed *color* here, never geometry (cell rect extents come
 * from `x_labels.length`/`y_labels.length` alone, schema-capped at 10×10) —
 * so `MAX_CHART_GEOMETRY_PX`'s own EMU-overflow trap has no analog to guard
 * here; `generate-heatmap-export.test.ts` verifies an extreme-magnitude
 * value (feeding only `valueT`'s ratio, clamped to [0,1]) exports cleanly
 * through the real `generatePptx`, confirming this by construction rather
 * than only asserting it in prose.
 */

const CELL_GAP = 3
const CELL_RADIUS = 3
const NATURAL_CELL_H = 36
const ROW_LABEL_W = 96
const ROW_LABEL_PAD = 8
const COL_LABEL_H = 26
const COL_LABEL_PAD = 4
const CELL_PAD = 4
const ROW_LABEL_FONT = 12
const ROW_LABEL_MIN_FONT = 9
const COL_LABEL_FONT = 11
const COL_LABEL_MIN_FONT = 9
const VALUE_FONT = 12
const VALUE_MIN_FONT = 9
const X_TITLE_H = 30
const Y_TITLE_W = 34
const AXIS_SIZE = 13

/**
 * Floor on the ramp's interpolation fraction (`valueT`'s output is always
 * remapped through this before `mixHex`) — without it, the lowest-value
 * cell (`t=0`) would paint exactly `colors.surface`, which in several
 * themes is indistinguishable from (or identical to) the ambient page
 * background a full-body component renders directly onto, silently erasing
 * that cell's own boundary. 0.12 keeps every cell — including the coolest
 * one in an otherwise-uniform grid — at a faint but real, visually distinct
 * tint, the same "never fully transparent into the page" concern
 * `matrix.tsx`'s default `toneFill` (`mixHex(surface, muted, 0.08)`, always
 * at least an 8% tint) already encodes for its own neutral tone.
 */
const RAMP_MIN_T = 0.12

/**
 * Normalize `v` into [0,1] against `domain`. A degenerate domain
 * (`max <= min` — every value equal, or an explicit same-value override)
 * returns a flat 0.5 rather than dividing by zero: every cell in that grid
 * reads as one uniform mid-tone, the honest visual answer for "no variance
 * to show." An in-domain value outside an explicit narrower `domain`
 * override clamps to [0,1] rather than overshooting the ramp.
 */
function valueT(v: number, domain: { min: number; max: number }): number {
  const range = domain.max - domain.min
  if (range <= 0) return 0.5
  return Math.max(0, Math.min(1, (v - domain.min) / range))
}

function resolveDomain(component: HeatmapComponent): { min: number; max: number } {
  if (component.domain) return component.domain
  const flat = component.values.flat()
  return { min: Math.min(...flat), max: Math.max(...flat) }
}

/** `requiredContrastRatio(fontSizePx)`'s own body-text floor — always the
 * applicable one here since `VALUE_FONT`/`VALUE_MIN_FONT` (12/9) both sit
 * far under `LARGE_TEXT_MIN_PX` (24), so the relaxed 3:1 large-text ratio
 * never applies to a heatmap cell's value text. Hard-coded rather than
 * threaded through as a parameter for that reason — see `ink.ts`'s own
 * `requiredContrastRatio`. */
const INK_SAFE_RATIO = 4.5

/** Deterministic step size (in `eased` units) `safeEased`'s search advances
 * by — small enough that the resulting fill visibly still reads as
 * "adjacent" to the raw lerp's own color, large enough that the whole
 * [0,1] range resolves in well under `EASED_STEP`'s own iteration cap. */
const EASED_STEP = 0.01

/**
 * WCAG's own worst-case contrast band (empirically confirmed against real
 * theme tokens, not just derived on paper — see the fix-round test failures
 * this constant's introduction closed): for a background whose relative
 * luminance sits in ≈0.183-0.194 (scanned directly against this codebase's
 * real `DARK_INK`/`LIGHT_INK` constants, `ink.ts` — not a paper estimate),
 * *neither* `readableOn`'s near-black (`#0A0E14`, not literally
 * 0-luminance) nor pure white clears 4.5:1 — the two-ink comparison's own
 * break-even point (`ink.ts`'s `LUMINANCE_INK_THRESHOLD` doc comment names
 * ~0.19) sits exactly where the *achievable* contrast from either candidate
 * dips to ~4.4, just under the body-text floor. A continuous
 * `colors.surface`→`colors.primary` lerp necessarily crosses this band at
 * some `eased` value between its two endpoints (surface is high-luminance,
 * primary is typically low — a monotonic luminance descent must pass
 * through every luminance in between, intermediate value theorem), so this
 * is not a bug in one specific theme's token choice — it is unavoidable for
 * *any* continuous light→dark ramp under this codebase's binary black/white
 * ink model, confirmed by the initial (unguarded) version of this ramp
 * failing `full-matrix-contrast.test.ts`: the representative content sweep
 * passed clean with no nudge at all, but the schema-max 10×10 sweep (dense
 * enough to statistically hit the ~1-in-50 dead-zone width on some cell)
 * failed on 12/13 themes, and the negative-distribution cell-ink probe
 * failed on 3/13 — 12/13 themes affected somewhere across the full battery
 * (review fix round measurement; supersedes an earlier, narrower "5/13"
 * figure from before those two sweeps existed). `safeEased` below is the
 * fix: when `show_values` will actually paint text on a cell (the only case
 * this matters — no text, no contrast requirement), nudge that cell's own
 * `eased` fraction away from the dead zone rather than accepting whichever
 * color the raw lerp landed on.
 *
 * **Confinement is a real, disclosed residual, not silently swallowed**
 * (review fix round finding 1): a theme whose *entire* surface→primary path
 * sits inside the band (both endpoints confined, or `surface === primary`
 * exactly in-band) has no `eased` value `safeEased` can escape to — the
 * search degrades to whichever boundary it hits, still the
 * `accessibleInk`-chosen best-available ink, never a wrong/unreadable
 * color. No canonical theme does this (all 13 green,
 * `full-matrix-contrast.test.ts`), and `registerTheme` currently performs
 * no color/contrast validation on a caller-supplied `style` at all — a
 * systemic extensibility gap this component doesn't own or fix. What this
 * component *does* guarantee: the confined case is deterministically
 * **audit-visible**, not silent — `findContrastIssues` measures each
 * cell's value text against that cell's own real rendered fill and reports
 * it as a `low-contrast` finding every time, on every affected value, at
 * the same ~4.38-4.44 ratio this comment names
 * (`heatmap-deadzone.test.ts` pins this against a real `registerTheme` +
 * `auditDeck` reconstruction of the confined case, plus a straddling
 * control that stays clean). `pptfast audit` is the deterministic backstop
 * for the residual this loop's own boundary clamp cannot itself close.
 */
function hasSafeInk(hex: string): boolean {
  return contrastRatio(readableOn(hex), hex) >= INK_SAFE_RATIO
}

/**
 * Push `eased` out of the dead zone (see `hasSafeInk`'s own doc comment)
 * when it lands there, by stepping further in whichever direction `eased`
 * was already heading — toward `colors.surface` (lighter, black-ink-safe)
 * below the ramp's midpoint, toward `colors.primary` (darker,
 * white-ink-safe) at or above it. Deterministic and monotonicity-preserving
 * on either side of the midpoint: two cells that were already ordered
 * before this nudge stay ordered after it, the nudge only ever narrows the
 * *visual* distance between a handful of near-dead-zone values, never
 * reverses their relative order. A pure function of `eased` and the
 * theme's own two anchor colors — no dependency on which specific value
 * produced `eased`, so it's exactly as deterministic as the ramp itself.
 * Bounded to 100 steps (the full [0,1] range at `EASED_STEP`'s own
 * resolution) — every one of the 13 canonical themes' `colors.primary`
 * clears the dead zone well before either boundary in practice (confirmed
 * by the 13-theme sweep this function's introduction turned green), so the
 * loop's own boundary clamp is the fallback for the confined case
 * `hasSafeInk`'s own doc comment discloses above — best-available ink, not
 * a guarantee — never the expected exit path for any theme this codebase
 * currently ships.
 */
function safeEased(eased: number, ctx: ComponentCtx): number {
  const hex = (e: number) => mixHex(ctx.colors.surface, ctx.colors.primary, e)
  if (hasSafeInk(hex(eased))) return eased
  const dir = eased < 0.5 ? -1 : 1
  let e = eased
  for (let i = 0; i < 100; i++) {
    const next = Math.max(0, Math.min(1, e + dir * EASED_STEP))
    if (next === e) break // hit the [0,1] boundary, can't push further
    e = next
    if (hasSafeInk(hex(e))) return e
  }
  return e
}

/** Deterministic value → color: single-hue luminance interpolation from
 * `colors.surface` toward `colors.primary`, floored at `RAMP_MIN_T` (see
 * that constant's own doc comment). `forInk` (default false) additionally
 * routes the interpolation fraction through `safeEased` — only worth paying
 * for when this exact fill is about to have text painted on top of it
 * (`show_values`); the pure, undistorted ramp is otherwise the right
 * answer, since there is no ink to contrast against a cell with no value
 * text on it. */
function cellFill(t: number, ctx: ComponentCtx, forInk = false): string {
  const eased = RAMP_MIN_T + (1 - RAMP_MIN_T) * t
  return mixHex(ctx.colors.surface, ctx.colors.primary, forInk ? safeEased(eased, ctx) : eased)
}

// y_title stacked-vertical-char fit — ported from matrix.tsx's
// `yTitleStackHeight`/`maxYTitleChars`/`fitYTitleStack` (identical
// arithmetic, renamed to avoid a cross-file symbol collision; no shared
// module exists for this idiom — every full-body component that needs it
// keeps its own private copy, same precedent `gantt.tsx`'s own `vx`
// primitive doc comment names).
const Y_TITLE_START_Y = 20
const Y_TITLE_CHAR_ADVANCE = AXIS_SIZE + 2

function yTitleStackHeight(charCount: number): number {
  if (charCount <= 0) return 0
  return Y_TITLE_START_Y + (charCount - 1) * Y_TITLE_CHAR_ADVANCE + AXIS_SIZE * 0.25
}

function maxYTitleChars(availH: number): number {
  return Math.max(1, Math.floor((availH - Y_TITLE_START_Y - AXIS_SIZE * 0.25) / Y_TITLE_CHAR_ADVANCE) + 1)
}

function fitYTitleStack(text: string, availH: number): { chars: string[]; truncated: boolean } {
  const chars = Array.from(text)
  if (chars.length === 0) return { chars, truncated: false }
  const maxChars = maxYTitleChars(availH)
  if (chars.length <= maxChars) return { chars, truncated: false }
  const kept = chars.slice(0, Math.max(0, maxChars - 1))
  return { chars: [...kept, "…"], truncated: true }
}

function gridGeom(component: HeatmapComponent, w: number) {
  const cols = component.x_labels.length
  const rows = component.y_labels.length
  const yTitleW = component.y_title ? Y_TITLE_W : 0
  const gridX0 = yTitleW + ROW_LABEL_W
  const gridW = Math.max(1, w - gridX0)
  const cellW = (gridW - CELL_GAP * (cols - 1)) / cols
  const gridH = rows * NATURAL_CELL_H + (rows - 1) * CELL_GAP
  const yTitleH = component.y_title ? yTitleStackHeight(Array.from(component.y_title).length) : 0
  return { cols, rows, yTitleW, gridX0, cellW, gridH, yTitleH }
}

export const heatmap: SvgComponent<HeatmapComponent> = {
  measure(component, w) {
    const { gridH, yTitleH } = gridGeom(component, w)
    // Same "grow to cover y_title's real stack, off by construction in the
    // common case" idiom as matrix.tsx's own measure() — see that file's
    // render() doc comment for the incident this guards against.
    return (component.x_title ? X_TITLE_H : 0) + COL_LABEL_H + Math.max(gridH, yTitleH)
  },
  render(component, box, ctx) {
    const { rows, yTitleW, gridX0, cellW, gridH, yTitleH } = gridGeom(component, box.w)
    const xTitleH = component.x_title ? X_TITLE_H : 0
    const gridTop = box.y + xTitleH + COL_LABEL_H
    // box.h-aware uniform stretch (matrix.tsx's own idiom, no
    // STRETCH_CAP_RATIO ceiling — full-body components never go through
    // growStretchables' capped path). Two "total height" semantics meet
    // here exactly like matrix.tsx's render() — `box.h`, when a caller sets
    // it, is the TOTAL remaining height from box.y downward (inclusive of
    // both the x_title band and the column-header band, same convention
    // measure() returns), so both come off it exactly once; the
    // measure()-mirroring fallback already excludes both, so subtracting
    // either from it again would double-count.
    const measuredFallbackH = Math.max(gridH, yTitleH)
    const availGridH =
      box.h !== undefined ? box.h - xTitleH - COL_LABEL_H : measuredFallbackH
    const rowH = Math.max(NATURAL_CELL_H, (availGridH - (rows - 1) * CELL_GAP) / rows)
    const r = Math.min(4, ctx.shape?.radius ?? CELL_RADIUS)
    const domain = resolveDomain(component)

    const xTitleFit = component.x_title
      ? fitSvgLine(`${component.x_title}  →`, {
          maxWidth: box.w - gridX0,
          fontSize: AXIS_SIZE,
          minFontSize: 10,
        })
      : null
    const yTitleFit = component.y_title ? fitYTitleStack(component.y_title, availGridH) : null

    const colLabelFits = component.x_labels.map((label) =>
      fitSvgLine(label, { maxWidth: cellW - COL_LABEL_PAD * 2, fontSize: COL_LABEL_FONT, minFontSize: COL_LABEL_MIN_FONT }),
    )
    const rowLabelFits = component.y_labels.map((label) =>
      fitSvgLine(label, {
        maxWidth: ROW_LABEL_W - ROW_LABEL_PAD * 2,
        fontSize: ROW_LABEL_FONT,
        minFontSize: ROW_LABEL_MIN_FONT,
      }),
    )

    return (
      <g>
        {xTitleFit ? (
          <text
            data-truncated={xTitleFit.truncated ? "1" : undefined}
            x={box.x + gridX0}
            y={box.y + AXIS_SIZE + 4}
            fontSize={xTitleFit.fontSize}
            fill={ctx.colors.muted}
            fontFamily={ctx.fonts.body}
            dominantBaseline="alphabetic"
          >
            {xTitleFit.text}
          </text>
        ) : null}
        {yTitleFit
          ? yTitleFit.chars.map((chr, i) => (
              <text
                key={i}
                data-truncated={yTitleFit.truncated && i === yTitleFit.chars.length - 1 ? "1" : undefined}
                x={box.x + yTitleW / 2}
                y={gridTop + Y_TITLE_START_Y + i * Y_TITLE_CHAR_ADVANCE}
                textAnchor="middle"
                fontSize={AXIS_SIZE}
                fill={ctx.colors.muted}
                fontFamily={ctx.fonts.body}
                dominantBaseline="alphabetic"
              >
                {chr}
              </text>
            ))
          : null}
        {colLabelFits.map((fit, col) => {
          const cx = box.x + gridX0 + col * (cellW + CELL_GAP) + cellW / 2
          return (
            <text
              key={col}
              data-truncated={fit.truncated ? "1" : undefined}
              x={cx}
              y={box.y + xTitleH + COL_LABEL_H - COL_LABEL_PAD}
              textAnchor="middle"
              fontSize={fit.fontSize}
              fill={ctx.colors.muted}
              fontFamily={ctx.fonts.body}
              dominantBaseline="alphabetic"
            >
              {fit.text}
            </text>
          )
        })}
        {rowLabelFits.map((fit, row) => {
          const rowY = gridTop + row * (rowH + CELL_GAP)
          const cy = rowY + rowH / 2
          return (
            <text
              key={row}
              data-truncated={fit.truncated ? "1" : undefined}
              x={box.x + yTitleW + ROW_LABEL_PAD}
              y={cy + Math.round(fit.fontSize * 0.35)}
              textAnchor="start"
              fontSize={fit.fontSize}
              fill={ctx.colors.muted}
              fontFamily={ctx.fonts.body}
              dominantBaseline="alphabetic"
            >
              {fit.text}
            </text>
          )
        })}
        {component.values.map((rowValues, row) =>
          rowValues.map((v, col) => {
            const x = box.x + gridX0 + col * (cellW + CELL_GAP)
            const y = gridTop + row * (rowH + CELL_GAP)
            const fill = cellFill(valueT(v, domain), ctx, component.show_values)
            const valueFit = component.show_values
              ? fitSvgLine(String(v), { maxWidth: cellW - CELL_PAD * 2, fontSize: VALUE_FONT, minFontSize: VALUE_MIN_FONT })
              : null
            return (
              <g key={`${row}-${col}`}>
                <rect
                  x={x}
                  y={y}
                  width={cellW}
                  height={rowH}
                  rx={r}
                  fill={fill}
                  {...(ctx.colors.cardStroke ? { stroke: ctx.colors.cardStroke, strokeWidth: 1 } : {})}
                />
                {valueFit ? (
                  <text
                    data-truncated={valueFit.truncated ? "1" : undefined}
                    x={x + cellW / 2}
                    y={y + rowH / 2 + Math.round(valueFit.fontSize * 0.35)}
                    textAnchor="middle"
                    fontSize={valueFit.fontSize}
                    fill={accessibleInk(ctx.colors.text, fill, valueFit.fontSize)}
                    fontFamily={ctx.fonts.body}
                    dominantBaseline="alphabetic"
                  >
                    {valueFit.text}
                  </text>
                ) : null}
              </g>
            )
          }),
        )}
      </g>
    )
  },
}
