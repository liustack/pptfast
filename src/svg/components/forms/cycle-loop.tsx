import type { ReactElement } from "react"
import type { Component } from "@/ir"
import { accessibleInk } from "../../ink"
import type { FormKnobs } from "../form-assignments"
import type { ComponentBox, ComponentCtx } from "../types"
import {
  FORM_BODY_FLOOR,
  FORM_TITLE_FLOOR,
  capFormBody,
  fitFormTitleLine,
  layoutFormBody,
  layoutFormTitle,
} from "./legibility"

type CycleComponent = Extract<Component, { type: "cycle" }>

/** 12 o'clock, clockwise. Same convention as the default cycle renderer. */
function nodeAngle(i: number, n: number): number {
  return -Math.PI / 2 + (i * 2 * Math.PI) / n
}

const CURRENT_R = 40
const OTHER_RADII = [31, 36, 30, 33, 30, 34, 30]
const NODE_GAP = 22
const MIN_RING_R = 110
const GAP_NODE_DESC = 14
const DESC_W = 176
const DESC_MAX_LINES = 3
const DESC_FONT = 15
const DESC_LINE_RATIO = 1.3
const TITLE_FONT = 20
const TITLE_MIN = FORM_TITLE_FLOOR
const TITLE_BAND = 36
const TITLE_PAD = 6
const NODE_TEXT_RATIO = 0.42
const MAX_H = 480
const MAX_UPSCALE = 1

function nodeRadius(i: number, highlightFirst: boolean): number {
  if (highlightFirst && i === 0) return CURRENT_R
  const offset = highlightFirst ? i - 1 : i
  return OTHER_RADII[((offset % OTHER_RADII.length) + OTHER_RADII.length) % OTHER_RADII.length]!
}

function ringRadius(n: number, radii: number[]): number {
  let maxChord = 0
  for (let i = 0; i < n; i++) {
    maxChord = Math.max(maxChord, radii[i]! + radii[(i + 1) % n]! + NODE_GAP)
  }
  return Math.max(MIN_RING_R, maxChord / (2 * Math.sin(Math.PI / n)))
}

interface LoopGeom {
  n: number
  scale: number
  ox: number
  oy: number
  ringR: number
  radii: number[]
  hasTitle: boolean
  h: number
  halfW: number
}

function resolveLoop(component: CycleComponent, w: number, knobs: FormKnobs, boxH?: number): LoopGeom {
  const n = component.items.length
  const highlightFirst = knobs.highlightFirst !== false
  const radii = component.items.map((_, i) => nodeRadius(i, highlightFirst))
  const ringR = ringRadius(n, radii)
  const maxR = Math.max(...radii)
  const hasTitle = !!component.title?.trim()
  const hasDesc = component.items.some((it) => !!it.description?.trim())
  const descBlockH = DESC_MAX_LINES * Math.round(DESC_FONT * DESC_LINE_RATIO)
  const halfW = ringR + maxR + (hasDesc ? GAP_NODE_DESC + DESC_W : 10)
  const halfH = ringR + maxR + (hasDesc ? GAP_NODE_DESC + descBlockH : 10)
  const titleBand = hasTitle ? TITLE_BAND : 0
  const localW = 2 * halfW
  const localH = 2 * halfH + titleBand
  const widthScale = w / Math.max(localW, 1)
  const heightBudget = boxH != null && boxH > 0 ? boxH : MAX_H
  const heightScale = heightBudget / Math.max(localH, 1)
  const scale = Math.min(widthScale, heightScale, MAX_UPSCALE)
  return {
    n,
    scale,
    ox: w / 2,
    oy: (halfH + titleBand) * scale,
    ringR,
    radii,
    hasTitle,
    h: localH * scale,
    halfW,
  }
}

function ringDash(ring: FormKnobs["ring"]): string | undefined {
  if (ring === "dotted") return "2 6"
  if (ring === "solid") return undefined
  return "8 8"
}

export function measureCycleLoop(
  component: CycleComponent,
  w: number,
  _ctx: ComponentCtx,
  knobs: FormKnobs,
): number {
  return resolveLoop(component, w, knobs).h
}

