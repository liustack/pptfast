import type React from "react"
import type { Component } from "@/ir"
import { fitSvgLine, layoutSvgText } from "../../../lib/svg-text-layout"
import { mixHex } from "../color-mix"
import { readableOn } from "../../ink"
import type { FormKnobs } from "../form-assignments"
import type { ComponentBox, ComponentCtx } from "../types"

type StepsComponent = Extract<Component, { type: "steps" }>

const MIN_ARROW_W = 180
const THRESHOLD_GAP = 40
const GAP = 20
const ARROW_H = 100
const BADGE_R = 22
const TITLE_SIZE = 18
const FOOT_SIZE = 14
const FOOT_GAP = 14

function needsVertical(n: number, w: number): boolean {
  return n * MIN_ARROW_W + (n - 1) * THRESHOLD_GAP > w
}

function arrowFill(knobs: FormKnobs, ctx: ComponentCtx): string {
  return knobs.arrow === "chevron" ? ctx.colors.accent : ctx.colors.primary
}

function chevronPath(x: number, y: number, w: number, h: number): string {
  const head = Math.min(56, w * 0.28)
  const overhang = Math.min(22, h * 0.28)
  const bodyRight = x + w - head
  const midY = y + h / 2
  return `M ${x} ${y + overhang} L ${bodyRight} ${y + overhang} L ${bodyRight} ${y} L ${x + w} ${midY} L ${bodyRight} ${y + h} L ${bodyRight} ${y + h - overhang} L ${x} ${y + h - overhang} Z`
}

function notchPath(x: number, y: number, w: number, h: number): string {
  const head = Math.min(48, w * 0.22)
  const bodyRight = x + w - head
  const midY = y + h / 2
  return `M ${x} ${y} L ${bodyRight} ${y} L ${x + w} ${midY} L ${bodyRight} ${y + h} L ${x} ${y + h} Z`
}

function slopePath(x: number, y: number, w: number, h: number): string {
  const head = Math.min(48, w * 0.24)
  const overhang = Math.min(12, h * 0.14)
  const bodyRight = x + w - head
  const midY = y + h / 2
  return `M ${x} ${y + overhang} L ${bodyRight} ${y + overhang} L ${bodyRight} ${y} L ${x + w} ${midY} L ${bodyRight} ${y + h} L ${bodyRight} ${y + h - overhang} L ${x} ${y + h - overhang} Z`
}

function arrowD(knobs: FormKnobs, x: number, y: number, w: number, h: number): string {
  if (knobs.arrow === "notch") return notchPath(x, y, w, h)
  if (knobs.arrow === "slope") return slopePath(x, y, w, h)
  return chevronPath(x, y, w, h)
}

function padIndex(i: number): string {
  return String(i + 1).padStart(2, "0")
}

function footnoteH(text: string, maxWidth: number, fontFamily: string): number {
  const laid = layoutSvgText(text, {
    maxWidth,
    fontSize: FOOT_SIZE,
    maxLines: 3,
    lineHeightRatio: 1.35,
    fontFamily,
  })
  return laid.lines.length * laid.lineHeight
}

function itemFootH(component: StepsComponent, slotW: number, fontFamily: string): number {
  return Math.max(FOOT_SIZE, ...component.items.map((item) => footnoteH(item.text, slotW, fontFamily)))
}

export function measureArrowSteps(
  component: StepsComponent,
  w: number,
  ctx: ComponentCtx,
  knobs: FormKnobs,
): number {
  const n = component.items.length
  const vertical = needsVertical(n, w)
  const slotW = vertical ? w : (w - GAP * (n - 1)) / n
  const foot = itemFootH(component, Math.max(1, slotW), ctx.fonts.body)
  const pulse = knobs.pulseLine ? 28 : 0
  if (vertical) return n * (ARROW_H + FOOT_GAP + foot + GAP) - GAP + pulse
  return ARROW_H + FOOT_GAP + foot + pulse
}

