import type { Component } from "@/ir"
import { Icon } from "../../icons"
import { accessibleInk, resolveSemanticColor } from "../../ink"
import type { FormKnobs } from "../form-assignments"
import type { ComponentBox, ComponentCtx } from "../types"
import { parseKpiRatio } from "./kpi-value"
import { FORM_BODY_FLOOR, fitFormLine } from "./legibility"

type KpiComponent = Extract<Component, { type: "kpi_cards" }>

const PAD = 8
const MIN_CELL = 168
const LABEL_BAND = 36
const SOURCE_BAND = 20
const BASELINE_FUDGE = 0.35
const FULL_T = 0.9999

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100)
}

/**
 * Progress arc from 12 o'clock, clockwise. SVG y-down: start is `(cx, cy-r)`,
 * sweep-flag=1. `t` is clamped to `[0, 1]`. t=0 returns `""` (caller skips
 * the path). t=1 uses 359.9° so the A command's start and end do not coincide.
 */
export function donutArcPath(cx: number, cy: number, r: number, t: number): string {
  if (t <= 0 || r <= 0) return ""
  const tt = t >= 1 ? FULL_T : t
  const sx = cx
  const sy = cy - r
  const angle = -Math.PI / 2 + tt * 2 * Math.PI
  const ex = cx + r * Math.cos(angle)
  const ey = cy + r * Math.sin(angle)
  const large = tt > 0.5 ? 1 : 0
  return `M ${fmt(sx)} ${fmt(sy)} A ${fmt(r)} ${fmt(r)} 0 ${large} 1 ${fmt(ex)} ${fmt(ey)}`
}

function arcToken(knobs: FormKnobs, ctx: ComponentCtx): string {
  return knobs.arc === "primary" ? ctx.colors.primary : ctx.colors.accent
}

function trackToken(knobs: FormKnobs, ctx: ComponentCtx): string {
  if (knobs.track === "border") return ctx.colors.border ?? ctx.colors.muted
  return ctx.colors.muted
}

function splitValue(value: string, unit: string | undefined): { head: string; tail: string | null } {
  const u = unit?.trim()
  const deduped = u && value.trim().endsWith(u) ? undefined : u
  if (value.endsWith("%") && !deduped) {
    return { head: value.slice(0, -1), tail: "%" }
  }
  return { head: value, tail: deduped ?? null }
}

function grid(n: number, w: number, h?: number) {
  const cols = Math.max(1, Math.min(n, Math.max(1, Math.floor((w + 8) / MIN_CELL))))
  const rows = Math.max(1, Math.ceil(n / cols))
  const cellW = w / cols
  const source = SOURCE_BAND
  const naturalCellH = Math.min(cellW * 1.15, 280)
  const cellH = h != null ? h / rows : naturalCellH
  const r = Math.max(
    36,
    Math.min(95, (cellW - PAD * 2) * 0.32, (cellH - LABEL_BAND - source - PAD * 2) * 0.42),
  )
  const strokeW = Math.max(8, Math.min(16, r * 0.14))
  const naturalH = rows * (2 * r + LABEL_BAND + source + PAD * 2 + strokeW)
  return { cols, rows, cellW, cellH, r, strokeW, naturalH }
}

export function measureDonutTrio(
  component: KpiComponent,
  w: number,
  _ctx: ComponentCtx,
  _knobs: FormKnobs,
): number {
  const n = component.items.length
  if (n === 0) return 0
  return grid(n, w).naturalH
}

