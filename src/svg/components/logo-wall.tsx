import type React from "react"
import type { Component } from "@/ir"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { readableOn } from "../ink"
import { mixHex } from "./color-mix"
import type { ComponentCtx, RenderDef, SvgComponent } from "./types"

type LogoWallComponent = Extract<Component, { type: "logo_wall" }>

/**
 * Logo wall (logo_wall wave, `.issues/2026-08-06-logo-wall/plan.md`): a set
 * of 4-12 organization/brand logos on an even grid, each drawn contain-fit
 * on its own neutral backing panel. Every geometry/color choice reuses an
 * existing mechanism (裁定 2 — no new machinery):
 *
 *  - **Contain, not crop (p13 counter):** the logo `<image>` uses
 *    `preserveAspectRatio="xMidYMid meet"` — the exact `meet`/contain branch
 *    `image.tsx` already exposes via its `fit` field. A wide wordmark keeps
 *    both its ends instead of being cropped to "NORTHBR" by `image_grid`'s
 *    `xMidYMid slice`. Whitespace inside a cell beats a mutilated logo — a
 *    logo losing its own wordmark is exactly the mistake this component
 *    exists to stop.
 *  - **Per-cell backing (p14 counter):** every cell paints a filled panel
 *    behind the logo, unlike `image_grid` (which paints a backing only on
 *    the *missing-asset* branch, so a present transparent logo shows the
 *    slide background straight through). The fill is a mid-neutral derived
 *    from the theme — see `logoBoardFill`.
 */

/** Total wall-height cap (px) — same budget and same number as `image.tsx`'s
 * `MAX_IMAGE_H`/`image-grid.tsx`'s `MAX_GRID_H` order of magnitude: a logo
 * wall occupies one visual-primary slot in the same content-rect budget. */
const MAX_WALL_H = 340
const GAP = 12
/** Inner padding between a cell's backing edge and the contain-fit logo — a
 * logo needs breathing room off the panel edge to read as a placed mark, not
 * a full-bleed image. */
const CELL_PAD = 12
const CELL_RADIUS = 8
/** Landscape-ish cell proportion (height ÷ width). Wordmark logos are wider
 * than tall, so a shallow cell fits them with the least wasted vertical space
 * — clamped so a single-row tier doesn't produce absurdly tall cells and the
 * 3-row tier doesn't crush them. */
const CELL_ASPECT = 0.52
const MIN_CELL_H = 56
const MAX_CELL_H = 132

// Optional overall `title` (裁定 1) — same fixed reserved band as
// cycle.tsx/people-cards.tsx: present in both measure() and render() only
// when the field is set, an absent title costs nothing.
const TITLE_FONT_SIZE = 16
const TITLE_MIN_FONT_SIZE = 12
const TITLE_BAND = 24

/** Missing-asset / fallback label font. */
const LABEL_FONT_SIZE = 13
const LABEL_MIN_FONT_SIZE = 10

/**
 * Fraction `colors.surface` blends toward the theme's readable ink to derive
 * each cell's backing fill. This is `device_mockup`'s own
 * `mixHex(colors.surface, readableOn(bg), FRAME_BAR_MIX)` precedent (裁定 2
 * — read that implementation and follow it), only with a larger fraction
 * because the goal here is stronger: not merely to separate a frame bar from
 * the page (device_mockup's subtle 0.14 nudge), but to reach a *mid-neutral*
 * panel that keeps **both** ink polarities legible on the same board.
 *
 * Why mid-neutral, and why this exact formula reaches it on every theme: a
 * transparent press logo can be near-black *or* near-white ink (p14 ships 5
 * of each), and the author can mix both polarities on one wall. No near-white
 * or near-dark board serves both — a white-ink logo dies on a light board,
 * the exact p14 defect (`image_grid` let the logo sit on the near-white slide
 * background and it vanished). `readableOn(bg)` is whichever pole (`#FFFFFF`
 * or near-black) is maximally distinct from the background, so on a *light*
 * theme this blends `surface` toward dark and on a *dark* theme toward light
 * — either way toward the middle. At 0.5 the board lands a mid gray on every
 * neutral-surface theme (~#85878a on white), clearing a comfortable margin to
 * both #000 and #FFF ink (empirically ≥2.5:1 to both across all 16 themes,
 * and a logo is a discernible *shape*, not 4.5:1 body text). It also
 * separates from `bg` for free — a mid board differs from either extreme
 * background — so the single formula solves both the panel-separation and the
 * both-ink-legibility requirements at once. No baked hex, no per-theme branch.
 */
const LOGO_BOARD_MIX = 0.5

function logoBoardFill(ctx: ComponentCtx): string {
  return mixHex(ctx.colors.surface, readableOn(ctx.defaultBg ?? ctx.colors.bg), LOGO_BOARD_MIX)
}

/**
 * Grid shape by logo count (裁定 4, BINDING geometry): 4-6 in 1-2 rows,
 * 7-9 in three rows (3×3), 10-12 in three rows (3×4). `cols` is chosen to
 * keep each cell landscape-ish for wordmarks; `rows = ceil(n/cols)`, with any
 * underfull last row left-aligned at the same cell size (same row-major
 * geometry as `image-grid`/`people-cards`). Deterministic pure function.
 */
function gridShape(n: number): { rows: number; cols: number } {
  const cols = n <= 4 ? n : n <= 6 ? 3 : n <= 9 ? 3 : 4
  const rows = Math.ceil(n / cols)
  return { rows, cols }
}

