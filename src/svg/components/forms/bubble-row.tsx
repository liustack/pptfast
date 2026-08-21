import type { Component } from "@/ir"
import { fitSvgLine } from "../../../lib/svg-text-layout"
import { Icon } from "../../icons"
import { accessibleInk, readableOn } from "../../ink"
import type { FormKnobs } from "../form-assignments"
import type { ComponentBox, ComponentCtx } from "../types"
import { parseKpiMagnitude } from "./kpi-value"

type KpiComponent = Extract<Component, { type: "kpi_cards" }>
type KpiItem = KpiComponent["items"][number]

const PAD = 10
const GAP = 14
const R_MIN = 28
const R_MAX = 110
const BASELINE_FUDGE = 0.35
const UNDER_LABEL = 20
const SOURCE_BAND = 18

interface Ranked {
  item: KpiItem
  index: number
  mag: number | null
  rank: number
}

function rankItems(items: readonly KpiItem[]): Ranked[] {
  const decorated = items.map((item, index) => ({
    item,
    index,
    mag: parseKpiMagnitude(String(item.value)),
  }))
  decorated.sort((a, b) => {
    if (a.mag != null && b.mag != null && a.mag !== b.mag) return b.mag - a.mag
    if (a.mag != null && b.mag == null) return -1
    if (a.mag == null && b.mag != null) return 1
    return a.index - b.index
  })
  return decorated.map((d, rank) => ({ ...d, rank }))
}

function radiiFor(ranked: Ranked[], boxW: number): number[] {
  const n = ranked.length
  const cap = Math.min(R_MAX, Math.max(R_MIN, (boxW - PAD * 2) / (2.2 + n * 0.55)))
  const parsed = ranked.map((d) => d.mag).filter((m): m is number => m != null)
  const vMin = parsed.length ? Math.min(...parsed) : 0
  const vMax = parsed.length ? Math.max(...parsed) : 1
  return ranked.map((d) => {
    if (d.mag == null) return R_MIN
    if (vMax === vMin) return (R_MIN + cap) / 2
    return R_MIN + ((d.mag - vMin) / (vMax - vMin)) * (cap - R_MIN)
  })
}

function placeRow(radii: number[]): { xs: number[]; left: number; right: number } {
  const n = radii.length
  const xs = new Array<number>(n).fill(0)
  if (n === 0) return { xs, left: 0, right: 0 }
  let left = -radii[0]!
  let right = radii[0]!
  for (let rank = 1; rank < n; rank++) {
    const r = radii[rank]!
    if (rank % 2 === 1) {
      xs[rank] = left - GAP - r
      left = xs[rank]! - r
    } else {
      xs[rank] = right + GAP + r
      right = xs[rank]! + r
    }
  }
  return { xs, left, right }
}

function paint(
  rank: number,
  origIndex: number,
  knobs: FormKnobs,
  ctx: ComponentCtx,
): { fill: string; stroke: string | undefined; strokeW: number; inkBg: string } {
  const pal = ctx.colors.chartPalette
  const swatch = pal.length === 0 ? ctx.colors.accent : pal[origIndex % pal.length]!
  const champ = rank === 0
  if (champ && knobs.champion === "fill-accent") {
    return { fill: ctx.colors.accent, stroke: undefined, strokeW: 0, inkBg: ctx.colors.accent }
  }
  if (champ && knobs.champion === "stroke-palette") {
    return {
      fill: ctx.colors.surface,
      stroke: knobs.paletteStroke ? swatch : ctx.colors.accent,
      strokeW: knobs.paletteStroke ? 5 : 3,
      inkBg: ctx.colors.surface,
    }
  }
  const stroke = knobs.paletteStroke
    ? swatch
    : rank <= 2
      ? ctx.colors.accent
      : (ctx.colors.border ?? ctx.colors.muted)
  return {
    fill: ctx.colors.surface,
    stroke,
    strokeW: knobs.paletteStroke ? 5 : 1.5,
    inkBg: ctx.colors.surface,
  }
}