export function renderDonutTrio(
  component: KpiComponent,
  box: ComponentBox,
  ctx: ComponentCtx,
  knobs: FormKnobs,
) {
  const n = component.items.length
  if (n === 0) return <g transform={`translate(${box.x},${box.y})`} />
  const natural = grid(n, box.w).naturalH
  const h = box.h ?? natural
  const G = grid(n, box.w, h)
  const defaultArc = arcToken(knobs, ctx)
  const track = trackToken(knobs, ctx)
  const danger = resolveSemanticColor("danger", ctx.colors)
  const pageBg = ctx.defaultBg ?? ctx.colors.bg

  let minI = -1
  let minT = Infinity
  if (knobs.dangerOnMin) {
    component.items.forEach((item, i) => {
      const t = parseKpiRatio(String(item.value), item.unit)
      if (t == null) return
      if (t < minT) {
        minT = t
        minI = i
      }
    })
  }

  return (
    <g transform={`translate(${box.x},${box.y})`}>
      {component.items.map((item, i) => {
        const col = i % G.cols
        const row = Math.floor(i / G.cols)
        const x0 = col * G.cellW
        const y0 = row * G.cellH
        const cx = x0 + G.cellW / 2
        const cy = y0 + PAD + G.r + G.strokeW / 2
        const t = parseKpiRatio(String(item.value), item.unit)
        const hot = knobs.dangerOnMin && i === minI
        const arc = hot ? danger : defaultArc
        const d = t != null && t > 0 ? donutArcPath(cx, cy, G.r, t) : ""
        const { head, tail } = splitValue(String(item.value), item.unit)
        const innerW = Math.max(8, (G.r - G.strokeW) * 1.5)
        const rawValue = tail ? `${head}${tail}` : head
        const preferred = Math.max(FORM_BODY_FLOOR, Math.min(40, G.r * 0.55))
        const lineOpts = {
          maxWidth: innerW,
          fontSize: preferred,
          floor: FORM_BODY_FLOOR,
          bold: true,
          fontFamily: ctx.fonts.heading,
        }
        const valueFit = fitFormLine(rawValue, lineOpts)
        const stackUnit = Boolean(tail && valueFit.truncated)
        const headFit = stackUnit ? fitFormLine(head, lineOpts) : valueFit
        const tailFit = stackUnit
          ? fitFormLine(tail!, {
              maxWidth: innerW,
              fontSize: FORM_BODY_FLOOR,
              floor: FORM_BODY_FLOOR,
              bold: true,
              fontFamily: ctx.fonts.heading,
            })
          : null
        const valueSize = headFit.fontSize
        const valueInk = hot ? accessibleInk(danger, pageBg, valueSize) : accessibleInk(arc, pageBg, valueSize)
        const label = fitFormLine(item.label, {
          maxWidth: G.cellW - 16,
          fontSize: 16,
          floor: FORM_BODY_FLOOR,
          bold: true,
          fontFamily: ctx.fonts.body,
        })
        const source = item.source
          ? fitFormLine(item.source, { maxWidth: G.cellW - 16, fontSize: 12, floor: 12, fontFamily: ctx.fonts.body })
          : null
        const labelY = cy + G.r + G.strokeW / 2 + 22
        const iconSize = 14
        const showIcon = Boolean(item.icon) && G.r >= 48
        return (
          <g key={i}>
            <circle
              cx={cx}
              cy={cy}
              r={G.r}
              fill="none"
              stroke={track}
              strokeWidth={G.strokeW}
            />
            {d ? (
              <path d={d} fill="none" stroke={arc} strokeWidth={G.strokeW} strokeLinecap="butt" />
            ) : null}
            {showIcon && item.icon ? (
              <Icon
                name={item.icon}
                x={cx - iconSize / 2}
                y={cy - G.r * 0.55}
                size={iconSize}
                color={accessibleInk(ctx.colors.primary, pageBg, iconSize)}
              />
            ) : null}
            {tailFit ? (
              <>
                <text
                  x={cx}
                  y={cy - tailFit.fontSize * 0.35 + valueSize * BASELINE_FUDGE}
                  textAnchor="middle"
                  fontSize={valueSize}
                  fontWeight="bold"
                  fill={valueInk}
                  fontFamily={ctx.fonts.heading}
                  dominantBaseline="alphabetic"
                >
                  {headFit.text}
                </text>
                <text
                  x={cx}
                  y={cy + tailFit.fontSize * 0.95}
                  textAnchor="middle"
                  fontSize={tailFit.fontSize}
                  fontWeight="bold"
                  fill={valueInk}
                  fontFamily={ctx.fonts.heading}
                  dominantBaseline="alphabetic"
                >
                  {tailFit.text}
                </text>
              </>
            ) : (
              <text
                x={cx}
                y={cy + valueSize * BASELINE_FUDGE}
                textAnchor="middle"
                fontSize={valueSize}
                fontWeight="bold"
                fill={valueInk}
                fontFamily={ctx.fonts.heading}
                dominantBaseline="alphabetic"
              >
                {headFit.text}
              </text>
            )}
            <text
              data-truncated={label.truncated ? "1" : undefined}
              x={cx}
              y={labelY}
              textAnchor="middle"
              fontSize={label.fontSize}
              fontWeight="bold"
              fill={hot ? valueInk : ctx.colors.text}
              fontFamily={ctx.fonts.body}
              dominantBaseline="alphabetic"
            >
              {label.text}
            </text>
            {source ? (
              <text
                data-truncated={source.truncated ? "1" : undefined}
                x={cx}
                y={labelY + 18}
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
