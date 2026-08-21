import type React from "react"
import type { Component } from "@/ir"
import {
  fitSvgLine,
  layoutSvgText,
  truncateToUnits,
} from "../../../lib/svg-text-layout"
import { Icon } from "../../icons"
import { readableOn } from "../../ink"
import type { FormKnobs } from "../form-assignments"
import type { ComponentBox, ComponentCtx } from "../types"

type IconCardsComponent = Extract<Component, { type: "icon_cards" }>
type IconCardItem = IconCardsComponent["items"][number]

const GAP = 16
const PAD_X = 20
const PAD_BOTTOM = 16
const INNER_GAP = 10
const TITLE_FONT_SIZE = 22
const TITLE_MIN_FONT_SIZE = 14
const TITLE_LINE_HEIGHT_RATIO = 1.4
const TEXT_FONT_SIZE = 16
const TEXT_LINE_HEIGHT_RATIO = 1.4
const TEXT_MAX_LINES = 2
const GAP_TITLE_TEXT = 8

function colsOf(n: number): number {
  return n <= 4 ? n : 3
}

function layoutItemText(item: IconCardItem, contentW: number, ctx: ComponentCtx) {
  const title = fitSvgLine(item.title, {
    maxWidth: contentW,
    fontSize: TITLE_FONT_SIZE,
    minFontSize: TITLE_MIN_FONT_SIZE,
    bold: true,
    fontFamily: ctx.fonts.heading,
  })
  const wrapped = layoutSvgText(item.text, {
    maxWidth: contentW,
    fontSize: TEXT_FONT_SIZE,
    maxLines: TEXT_MAX_LINES,
    lineHeightRatio: TEXT_LINE_HEIGHT_RATIO,
    fontFamily: ctx.fonts.body,
  })
  const maxUnits = contentW / wrapped.fontSize
  return {
    title,
    text: {
      ...wrapped,
      lines: wrapped.lines.map((line) => truncateToUnits(line, maxUnits)),
    },
  }
}

function shellRadius(knobs: FormKnobs, ctx: ComponentCtx): number {
  if (knobs.radius === "square") return 0
  if (knobs.radius === "round") return ctx.shape?.radius ?? 16
  if (knobs.radius === "soft") return ctx.shape?.radius ?? 8
  return 0
}

function badgeRadius(cardW: number): number {
  return Math.round(Math.min(44, Math.max(28, cardW * 0.14)))
}

function renderGlyph(
  name: string,
  x: number,
  y: number,
  size: number,
  color: string,
): React.ReactElement {
  if (!name) {
    return (
      <circle
        cx={x + size / 2}
        cy={y + size / 2}
        r={Math.max(3, size / 6)}
        fill={color}
      />
    )
  }
  return <Icon name={name} x={x} y={y} size={size} color={color} />
}

function geometry(
  component: IconCardsComponent,
  w: number,
  ctx: ComponentCtx,
  boxH?: number,
) {
  const n = component.items.length
  const cols = colsOf(n)
  const rows = Math.ceil(n / cols)
  const cardW = (w - GAP * (cols - 1)) / cols
  const badgeR = badgeRadius(cardW)
  const contentW = Math.max(24, cardW - PAD_X * 2)
  const layouts = component.items.map((item) => layoutItemText(item, contentW, ctx))
  const titleLineHeight = Math.round(TITLE_FONT_SIZE * TITLE_LINE_HEIGHT_RATIO)
  const contentH = Math.max(
    ...layouts.map(
      (layout) =>
        titleLineHeight +
        GAP_TITLE_TEXT +
        layout.text.lines.length * layout.text.lineHeight,
    ),
  )
  const naturalCardH = badgeR + INNER_GAP + contentH + PAD_BOTTOM
  const measuredH = rows * (badgeR + naturalCardH) + (rows - 1) * GAP
  const grow = boxH === undefined ? 0 : Math.max(0, (boxH - measuredH) / rows)
  return {
    cols,
    rows,
    cardW,
    badgeR,
    contentW,
    layouts,
    titleLineHeight,
    cardH: naturalCardH + grow,
    measuredH,
  }
}

export function measureBadgeCards(
  component: IconCardsComponent,
  w: number,
  ctx: ComponentCtx,
  _knobs: FormKnobs,
): number {
  return geometry(component, w, ctx).measuredH
}

export function renderBadgeCards(
  component: IconCardsComponent,
  box: ComponentBox,
  ctx: ComponentCtx,
  knobs: FormKnobs,
): React.ReactElement {
  const g = geometry(component, box.w, ctx, box.h)
  const rx = shellRadius(knobs, ctx)
  const solid = knobs.badge === "circle-solid"
  const badgeFill = ctx.colors.primary
  const iconColor = solid ? readableOn(badgeFill) : ctx.colors.accent
  const border = ctx.colors.border ?? ctx.colors.muted
  const rowPitch = g.badgeR + g.cardH + GAP
  const iconSize = Math.round(g.badgeR * 0.7)

  return (
    <g transform={`translate(${box.x},${box.y})`}>
      {component.items.map((item, i) => {
        const col = i % g.cols
        const row = Math.floor(i / g.cols)
        const cardX = col * (g.cardW + GAP)
        const cardY = row * rowPitch + g.badgeR
        const cx = cardX + g.cardW / 2
        const layout = g.layouts[i]!
        const blockH =
          g.titleLineHeight +
          GAP_TITLE_TEXT +
          layout.text.lines.length * layout.text.lineHeight
        const innerTop = cardY + g.badgeR + INNER_GAP
        const innerH = g.cardH - g.badgeR - INNER_GAP - PAD_BOTTOM
        const blockTop = innerTop + Math.max(0, (innerH - blockH) / 2)
        const textTop = blockTop + g.titleLineHeight + GAP_TITLE_TEXT
        return (
          <g
            key={i}
            data-audit-box={`${box.x + cardX},${box.y + cardY},${g.cardW}`}
          >
            <rect
              x={cardX}
              y={cardY}
              width={g.cardW}
              height={g.cardH}
              rx={rx}
              fill={ctx.colors.surface}
              stroke={border}
              strokeWidth={1}
            />
            {solid ? (
              <circle cx={cx} cy={cardY} r={g.badgeR} fill={badgeFill} />
            ) : (
              <circle
                cx={cx}
                cy={cardY}
                r={g.badgeR}
                fill={badgeFill}
                stroke={ctx.colors.accent}
                strokeWidth={2}
              />
            )}
            {renderGlyph(
              item.icon,
              cx - iconSize / 2,
              cardY - iconSize / 2,
              iconSize,
              iconColor,
            )}
            <text
              data-truncated={layout.title.truncated ? "1" : undefined}
              x={cx}
              y={blockTop + layout.title.fontSize}
              textAnchor="middle"
              fontSize={layout.title.fontSize}
              fontWeight="700"
              fill={ctx.colors.text}
              fontFamily={ctx.fonts.heading}
              dominantBaseline="alphabetic"
            >
              {layout.title.text}
            </text>
            {layout.text.lines.map((line, li) => (
              <text
                key={li}
                x={cx}
                y={textTop + li * layout.text.lineHeight + layout.text.fontSize}
                textAnchor="middle"
                fontSize={layout.text.fontSize}
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
    </g>
  )
}
