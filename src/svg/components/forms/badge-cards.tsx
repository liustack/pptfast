import type React from "react"
import type { Component } from "@/ir"
import { Icon } from "../../icons"
import { readableOn } from "../../ink"
import type { FormKnobs } from "../form-assignments"
import type { ComponentBox, ComponentCtx } from "../types"
import {
  boardTypeScale,
  fillCardType,
  formGridCols,
  formLineHeight,
  layoutFormBody,
  layoutFormTitle,
  linesThatFit,
} from "./legibility"

type IconCardsComponent = Extract<Component, { type: "icon_cards" }>
type IconCardItem = IconCardsComponent["items"][number]

const GAP = 16
const PAD_X = 20
const PAD_BOTTOM = 16
const INNER_GAP = 10
const TITLE_LINE_HEIGHT_RATIO = 1.4
const TEXT_LINE_HEIGHT_RATIO = 1.4
const GAP_TITLE_TEXT = 8

function layoutItemText(
  item: IconCardItem,
  contentW: number,
  ctx: ComponentCtx,
  titleSize: number,
  bodySize: number,
  titleMaxLines: number,
  bodyMaxLines: number,
) {
  const title = layoutFormTitle(item.title, {
    maxWidth: contentW,
    fontSize: titleSize,
    fontFamily: ctx.fonts.heading,
    maxLines: Math.max(1, titleMaxLines),
  })
  const text =
    bodyMaxLines > 0
      ? layoutFormBody(item.text, {
          maxWidth: contentW,
          fontSize: bodySize,
          maxLines: bodyMaxLines,
          lineHeightRatio: TEXT_LINE_HEIGHT_RATIO,
          fontFamily: ctx.fonts.body,
        })
      : { lines: [] as string[], fontSize: bodySize, lineHeight: 0, truncated: false }
  return { title, text }
}

function shellRadius(knobs: FormKnobs, ctx: ComponentCtx): number {
  if (knobs.radius === "square") return 0
  if (knobs.radius === "round") return ctx.shape?.radius ?? 16
  if (knobs.radius === "soft") return ctx.shape?.radius ?? 8
  return 0
}

function badgeRadius(cardW: number, rows: number, boxH?: number): number {
  const preferred = Math.round(Math.min(44, Math.max(28, cardW * 0.14)))
  if (rows < 2 || boxH == null) return preferred
  const minContent =
    formLineHeight(20, TITLE_LINE_HEIGHT_RATIO) +
    GAP_TITLE_TEXT +
    2 * formLineHeight(15, TEXT_LINE_HEIGHT_RATIO)
  const maxR =
    (boxH - GAP * (rows - 1) - rows * (INNER_GAP + minContent + PAD_BOTTOM)) / (2 * rows)
  if (!Number.isFinite(maxR)) return preferred
  return Math.round(Math.min(preferred, Math.max(20, maxR)))
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
  const cols = formGridCols(n)
  const rows = Math.ceil(n / cols)
  const cardW = (w - GAP * (cols - 1)) / cols
  const badgeR = badgeRadius(cardW, rows, boxH)
  const contentW = Math.max(24, cardW - PAD_X * 2)
  const slotH =
    boxH != null ? Math.max(1, (boxH - GAP * (rows - 1)) / rows - badgeR) : undefined
  const start = boardTypeScale(cardW, slotH)
  const naturalInner =
    formLineHeight(start.title) +
    GAP_TITLE_TEXT +
    2 * formLineHeight(start.body)
  const naturalCardH = badgeR + INNER_GAP + naturalInner + PAD_BOTTOM
  const naturalMeasured = rows * (badgeR + naturalCardH) + (rows - 1) * GAP
  const cardH =
    boxH === undefined
      ? naturalCardH
      : Math.max(1, (boxH - GAP * (rows - 1)) / rows - badgeR)
  const innerH = Math.max(1, cardH - badgeR - INNER_GAP - PAD_BOTTOM)
  const filled = fillCardType({
    innerH,
    contentW,
    titleSize: start.title,
    bodySize: start.body,
    gap: GAP_TITLE_TEXT,
    longestBody: component.items.map((it) => it.text).sort((a, b) => b.length - a.length)[0],
    titles: component.items.map((it) => it.title),
    fonts: { heading: ctx.fonts.heading, body: ctx.fonts.body },
    titleLhRatio: TITLE_LINE_HEIGHT_RATIO,
    bodyLhRatio: TEXT_LINE_HEIGHT_RATIO,
  })
  const fit = linesThatFit({
    innerH,
    titleSize: filled.titleSize,
    bodySize: filled.bodySize,
    gap: GAP_TITLE_TEXT,
    titleMax: 2,
    bodyMax: Math.max(2, filled.bodyMaxLines),
  })
  const layouts = component.items.map((item) =>
    layoutItemText(
      item,
      contentW,
      ctx,
      filled.titleSize,
      filled.bodySize,
      fit.titleMaxLines,
      fit.bodyMaxLines,
    ),
  )
  const measuredH =
    boxH === undefined
      ? naturalMeasured
      : rows * (badgeR + cardH) + (rows - 1) * GAP
  return {
    cols,
    rows,
    cardW,
    badgeR,
    contentW,
    layouts,
    cardH,
    measuredH: boxH === undefined ? measuredH : Math.min(boxH, measuredH),
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
          layout.title.lines.length * layout.title.lineHeight +
          GAP_TITLE_TEXT +
          layout.text.lines.length * layout.text.lineHeight
        const innerTop = cardY + g.badgeR + INNER_GAP
        const innerH = g.cardH - g.badgeR - INNER_GAP - PAD_BOTTOM
        const blockTop = innerTop + Math.max(0, (innerH - blockH) / 2)
        const textTop = blockTop + layout.title.lines.length * layout.title.lineHeight + GAP_TITLE_TEXT
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
            {layout.title.lines.map((line, li) => (
              <text
                key={`t-${li}`}
                data-truncated={layout.title.truncated && li === layout.title.lines.length - 1 ? "1" : undefined}
                x={cx}
                y={blockTop + li * layout.title.lineHeight + layout.title.fontSize}
                textAnchor="middle"
                fontSize={layout.title.fontSize}
                fontWeight="700"
                fill={ctx.colors.text}
                fontFamily={ctx.fonts.heading}
                dominantBaseline="alphabetic"
              >
                {line}
              </text>
            ))}
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
