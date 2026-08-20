import type React from "react"
import type { Component } from "@/ir"
import { fitSvgLine, layoutSvgText, truncateToUnits } from "../../lib/svg-text-layout"
import { readableOn } from "../ink"
import { deriveInitials } from "./people-initials"
import type { ComponentCtx, RenderDef, SvgComponent } from "./types"

type PeopleCardsComponent = Extract<Component, { type: "people_cards" }>
type PersonItem = PeopleCardsComponent["people"][number]

/**
 * Equal-weight people-card grid (people_cards wave, `.issues/
 * 2026-08-05-component-waves/plan-people-cards.md`): a team roster/speaker
 * lineup/panel/author list, each person an initials badge (no photo
 * needed) + name + optional role/org. Reuses row-cards.tsx/icon-cards.tsx's
 * own scaling technique verbatim (裁定 3 — no new mechanism): `fitSvgLine`
 * shrink-then-truncate for single lines, `layoutSvgText` wrap-then-
 * truncate for the up-to-2-line role, the tallest card in the set wins
 * `cardH` (`icon-cards.tsx`'s `cardGeometry`), and box.h density-stretch
 * grows every card evenly (`STRETCHABLE_TYPES`, same posture as
 * row_cards/icon_cards).
 */
// Sizing constants are deliberately compact — chosen so that even the
// schema-maximum 12-person, 3-row tier stays comfortably inside the
// tightest real content-rect budget this codebase's own layouts grant a
// single component (`content-tone-adaptive-content.tsx`'s `contentH = 420`
// with a footnote present is the tightest observed), verified empirically
// against `stress-fixtures.ts`'s own `people_cards` pathological entry
// (12 people, every field at CJK_LONG length) across all 16 themes in
// `audit-baseline.test.ts` — not merely eyeballed. A generous, larger set
// of constants was tried first and overflowed the tightest layouts at
// n=12; unlike flowchart.tsx/cycle.tsx's own self-bounding proportional
// `fitScale`, this component uses one fixed compact profile rather than a
// dynamic scale factor (裁定 3 — no new mechanism: `fitSvgLine`/
// `layoutSvgText`'s own shrink-then-truncate already absorbs most of the
// per-tier size pressure as `contentW` narrows with more columns; these
// constants only needed to shrink the *fixed* per-card cost — badge/
// padding/gaps — that doesn't already shrink with width).
const GAP = 16
const CARD_RADIUS = 8
const PAD_X = 14
const PAD_TOP = 12
const PAD_BOTTOM = 10

const BADGE_R = 16
const BADGE_D = BADGE_R * 2
const BADGE_FONT_SIZE = 12
// Same "cy + round(fontSize * 0.32)" single-line vertical-centering trick
// as steps.tsx's own numbered badge (that file's BASELINE_FUDGE_RATIO
// comment) — lands the initials' baseline visually centered on the
// badge's cy.
const BASELINE_FUDGE_RATIO = 0.32

const GAP_BADGE_NAME = 6
const NAME_FONT_SIZE = 13
const NAME_MIN_FONT_SIZE = 10
const NAME_LINE_HEIGHT = Math.round(NAME_FONT_SIZE * 1.25)

const GAP_NAME_ROLE = 2
const ROLE_FONT_SIZE = 11
const ROLE_MAX_LINES = 2
const ROLE_LINE_HEIGHT_RATIO = 1.3

const GAP_ROLE_ORG = 2
const ORG_FONT_SIZE = 10
const ORG_MIN_FONT_SIZE = 8
const ORG_LINE_HEIGHT = Math.round(ORG_FONT_SIZE * 1.25)

