import type React from "react"
import type { Component } from "@/ir"
import { fitSvgLine, layoutSvgText, truncateToUnits } from "../../lib/svg-text-layout"
import { accessibleInk } from "../ink"
import type { ComponentBox, ComponentCtx, SvgComponent } from "./types"

type StepsComponent = Extract<Component, { type: "steps" }>
type StepItem = StepsComponent["items"][number]

/* ── Horizontal (default) mode constants ──
 * Card shell (surface fill, rx 8) is the same family as icon-cards.tsx's
 * card — see that file's own PAD_X/CARD_RADIUS comment for the split
 * rationale (this file's own row-layout padding vs. tech.tsx's own
 * padding convention when a component is dropped into a bento cell, which does
 * NOT happen for `steps` — see the "not exploded" note on the component dispatch
 * side, `bento-layout.ts`'s `explodeIntoUnits` default path).
 */
const PAD_X = 24
const PAD_TOP = 24
const PAD_BOTTOM = 20
const CARD_RADIUS = 8
// Gap between cards — doubles as the "arrow corridor" the connecting
// line+triangle is centered in, and as the per-item width budget in the
// vertical-degrade threshold check below.
const GAP = 40

const BADGE_R = 14
const BADGE_BAND = BADGE_R * 2 // 28 — vertical space the badge occupies
const BADGE_FONT_SIZE = 16
// Same "pivotY + round(fontSize * 0.32)" single-line vertical-centering trick
// as academic.tsx's rail badge (see that file's BASELINE_FUDGE_RATIO
// comment) — lands the digit's baseline visually centered on the badge's cy.
const BASELINE_FUDGE_RATIO = 0.32
// Gap between the badge band and the title (horizontal mode, vertical
// spacing) — reused as the *horizontal* gap between the badge column and the
// text column in vertical mode (badge right edge at PAD_X + BADGE_BAND = 52,
// + 12 = 64 = vertical mode's TEXT_X_VERTICAL below).
const GAP_BADGE_TITLE = 12

const TITLE_FONT_SIZE = 18
const TITLE_MIN_FONT_SIZE = 13
// Same fixed "line box" convention as icon-cards.tsx's own TITLE_LINE_HEIGHT
// (title never wraps — fitSvgLine only shrinks/truncates a single line — so
// this is a reserved box height, not a measured value).
const TITLE_LINE_HEIGHT_RATIO = 1.4
const TITLE_LINE_HEIGHT = Math.round(TITLE_FONT_SIZE * TITLE_LINE_HEIGHT_RATIO) // 25
const GAP_TITLE_TEXT = 8

const TEXT_FONT_SIZE = 14
const TEXT_MAX_LINES = 2
const TEXT_LINE_HEIGHT_RATIO = 1.4

/* ── Vertical (degrade) mode constants ── */
// Narrowest a horizontal card may get before this component switches to a
// left-badge-column + full-width-text vertical stack instead.
const MIN_CARD_W = 180
// Horizontal gap between the badge column and the text column, vertical
// mode: badge bounding-box right edge (PAD_X + BADGE_BAND = 52) + the same
// GAP_BADGE_TITLE(12) reused from horizontal mode = 64.
const TEXT_X_VERTICAL = PAD_X + BADGE_BAND + GAP_BADGE_TITLE // 64
const GAP_TITLE_TEXT_VERTICAL = 24
const ROW_GAP = 16

const ARROW_LEN = 24
const ARROW_HEAD_LEN = 8
const ARROW_HEAD_HALF_H = 4
const ARROW_STROKE_W = 1.5
const CONNECTOR_STROKE_W = 1.5

interface StepItemTextLayout {
  title: { text: string; fontSize: number }
  text: { lines: string[]; fontSize: number; lineHeight: number }
}

/** Fit an item's title (single line, shrink-to-fit) and text (up to 2 lines)
 * within `contentW` — shared by both horizontal (per-card) and vertical
 * (per-row) modes, same technique as icon-cards.tsx's `layoutIconCard`
 * (including that file's defensive post-wrap truncation — see the comment
 * there: `layoutSvgText`'s own font-shrink floors at 1px, which text long
 * enough can still overflow `contentW` at). */
function layoutStepItem(item: StepItem, contentW: number): StepItemTextLayout {
  const title = fitSvgLine(item.title, {
    maxWidth: contentW,
    fontSize: TITLE_FONT_SIZE,
    minFontSize: TITLE_MIN_FONT_SIZE,
  })
  const wrapped = layoutSvgText(item.text, {
    maxWidth: contentW,
    fontSize: TEXT_FONT_SIZE,
    maxLines: TEXT_MAX_LINES,
    lineHeightRatio: TEXT_LINE_HEIGHT_RATIO,
  })
  const maxUnits = contentW / wrapped.fontSize
  const text = {
    ...wrapped,
    lines: wrapped.lines.map((line) => truncateToUnits(line, maxUnits)),
  }
  return { title, text }
}

