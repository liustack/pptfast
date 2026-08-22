import type { ReactElement } from "react"
import type { Component } from "@/ir"
import { accessibleInk, readableOn } from "../../ink"
import type { FormKnobs } from "../form-assignments"
import type { ComponentBox, ComponentCtx } from "../types"
import {
  FORM_BODY_FLOOR,
  FORM_TITLE_FLOOR,
  layoutFormBody,
  layoutFormTitle,
} from "./legibility"

type CycleComponent = Extract<Component, { type: "cycle" }>

function nodeAngle(i: number, n: number): number {
  return -Math.PI / 2 + (i * 2 * Math.PI) / n
}

const MAX_H = 400
const MAX_UPSCALE = 1.12
const PAD = 8

interface Capsule {
  i: number
  x: number
  y: number
  w: number
  h: number
  badge: "left" | "right"
}

function sizes(n: number): { capW: number; capH: number; hubR: number; spoke: number } {
  if (n <= 3) return { capW: 300, capH: 88, hubR: 92, spoke: 36 }
  if (n === 4) return { capW: 300, capH: 88, hubR: 92, spoke: 32 }
  if (n <= 6) return { capW: 230, capH: 76, hubR: 72, spoke: 24 }
  return { capW: 200, capH: 68, hubR: 56, spoke: 18 }
}

function placeCapsules(n: number, capW: number, capH: number, hubR: number, spoke: number): Capsule[] {
  if (n === 2) {
    return [
      { i: 0, x: -(hubR + spoke + capW), y: -capH / 2, w: capW, h: capH, badge: "left" },
      { i: 1, x: hubR + spoke, y: -capH / 2, w: capW, h: capH, badge: "right" },
    ]
  }
  if (n === 3) {
    return [
      { i: 0, x: -capW / 2, y: -(hubR + spoke + capH), w: capW, h: capH, badge: "left" },
      { i: 1, x: hubR + spoke, y: -capH / 2, w: capW, h: capH, badge: "right" },
      { i: 2, x: -(hubR + spoke + capW), y: -capH / 2, w: capW, h: capH, badge: "left" },
    ]
  }
  if (n === 4) {
    const dx = hubR + spoke
    const dy = hubR * 0.58
    return [
      { i: 0, x: -dx - capW, y: -dy - capH / 2, w: capW, h: capH, badge: "left" },
      { i: 1, x: dx, y: -dy - capH / 2, w: capW, h: capH, badge: "right" },
      { i: 2, x: -dx - capW, y: dy - capH / 2, w: capW, h: capH, badge: "left" },
      { i: 3, x: dx, y: dy - capH / 2, w: capW, h: capH, badge: "right" },
    ]
  }
  return Array.from({ length: n }, (_, i) => {
    const a = nodeAngle(i, n)
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    const ix = cos * (hubR + spoke)
    const iy = sin * (hubR + spoke)
    if (cos >= 0.3) {
      return { i, x: ix, y: iy - capH / 2, w: capW, h: capH, badge: "right" as const }
    }
    if (cos <= -0.3) {
      return { i, x: ix - capW, y: iy - capH / 2, w: capW, h: capH, badge: "left" as const }
    }
    if (sin < 0) {
      return { i, x: ix - capW / 2, y: iy - capH, w: capW, h: capH, badge: "left" as const }
    }
    return { i, x: ix - capW / 2, y: iy, w: capW, h: capH, badge: "left" as const }
  })
}

interface HubGeom {
  scale: number
  ox: number
  oy: number
  hubR: number
  caps: Capsule[]
  h: number
}