// Optional overall `title` (裁定 1: "可选整体 title 按惯例") — same posture
// as cycle.tsx's own optional title: a fixed band reserved above the card
// grid, present in both measure() and render() only when the field is set
// (an absent title costs nothing, no dead band).
const TITLE_FONT_SIZE = 16
const TITLE_MIN_FONT_SIZE = 12
// Raised from 24 on 2026-08-15, back when the title's baseline sat at
// TITLE_FONT_SIZE (round 4 hung it off the band's bottom edge instead —
// see TITLE_TO_CARDS). A 24px band left barely 4px between the title's
// descenders and the top of the first card — the visual review read the
// two as one glued block ("标题距离卡片太近了，没有呼吸感"). 36 leaves the
// title its own line of air, the same relationship cycle.tsx's band
// already has at its larger type size.
//
// 36 is the *natural* band — what `measure()` reserves. It stopped being
// enough as soon as the layout stretched the cards: `box.h` growth used to
// go entirely into the card shells, which split it into top and bottom
// padding, so a page with 163px of leftover gave every card ~40px of extra
// internal air while the band stayed at 36 and the title's own clearance
// stayed at 20. The 2026-08-19 review read the result as "标题贴卡片" — a
// relative measurement: the tightest air on the page was directly under the
// title, at a third of what the cards had inside them. So the band takes a
// share of that growth too (see `TITLE_BAND_GROW_SHARE` at the render site).
const TITLE_BAND = 36
/** Share of the density-stretch increment that widens the title's band
 * rather than the card shells, so the title gets air of its own as the
 * cards' internal padding grows instead of staying frozen. Which side of
 * the title that air lands on is `TITLE_TO_CARDS`'s business — round 4
 * moved it above the title; the share itself is unchanged. */
const TITLE_BAND_GROW_SHARE = 0.25
/** Ceiling on that widening — past this the title stops reading as a label
 * on the grid below it and starts floating on its own. */
const TITLE_BAND_MAX_GROW = 16
/**
 * Distance from the title's baseline down to the top of the first card —
 * fixed, and deliberately shorter than the layout's own stacking gap
 * (`BLOCK_GAP`, 16px).
 *
 * Review round 4. A reader assigns a label to a group by proximity, before
 * reading a word of it, so the label has to be nearer the thing it names
 * than the block it follows. It was the other way round on the gallery's
 * `component--people-cards--mixed`: 22px up to the paragraph, 32px down to
 * its own cards. The band is where the slack lives — its natural surplus
 * plus the growth share above — and all of it used to pile up under the
 * title because the title was pinned to the top of the band. It hangs off
 * the *bottom* of the band now, so the slack opens above the label, where
 * it separates two blocks instead of splitting one.
 *
 * The band itself and how much of a density stretch it takes
 * (`TITLE_BAND`, `TITLE_BAND_GROW_SHARE`) are unchanged — this only moves
 * the title inside it, so `measure()` reports exactly what it always did.
 */
const TITLE_TO_CARDS = 12

interface PersonCardLayout {
  name: { text: string; fontSize: number; truncated: boolean }
  role: { lines: string[]; fontSize: number; lineHeight: number } | null
  org: { text: string; fontSize: number; truncated: boolean } | null
}

/** Fit a person's name/role/org within `contentW` — same technique as
 * icon-cards.tsx's `layoutIconCard`/steps.tsx's `layoutStepItem`: name
 * shrink-then-truncate (never wraps), role wrap-then-truncate (up to 2
 * lines, with the same defensive post-wrap `truncateToUnits` those two
 * files apply for the case `layoutSvgText`'s own font-shrink floors out
 * before the merged tail line actually fits), org shrink-then-truncate
 * (a second single line, smaller and lower-priority than name). */
function layoutPersonCard(person: PersonItem, contentW: number): PersonCardLayout {
  const name = fitSvgLine(person.name, {
    maxWidth: contentW,
    fontSize: NAME_FONT_SIZE,
    minFontSize: NAME_MIN_FONT_SIZE,
    bold: true,
  })
  const role = person.role
    ? (() => {
        const wrapped = layoutSvgText(person.role, {
          maxWidth: contentW,
          fontSize: ROLE_FONT_SIZE,
          maxLines: ROLE_MAX_LINES,
          lineHeightRatio: ROLE_LINE_HEIGHT_RATIO,
        })
        const maxUnits = contentW / wrapped.fontSize
        return { ...wrapped, lines: wrapped.lines.map((line) => truncateToUnits(line, maxUnits)) }
      })()
    : null
  const org = person.org
    ? fitSvgLine(person.org, { maxWidth: contentW, fontSize: ORG_FONT_SIZE, minFontSize: ORG_MIN_FONT_SIZE })
    : null
  return { name, role, org }
}

