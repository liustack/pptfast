import type { ReactElement } from "react"
import type { Component } from "@/ir"
import { mixHex } from "../color-mix"
import { accessibleInk, readableOn } from "../../ink"
import { Icon } from "../../icons"
import type { FormKnobs } from "../form-assignments"
import type { ComponentBox, ComponentCtx } from "../types"
import {
  FORM_BODY_FLOOR,
  FORM_TITLE_FLOOR,
  fitFormLine,
  layoutFormBody,
  layoutFormTitle,
} from "./legibility"

type CycleComponent = Extract<Component, { type: "cycle" }>
type CycleItem = CycleComponent["items"][number] & { icon?: string }

function itemIcon(item: CycleComponent["items"][number]): string | undefined {
  const icon = (item as CycleItem).icon
  return typeof icon === "string" && icon.length > 0 ? icon : undefined
}

function nodeAngle(i: number, n: number): number {
  return -Math.PI / 2 + (i * 2 * Math.PI) / n
}

const OUTER = 150
const INNER = 40
const HUB_R = 62
const CALL_W = 200
const CALL_GAP = 22
const DOT_R = 4
const MAX_CALL_PER_SIDE = 2
const MAX_H = 400
const MAX_UPSCALE = 1.15
const PAD = 10

function petalFill(ctx: ComponentCtx, petalAlt: boolean, i: number): string {
  if (!petalAlt) {
    return i % 2 === 0 ? ctx.colors.surface : mixHex(ctx.colors.surface, ctx.colors.primary, 0.22)
  }
  return i % 2 === 0 ? mixHex(ctx.colors.surface, ctx.colors.primary, 0.35) : ctx.colors.surface
}

function petalD(cx: number, cy: number, innerR: number, outerR: number, a0: number, a1: number): string {
  const pt = (r: number, a: number) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  const i0 = pt(innerR, a0)
  const o0 = pt(outerR, a0)
  const o1 = pt(outerR, a1)
  const i1 = pt(innerR, a1)
  const large = a1 - a0 > Math.PI ? 1 : 0
  const n = (v: number) => Math.round(v * 100) / 100
  return `M ${n(i0.x)} ${n(i0.y)} L ${n(o0.x)} ${n(o0.y)} A ${n(outerR)} ${n(outerR)} 0 ${large} 1 ${n(o1.x)} ${n(o1.y)} L ${n(i1.x)} ${n(i1.y)} Z`
}

interface Callout {
  i: number
  side: "left" | "right"
  mid: number
}

function pickCallouts(n: number): { callouts: Callout[]; petalOnly: number[] } {
  const items = Array.from({ length: n }, (_, i) => {
    const mid = nodeAngle(i, n) + Math.PI / n
    const side: "left" | "right" = Math.cos(mid) < 0 ? "left" : "right"
    return { i, side, mid, vert: Math.abs(Math.sin(mid)) }
  })
  const callouts: Callout[] = []
  const petalOnly: number[] = []
  for (const side of ["left", "right"] as const) {
    const group = items.filter((it) => it.side === side).sort((a, b) => b.vert - a.vert)
    group.forEach((it, idx) => {
      if (idx < MAX_CALL_PER_SIDE) callouts.push({ i: it.i, side, mid: it.mid })
      else petalOnly.push(it.i)
    })
  }
  callouts.sort((a, b) => a.i - b.i)
  petalOnly.sort((a, b) => a - b)
  return { callouts, petalOnly }
}

interface WheelGeom {
  scale: number
  ox: number
  oy: number
  outer: number
  inner: number
  hubR: number
  h: number
  callouts: Callout[]
  petalOnly: number[]
  calloutY: Map<number, number>
}