function wallGeometry(component: LogoWallComponent, w: number) {
  const n = component.items.length
  const { rows, cols } = gridShape(n)
  const cellW = (w - GAP * (cols - 1)) / cols
  // Cell height from the landscape target, clamped, then scaled down if the
  // stack of rows would exceed the wall-height budget (so the 3-row tiers
  // never overflow their slot — same "cap the total" discipline as image.tsx).
  const titleBand = component.title?.trim() ? TITLE_BAND : 0
  let cellH = Math.min(MAX_CELL_H, Math.max(MIN_CELL_H, cellW * CELL_ASPECT))
  const gridH = () => rows * cellH + (rows - 1) * GAP
  const budget = MAX_WALL_H - titleBand
  if (gridH() > budget) cellH = Math.max(1, (budget - (rows - 1) * GAP) / rows)
  return { rows, cols, cellW: Math.floor(cellW), cellH: Math.floor(cellH), titleBand }
}

/** Missing-asset cell — a `label` renders as text on the backing (readableOn
 * the board), otherwise the same "Image missing" placeholder as image.tsx/
 * image-grid.tsx (裁定 3 iron rule: never render a fake logo, the only raster
 * exit is a real asset's `<image>`). Drawn in the cell's local (0,0) space. */
function MissingLogo({
  label,
  w,
  h,
  board,
  ctx,
}: {
  label: string | undefined
  w: number
  h: number
  board: string
  ctx: ComponentCtx
}): React.ReactElement {
  if (label?.trim()) {
    const fitted = fitSvgLine(label, {
      maxWidth: w - CELL_PAD * 2,
      fontSize: LABEL_FONT_SIZE,
      minFontSize: LABEL_MIN_FONT_SIZE,
    })
    return (
      <text
        data-truncated={fitted.truncated ? "1" : undefined}
        x={w / 2}
        y={h / 2 + Math.round(fitted.fontSize * 0.32)}
        textAnchor="middle"
        fontSize={fitted.fontSize}
        fill={readableOn(board)}
        fontFamily={ctx.fonts.body}
        dominantBaseline="alphabetic"
      >
        {fitted.text}
      </text>
    )
  }
  // Both fallback branches ink against the board via `readableOn` (not
  // `colors.muted`, unlike image.tsx's placeholder on plain `colors.surface`):
  // the board is a mid-neutral, and muted-on-mid-neutral has no guaranteed
  // contrast, so `readableOn(board)` keeps this degrade text legible by
  // construction on every theme. logo_wall therefore renders no `colors.muted`
  // text at all ("no-muted-fill" in full-matrix-contrast's own class map).
  return (
    <text
      textAnchor="middle"
      x={w / 2}
      y={h / 2}
      fontSize={LABEL_FONT_SIZE}
      fill={readableOn(board)}
      fontFamily={ctx.fonts.body}
      dominantBaseline="alphabetic"
    >
      Image missing
    </text>
  )
}

export const logoWall: SvgComponent<LogoWallComponent> = {
  measure(component, w) {
    const { rows, cellH, titleBand } = wallGeometry(component, w)
    return titleBand + rows * cellH + (rows - 1) * GAP
  },
  render(component, box, ctx) {
    const { cols, cellW, cellH, titleBand } = wallGeometry(component, box.w)
    const hasTitle = !!component.title?.trim()
    const board = logoBoardFill(ctx)
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {hasTitle &&
          (() => {
            const title = fitSvgLine(component.title!, {
              maxWidth: box.w,
              fontSize: TITLE_FONT_SIZE,
              minFontSize: TITLE_MIN_FONT_SIZE,
              bold: true,
              fontFamily: ctx.fonts.heading,
            })
            return (
              <text
                data-truncated={title.truncated ? "1" : undefined}
                x={0}
                y={TITLE_FONT_SIZE}
                fontFamily={ctx.fonts.heading}
                fontSize={title.fontSize}
                fontWeight="700"
                fill={ctx.colors.text}
                dominantBaseline="alphabetic"
              >
                {title.text}
              </text>
            )
          })()}
        {component.items.map((item, i) => {
          const cellX = (i % cols) * (cellW + GAP)
          const cellY = titleBand + Math.floor(i / cols) * (cellH + GAP)
          const src = ctx.images?.[item.asset_id]?.src
          // alt chain (裁定 3, new `<image>` emission site): the asset's own
          // alt wins, then the item `label`, then nothing — identical
          // single-attribute wiring to image.tsx (no `<title>` child, no
          // empty string emitted).
          const alt = ctx.images?.[item.asset_id]?.alt || item.label
          return (
            <g key={i} transform={`translate(${cellX},${cellY})`}>
              <rect
                x={0}
                y={0}
                width={cellW}
                height={cellH}
                rx={ctx.shape?.radius ?? CELL_RADIUS}
                fill={board}
              />
              {src ? (
                <image
                  href={src}
                  x={CELL_PAD}
                  y={CELL_PAD}
                  width={cellW - CELL_PAD * 2}
                  height={cellH - CELL_PAD * 2}
                  preserveAspectRatio="xMidYMid meet"
                  aria-label={alt || undefined}
                />
              ) : (
                <MissingLogo label={item.label} w={cellW} h={cellH} board={board} ctx={ctx} />
              )}
            </g>
          )
        })}
      </g>
    )
  },
}

export const renderDef: RenderDef<LogoWallComponent> = {
  type: "logo_wall",
  measure: logoWall.measure,
  render: logoWall.render,
}