/** Pure content height (badge + gaps + name's line + role's 1-2 lines +
 * org's line) — excludes PAD_TOP/PAD_BOTTOM, mirroring icon-cards.tsx's
 * `iconCardContentHeight`/steps.tsx's `stepContentHeight` split. */
function personCardContentHeight(person: PersonItem, contentW: number): number {
  const { role, org } = layoutPersonCard(person, contentW)
  return (
    BADGE_D +
    GAP_BADGE_NAME +
    NAME_LINE_HEIGHT +
    (role ? GAP_NAME_ROLE + role.lines.length * role.lineHeight : 0) +
    (org ? GAP_ROLE_ORG + ORG_LINE_HEIGHT : 0)
  )
}

/**
 * Grid tiers by person count (裁定 3, BINDING): 2-4 people single row,
 * 5-8 two rows, 9-12 three rows — measured against a 1280x720 slide's real
 * content width, verified zero-overflow for the 12-person + long-CJK-name
 * + long-role pathological fixture across all 16 themes
 * (`stress-fixtures.ts`'s own `people_cards` entry,
 * `audit-baseline.test.ts`). Columns per row = ceil(n / rows), same
 * "row-major grid, last row left-aligned if underfull" geometry as
 * icon-cards.tsx's `cardGeometry` — no new mechanism.
 */
function tierRows(n: number): number {
  if (n <= 4) return 1
  if (n <= 8) return 2
  return 3
}

function cardGeometry(component: PeopleCardsComponent, w: number) {
  const n = component.people.length
  const rows = tierRows(n)
  const cols = Math.ceil(n / rows)
  const cardW = (w - GAP * (cols - 1)) / cols
  const contentW = Math.max(1, cardW - PAD_X * 2)
  const cardH = Math.max(
    ...component.people.map((p) => PAD_TOP + personCardContentHeight(p, contentW) + PAD_BOTTOM),
  )
  return { rows, cols, cardW, contentW, cardH }
}

/**
 * Initials badge — fill color is `ctx.colors.chartPalette[i % length]`,
 * `i` the person's own *list index* (裁定 2: deterministic, seed-
 * independent — list order is visual order). Deliberately does not read
 * `ctx.chartPaletteOffset` (chart.tsx's own seed-derived rotation seam;
 * see chart-palette.ts's header on why every *other* `chartPalette` reader
 * stays unrotated) — a roster's badge colors shouldn't drift with the
 * deck's seed the way a chart series color intentionally does.
 *
 * Ink is `readableOn(fill)` computed against *this exact fill*, not a
 * fixed "#FFFFFF" preference (unlike steps.tsx's `accessibleInk("#FFFFFF",
 * ...)`, which keeps white when it already clears the ratio) — theme
 * chartPalettes range from near-white (e.g. enterprise's `#C9D3E8`) to
 * near-black (e.g. runway's `#0A0A0A`), so a single assumed preference
 * would fail contrast on roughly half of any given theme's palette
 * entries. Always resolving per-entry is the correct, not merely
 * simpler, choice here.
 */
function renderBadge(
  cx: number,
  cy: number,
  initials: string,
  fill: string,
  ctx: ComponentCtx,
): React.ReactElement {
  const ink = readableOn(fill)
  return (
    <>
      <circle cx={cx} cy={cy} r={BADGE_R} fill={fill} />
      <text
        x={cx}
        y={cy + Math.round(BADGE_FONT_SIZE * BASELINE_FUDGE_RATIO)}
        textAnchor="middle"
        fontSize={BADGE_FONT_SIZE}
        fontWeight="700"
        fill={ink}
        fontFamily={ctx.fonts.body}
        dominantBaseline="alphabetic"
      >
        {initials}
      </text>
    </>
  )
}

