import type { ReactElement } from "react"
import type { Component } from "@/ir"
import { fitSvgLine, layoutSvgText, truncateToUnits } from "../../../lib/svg-text-layout"
import { accessibleInk } from "../../ink"
import type { FormKnobs } from "../form-assignments"
import type { ComponentBox, ComponentCtx } from "../types"

type CycleComponent = Extract<Component, { type: "cycle" }>

/** 12 o'clock, clockwise. Same convention as the default cycle renderer. */
function nodeAngle(i: number, n: number): number {
  return -Math.PI / 2 + (i * 2 * Math.PI) / n
}

const CURRENT_R = 46
const OTHER_RADII = [34, 40, 28, 36, 32, 38, 30]
const NODE_GAP = 28
const MIN_RING_R = 160
const GAP_NODE_DESC = 14
const DESC_W = 176
const DESC_MAX_LINES = 2
const DESC_FONT = 13
const DESC_MIN_FONT = 9
const DESC_LINE_RATIO = 1.3
const TITLE_FONT = 20
const TITLE_MIN = 13
const TITLE_BAND = 36
const TITLE_PAD = 6
const NODE_TEXT_RATIO = 0.72
const MAX_H = 400
const MAX_UPSCALE = 1.15

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

function resolveLoop(component: CycleComponent, w: number, knobs: FormKnobs): LoopGeom {
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
  const scale = Math.min(w / localW, MAX_H / localH, MAX_UPSCALE)
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
  const g = resolveLoop(component, box.w, knobs)
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
        const fit = fitSvgLine(item.label, {
          maxWidth: 2 * nr * NODE_TEXT_RATIO,
          fontSize: Math.max(10, Math.round((current ? 22 : 18) * scale)),
          minFontSize: 10,
          fontFamily: ctx.fonts.body,
        })
        const preferred = current ? ctx.colors.accent : ctx.colors.muted
        const ink = accessibleInk(preferred, fill, fit.fontSize)
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
            <text
              data-truncated={fit.truncated ? "1" : undefined}
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily={ctx.fonts.body}
              fontSize={fit.fontSize}
              fontWeight={current ? "700" : "600"}
              fill={ink}
            >
              {fit.text}
            </text>
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
        const wrapped = layoutSvgText(item.description, {
          maxWidth,
          fontSize: Math.max(DESC_MIN_FONT, Math.round(DESC_FONT * scale)),
          maxLines: DESC_MAX_LINES,
          lineHeightRatio: DESC_LINE_RATIO,
          fontFamily: ctx.fonts.body,
        })
        const maxUnits = maxWidth / wrapped.fontSize
        const lines = wrapped.lines.map((line) => truncateToUnits(line, maxUnits))
        const truncated = lines.some((line, li) => line !== wrapped.lines[li])
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
          const title = fitSvgLine(component.title!, {
            maxWidth: 2 * g.halfW * scale * 0.9,
            fontSize: Math.max(TITLE_MIN, Math.round(TITLE_FONT * scale)),
            minFontSize: TITLE_MIN,
            bold: true,
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