export function renderCycleLoop(
  component: CycleComponent,
  box: ComponentBox,
  ctx: ComponentCtx,
  knobs: FormKnobs,
): ReactElement {
  const g = resolveLoop(component, box.w, knobs, box.h)
  const { n, scale, ox, oy, ringR, radii, hasTitle } = g
  const r = ringR * scale
  const dash = ringDash(knobs.ring)
  const ringStroke =
    knobs.ring === "solid" ? (ctx.colors.border ?? ctx.colors.muted) : ctx.colors.accent
  const border = ctx.colors.border ?? ctx.colors.muted
  const highlightFirst = knobs.highlightFirst !== false

  const ringD = `M ${ox} ${oy - r} A ${r} ${r} 0 0 1 ${ox} ${oy + r} A ${r} ${r} 0 0 1 ${ox} ${oy - r}`

  return (
    <g transform={`translate(${box.x},${box.y})`}>
      <path
        d={ringD}
        fill="none"
        stroke={ringStroke}
        strokeWidth={knobs.ring === "solid" ? 2 : 1.5}
        strokeDasharray={dash}
      />
      {component.items.map((item, i) => {
        const a = nodeAngle(i, n)
        const nr = radii[i]! * scale
        const cx = ox + Math.cos(a) * ringR * scale
        const cy = oy + Math.sin(a) * ringR * scale
        const current = highlightFirst && i === 0
        const fill = ctx.colors.surface
        const stroke = current ? ctx.colors.accent : border
        const nodeFont = Math.max(
          FORM_BODY_FLOOR,
          Math.min(FORM_TITLE_FLOOR, Math.round(nr * NODE_TEXT_RATIO)),
        )
        const fit = layoutFormTitle(item.label, {
          maxWidth: 2 * nr * 0.72,
          fontSize: nodeFont,
          floor: FORM_BODY_FLOOR,
          maxLines: 2,
          fontFamily: ctx.fonts.body,
        })
        const preferred = current ? ctx.colors.accent : ctx.colors.muted
        const ink = accessibleInk(preferred, fill, fit.fontSize)
        const totalH = fit.lines.length * fit.lineHeight
        const top = cy - totalH / 2
        return (
          <g key={`node-${i}`} data-audit-box={`${box.x + cx - nr},${box.y + cy - nr},${2 * nr}`}>
            <circle
              cx={cx}
              cy={cy}
              r={nr}
              fill={fill}
              stroke={stroke}
              strokeWidth={current ? 2 : 1.25}
            />
            {fit.lines.map((line, li) => (
              <text
                key={li}
                data-truncated={fit.truncated && li === fit.lines.length - 1 ? "1" : undefined}
                x={cx}
                y={top + li * fit.lineHeight + fit.fontSize * 0.85}
                textAnchor="middle"
                fontFamily={ctx.fonts.body}
                fontSize={fit.fontSize}
                fontWeight={current ? "700" : "600"}
                fill={ink}
              >
                {line}
              </text>
            ))}
          </g>
        )
      })}
      {component.items.map((item, i) => {
        if (!item.description?.trim()) return null
        const a = nodeAngle(i, n)
        const outward = { x: Math.cos(a), y: Math.sin(a) }
        const nr = radii[i]!
        const anchorR = (ringR + nr + GAP_NODE_DESC) * scale
        const ax = ox + outward.x * anchorR
        const ay = oy + outward.y * anchorR
        const maxWidth = DESC_W * scale
        const nodeFont = Math.max(
          FORM_BODY_FLOOR,
          Math.min(FORM_TITLE_FLOOR, Math.round(nr * scale * NODE_TEXT_RATIO)),
        )
        const wrapped = layoutFormBody(item.description, {
          maxWidth,
          fontSize: capFormBody(nodeFont, Math.round(DESC_FONT * scale)),
          titleSize: nodeFont,
          maxLines: DESC_MAX_LINES,
          lineHeightRatio: DESC_LINE_RATIO,
          fontFamily: ctx.fonts.body,
        })
        const lines = wrapped.lines
        const truncated = wrapped.truncated
        const textAnchor = outward.x > 0.3 ? "start" : outward.x < -0.3 ? "end" : "middle"
        const stackUp = outward.y < 0
        const totalH = lines.length * wrapped.lineHeight
        const topY = stackUp ? ay - totalH : ay
        return (
          <g key={`desc-${i}`}>
            {lines.map((line, li) => (
              <text
                key={li}
                data-truncated={truncated ? "1" : undefined}
                x={ax}
                y={topY + li * wrapped.lineHeight + wrapped.fontSize}
                textAnchor={textAnchor}
                fontFamily={ctx.fonts.body}
                fontSize={wrapped.fontSize}
                fill={accessibleInk(ctx.colors.muted, ctx.defaultBg ?? ctx.colors.bg, wrapped.fontSize)}
              >
                {line}
              </text>
            ))}
          </g>
        )
      })}
      {hasTitle &&
        (() => {
          const title = fitFormTitleLine(component.title!, {
            maxWidth: 2 * g.halfW * scale * 0.9,
            fontSize: Math.max(TITLE_MIN, Math.round(TITLE_FONT * scale)),
            fontFamily: ctx.fonts.heading,
          })
          return (
            <text
              data-truncated={title.truncated ? "1" : undefined}
              x={ox}
              y={TITLE_PAD * scale + title.fontSize}
              textAnchor="middle"
              fontFamily={ctx.fonts.heading}
              fontSize={title.fontSize}
              fontWeight="700"
              fill={ctx.colors.text}
            >
              {title.text}
            </text>
          )
        })()}
    </g>
  )
}