export const peopleCards: SvgComponent<PeopleCardsComponent> = {
  measure(component, w) {
    const { rows, cardH } = cardGeometry(component, w)
    const titleBand = component.title?.trim() ? TITLE_BAND : 0
    return titleBand + rows * cardH + (rows - 1) * GAP
  },
  render(component, box, ctx) {
    const { cols, rows, cardW, contentW, cardH } = cardGeometry(component, box.w)
    const hasTitle = !!component.title?.trim()
    const titleBand = hasTitle ? TITLE_BAND : 0
    // 密度拉伸（box.h 由布局分配）：每行卡壳均分增量，内容组垂直居中——同
    // icon-cards.tsx render() 的 perRowGrow/contentShift 写法。增量先按
    // TITLE_BAND_GROW_SHARE 切一小块给 title band（有 title 时），其余才进
    // 卡壳池：band 曾是纯固定预留，卡片越长它越显得贴。
    const measuredH = titleBand + rows * cardH + (rows - 1) * GAP
    const grow = Math.max(0, (box.h ?? measuredH) - measuredH)
    const bandGrow = hasTitle
      ? Math.min(grow * TITLE_BAND_GROW_SHARE, TITLE_BAND_MAX_GROW)
      : 0
    const grownTitleBand = titleBand + bandGrow
    const perRowGrow = (grow - bandGrow) / rows
    const shellH = cardH + perRowGrow
    const contentShift = perRowGrow / 2
    const palette = ctx.colors.chartPalette
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
            // Hung off the bottom of the band (see `TITLE_TO_CARDS`), never
            // above the band's own top edge — a title shrunk by `fitSvgLine`
            // gets a shorter baseline offset, and the clamp keeps even that
            // case inside the box the layout handed this component.
            const baselineY = Math.max(title.fontSize, grownTitleBand - TITLE_TO_CARDS)
            return (
              <text
                data-truncated={title.truncated ? "1" : undefined}
                x={0}
                y={baselineY}
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
        {component.people.map((person, i) => {
          const cardX = (i % cols) * (cardW + GAP)
          const cardY = grownTitleBand + Math.floor(i / cols) * (shellH + GAP)
          const { name, role, org } = layoutPersonCard(person, contentW)
          const badgeCx = cardX + cardW / 2
          const badgeCy = cardY + PAD_TOP + contentShift + BADGE_R
          const nameTopY = badgeCy + BADGE_R + GAP_BADGE_NAME
          const nameBaselineY = nameTopY + NAME_FONT_SIZE
          let cursorY = nameTopY + NAME_LINE_HEIGHT
          const roleTopY = cursorY + (role ? GAP_NAME_ROLE : 0)
          if (role) cursorY = roleTopY + role.lines.length * role.lineHeight
          const orgBaselineY = cursorY + (org ? GAP_ROLE_ORG : 0) + (org ? org.fontSize : 0)
          const fill = palette.length > 0 ? palette[i % palette.length] : ctx.colors.primary
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
              {renderBadge(badgeCx, badgeCy, deriveInitials(person.name), fill, ctx)}
              <text
                data-truncated={name.truncated ? "1" : undefined}
                x={badgeCx}
                y={nameBaselineY}
                textAnchor="middle"
                fontSize={name.fontSize}
                fontWeight="700"
                fill={ctx.colors.text}
                fontFamily={ctx.fonts.heading}
                dominantBaseline="alphabetic"
              >
                {name.text}
              </text>
              {role
                ? role.lines.map((line, li) => (
                    <text
                      key={li}
                      x={badgeCx}
                      y={roleTopY + li * role.lineHeight + role.fontSize}
                      textAnchor="middle"
                      fontSize={role.fontSize}
                      fill={ctx.colors.muted}
                      fontFamily={ctx.fonts.body}
                      dominantBaseline="alphabetic"
                    >
                      {line}
                    </text>
                  ))
                : null}
              {org ? (
                <text
                  data-truncated={org.truncated ? "1" : undefined}
                  x={badgeCx}
                  y={orgBaselineY}
                  textAnchor="middle"
                  fontSize={org.fontSize}
                  fill={ctx.colors.muted}
                  fontFamily={ctx.fonts.body}
                  dominantBaseline="alphabetic"
                >
                  {org.text}
                </text>
              ) : null}
            </g>
          )
        })}
      </g>
    )
  },
}

export const renderDef: RenderDef<PeopleCardsComponent> = {
  type: "people_cards",
  measure: peopleCards.measure,
  render: peopleCards.render,
}