function resolveWheel(component: CycleComponent, w: number): WheelGeom {
  const n = component.items.length
  const { callouts, petalOnly } = pickCallouts(n)
  const minX = -(OUTER + CALL_GAP + CALL_W)
  const maxX = OUTER + CALL_GAP + CALL_W
  const minY = -(OUTER + PAD + 28)
  const maxY = OUTER + PAD + 28
  const bboxW = maxX - minX
  const bboxH = maxY - minY
  const scale = Math.min(w / bboxW, MAX_H / bboxH, MAX_UPSCALE)
  const drawnW = bboxW * scale
  const ox = (w - drawnW) / 2 + (0 - minX) * scale
  const oy = (0 - minY) * scale
  const left = callouts.filter((c) => c.side === "left").sort((a, b) => Math.sin(a.mid) - Math.sin(b.mid))
  const right = callouts.filter((c) => c.side === "right").sort((a, b) => Math.sin(a.mid) - Math.sin(b.mid))
  const ys = (count: number): number[] => {
    if (count <= 0) return []
    if (count === 1) return [oy]
    const span = OUTER * 0.72 * scale
    return Array.from({ length: count }, (_, i) => oy - span + (2 * span * i) / (count - 1))
  }
  const calloutY = new Map<number, number>()
  ys(left.length).forEach((y, i) => calloutY.set(left[i]!.i, y))
  ys(right.length).forEach((y, i) => calloutY.set(right[i]!.i, y))
  return {
    scale,
    ox,
    oy,
    outer: OUTER * scale,
    inner: INNER * scale,
    hubR: HUB_R * scale,
    h: bboxH * scale,
    callouts,
    petalOnly,
    calloutY,
  }
}

export function measurePetalWheel(
  component: CycleComponent,
  w: number,
  _ctx: ComponentCtx,
  _knobs: FormKnobs,
): number {
  return resolveWheel(component, w).h
}

