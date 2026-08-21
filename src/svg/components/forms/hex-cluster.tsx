import type { Component } from "@/ir"
import { mixHex } from "../color-mix"
import { accessibleInk, readableOn } from "../../ink"
import type { FormKnobs } from "../form-assignments"
import type { ComponentBox, ComponentCtx } from "../types"
import { FORM_BODY_FLOOR, FORM_TITLE_FLOOR, layoutFormBody, layoutFormTitle } from "./legibility"

type NumberedCardsComponent = Extract<Component, { type: "numbered_cards" }>

const SQRT3 = Math.sqrt(3)
const PAD = 10
const HEIGHT_CAP = 420
const BASELINE_FUDGE = 0.35
const STROKE_W = 5

/**
 * Pointy-top axial cells. n=3 is 品字 (one on top, two below). n=4 is that
 * triangle plus a cell under the pair (diamond). n=5 is two-on-three,
 * n=6 two interlocking rows of three, n=7 a 2-3-2 flower, n=8 two
 * interlocking rows of four. n outside 3..8 still packs, for tests that
 * feed a short list.
 */
export function hexAxialPositions(n: number): { q: number; r: number }[] {
  if (n <= 0) return []
  if (n === 1) return [{ q: 0, r: 0 }]
  if (n === 2) return [{ q: 0, r: 0 }, { q: 1, r: 0 }]
  if (n === 3) return [{ q: 0, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }]
  if (n === 4) {
    return [
      { q: 0, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
      { q: -1, r: 2 },
    ]
  }
  if (n === 5) {
    return [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
      { q: 1, r: 1 },
    ]
  }
  if (n === 6) {
    return [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
      { q: 0, r: 1 },
      { q: 1, r: 1 },
      { q: 2, r: 1 },
    ]
  }
  if (n === 7) {
    return [
      { q: 1, r: -1 },
      { q: 2, r: -1 },
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
      { q: 0, r: 1 },
      { q: 1, r: 1 },
    ]
  }
  const top = Math.ceil(n / 2)
  const cells: { q: number; r: number }[] = []
  for (let i = 0; i < top; i++) cells.push({ q: i, r: 0 })
  for (let i = 0; i < n - top; i++) cells.push({ q: i, r: 1 })
  return cells
}

function axialToPixel(q: number, r: number, size: number): { x: number; y: number } {
  return {
    x: size * SQRT3 * (q + r / 2),
    y: size * 1.5 * r,
  }
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100)
}

function hexPoints(cx: number, cy: number, size: number): string {
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3
    pts.push(`${fmt(cx + size * Math.cos(a))},${fmt(cy + size * Math.sin(a))}`)
  }
  return pts.join(" ")
}

function clusterFit(n: number, w: number, h: number) {
  const cells = hexAxialPositions(n)
  if (cells.length === 0) {
    return { cells, size: 0, ox: 0, oy: 0, usedH: PAD * 2, w, h }
  }
  const unit = cells.map((c) => axialToPixel(c.q, c.r, 1))
  const halfW = SQRT3 / 2
  const halfH = 1
  const minX = Math.min(...unit.map((p) => p.x)) - halfW
  const maxX = Math.max(...unit.map((p) => p.x)) + halfW
  const minY = Math.min(...unit.map((p) => p.y)) - halfH
  const maxY = Math.max(...unit.map((p) => p.y)) + halfH
  const bw = Math.max(maxX - minX, 0.001)
  const bh = Math.max(maxY - minY, 0.001)
  const inset = PAD + STROKE_W / 2
  const size = Math.max(48, Math.min((w - inset * 2) / bw, (h - inset * 2) / bh))
  const usedW = bw * size
  const usedH = bh * size + inset * 2
  const ox = (w - usedW) / 2 - minX * size
  const oy = (h - bh * size) / 2 - minY * size
  return { cells, size, ox, oy, usedH, w, h }
}

function cellFill(
  i: number,
  n: number,
  knobs: FormKnobs,
  ctx: ComponentCtx,
): string {
  if (knobs.hexFill === "accent-ramp") {
    const t = n <= 1 ? 0 : i / (n - 1)
    if (t <= 0) return ctx.colors.accent
    if (t >= 1) return ctx.colors.primary
    return mixHex(ctx.colors.accent, ctx.colors.primary, t)
  }
  const pal = ctx.colors.chartPalette
  return pal.length === 0 ? ctx.colors.accent : pal[i % pal.length]!
}

function cellStroke(knobs: FormKnobs, ctx: ComponentCtx): string {
  return knobs.hexStroke === "accent" ? ctx.colors.accent : ctx.colors.bg
}

