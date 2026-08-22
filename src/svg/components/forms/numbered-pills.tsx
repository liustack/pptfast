import type { Component } from "@/ir"
import { layoutSvgText } from "@/lib/svg-text-layout"
import { accessibleInk, readableOn } from "../../ink"
import type { FormKnobs } from "../form-assignments"
import type { ComponentBox, ComponentCtx } from "../types"
import { FORM_BODY_FLOOR, FORM_TITLE_FLOOR, formLineHeight } from "./legibility"

type NumberedCardsComponent = Extract<Component, { type: "numbered_cards" }>

const STAGGER_X = 40
const COL_GAP = 24
const PILL_GAP = 14
const PAD = 6
const STACK_CAP = 440
const BASELINE_FUDGE = 0.35
const BODY_PILL_MIN = 72
const LEFT_CAP = 96
const MIN_PILL_W = 72
const BADGE_DIAMETER_RATIO = 0.8
const BADGE_TEXT_GAP = 14
const TEXT_PAD = 14
const OUTLINE_STROKE = 3
const TITLE_BODY_GAP = 4
const SOFT_LEFT = 88
const WRAP_PROBE_LINES = 64
const TITLE_MAX_LINES = 2
const BODY_MAX_LINES = 4

function pillRx(knobs: FormKnobs, pillH: number, ctx: ComponentCtx): number {
  if (knobs.radius === "square") return 0
  return ctx.shape?.radius ?? (knobs.radius === "soft" ? 12 : pillH / 2)
}

function layoutPills(n: number, w: number, knobs: FormKnobs, hHint?: number) {
  const stagger = knobs.stagger === true
  const staggerSpan = stagger ? STAGGER_X : 0
  const gaps = Math.max(n - 1, 0) * PILL_GAP
  let pillH = Math.min(
    88,
    Math.max(BODY_PILL_MIN, (STACK_CAP - gaps) / Math.max(n, 1)),
  )
  if (hHint != null && n > 0) {
    const fitted = (hHint - PAD * 2 - gaps) / n
    if (Number.isFinite(fitted)) pillH = Math.min(pillH, Math.max(0, fitted))
  }
  const stackH = n <= 0 ? 0 : n * pillH + gaps
  const innerW = Math.max(0, w - staggerSpan - COL_GAP - PAD * 2)
  const boxH = hHint != null && hHint > 0 ? hHint : stackH + PAD * 2
  const availH = Math.max(0, boxH - PAD * 2)
  const maxByW = Math.max(0, innerW - MIN_PILL_W)
  const maxFit = Math.min(LEFT_CAP, availH, maxByW)
  const preferred = Math.min(stackH * 0.42, innerW * 0.16, LEFT_CAP)
  // 软偏好 88，但不把主旨圆撑出剩余列
  let leftSize = Math.min(preferred, maxFit)
  if (leftSize < SOFT_LEFT) leftSize = Math.min(SOFT_LEFT, maxFit)
  leftSize = Math.max(0, leftSize)
  const pillW = Math.max(MIN_PILL_W, innerW - leftSize)
  const h = Math.max(stackH, leftSize) + PAD * 2
  return {
    n,
    stagger,
    staggerSpan,
    pillH,
    pillW,
    stackH,
    leftSize,
    h: hHint != null && hHint > 0 ? hHint : h,
    naturalH: h,
  }
}

