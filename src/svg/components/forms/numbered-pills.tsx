import type { Component } from "@/ir"
import { wrapClip } from "./clip-text"
import { accessibleInk, readableOn } from "../../ink"
import type { FormKnobs } from "../form-assignments"
import type { ComponentBox, ComponentCtx } from "../types"
import { FORM_BODY_FLOOR, FORM_TITLE_FLOOR, fitFormTitleLine } from "./legibility"

type NumberedCardsComponent = Extract<Component, { type: "numbered_cards" }>

const STAGGER_X = 40
const COL_GAP = 24
const PILL_GAP = 14
const PAD = 6
const STACK_CAP = 440
const BASELINE_FUDGE = 0.35
const TITLE_PILL_MIN = 52
const BODY_PILL_MIN = 72

function pillRx(knobs: FormKnobs, pillH: number): number {
  if (knobs.radius === "square") return 0
  if (knobs.radius === "soft") return 12
  return pillH / 2
}

function layoutPills(n: number, w: number, knobs: FormKnobs, hHint?: number) {
  const stagger = knobs.stagger === true
  const staggerSpan = stagger ? STAGGER_X : 0
  let pillH = Math.min(
    88,
    Math.max(BODY_PILL_MIN, (STACK_CAP - Math.max(n - 1, 0) * PILL_GAP) / Math.max(n, 1)),
  )
  if (hHint != null && n > 0) {
    const fitted = (hHint - PAD * 2 - Math.max(n - 1, 0) * PILL_GAP) / n
    if (Number.isFinite(fitted)) pillH = Math.min(pillH, Math.max(TITLE_PILL_MIN, fitted))
  }
  const stackH = n <= 0 ? 0 : n * pillH + (n - 1) * PILL_GAP
  const leftSize = Math.max(
    88,
    Math.min(stackH * 0.72, (w - staggerSpan - COL_GAP - PAD * 2) * 0.28, 240),
  )
  const pillW = Math.max(72, w - leftSize - COL_GAP - staggerSpan - PAD * 2)
  const h = Math.max(stackH, leftSize) + PAD * 2
  return {
    n,
    stagger,
    staggerSpan,
    pillH,
    pillW,
    stackH,
    leftSize,
    h: hHint ?? h,
    naturalH: h,
  }
}

export function measureNumberedPills(
  component: NumberedCardsComponent,
  w: number,
  _ctx: ComponentCtx,
  knobs: FormKnobs,
): number {
  return layoutPills(component.items.length, w, knobs).naturalH
}