/** Numbered badge (circle, primary fill, centered digit) shared by both
 * modes — `cx`/`cy` are the caller's already-resolved badge center.
 *
 * Bench-driven fix round, defect A reclassification (Task 3 handoff): the
 * digit's ink used to be a bare `fill="#FFFFFF"` literal on the assumption
 * every theme's `colors.primary` is dark enough for white to read — full-
 * matrix scanning (once `deck-audit.ts` learned to attribute a `<text>` to
 * its own self-painted circle instead of falling through to a larger,
 * unrelated region — defect A's own fix) found campaign/classroom/insight/
 * luxe/tech's `colors.primary` measures well under 4.5:1 against white.
 * `accessibleInk` keeps the white preference when it already clears the
 * ratio (every other theme, byte-identical) and falls back to
 * `readableOn`'s neutral ink only where it doesn't — same precedent as
 * `content-rail-numbered.tsx`'s own badge (the sibling in this component
 * family that already got this treatment in an earlier fix round). */
function renderBadge(cx: number, cy: number, n: number, ctx: ComponentCtx): React.ReactElement {
  return (
    <>
      <circle cx={cx} cy={cy} r={BADGE_R} fill={ctx.colors.primary} />
      <text
        x={cx}
        y={cy + Math.round(BADGE_FONT_SIZE * BASELINE_FUDGE_RATIO)}
        textAnchor="middle"
        fontSize={BADGE_FONT_SIZE}
        fontWeight="700"
        fill={accessibleInk("#FFFFFF", ctx.colors.primary, BADGE_FONT_SIZE)}
        fontFamily={ctx.fonts.body}
        dominantBaseline="alphabetic"
      >
        {n}
      </text>
    </>
  )
}

/* ── Horizontal mode ── */

/** Pure content height (badge band + gaps + title's line + text's 1-2 lines)
 * — excludes PAD_TOP/PAD_BOTTOM, mirroring icon-cards.tsx's
 * `iconCardContentHeight` split (a caller with its own padding convention
 * subtracts its own budget and compares). */
function stepContentHeight(item: StepItem, contentW: number): number {
  const { text } = layoutStepItem(item, contentW)
  return (
    BADGE_BAND +
    GAP_BADGE_TITLE +
    TITLE_LINE_HEIGHT +
    GAP_TITLE_TEXT +
    text.lines.length * text.lineHeight
  )
}

/** Render one card's badge/title/text inside `box` — `box` is already the
 * padded content area (top-left is where the badge band starts, width is
 * the text-wrap budget), mirroring icon-cards.tsx's `renderIconCardBody`
 * contract. Does not paint the card shell. */
