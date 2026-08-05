import type React from "react"
import type { Component } from "@/ir"
import { fitSvgLine, measureTextUnits, truncateToUnits } from "../../lib/svg-text-layout"
import { readableOn } from "../ink"
import { mixHex } from "./color-mix"
import type { ComponentCtx, RenderDef, SvgComponent } from "./types"

type TagRowComponent = Extract<Component, { type: "tag_row" }>

/**
 * Tag row (tag_row wave, `.issues/2026-08-06-tag-row/plan.md`): 2-16 short
 * labels laid out as a wrapping row of capsule pills. Every mechanism is an
 * existing one (裁定 2 — no new machinery):
 *
 *  - **Exact-width flow-wrap:** each pill's width is
 *    `measureTextUnits(label, { fontFamily }) * fontSize + PAD_X*2` — the same
 *    per-character width model every other component measures with, so a
 *    CJK/Latin-mixed label ("基于 Kubernetes Operator" — CJK at 1.0em, Latin
 *    off the exact hmtx tables) is sized right and the greedy pack never
 *    wraps a line one glyph too wide.
 *  - **Two-tier fill (裁定 2):** a default pill is `colors.surface` with
 *    `colors.text` ink (low-key), the `emphasis: "first"` pill is
 *    `colors.accent` with `readableOn(accent)` ink (stands out). Both text
 *    colors are measured against their pill's own opaque rect by
 *    `deck-audit` (`PaintedShape` attribution is area-unrestricted since the
 *    defect-A fix), and both clear 4.5:1 on all 16 themes (verified: default
 *    text-on-surface ≥7.78:1, emphasis readableOn(accent)-on-accent ≥5.10:1)
 *    — so this component renders no `colors.muted` and needs no dedicated
 *    contrast fixture (`full-matrix-contrast.test.ts`'s `MUTED_SURFACE_CLASS`
 *    classifies it "no-muted-fill").
 *  - **Scale-to-fit (裁定 2):** one uniform font size is picked as the
 *    largest in `[MIN, MAX]` whose greedy wrap fits the height budget; a
 *    single label wider than the whole row is truncated (shrink-then-
 *    truncate, `fitSvgLine`/`truncateToUnits`'s own idiom) so a pathological
 *    over-long tag degrades instead of overflowing.
 */

const TAG_FONT_SIZE = 14
const TAG_MIN_FONT_SIZE = 11
/** Horizontal padding inside a pill (label edge → capsule edge). */
const PAD_X = 12
/** Vertical padding inside a pill — pill height = fontSize + 2*PAD_Y. */
const PAD_Y = 6
/** Gap between pills on the same row, and between wrapped rows. */
const GAP_X = 8
const GAP_Y = 8
/** Total pill-stack height budget (px, excl. title band) — the same order of
 * magnitude as logo_wall's `MAX_WALL_H`: a tag row occupies one content-rect
 * slot, not the whole slide. When 16 long tags in a mid-width column would
 * exceed it, the uniform font shrinks (more tags per row → fewer rows) to
 * protect it. */
const MAX_ROWS_H = 300

// Optional overall `title` (裁定 1) — the same fixed reserved band as
// logo-wall.tsx/people-cards.tsx: present in both measure() and render() only
// when the field is set, an absent title costs nothing.
const TITLE_FONT_SIZE = 16
const TITLE_MIN_FONT_SIZE = 12
const TITLE_BAND = 24

// Same "cy + round(fontSize * 0.32)" single-line vertical-centering trick as
// people-cards.tsx's own badge/steps.tsx's numbered badge — lands the label's
// baseline visually centered on the pill's vertical middle.
const BASELINE_FUDGE_RATIO = 0.32

/** Pill height at a given font size. */
function pillHeight(fontSize: number): number {
  return fontSize + PAD_Y * 2
}

/** One placed pill in the row's local (0,0) space (before the title band /
 * box translate is applied). */
interface PlacedTag {
  text: string
  x: number
  y: number
  w: number
  truncated: boolean
}

interface WrapResult {
  placed: PlacedTag[]
  rows: number
}

/** Greedy left-to-right flow-wrap at a fixed font size. A single label whose
 * pill is wider than the whole row `w` is truncated to fit (shrink-then-
 * truncate's truncate half, measured with the exact `fontFamily`). Pure and
 * deterministic. */
function greedyWrap(items: string[], fontSize: number, w: number, fontFamily: string): WrapResult {
  const ph = pillHeight(fontSize)
  const placed: PlacedTag[] = []
  let x = 0
  let y = 0
  let rows = 1
  for (const raw of items) {
    const text = raw.trim()
    let display = text
    let truncated = false
    let pillW = measureTextUnits(display, { fontFamily }) * fontSize + PAD_X * 2
    if (pillW > w) {
      // Single label wider than the entire row — truncate to the inner width.
      const maxUnits = Math.max(1, (w - PAD_X * 2) / fontSize)
      display = truncateToUnits(text, maxUnits, { fontFamily })
      truncated = true
      pillW = measureTextUnits(display, { fontFamily }) * fontSize + PAD_X * 2
    }
    // Wrap when this pill would overflow the current row (but never on the
    // first pill of a row — it's already width-clamped above).
    if (x > 0 && x + pillW > w) {
      x = 0
      y += ph + GAP_Y
      rows += 1
    }
    placed.push({ text: display, x, y, w: pillW, truncated })
    x += pillW + GAP_X
  }
  return { placed, rows }
}

