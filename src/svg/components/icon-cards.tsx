import type React from "react"
import type { Component } from "@/ir"
import {
  fitSvgLine,
  layoutSvgText,
  truncateToUnits,
} from "../../lib/svg-text-layout"
import { Icon } from "../icons"
import type { ComponentBox, ComponentCtx, SvgComponent } from "./types"

type IconCardsComponent = Extract<Component, { type: "icon_cards" }>
/** A single `icon_cards` item, keyed off the schema so `icon` stays in sync
 * — same technique as `bento-layout.ts`'s `KpiItem`. */
export type IconCardItem = IconCardsComponent["items"][number]

const GAP = 16

const ICON_SIZE = 24
const GAP_ICON_TITLE = 12
const TITLE_FONT_SIZE = 20
const TITLE_MIN_FONT_SIZE = 14
// Matches callout.tsx/bullets.tsx's own line-height convention for
// body-weight text (`LINE_RATIO` / the 1.4 used in `layoutItems`) — title
// never wraps (`fitSvgLine` only shrinks/truncates a single line), so this
// is a fixed "line box" height reserved for it, not a measured value.
// `titleLineHeight` is derived from this ratio at each call site (default
// TITLE_FONT_SIZE * 1.4 = 28, unless a caller's `titleFontSize` opt overrides
// it — see `IconCardLayoutOptions`), not hoisted to its own module constant.
const TITLE_LINE_HEIGHT_RATIO = 1.4
const GAP_TITLE_TEXT = 8
const TEXT_FONT_SIZE = 15
// 15 * 1.4 = 21, matching the brief's stated line height for the 2-line
// description text.
const TEXT_LINE_HEIGHT_RATIO = 1.4
const TEXT_MAX_LINES = 2

// This file's own row-layout padding — used both by `measure`/`render` below
// to inset the standalone (non-bento) card. `templates/tech.tsx` uses
// its *own* BENTO_CARD_PAD/TOP_PAD/BOTTOM_PAD constants instead when it
// explodes an `icon_cards` item into a bento tile (same split as
// `kpi.tsx` vs. bento's own `renderKpiCardBody` padding).
const PAD_X = 24
const PAD_TOP = 20
const PAD_BOTTOM = 20

const ACCENT_W = 32
const ACCENT_H = 3
const CARD_RADIUS = 8

interface IconCardTextLayout {
  title: { text: string; fontSize: number; truncated: boolean }
  text: { lines: string[]; fontSize: number; lineHeight: number }
}

/**
 * Bento-only injection point (tech.tsx's `BENTO_ICON_CARD_TITLE_SIZE`):
 * lets a caller bump the title's *requested* font size without touching this
 * file's own `TITLE_FONT_SIZE` module constant, which `iconCards.render`'s
 * standalone row-card layout (used by the other 5 themes) still reads
 * directly and must stay byte-identical to. Omitted (`undefined`) falls back
 * to `TITLE_FONT_SIZE` everywhere below, so every existing call site is
 * unaffected.
 */
interface IconCardLayoutOptions {
  titleFontSize?: number
  /** 图标尺寸覆盖（tech bento 卡传更大值增强存在感），缺省共享 ICON_SIZE。 */
  iconSize?: number
}

function layoutIconCard(
  item: IconCardItem,
  contentW: number,
  opts: IconCardLayoutOptions = {}
): IconCardTextLayout {
  const titleFontSize = opts.titleFontSize ?? TITLE_FONT_SIZE
  const title = fitSvgLine(item.title, {
    maxWidth: contentW,
    fontSize: titleFontSize,
    minFontSize: TITLE_MIN_FONT_SIZE,
  })
  const wrapped = layoutSvgText(item.text, {
    maxWidth: contentW,
    fontSize: TEXT_FONT_SIZE,
    maxLines: TEXT_MAX_LINES,
    lineHeightRatio: TEXT_LINE_HEIGHT_RATIO,
  })
  // `layoutSvgText` shrinks its returned font size so the *widest wrapped*
  // line fits `contentW`, but that shrink floors at 1px (its own
  // `Math.max(1, ...)`). Text long enough that the post-`maxLines` merged
  // tail line still exceeds `contentW` even at 1px/unit comes back unfit —
  // truncate defensively at the fitted size, the same floor-size fallback
  // bullets.tsx applies locally.
  const maxUnits = contentW / wrapped.fontSize
  const text = {
    ...wrapped,
    lines: wrapped.lines.map((line) => truncateToUnits(line, maxUnits)),
  }
  return { title, text }
}

/**
 * Pure content height (icon + gaps + title's single line + text's 1-2
 * lines) — deliberately excludes any padding, so a caller with its own
 * padding convention (this file's PAD_TOP/PAD_BOTTOM, or tech.tsx's
 * BENTO_CARD_TOP_PAD/BOTTOM_PAD) can subtract its own budget and compare,
 * exactly mirroring `kpi.tsx`/tech.tsx's `kpiContentHeight` split.
 */