export function measureHexCluster(
  component: NumberedCardsComponent,
  w: number,
  _ctx: ComponentCtx,
  _knobs: FormKnobs,
): number {
  return clusterFit(component.items.length, w, HEIGHT_CAP).usedH
}

export function renderHexCluster(
  component: NumberedCardsComponent,
  box: ComponentBox,
  ctx: ComponentCtx,
  knobs: FormKnobs,
) {
  const n = component.items.length
  const natural = clusterFit(n, box.w, HEIGHT_CAP).usedH
  const h = box.h ?? natural
  const g = clusterFit(n, box.w, h)
  const stroke = cellStroke(knobs, ctx)

  return (
    <g transform={`translate(${box.x},${box.y})`}>
      {component.items.map((item, i) => {
        const cell = g.cells[i]
        if (!cell) return null
        const local = axialToPixel(cell.q, cell.r, g.size)
        const cx = g.ox + local.x
        const cy = g.oy + local.y
        const fill = cellFill(i, n, knobs, ctx)
        const num = String(i + 1).padStart(2, "0")
        const equatorH = Math.max(FORM_TITLE_FLOOR * 2, g.size - 6)
        const contentW = Math.max(FORM_TITLE_FLOOR, g.size * SQRT3 * 0.55)
        const title = layoutFormTitle(item.title, {
          maxWidth: contentW,
          fontSize: FORM_TITLE_FLOOR,
          fontFamily: ctx.fonts.heading,
          maxLines: 2,
        })
        const titleH =
          title.lines.length === 0
            ? 0
            : (title.lines.length - 1) * title.lineHeight + title.fontSize
        const numTitleGap = titleH > 0 ? 4 : 0
        let numSize = Math.max(FORM_BODY_FLOOR, Math.min(34, g.size * 0.38))
        const numBudget = equatorH - titleH - numTitleGap
        if (numBudget >= FORM_BODY_FLOOR) numSize = Math.min(numSize, numBudget)
        const used = numSize + numTitleGap + titleH
        const leftover = equatorH - used
        const bodyGap = 4
        const body = item.text && leftover >= FORM_BODY_FLOOR * 1.25 + bodyGap
          ? layoutFormBody(item.text, {
              maxWidth: contentW,
              fontSize: FORM_BODY_FLOOR,
              maxLines: leftover >= FORM_BODY_FLOOR * 2.4 + bodyGap ? 2 : 1,
              lineHeightRatio: 1.25,
              fontFamily: ctx.fonts.body,
            })
          : null
        const bodyH = body
          ? (body.lines.length - 1) * body.lineHeight + body.fontSize
          : 0
        const stackH = used + (body ? bodyGap + bodyH : 0)
        const stackTop = cy - stackH / 2
        const ink = accessibleInk(readableOn(fill), fill, numSize)
        const titleInk = accessibleInk(readableOn(fill), fill, title.fontSize)
        const numY = stackTop + numSize / 2
        const titleTop = stackTop + numSize + numTitleGap
        const bodyTop = titleTop + titleH + (body ? bodyGap : 0)
        return (
          <g key={i}>
            <polygon
              points={hexPoints(cx, cy, g.size)}
              fill={fill}
              stroke={stroke}
              strokeWidth={STROKE_W}
              strokeLinejoin="round"
            />
            <text
              x={cx}
              y={numY + numSize * BASELINE_FUDGE}
              textAnchor="middle"
              fontSize={numSize}
              fontWeight="bold"
              fill={ink}
              fontFamily={ctx.fonts.heading}
              dominantBaseline="alphabetic"
            >
              {num}
            </text>
            {title.lines.map((line, li) => (
              <text
                key={`t-${li}`}
                data-truncated={title.truncated && li === title.lines.length - 1 ? "1" : undefined}
                x={cx}
                y={titleTop + li * title.lineHeight + title.fontSize}
                textAnchor="middle"
                fontSize={title.fontSize}
                fontWeight="bold"
                fill={titleInk}
                fontFamily={ctx.fonts.heading}
                dominantBaseline="alphabetic"
              >
                {line}
              </text>
            ))}
            {body
              ? body.lines.map((line, li) => (
                  <text
                    key={li}
                    x={cx}
                    y={bodyTop + li * body.lineHeight + body.fontSize}
                    textAnchor="middle"
                    fontSize={body.fontSize}
                    fill={accessibleInk(readableOn(fill), fill, body.fontSize)}
                    fontFamily={ctx.fonts.body}
                    dominantBaseline="alphabetic"
                  >
                    {line}
                  </text>
                ))
              : null}
          </g>
        )
      })}
    </g>
  )
}