function renderStepCardBody(
  item: StepItem,
  index: number,
  box: ComponentBox,
  ctx: ComponentCtx,
): React.ReactElement {
  const { title, text } = layoutStepItem(item, box.w)
  const badgeCx = box.x + BADGE_R
  const badgeCy = box.y + BADGE_R
  const titleTopY = box.y + BADGE_BAND + GAP_BADGE_TITLE
  const titleBaselineY = titleTopY + TITLE_FONT_SIZE
  const textTopY = titleTopY + TITLE_LINE_HEIGHT + GAP_TITLE_TEXT
  return (
    <>
      {renderBadge(badgeCx, badgeCy, index + 1, ctx)}
      <text
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

function cardGeometry(component: StepsComponent, w: number) {
  const n = component.items.length
  const cardW = (w - GAP * (n - 1)) / n
  const contentW = cardW - PAD_X * 2
  const cardH = Math.max(
    ...component.items.map((item) => PAD_TOP + stepContentHeight(item, contentW) + PAD_BOTTOM),
  )
  return { cardW, contentW, cardH }
}

/** A horizontal-line + solid-triangle arrow, `ARROW_LEN` px long, `x` is its
 * left (tail) end and `y` its vertical center. */
function renderArrow(x: number, y: number, color: string): React.ReactElement {
  const tipX = x + ARROW_LEN
  const baseX = tipX - ARROW_HEAD_LEN
  return (
    <>
      <line x1={x} y1={y} x2={baseX} y2={y} stroke={color} strokeWidth={ARROW_STROKE_W} />
      <polygon
        points={`${tipX},${y} ${baseX},${y - ARROW_HEAD_HALF_H} ${baseX},${y + ARROW_HEAD_HALF_H}`}
        fill={color}
      />
    </>
  )
}

/* ── Vertical mode ──
 * Triggers when even the narrowest allowed horizontal card (MIN_CARD_W=180)
 * wouldn't fit — items×180 + (items-1)×GAP > w. Badges form a left column
 * (x=24, same PAD_X as horizontal mode) connected by thin vertical lines;
 * title+text move to a full-width column starting after the badge (x=64).
 */
function needsVerticalLayout(n: number, w: number): boolean {
  return n * MIN_CARD_W + (n - 1) * GAP > w
}

/** Row height (title + gap + tallest text) shared by all rows — mirrors
 * horizontal mode's "tallest card wins" convention (`cardGeometry`'s
 * `Math.max`), applied to rows instead of cards. */
function verticalRowGeometry(component: StepsComponent, w: number) {
  const contentW = Math.max(1, w - TEXT_X_VERTICAL)
  const rowH =
    Math.max(
      ...component.items.map((item) => {
        const { text } = layoutStepItem(item, contentW)
        return TITLE_LINE_HEIGHT + GAP_TITLE_TEXT_VERTICAL + text.lines.length * text.lineHeight
      }),
    ) + ROW_GAP
  return { contentW, rowH }
}

function renderVertical(component: StepsComponent, box: ComponentBox, ctx: ComponentCtx): React.ReactElement {
  const { contentW, rowH } = verticalRowGeometry(component, box.w)
  const badgeCx = PAD_X + BADGE_R
  const badgeCy = (i: number) => i * rowH + TITLE_LINE_HEIGHT / 2

  return (
    <g transform={`translate(${box.x},${box.y})`}>
      {/* Connecting lines drawn first so each badge layers on top of the
          line ends, same ordering as timeline.tsx's axis-then-milestones. */}
      {component.items.slice(1).map((_, i) => (
        <line
          key={`connector-${i}`}
          x1={badgeCx}
          y1={badgeCy(i)}
          x2={badgeCx}
          y2={badgeCy(i + 1)}
          stroke={ctx.colors.muted}
          strokeWidth={CONNECTOR_STROKE_W}
        />
      ))}
      {component.items.map((item, i) => {
        const rowTop = i * rowH
        const { title, text } = layoutStepItem(item, contentW)
        const titleBaselineY = rowTop + TITLE_FONT_SIZE
        const textTopY = rowTop + TITLE_LINE_HEIGHT + GAP_TITLE_TEXT_VERTICAL
        return (
          <g key={i} data-audit-box={`${box.x},${box.y + rowTop},${box.w}`}>
            {renderBadge(badgeCx, badgeCy(i), i + 1, ctx)}
            <text
              x={TEXT_X_VERTICAL}
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
                x={TEXT_X_VERTICAL}
                y={textTopY + li * text.lineHeight + text.fontSize}
                fontSize={text.fontSize}
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

export const steps: SvgComponent<StepsComponent> = {
  measure(component, w) {
    const n = component.items.length
    if (needsVerticalLayout(n, w)) {
      return n * verticalRowGeometry(component, w).rowH
    }
    return cardGeometry(component, w).cardH
  },
  render(component, box, ctx) {
    const n = component.items.length
    if (needsVerticalLayout(n, box.w)) {
      return renderVertical(component, box, ctx)
    }
    const { cardW, contentW, cardH } = cardGeometry(component, box.w)
    return (
      <g transform={`translate(${box.x},${box.y})`}>
        {component.items.map((item, i) => {
          const cardX = i * (cardW + GAP)
          return (
            <g key={i} data-audit-box={`${box.x + cardX},${box.y},${cardW}`}>
              <rect
                x={cardX}
                y={0}
                width={cardW}
                height={cardH}
                rx={CARD_RADIUS}
                fill={ctx.colors.surface}
                {...(ctx.colors.cardStroke
                  ? { stroke: ctx.colors.cardStroke, strokeWidth: 1 }
                  : {})}
              />
              {renderStepCardBody(item, i, { x: cardX + PAD_X, y: PAD_TOP, w: contentW }, ctx)}
            </g>
          )
        })}
        {component.items.slice(1).map((_, i) => {
          const cardRightEdge = i * (cardW + GAP) + cardW
          const arrowX = cardRightEdge + (GAP - ARROW_LEN) / 2
          return (
            <g key={`arrow-${i}`}>{renderArrow(arrowX, cardH / 2, ctx.colors.muted)}</g>
          )
        })}
      </g>
    )
  },
}