interface TagRowLayout {
  fontSize: number
  placed: PlacedTag[]
  rows: number
  contentH: number
  titleBand: number
}

/** Pick the largest uniform font in `[MIN, MAX]` whose flow-wrap fits the
 * height budget, then lay the pills out at it. Falls back to MIN (accepting
 * the natural height) when even MIN can't fit — the graceful-degrade boundary
 * (16 long tags crammed into a very narrow column), the same "content beats
 * purity" posture the rest of the codebase's fit paths take. Shared by
 * `measure` and `render` so they never disagree. */
function layoutTagRow(component: TagRowComponent, w: number, ctx: ComponentCtx): TagRowLayout {
  const fontFamily = ctx.fonts.body
  const titleBand = component.title?.trim() ? TITLE_BAND : 0
  let chosen = greedyWrap(component.items, TAG_MIN_FONT_SIZE, w, fontFamily)
  let fontSize = TAG_MIN_FONT_SIZE
  for (let fs = TAG_FONT_SIZE; fs >= TAG_MIN_FONT_SIZE; fs -= 1) {
    const wrap = greedyWrap(component.items, fs, w, fontFamily)
    const contentH = wrap.rows * pillHeight(fs) + (wrap.rows - 1) * GAP_Y
    if (contentH <= MAX_ROWS_H) {
      chosen = wrap
      fontSize = fs
      break
    }
  }
  const ph = pillHeight(fontSize)
  const contentH = chosen.rows * ph + (chosen.rows - 1) * GAP_Y
  return { fontSize, placed: chosen.placed, rows: chosen.rows, contentH, titleBand }
}

export const tagRow: SvgComponent<TagRowComponent> = {
  measure(component, w, ctx) {
    const { contentH, titleBand } = layoutTagRow(component, w, ctx)
    return titleBand + contentH
  },
  render(component, box, ctx) {
    const { fontSize, placed, titleBand } = layoutTagRow(component, box.w, ctx)
    const ph = pillHeight(fontSize)
    const radius = ph / 2 // capsule (裁定 2 — a pill is a capsule by definition)
    const emphasisFirst = component.emphasis === "first"
    const hasTitle = !!component.title?.trim()
    // Default-pill hairline: keep the pill visible even on a theme whose
    // `surface` equals its page background, without changing the pill FILL
    // (the fill stays exactly `colors.surface`, preserving the audited
    // text-on-surface contrast pair). Prefer a theme's own card stroke, else
    // a faint surface→text blend (device_mockup's own `mixHex` precedent).
    const defaultStroke = ctx.colors.cardStroke ?? ctx.colors.border ?? mixHex(ctx.colors.surface, ctx.colors.text, 0.2)
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {hasTitle &&
          (() => {
            const title = fitSvgLine(component.title!, {
              maxWidth: box.w,
              fontSize: TITLE_FONT_SIZE,
              minFontSize: TITLE_MIN_FONT_SIZE,
              bold: true,
              fontFamily: ctx.fonts.heading,
            })
            return (
              <text
                data-truncated={title.truncated ? "1" : undefined}
                x={0}
                y={TITLE_FONT_SIZE}
                fontFamily={ctx.fonts.heading}
                fontSize={title.fontSize}
                fontWeight="700"
                fill={ctx.colors.text}
                dominantBaseline="alphabetic"
              >
                {title.text}
              </text>
            )
          })()}
        {placed.map((pill, i) => {
          const isEmph = emphasisFirst && i === 0
          const fill = isEmph ? ctx.colors.accent : ctx.colors.surface
          const ink = isEmph ? readableOn(ctx.colors.accent) : ctx.colors.text
          return (
            <g key={i} transform={`translate(${pill.x},${titleBand + pill.y})`}>
              <rect
                x={0}
                y={0}
                width={pill.w}
                height={ph}
                rx={radius}
                fill={fill}
                {...(isEmph ? {} : { stroke: defaultStroke, strokeWidth: 1 })}
              />
              <text
                data-truncated={pill.truncated ? "1" : undefined}
                x={pill.w / 2}
                y={ph / 2 + Math.round(fontSize * BASELINE_FUDGE_RATIO)}
                textAnchor="middle"
                fontSize={fontSize}
                fill={ink}
                fontFamily={ctx.fonts.body}
                dominantBaseline="alphabetic"
              >
                {pill.text}
              </text>
            </g>
          )
        })}
      </g>
    )
  },
}

export const renderDef: RenderDef<TagRowComponent> = {
  type: "tag_row",
  measure: tagRow.measure,
  render: tagRow.render,
}