function resolveHub(component: CycleComponent, w: number): HubGeom {
  const n = component.items.length
  const { capW, capH, hubR, spoke } = sizes(n)
  const caps = placeCapsules(n, capW, capH, hubR, spoke)
  let minX = -hubR
  let minY = -hubR
  let maxX = hubR
  let maxY = hubR
  for (const c of caps) {
    minX = Math.min(minX, c.x)
    minY = Math.min(minY, c.y)
    maxX = Math.max(maxX, c.x + c.w)
    maxY = Math.max(maxY, c.y + c.h)
  }
  minX -= PAD
  minY -= PAD
  maxX += PAD
  maxY += PAD
  const bboxW = maxX - minX
  const bboxH = maxY - minY
  const scale = Math.min(w / bboxW, MAX_H / bboxH, MAX_UPSCALE)
  const drawnW = bboxW * scale
  const ox = (w - drawnW) / 2 + (0 - minX) * scale
  const oy = (0 - minY) * scale
  return {
    scale,
    ox,
    oy,
    hubR,
    caps: caps.map((c) => ({
      ...c,
      x: ox + c.x * scale,
      y: oy + c.y * scale,
      w: c.w * scale,
      h: c.h * scale,
    })),
    h: bboxH * scale,
  }
}

function spokeEnd(ox: number, oy: number, cap: Capsule): { x: number; y: number } {
  const r = cap.h / 2
  const x0 = cap.x + r
  const x1 = cap.x + cap.w - r
  const cy = cap.y + r
  if (ox >= x0 && ox <= x1) {
    const top = cap.y
    const bot = cap.y + cap.h
    return { x: ox, y: Math.abs(oy - top) < Math.abs(oy - bot) ? top : bot }
  }
  const ccx = ox < x0 ? x0 : x1
  const vx = ox - ccx
  const vy = oy - cy
  const len = Math.hypot(vx, vy) || 1
  return { x: ccx + (vx / len) * r, y: cy + (vy / len) * r }
}

function badgeGlyph(i: number, solidHub: boolean): string {
  return solidHub ? String.fromCharCode(65 + i) : String(i + 1)
}

export function measureHubSpoke(
  component: CycleComponent,
  w: number,
  _ctx: ComponentCtx,
  _knobs: FormKnobs,
): number {
  return resolveHub(component, w).h
}