export function renderPetalWheel(
  component: CycleComponent,
  box: ComponentBox,
  ctx: ComponentCtx,
  knobs: FormKnobs,
): ReactElement {
  const g = resolveWheel(component, box.w)
  const n = component.items.length
  const { ox, oy, outer, inner, hubR, scale, callouts, petalOnly, calloutY } = g
  const petalAlt = knobs.petalAlt === true
  const border = ctx.colors.border ?? ctx.colors.muted
  const hubFill = knobs.hub === "solid" ? ctx.colors.primary : ctx.colors.surface
  const hubStroke = knobs.hub === "solid" ? undefined : ctx.colors.accent
  const title = component.title?.trim() ?? ""

  return (
    <g transform={`translate(${box.x},${box.y})`}>
      {component.items.map((item, i) => {
        const a0 = nodeAngle(i, n)
        const a1 = a0 + (2 * Math.PI) / n
        const fill = petalFill(ctx, petalAlt, i)
        const icon = itemIcon(item)
        const mid = a0 + Math.PI / n
        const lr = (inner + outer) / 2
        const iconSize = Math.max(12, Math.round(20 * scale))
        const ix = ox + Math.cos(mid) * lr - iconSize / 2
        const iy = oy + Math.sin(mid) * lr - iconSize / 2
        return (
          <g key={`petal-${i}`}>
            <path
              d={petalD(ox, oy, inner, outer, a0, a1)}
              fill={fill}
              stroke={ctx.colors.bg}
              strokeWidth={Math.max(2, 3 * scale)}
            />
            {icon ? (
              <Icon name={icon} x={ix} y={iy} size={iconSize} color={readableOn(fill)} />
            ) : null}
          </g>
        )
      })}
      <circle
        cx={ox}
        cy={oy}
        r={hubR}
        fill={hubFill}
        stroke={hubStroke}
        strokeWidth={hubStroke ? 2 : undefined}
      />
      {title
        ? (() => {
            const layout = layoutFormTitle(title, {
              maxWidth: hubR * 1.55,
              fontSize: Math.max(FORM_TITLE_FLOOR, Math.round(20 * scale)),
              maxLines: 2,
              fontFamily: ctx.fonts.heading,
            })
            const totalH = layout.lines.length * layout.lineHeight
            const top = oy - totalH / 2
            const ink = knobs.hub === "solid"
              ? readableOn(hubFill)
              : accessibleInk(ctx.colors.accent, hubFill, layout.fontSize)
            return layout.lines.map((line, li) => (
              <text
                key={`hub-${li}`}
                x={ox}
                y={top + li * layout.lineHeight + layout.fontSize * 0.92}
                textAnchor="middle"
                fontFamily={ctx.fonts.heading}
                fontSize={layout.fontSize}
                fontWeight="700"
                fill={ink}
              >
                {line}
              </text>
            ))
          })()
        : null}
      {petalOnly.map((i) => {
        const item = component.items[i]!
        if (itemIcon(item)) return null
        const mid = nodeAngle(i, n) + Math.PI / n
        const lr = (inner + outer) / 2 + 6 * scale
        const x = ox + Math.cos(mid) * lr
        const y = oy + Math.sin(mid) * lr
        const chord = 2 * lr * Math.sin(Math.PI / n)
        const layout = layoutFormTitle(item.label, {
          maxWidth: Math.max(2 * FORM_TITLE_FLOOR, Math.min(chord * 0.72, 2.2 * FORM_TITLE_FLOOR)),
          fontSize: Math.max(FORM_TITLE_FLOOR, Math.round(20 * scale)),
          maxLines: 2,
          fontFamily: ctx.fonts.body,
        })
        const fill = petalFill(ctx, petalAlt, i)
        const totalH = layout.lines.length * layout.lineHeight
        const top = y - totalH / 2
        return layout.lines.map((line, li) => (
          <text
            key={`petal-label-${i}-${li}`}
            data-truncated={layout.truncated && li === layout.lines.length - 1 ? "1" : undefined}
            x={x}
            y={top + li * layout.lineHeight + layout.fontSize * 0.85}
            textAnchor="middle"
            fontFamily={ctx.fonts.body}
            fontSize={layout.fontSize}
            fontWeight="600"
            fill={readableOn(fill)}
          >
            {line}
          </text>
        ))
      })}
      {callouts.map((c) => {
        const item = component.items[c.i]!
        const mid = c.mid
        const dx = ox + Math.cos(mid) * outer
        const dy = oy + Math.sin(mid) * outer
        const cy = calloutY.get(c.i) ?? oy
        const tx = c.side === "left" ? ox - outer - CALL_GAP * scale : ox + outer + CALL_GAP * scale
        const anchor = c.side === "left" ? "end" : "start"
        const maxWidth = CALL_W * scale - 4
        const labelFit = fitFormLine(item.label, {
          maxWidth,
          fontSize: Math.max(FORM_TITLE_FLOOR, Math.round(16 * scale)),
          floor: FORM_TITLE_FLOOR,
          bold: true,
          fontFamily: ctx.fonts.body,
        })
        const desc = item.description?.trim()
        const descLayout = desc
          ? layoutFormBody(desc, {
              maxWidth,
              fontSize: Math.max(FORM_BODY_FLOOR, Math.round(13 * scale)),
              maxLines: 1,
              lineHeightRatio: 1.25,
              fontFamily: ctx.fonts.body,
            })
          : null
        const descLine = descLayout?.lines[0] ?? ""
        const blockH = labelFit.fontSize + (descLine ? descLayout!.lineHeight : 0)
        const labelY = cy - blockH / 2 + labelFit.fontSize * 0.9
        const descY = labelY + (descLayout ? descLayout.lineHeight : 0)
        return (
          <g key={`call-${c.i}`}>
            <circle cx={dx} cy={dy} r={DOT_R * scale} fill={ctx.colors.muted} />
            <line
              x1={dx}
              y1={dy}
              x2={tx}
              y2={cy}
              stroke={border}
              strokeWidth={1.5}
            />
            <text
              data-truncated={labelFit.truncated ? "1" : undefined}
              x={tx}
              y={labelY}
              textAnchor={anchor}
              fontFamily={ctx.fonts.body}
              fontSize={labelFit.fontSize}
              fontWeight="700"
              fill={ctx.colors.text}
            >
              {labelFit.text}
            </text>
            {descLine ? (
              <text
                x={tx}
                y={descY}
                textAnchor={anchor}
                fontFamily={ctx.fonts.body}
                fontSize={descLayout!.fontSize}
                fill={accessibleInk(ctx.colors.muted, ctx.defaultBg ?? ctx.colors.bg, descLayout!.fontSize)}
              >
                {descLine}
              </text>
            ) : null}
          </g>
        )
      })}
    </g>
  )
}