export function iconCardContentHeight(
  item: IconCardItem,
  contentW: number,
  opts: IconCardLayoutOptions = {}
): number {
  const titleFontSize = opts.titleFontSize ?? TITLE_FONT_SIZE
  const iconSize = opts.iconSize ?? ICON_SIZE
  const titleLineHeight = Math.round(titleFontSize * TITLE_LINE_HEIGHT_RATIO)
  const { text } = layoutIconCard(item, contentW, opts)
  return (
    iconSize +
    GAP_ICON_TITLE +
    titleLineHeight +
    GAP_TITLE_TEXT +
    text.lines.length * text.lineHeight
  )
}

/**
 * Render one card's icon/title/text inside `box` — `box` is already the
 * *padded content area* (its top-left is where the icon starts, its width is
 * the text-wrap budget). Does not paint the card shell or accent bar —
 * callers compose those separately (this file's `iconCards.render` paints a
 * single-accent shell; `templates/tech.tsx`'s exploded tiles paint
 * their own outline shell instead), mirroring `renderKpiCardBody`'s
 * content-only contract in tech.tsx.
 */
export function renderIconCardBody(
  item: IconCardItem,
  box: ComponentBox,
  ctx: ComponentCtx,
  opts: IconCardLayoutOptions = {}
): React.ReactElement {
  const titleFontSize = opts.titleFontSize ?? TITLE_FONT_SIZE
  const iconSize = opts.iconSize ?? ICON_SIZE
  const titleLineHeight = Math.round(titleFontSize * TITLE_LINE_HEIGHT_RATIO)
  const { title, text } = layoutIconCard(item, box.w, opts)
  const titleTopY = box.y + iconSize + GAP_ICON_TITLE
  const titleBaselineY = titleTopY + titleFontSize
  const textTopY = titleTopY + titleLineHeight + GAP_TITLE_TEXT
  return (
    <>
      <Icon
        name={item.icon}
        x={box.x}
        y={box.y}
        size={iconSize}
        color={ctx.colors.primary}
      />
      <text
        data-truncated={title.truncated ? "1" : undefined}
        x={box.x}
        y={titleBaselineY}
        fontSize={title.fontSize}
        fontWeight="600"
        fill={ctx.colors.text}
        fontFamily={ctx.fonts.heading}
        dominantBaseline="alphabetic"
      >
        {title.text}
      </text>
      {text.lines.map((line, li) => (
        <text
          key={li}
          x={box.x}
          y={textTopY + li * text.lineHeight + text.fontSize}
          fontSize={text.fontSize}
          fill={ctx.colors.muted}
          fontFamily={ctx.fonts.body}
          dominantBaseline="alphabetic"
        >
          {line}
        </text>
      ))}
    </>
  )
}

function cardGeometry(component: IconCardsComponent, w: number) {
  const n = component.items.length
  // 2-4 项单行 n 列，5-6 项 2 行 3 列宫格（2026-07-11 用户借鉴 6 宫格）
  const cols = n <= 4 ? n : 3
  const rows = Math.ceil(n / cols)
  const cardW = (w - GAP * (cols - 1)) / cols
  const contentW = cardW - PAD_X * 2
  const cardH = Math.max(
    ...component.items.map(
      (item) => PAD_TOP + iconCardContentHeight(item, contentW) + PAD_BOTTOM
    )
  )
  return { cols, rows, cardW, contentW, cardH }
}

export const iconCards: SvgComponent<IconCardsComponent> = {
  measure(component, w) {
    const { rows, cardH } = cardGeometry(component, w)
    return rows * cardH + (rows - 1) * GAP
  },
  render(component, box, ctx) {
    const { cols, rows, cardW, contentW, cardH } = cardGeometry(component, box.w)
    // 密度拉伸（box.h 由布局分配）：每行卡壳均分增量，内容组垂直居中
    const measuredH = rows * cardH + (rows - 1) * GAP
    const perRowGrow = Math.max(0, ((box.h ?? measuredH) - measuredH) / rows)
    const shellH = cardH + perRowGrow
    const contentShift = perRowGrow / 2
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {component.items.map((item, i) => {
          const cardX = (i % cols) * (cardW + GAP)
          const cardY = Math.floor(i / cols) * (shellH + GAP)
          return (
            <g key={i} data-audit-box={`${box.x + cardX},${box.y + cardY},${cardW}`}>
              <rect
                x={cardX}
                y={cardY}
                width={cardW}
                height={shellH}
                rx={ctx.shape?.radius ?? CARD_RADIUS}
                fill={ctx.colors.surface}
                {...(ctx.colors.cardStroke
                  ? { stroke: ctx.colors.cardStroke, strokeWidth: 1 }
                  : {})}
              />
              <rect
                x={cardX + PAD_X}
                y={cardY}
                width={ACCENT_W}
                height={ACCENT_H}
                rx={1.5}
                fill={ctx.colors.accent}
              />
              {renderIconCardBody(
                item,
                { x: cardX + PAD_X, y: cardY + PAD_TOP + contentShift, w: contentW },
                ctx
              )}
            </g>
          )
        })}
      </g>
    )
  },
}