export function renderNumberedPills(
  component: NumberedCardsComponent,
  box: ComponentBox,
  ctx: ComponentCtx,
  knobs: FormKnobs,
) {
  const n = component.items.length
  const L = layoutPills(n, box.w, knobs, box.h)
  const node = knobs.node ?? "circle"
  const outlineBadge = knobs.badge === "circle-outline"
  const leftFill = ctx.colors.primary
  const leftX = PAD
  const leftCY = L.h / 2
  const leftCX = leftX + L.leftSize / 2
  const leftTop = leftCY - L.leftSize / 2
  const count = String(n).padStart(2, "0")
  const countSize = Math.min(44, L.leftSize * 0.32)
  const countInk = readableOn(leftFill)
  const pillsTop = (L.h - L.stackH) / 2
  const pillsLeft = leftX + L.leftSize + COL_GAP
  const surface = ctx.colors.surface
  const border = ctx.colors.border ?? ctx.colors.muted
  const rx = pillRx(knobs, L.pillH)
  const showText = L.pillH >= BODY_PILL_MIN - 4

  return (
    <g transform={`translate(${box.x},${box.y})`}>
      {node === "square" ? (
        <rect x={leftX} y={leftTop} width={L.leftSize} height={L.leftSize} fill={leftFill} />
      ) : (
        <circle cx={leftCX} cy={leftCY} r={L.leftSize / 2} fill={leftFill} />
      )}
      <text
        x={leftCX}
        y={leftCY + countSize * BASELINE_FUDGE}
        textAnchor="middle"
        fontSize={countSize}
        fontWeight="bold"
        fill={countInk}
        fontFamily={ctx.fonts.heading}
        dominantBaseline="alphabetic"
      >
        {count}
      </text>
      {component.items.map((item, i) => {
        const pillX = pillsLeft + (L.stagger && i % 2 === 1 ? STAGGER_X : 0)
        const pillY = pillsTop + i * (L.pillH + PILL_GAP)
        const badgeR = outlineBadge ? L.pillH * 0.38 : L.pillH / 2
        const squareBadge = node === "square" && !outlineBadge
        const badgeCx = squareBadge ? pillX + L.pillH / 2 : pillX + (outlineBadge ? 10 + badgeR : badgeR)
        const badgeCy = pillY + L.pillH / 2
        const badgeFill = outlineBadge ? "none" : squareBadge ? ctx.colors.primary : ctx.colors.accent
        const num = String(i + 1).padStart(2, "0")
        const badgeFont = Math.min(22, L.pillH * 0.42)
        const badgeInk = outlineBadge
          ? accessibleInk(ctx.colors.accent, surface, badgeFont)
          : readableOn(squareBadge ? ctx.colors.primary : ctx.colors.accent)
        const textX = (squareBadge ? pillX + L.pillH : badgeCx + badgeR) + 14
        const textW = Math.max(24, pillX + L.pillW - textX - 14)
        const title = fitFormTitleLine(item.title, {
          maxWidth: textW,
          fontSize: FORM_TITLE_FLOOR,
          fontFamily: ctx.fonts.heading,
        })
        const body = showText && item.text
          ? wrapClip(item.text, {
              maxWidth: textW,
              fontSize: FORM_BODY_FLOOR,
              minPt: FORM_BODY_FLOOR,
              maxLines: 1,
              lineHeightRatio: 1.3,
              fontFamily: ctx.fonts.body,
            })
          : null
        const titleY = body
          ? pillY + L.pillH * 0.42
          : pillY + L.pillH / 2 + title.fontSize * BASELINE_FUDGE
        return (
          <g key={i}>
            <rect
              x={pillX}
              y={pillY}
              width={L.pillW}
              height={L.pillH}
              rx={rx}
              fill={surface}
              stroke={border}
              strokeWidth={1}
            />
            {squareBadge ? (
              <rect x={pillX} y={pillY} width={L.pillH} height={L.pillH} fill={ctx.colors.primary} />
            ) : (
              <circle
                cx={badgeCx}
                cy={badgeCy}
                r={badgeR}
                fill={badgeFill}
                {...(outlineBadge
                  ? { stroke: ctx.colors.accent, strokeWidth: 3 }
                  : {})}
              />
            )}
            <text
              x={badgeCx}
              y={badgeCy + badgeFont * BASELINE_FUDGE}
              textAnchor="middle"
              fontSize={badgeFont}
              fontWeight="bold"
              fill={badgeInk}
              fontFamily={ctx.fonts.heading}
              dominantBaseline="alphabetic"
            >
              {num}
            </text>
            <text
              data-truncated={title.truncated ? "1" : undefined}
              x={textX}
              y={titleY}
              fontSize={title.fontSize}
              fontWeight="bold"
              fill={ctx.colors.text}
              fontFamily={ctx.fonts.heading}
              dominantBaseline="alphabetic"
            >
              {title.text}
            </text>
            {body
              ? body.lines.map((line, li) => (
                  <text
                    key={li}
                    x={textX}
                    y={titleY + 4 + (li + 1) * body.lineHeight}
                    fontSize={body.fontSize}
                    fill={ctx.colors.muted}
                    fontFamily={ctx.fonts.body}
                    dominantBaseline="alphabetic"
                  >
                    {line}
                  </text>
                ))
              : null}
            {knobs.waveFirst && i === 0 && pillX + L.pillW - textX > 36 ? (
              <path
                d={`M ${textX} ${titleY + 6} q ${Math.min(40, (pillX + L.pillW - textX) * 0.4)} 10 ${Math.min(90, pillX + L.pillW - textX - 10)} 2`}
                stroke={ctx.colors.accent}
                strokeWidth={2.5}
                fill="none"
                strokeLinecap="round"
              />
            ) : null}
          </g>
        )
      })}
    </g>
  )
}