export function renderHubSpoke(
  component: CycleComponent,
  box: ComponentBox,
  ctx: ComponentCtx,
  knobs: FormKnobs,
): ReactElement {
  const g = resolveHub(component, box.w)
  const { ox, oy, caps, scale } = g
  const hubR = g.hubR * scale
  const solidHub = knobs.hub === "solid"
  const border = ctx.colors.border ?? ctx.colors.muted
  const hubFill = solidHub ? ctx.colors.primary : ctx.colors.surface
  const hubStroke = solidHub ? undefined : ctx.colors.accent
  const title = component.title?.trim() ?? ""

  return (
    <g transform={`translate(${box.x},${box.y})`}>
      {caps.map((cap) => {
        const end = spokeEnd(ox, oy, cap)
        const dx = end.x - ox
        const dy = end.y - oy
        const len = Math.hypot(dx, dy) || 1
        const x1 = ox + (dx / len) * hubR
        const y1 = oy + (dy / len) * hubR
        return (
          <line
            key={`spoke-${cap.i}`}
            x1={x1}
            y1={y1}
            x2={end.x}
            y2={end.y}
            stroke={border}
            strokeWidth={1.5}
          />
        )
      })}
      <circle
        cx={ox}
        cy={oy}
        r={hubR}
        fill={hubFill}
        stroke={hubStroke}
        strokeWidth={hubStroke ? 1.5 : undefined}
      />
      {title
        ? (() => {
            const layout = layoutFormTitle(title, {
              maxWidth: hubR * 1.55,
              fontSize: Math.max(FORM_TITLE_FLOOR, Math.round(22 * scale)),
              maxLines: 2,
              fontFamily: ctx.fonts.heading,
            })
            const lines = layout.lines
            const totalH = lines.length * layout.lineHeight
            const top = oy - totalH / 2
            const ink = solidHub
              ? readableOn(hubFill)
              : accessibleInk(ctx.colors.accent, hubFill, layout.fontSize)
            return lines.map((line, li) => (
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
      {caps.map((cap) => {
        const item = component.items[cap.i]!
        const badgeR = cap.h * 0.36
        const inset = cap.h * 0.14
        const badgeCx = cap.badge === "left" ? cap.x + inset + badgeR : cap.x + cap.w - inset - badgeR
        const badgeCy = cap.y + cap.h / 2
        const badgeFill = solidHub ? ctx.colors.surface : ctx.colors.accent
        const badgeStroke = solidHub ? ctx.colors.accent : undefined
        const glyph = badgeGlyph(cap.i, solidHub)
        const glyphSize = Math.max(FORM_BODY_FLOOR, Math.round(16 * scale))
        const glyphInk = solidHub
          ? accessibleInk(ctx.colors.primary, badgeFill, glyphSize)
          : readableOn(badgeFill)
        const textLeft = cap.badge === "left" ? badgeCx + badgeR + 8 : cap.x + 12
        const textRight = cap.badge === "left" ? cap.x + cap.w - 12 : badgeCx - badgeR - 8
        const textW = Math.max(24, textRight - textLeft)
        const anchor = cap.badge === "left" ? "start" : "end"
        const tx = cap.badge === "left" ? textLeft : textRight
        const labelFit = layoutFormTitle(item.label, {
          maxWidth: textW,
          fontSize: Math.max(FORM_TITLE_FLOOR, Math.round(16 * scale)),
          maxLines: 1,
          fontFamily: ctx.fonts.body,
        })
        const desc = item.description?.trim()
        const descBudget = cap.h - labelFit.lineHeight - 8
        const descLayout =
          desc && descBudget >= FORM_BODY_FLOOR
            ? layoutFormBody(desc, {
                maxWidth: textW,
                fontSize: Math.max(FORM_BODY_FLOOR, Math.round(13 * scale)),
                maxLines: 1,
                lineHeightRatio: 1.25,
                fontFamily: ctx.fonts.body,
              })
            : null
        const descLine = descLayout?.lines[0] ?? ""
        const labelInk = ctx.colors.text
        const descInk = accessibleInk(ctx.colors.muted, ctx.colors.surface, descLayout?.fontSize ?? 12)
        const blockH = labelFit.fontSize + (descLine ? descLayout!.lineHeight : 0)
        const labelY = cap.y + cap.h / 2 - blockH / 2 + labelFit.fontSize * 0.9
        const descY = labelY + (descLayout ? descLayout.lineHeight : 0)
        return (
          <g key={`cap-${cap.i}`}>
            <rect
              x={cap.x}
              y={cap.y}
              width={cap.w}
              height={cap.h}
              rx={cap.h / 2}
              fill={ctx.colors.surface}
              stroke={border}
              strokeWidth={1.25}
            />
            <circle
              cx={badgeCx}
              cy={badgeCy}
              r={badgeR}
              fill={badgeFill}
              stroke={badgeStroke}
              strokeWidth={badgeStroke ? 1.5 : undefined}
            />
            <text
              x={badgeCx}
              y={badgeCy}
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily={ctx.fonts.heading}
              fontSize={glyphSize}
              fontWeight="700"
              fill={glyphInk}
            >
              {glyph}
            </text>
            <text
              data-truncated={labelFit.truncated ? "1" : undefined}
              x={tx}
              y={labelY}
              textAnchor={anchor}
              fontFamily={ctx.fonts.body}
              fontSize={labelFit.fontSize}
              fontWeight="700"
              fill={labelInk}
            >
              {labelFit.lines[0] ?? ""}
            </text>
            {descLine ? (
              <text
                x={tx}
                y={descY}
                textAnchor={anchor}
                fontFamily={ctx.fonts.body}
                fontSize={descLayout!.fontSize}
                fill={descInk}
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