/** Wrap at a frozen floor, then keep the lines that fit. Never ellipsizes. */
function wrapPillText(
  text: string,
  opts: {
    maxWidth: number
    fontSize: number
    maxKeep: number
    fontFamily?: string
    bold?: boolean
  },
): { lines: string[]; fontSize: number; lineHeight: number; truncated: boolean } {
  const fontSize = opts.fontSize
  const lineHeight = formLineHeight(fontSize)
  const content = text?.trim() ?? ""
  if (!content || opts.maxKeep <= 0) {
    return { lines: [], fontSize, lineHeight, truncated: false }
  }
  const laid = layoutSvgText(content, {
    maxWidth: opts.maxWidth,
    fontSize,
    minPt: fontSize,
    maxLines: WRAP_PROBE_LINES,
    fontFamily: opts.fontFamily,
    bold: opts.bold,
  })
  const lines = laid.lines.slice(0, opts.maxKeep)
  return {
    lines,
    fontSize,
    lineHeight,
    truncated: laid.lines.length > lines.length,
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
  const rx = pillRx(knobs, L.pillH, ctx)
  const showText = L.pillH >= BODY_PILL_MIN - 4
  const strokeW = outlineBadge ? OUTLINE_STROKE : 0
  const visualDiam = L.pillH * BADGE_DIAMETER_RATIO
  const badgeR = Math.max(0, (visualDiam - strokeW) / 2)
  const squareSide = Math.max(0, visualDiam)
  const visualR = badgeR + strokeW / 2
  const badgeInset = Math.max(0, (L.pillH - visualDiam) / 2)

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
        const squareBadge = node === "square" && !outlineBadge
        const badgeCx = squareBadge
          ? pillX + badgeInset + squareSide / 2
          : pillX + badgeInset + visualR
        const badgeCy = pillY + L.pillH / 2
        const badgeFill = outlineBadge ? "none" : squareBadge ? ctx.colors.primary : ctx.colors.accent
        const num = String(i + 1).padStart(2, "0")
        const badgeFont = Math.min(22, (squareBadge ? squareSide : badgeR * 2) * 0.42)
        const badgeInk = outlineBadge
          ? accessibleInk(ctx.colors.accent, surface, badgeFont)
          : readableOn(squareBadge ? ctx.colors.primary : ctx.colors.accent)
        const badgeRight = squareBadge ? pillX + badgeInset + squareSide : badgeCx + badgeR
        const textX = badgeRight + BADGE_TEXT_GAP
        const textW = Math.max(24, pillX + L.pillW - TEXT_PAD - textX)
        const innerH = Math.max(0, L.pillH - 4)
        const titleLH = formLineHeight(FORM_TITLE_FLOOR)
        const titleKeep = Math.max(1, Math.min(TITLE_MAX_LINES, Math.floor(innerH / titleLH) || 1))
        const title = wrapPillText(item.title, {
          maxWidth: textW,
          fontSize: FORM_TITLE_FLOOR,
          maxKeep: titleKeep,
          fontFamily: ctx.fonts.heading,
          bold: true,
        })
        const titleBlockH = title.lines.length * title.lineHeight
        const leftover = innerH - titleBlockH - (showText && item.text ? TITLE_BODY_GAP : 0)
        const bodyLH = formLineHeight(FORM_BODY_FLOOR)
        const bodyMaxLines =
          showText && item.text && leftover >= bodyLH
            ? Math.min(BODY_MAX_LINES, Math.floor(leftover / bodyLH))
            : 0
        const body =
          bodyMaxLines > 0 && item.text
            ? wrapPillText(item.text, {
                maxWidth: textW,
                fontSize: FORM_BODY_FLOOR,
                maxKeep: bodyMaxLines,
                fontFamily: ctx.fonts.body,
              })
            : null
        const bodyBlockH = body ? body.lines.length * body.lineHeight : 0
        const stackTextH = titleBlockH + (body ? TITLE_BODY_GAP + bodyBlockH : 0)
        const textTop = pillY + (L.pillH - stackTextH) / 2
        const titleY0 = textTop + title.fontSize * 0.85
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
              <rect
                x={pillX + badgeInset}
                y={pillY + badgeInset}
                width={squareSide}
                height={squareSide}
                fill={ctx.colors.primary}
              />
            ) : (
              <circle
                cx={badgeCx}
                cy={badgeCy}
                r={badgeR}
                fill={badgeFill}
                {...(outlineBadge ? { stroke: ctx.colors.accent, strokeWidth: OUTLINE_STROKE } : {})}
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
            {title.lines.map((line, li) => (
              <text
                key={`t-${li}`}
                data-truncated={title.truncated && li === title.lines.length - 1 ? "1" : undefined}
                x={textX}
                y={textTop + li * title.lineHeight + title.fontSize * 0.85}
                fontSize={title.fontSize}
                fontWeight="bold"
                fill={ctx.colors.text}
                fontFamily={ctx.fonts.heading}
                dominantBaseline="alphabetic"
              >
                {line}
              </text>
            ))}
            {body
              ? body.lines.map((line, li) => (
                  <text
                    key={`b-${li}`}
                    data-truncated={
                      body.truncated && li === body.lines.length - 1 ? "1" : undefined
                    }
                    x={textX}
                    y={
                      textTop +
                      titleBlockH +
                      TITLE_BODY_GAP +
                      li * body.lineHeight +
                      body.fontSize * 0.85
                    }
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
                d={`M ${textX} ${titleY0 + 6} q ${Math.min(40, (pillX + L.pillW - textX) * 0.4)} 10 ${Math.min(90, pillX + L.pillW - textX - 10)} 2`}
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