function renderBadge(
  knobs: FormKnobs,
  cx: number,
  cy: number,
  arrowX: number,
  arrowY: number,
  arrowH: number,
  index: number,
  fill: string,
  ctx: ComponentCtx,
): React.ReactElement {
  const label = padIndex(index)
  const pageBg = ctx.defaultBg ?? ctx.colors.bg
  if (knobs.badge === "square-solid") {
    const bw = 44
    const bx = arrowX
    const inkBg = mixHex(fill, ctx.colors.text, 0.42)
    return (
      <>
        <rect x={bx} y={arrowY} width={bw} height={arrowH} fill={inkBg} />
        <text
          x={bx + bw / 2}
          y={cy + 8}
          textAnchor="middle"
          fontSize={20}
          fontWeight="700"
          fill={readableOn(inkBg)}
          fontFamily={ctx.fonts.body}
          dominantBaseline="alphabetic"
        >
          {label}
        </text>
      </>
    )
  }
  if (knobs.badge === "circle-solid") {
    const badgeFill = ctx.colors.accent
    return (
      <>
        <circle cx={cx} cy={cy} r={BADGE_R} fill={badgeFill} />
        <text
          x={cx}
          y={cy + 7}
          textAnchor="middle"
          fontSize={14}
          fontWeight="700"
          fill={readableOn(badgeFill)}
          fontFamily={ctx.fonts.body}
          dominantBaseline="alphabetic"
        >
          {label}
        </text>
      </>
    )
  }
  return (
    <>
      <circle cx={cx} cy={cy} r={BADGE_R} fill={pageBg} stroke={fill} strokeWidth={2.5} />
      <text
        x={cx}
        y={cy + 7}
        textAnchor="middle"
        fontSize={14}
        fontWeight="700"
        fill={fill}
        fontFamily={ctx.fonts.body}
        dominantBaseline="alphabetic"
      >
        {label}
      </text>
    </>
  )
}

export function renderArrowSteps(
  component: StepsComponent,
  box: ComponentBox,
  ctx: ComponentCtx,
  knobs: FormKnobs,
): React.ReactElement {
  const n = component.items.length
  const vertical = needsVertical(n, box.w)
  const slotW = vertical ? box.w : (box.w - GAP * (n - 1)) / n
  const fill = arrowFill(knobs, ctx)
  const ink = readableOn(fill)
  const footH = itemFootH(component, Math.max(1, slotW), ctx.fonts.body)
  const stride = ARROW_H + FOOT_GAP + footH + (vertical ? GAP : 0)
  const titleMaxW = Math.max(1, slotW - BADGE_R * 2 - 28)

  return (
    <g transform={`translate(${box.x},${box.y})`}>
      {component.items.map((item, i) => {
        const x = vertical ? 0 : i * (slotW + GAP)
        const y = vertical ? i * stride : 0
        const cx = x + BADGE_R
        const cy = y + ARROW_H / 2
        const title = fitSvgLine(item.title, {
          maxWidth: titleMaxW,
          fontSize: TITLE_SIZE,
          minFontSize: 12,
          bold: true,
          fontFamily: ctx.fonts.heading,
        })
        const foot = layoutSvgText(item.text, {
          maxWidth: Math.max(1, slotW),
          fontSize: FOOT_SIZE,
          maxLines: 3,
          lineHeightRatio: 1.35,
          fontFamily: ctx.fonts.body,
        })
        const titleX = x + BADGE_R * 2 + 10
        return (
          <g key={i}>
            <path d={arrowD(knobs, x, y, slotW, ARROW_H)} fill={fill} />
            {renderBadge(knobs, cx, cy, x, y, ARROW_H, i, fill, ctx)}
            <text
              data-truncated={title.truncated ? "1" : undefined}
              x={titleX}
              y={cy + 6}
              fontSize={title.fontSize}
              fontWeight="700"
              fill={ink}
              fontFamily={ctx.fonts.heading}
              dominantBaseline="alphabetic"
            >
              {title.text}
            </text>
            {foot.lines.map((line, li) => (
              <text
                key={li}
                x={x}
                y={y + ARROW_H + FOOT_GAP + (li + 1) * foot.lineHeight}
                fontSize={foot.fontSize}
                fill={ctx.colors.muted}
                fontFamily={ctx.fonts.body}
                dominantBaseline="alphabetic"
              >
                {line}
              </text>
            ))}
          </g>
        )
      })}
      {knobs.pulseLine ? (
        <path
          d={(() => {
            const y = vertical ? n * stride - GAP + 16 : ARROW_H + FOOT_GAP + footH + 16
            const mid = box.w * 0.32
            return `M 0 ${y} L ${mid} ${y} L ${mid + 12} ${y - 16} L ${mid + 28} ${y + 16} L ${mid + 40} ${y} L ${box.w} ${y}`
          })()}
          fill="none"
          stroke={ctx.colors.border ?? ctx.colors.muted}
          strokeWidth={2}
        />
      ) : null}
    </g>
  )
}