function layout(component: KpiComponent, w: number) {
  const ranked = rankItems(component.items)
  const radii = radiiFor(ranked, w)
  const placed = placeRow(radii)
  // Champion stays on the box center. Scale from the wider wing so an
  // odd-length row (more bubbles on the left) still fits.
  const half = Math.max(-placed.left, placed.right, 1)
  const innerHalf = Math.max(24, w / 2 - PAD - 6)
  const scale = Math.min(1, innerHalf / half)
  const r = radii.map((x) => x * scale)
  const xs = placed.xs.map((x) => x * scale)
  const maxR = r.reduce((m, x) => Math.max(m, x), 0)
  const anySource = component.items.some((it) => it.source)
  const anyUnder = r.some((x) => x < 46)
  const naturalH = PAD * 2 + maxR * 2 + (anyUnder ? UNDER_LABEL : 8) + (anySource ? SOURCE_BAND : 0)
  return { ranked, r, xs, maxR, anySource, anyUnder, naturalH }
}

export function measureBubbleRow(
  component: KpiComponent,
  w: number,
  _ctx: ComponentCtx,
  _knobs: FormKnobs,
): number {
  if (component.items.length === 0) return 0
  return layout(component, w).naturalH
}

export function renderBubbleRow(
  component: KpiComponent,
  box: ComponentBox,
  ctx: ComponentCtx,
  knobs: FormKnobs,
) {
  const n = component.items.length
  if (n === 0) return <g transform={`translate(${box.x},${box.y})`} />
  const L = layout(component, box.w)
  const h = box.h ?? L.naturalH
  const cx0 = box.w / 2
  const extraBottom = (L.anyUnder ? UNDER_LABEL : 8) + (L.anySource ? SOURCE_BAND : 0)
  const cy = PAD + L.maxR + Math.max(0, (h - PAD * 2 - L.maxR * 2 - extraBottom) / 2)
  const pageBg = ctx.defaultBg ?? ctx.colors.bg

  return (
    <g transform={`translate(${box.x},${box.y})`}>
      {L.ranked.map((d) => {
        const r = L.r[d.rank]!
        const cx = cx0 + L.xs[d.rank]!
        const p = paint(d.rank, d.index, knobs, ctx)
        const value = String(d.item.value)
        const valueSize = Math.min(r * 0.42, 40)
        const inside = r >= 46
        const valueInk = accessibleInk(
          p.fill === ctx.colors.accent
            ? readableOn(p.fill)
            : (p.stroke && knobs.paletteStroke ? p.stroke : ctx.colors.text),
          p.inkBg,
          valueSize,
        )
        const label = fitSvgLine(d.item.label, {
          maxWidth: Math.max(24, inside ? r * 1.5 : r * 2.2),
          fontSize: inside ? 14 : 12,
          minFontSize: 9,
        })
        const labelInk = inside
          ? accessibleInk(readableOn(p.inkBg), p.inkBg, label.fontSize)
          : accessibleInk(ctx.colors.muted, pageBg, label.fontSize)
        const source = d.item.source
          ? fitSvgLine(d.item.source, {
              maxWidth: Math.max(40, r * 2.4),
              fontSize: 11,
              minFontSize: 8,
            })
          : null
        const iconSize = 12
        const showIcon = Boolean(d.item.icon) && r >= 52
        return (
          <g key={d.index}>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={p.fill}
              {...(p.stroke ? { stroke: p.stroke, strokeWidth: p.strokeW } : {})}
            />
            {showIcon && d.item.icon ? (
              <Icon
                name={d.item.icon}
                x={cx - iconSize / 2}
                y={cy - r * 0.55}
                size={iconSize}
                color={valueInk}
              />
            ) : null}
            <text
              x={cx}
              y={cy + (inside ? -2 : valueSize * BASELINE_FUDGE)}
              textAnchor="middle"
              fontSize={valueSize}
              fontWeight="bold"
              fill={valueInk}
              fontFamily={ctx.fonts.heading}
              dominantBaseline="alphabetic"
            >
              {value}
            </text>
            <text
              data-truncated={label.truncated ? "1" : undefined}
              x={cx}
              y={inside ? cy + valueSize * 0.7 : cy + r + 14}
              textAnchor="middle"
              fontSize={label.fontSize}
              fill={labelInk}
              fontFamily={ctx.fonts.body}
              dominantBaseline="alphabetic"
            >
              {label.text}
            </text>
            {source ? (
              <text
                data-truncated={source.truncated ? "1" : undefined}
                x={cx}
                y={inside ? cy + r + 16 : cy + r + 30}
                textAnchor="middle"
                fontSize={source.fontSize}
                fill={accessibleInk(ctx.colors.muted, pageBg, source.fontSize)}
                fontFamily={ctx.fonts.body}
                dominantBaseline="alphabetic"
              >
                {source.text}
              </text>
            ) : null}
          </g>
        )
      })}
    </g>
  )
}
