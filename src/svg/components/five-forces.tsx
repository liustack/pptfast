import type React from "react"
import type { Component } from "@/ir"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleInk } from "../ink"
import { mixHex } from "./color-mix"
import type { ComponentCtx, RenderDef, SvgComponent } from "./types"

type FiveForcesComponent = Extract<Component, { type: "five_forces" }>
type ForceKey = "rivalry" | "new_entrants" | "supplier_power" | "buyer_power" | "substitutes"
type Intensity = "low" | "medium" | "high"

/**
 * Porter's Five Forces hub-and-spoke panel (structure-components wave 2,
 * task 1) — `rivalry` is the center panel (competitive rivalry, the model's
 * own namesake force), the other four surround it in the conventional
 * textbook arrangement (new entrants above, suppliers left, buyers right,
 * substitutes below) and each connects to the center with a native `<line>`
 * — the diagram's own hub-and-spoke identity, not a decorative flourish. A
 * full-body component (`FULL_BODY_TYPES`, `component-traits.ts`) — the only
 * component `svg-content.tsx` ever hands this to fills the whole content
 * rect, no sibling components on the same slide (`checkFullBodyExclusivity`,
 * `api.ts`).
 *
 * **Geometry is a 3×3 cross grid, engine-derived, never modeled**: three
 * columns (`left`/`center`/`right`, `SIDE_COL_RATIO` splits the width) by
 * three rows whose heights are each panel's own real fitted-content height
 * (`crossGeom`, the same "measure every cell's natural content, take the
 * governing max" idiom `bmc.tsx`'s `naturalBandHeights` already established)
 * — the four corner cells are simply never populated.
 *
 * **Undersized-box shrink is real here too** (`bmc.tsx`'s own bench-driven
 * fix-round defect F, ported proactively rather than rediscovered): a
 * full-body component gets the layout's *fixed* content-rect height
 * verbatim (`svg-content.tsx`), never a box sized to its own `measure()`
 * value, and this component's schema-max content (5 items in every one of
 * the 5 panels) can exceed even the narrowest curated content rect —
 * confirmed empirically the same way bmc's own defect was (this file's
 * dedicated 13-theme schema-max sweep in `../audit/full-matrix-
 * contrast.test.ts` failed with bottom-band v-overflow/page-overflow
 * findings on every theme before this fix, verified during this task's own
 * red-first pass). `render` extends `bmc.tsx`'s two-stage fix to three,
 * cheapest concession first:
 *
 * 1. **Air** (`airScale`, 2026-08-20): the two header gaps slide from their
 *    comfortable values toward their `_TIGHT` ones, by exactly as much as
 *    `box.h` is short by and no more. Air carries no legibility obligation,
 *    so it is what a tight box spends first — see `GAP_LABEL_MARKER_TIGHT`.
 * 2. **Type** (`fontScale` < 1, floored at `MIN_FONT_SCALE`): still short
 *    once the air is gone, so every panel's font size and vertical rhythm
 *    shrink uniformly before geometry is derived.
 * 3. **Stretch** (`growScale` >= 1, `swot.tsx`/`bmc.tsx`'s uncapped idiom):
 *    grows the row bands when `box.h` instead exceeds the natural total.
 *
 * Stages 1-2 and stage 3 never engage at once (`box.h` is either short of
 * natural, long, or exactly natural). Together they absorb the dedicated
 * 13-theme schema-max sweep cleanly (verified: zero findings,
 * "pest/five_forces schema-max content" describe block) — and with room to
 * spare that the pre-2026-08-20 build did not have, since that sweep used
 * to clear `MIN_FONT_SCALE`'s floor by one percent and now clears it on air
 * alone. The one compound edge case still not fully absorbed — the same
 * residual `bmc.tsx`'s own header already names — is schema-max content
 * *and* a heading long enough to force a 2-line wrap *and* the narrowest
 * curated layout, all three at once (verified: a synthetic 55-char heading
 * shrinks `narrow-column`'s content rect to 347px against a 425px floored
 * natural, reintroducing a bottom-band v-overflow that neither air nor the
 * font-scale floor can close; a realistic short heading does not reach it).
 * Out of this task's own scope, same discipline as bmc's residual —
 * documented, not chased.
 *
 * **Intensity marker** (task 1 scope item 2): a deterministic 3-dot meter —
 * filled-dot count = 1 (low) / 2 (medium) / 3 (high) out of 3, solid fill
 * for a filled dot vs. stroke-only outline for an empty one. Distinguishing
 * filled/empty by *shape* (solid disk vs. ring), not only by color, keeps
 * the marker legible independent of hue — the same reasoning
 * `accessibleInk`'s whole existence rests on (never assume a viewer
 * resolves color the way the author's screen did). The marker paints no
 * text, so it carries no `findContrastIssues` obligation of its own — only
 * the panel's title/item text does, same as `swot.tsx`/`bmc.tsx`.
 *
 * **Panel color policy** (decision 7: theme tokens only): `rivalry`
 * (`colors.accent`, tinted slightly stronger — 0.18 vs. 0.14 — to read as
 * the visual hub) / `new_entrants` (`colors.primary`) / `supplier_power`
 * (`colors.muted`) / `buyer_power` (`mixHex(primary, accent, 0.5)`) /
 * `substitutes` (`mixHex(accent, muted, 0.5)`) — five distinct combinations
 * from three semantic tokens, the same "no 4th/5th token exists, blend
 * instead of inventing a hardcoded color" constraint `swot.tsx`'s
 * `badgeFill` already documents. Every title/item ink routes through
 * `accessibleInk` against its own panel's real fill — see the dedicated
 * 13-theme sweep in `../audit/full-matrix-contrast.test.ts`
 * ("pest/five_forces tinted-panel contrast").
 */

const DEFAULT_LABELS: Record<ForceKey, string> = {
  rivalry: "Competitive Rivalry",
  new_entrants: "Threat of New Entrants",
  supplier_power: "Supplier Power",
  buyer_power: "Buyer Power",
  substitutes: "Threat of Substitutes",
}

const GAP = 14
const PAD_X = 14
const PAD_TOP = 10
const PAD_BOTTOM = 10
const CARD_RADIUS = 10

const LABEL_SIZE = 13.5
const LABEL_SIZE_MIN = 10.5
/**
 * Air between the panel's title and the intensity dots under it, and
 * between that header block and the item list.
 *
 * Both were raised on 2026-08-15 after the visual review found the dots
 * reading as if they were stuck to the underside of the title ("圆点跟文本
 * 挤在一起…没有呼吸感") in both Chinese and English. The dot meter is a
 * separate statement from the title, not a diacritic on it, so it needs
 * enough room to read as its own line — and the header as a whole needs to
 * separate from the items more than it separates internally, or the three
 * elements read as one undifferentiated block.
 *
 * **Raised a second time on 2026-08-20** — the same complaint came back in
 * review round 3, and re-measuring showed the 2026-08-15 pass had not moved
 * the render at all in the direction it claimed. Two reasons, both now
 * fixed:
 *
 * 1. The numbers were too small to begin with. Measured on the real
 *    `component--five-forces--zh` page (browser `getBBox`, not estimates),
 *    title-to-dot air was 5.8px against a panel that pads itself 10px at
 *    the top — the dots read as belonging to the title's own line.
 * 2. `renderPanel` then spent 2px of `GAP_LABEL_MARKER` back by drawing the
 *    marker at `gapLabelMarker - markerDotR / 2`, i.e. half a dot higher
 *    than the band `panelLayout` reserves for it. So the drawn air was
 *    never the declared air, and the marker overhung the top of its own
 *    reserved band by `markerDotR / 2` while leaving that much slack at the
 *    bottom. The subtraction is gone: the marker's top now sits exactly
 *    `gapLabelMarker` below the title baseline, which is what `contentH`
 *    has always been budgeting for.
 *
 * These two constants are the vertical rhythm's only free variables, so
 * they are also what `five-forces.test.tsx`'s "header rhythm" assertions
 * pin — a panel's declared header band must match its drawn one, and the
 * header must separate from the items by more than it separates
 * internally. Raising these raises `measure()` by 10px per intensity-
 * carrying panel (5 for the marker band, 5 for the header/items gap),
 * i.e. +30px of natural component height for the three-row cross.
 *
 * That +30 is not free, which is what `_TIGHT` below is for.
 */
const GAP_LABEL_MARKER = 16
const GAP_HEADER_ITEMS = 18

/**
 * The same two gaps, at the smallest values this component is willing to
 * draw them — `render`'s undersized-box path collapses toward these before
 * it touches type size.
 *
 * They are the pre-2026-08-20 values verbatim, which is the point: this
 * component shipped at 11/13 for five days and the complaint against them
 * was that they read cramped, not that they read broken. Cramped is the
 * correct answer for a box that cannot afford comfortable.
 *
 * **Why air gives before type does.** The raise above cost real headroom
 * on the one fixture that was already at the edge: the 13-theme schema-max
 * sweep (`../audit/full-matrix-contrast.test.ts`, 5 items in all 5 panels
 * on `narrow-column`, the narrowest curated content layout) fits its
 * component into a 410px rect. At 11/13 the natural total was 512.5, so it
 * needed a `fontScale` of 0.800 — clearing `MIN_FONT_SCALE`'s 0.792 floor
 * by one percent. At 16/18 the natural total is 542.5 and the required
 * scale is 0.756, i.e. under the floor, so the floor clamps and 15.2px of
 * item text spills past the content rect on every one of the 17 themes.
 *
 * Shrinking type further is the wrong way to buy that back: `padTop`,
 * `padBottom` and these two gaps are the only vertical terms carrying no
 * legibility obligation at all, while `MIN_FONT_SCALE` exists precisely to
 * say how small item text is allowed to get. So the shrink path spends air
 * first and type second (`render`), and these constants are how far the
 * air is allowed to be spent. A box that is short by less than the
 * comfort span gets the air scaled part-way rather than dropped to the
 * floor, so there is no cliff at exactly-natural height.
 */
const GAP_LABEL_MARKER_TIGHT = 11
const GAP_HEADER_ITEMS_TIGHT = 13

const ITEM_SIZE = 12
const ITEM_SIZE_MIN = 9.5
const ITEM_LH_RATIO = 1.3
const ITEM_GAP = 4
const BULLET_R = 2
const BULLET_INDENT = 11

const MARKER_DOTS = 3
const MARKER_DOT_R = 4
const MARKER_DOT_GAP = 6

const SIDE_COL_RATIO = 0.27

// bench-driven fix round, defect F (ported from bmc.tsx — see file header's
// "Undersized-box shrink is real here too") — floor for render's
// box.h-undersized font-shrink below, derived the same way bmc.tsx's own
// floor is: it equals the item text's own width-axis shrink floor
// (`ITEM_SIZE_MIN / ITEM_SIZE`), so the new height-axis floor never asks
// item text to go smaller than a size this file already treats as an
// acceptable edge.
const MIN_FONT_SCALE = ITEM_SIZE_MIN / ITEM_SIZE

const INTENSITY_LEVEL: Record<Intensity, number> = { low: 1, medium: 2, high: 3 }

/** Solid, un-blended theme token per force — the panel tint blends this
 * toward `colors.surface`; the intensity marker's filled dots reuse it too. */
function forceToken(key: ForceKey, ctx: ComponentCtx): string {
  switch (key) {
    case "rivalry":
      return ctx.colors.accent
    case "new_entrants":
      return ctx.colors.primary
    case "supplier_power":
      return ctx.colors.muted
    case "buyer_power":
      return mixHex(ctx.colors.primary, ctx.colors.accent, 0.5)
    case "substitutes":
      return mixHex(ctx.colors.accent, ctx.colors.muted, 0.5)
  }
}

function panelFill(key: ForceKey, ctx: ComponentCtx): string {
  const t = key === "rivalry" ? 0.18 : 0.14
  return mixHex(ctx.colors.surface, forceToken(key, ctx), t)
}

interface PanelLayout {
  label: { text: string; fontSize: number; truncated: boolean }
  items: { text: string; fontSize: number; truncated: boolean }[]
  intensity?: Intensity
  contentH: number
  // fontScale-applied nominal rhythm — renderPanel positions against these,
  // not each fitted item/label's own (possibly further width-shrunk)
  // fontSize. Same nominal/fitted split `bmc.tsx`'s own `BlockLayout` uses.
  labelSize: number
  padTop: number
  padBottom: number
  gapLabelMarker: number
  gapHeaderItems: number
  itemSize: number
  itemLH: number
  itemGap: number
  bulletR: number
  markerDotR: number
  markerDotGap: number
}

/**
 * `fontScale` (default 1, nominal) shrinks every vertical measurement — font
 * sizes, line-height, padding, gaps, marker dot size — by the same
 * proportion; `w`/`PAD_X`/`BULLET_INDENT` (the horizontal axis) are
 * untouched. At `fontScale === 1` every returned field reduces to this
 * file's nominal constants exactly — same as `bmc.tsx`'s `blockLayout`.
 *
 * `airScale` (default 1, comfortable) independently slides the two header
 * gaps between their comfortable and `_TIGHT` values — 1 is comfortable, 0
 * is tight, and `render` picks the largest value the box can pay for. It is
 * a second axis rather than a second `fontScale` because it must be able to
 * keep giving after `fontScale` has hit `MIN_FONT_SCALE`; see
 * `GAP_LABEL_MARKER_TIGHT`. Both scales compose: the gaps are interpolated
 * by `airScale` first, then scaled by `fontScale` like every other vertical
 * term, so `airScale === 1` reduces to exactly the previous behaviour.
 */
// `fontFamily` (bold-metrics fix, round 2, 2026-07-24): the rendered label
// `<text>` declares `fontWeight="700"` in `ctx.fonts.heading` (`render`
// below) -- same bold-aware-fitting need as every other bold heading-faced
// text this task's audit-baseline sweep found and fixed. Optional,
// defaults to `undefined` (envelope fallback) -- `measure()` never reads
// `.label`, only the `contentH` derived from the fixed declared
// `labelSize`, so it doesn't need a real value.
function panelLayout(
  key: ForceKey,
  panel: { label?: string; intensity?: Intensity; items: string[] },
  w: number,
  fontScale: number = 1,
  airScale: number = 1,
  fontFamily?: string,
): PanelLayout {
  const contentW = Math.max(1, w - PAD_X * 2)
  const labelSize = LABEL_SIZE * fontScale
  const itemSize = ITEM_SIZE * fontScale
  const itemLH = Math.round(itemSize * ITEM_LH_RATIO)
  const padTop = PAD_TOP * fontScale
  const padBottom = PAD_BOTTOM * fontScale
  const air = (tight: number, comfortable: number) => tight + (comfortable - tight) * airScale
  const gapLabelMarker = air(GAP_LABEL_MARKER_TIGHT, GAP_LABEL_MARKER) * fontScale
  const gapHeaderItems = air(GAP_HEADER_ITEMS_TIGHT, GAP_HEADER_ITEMS) * fontScale
  const itemGap = ITEM_GAP * fontScale
  const bulletR = BULLET_R * fontScale
  const markerDotR = MARKER_DOT_R * fontScale
  const markerDotGap = MARKER_DOT_GAP * fontScale

  const label = fitSvgLine(panel.label ?? DEFAULT_LABELS[key], {
    maxWidth: contentW,
    fontSize: labelSize,
    minFontSize: LABEL_SIZE_MIN * fontScale,
    bold: true,
    fontFamily,
  })
  const items = panel.items.map((it) =>
    fitSvgLine(it, {
      maxWidth: contentW - BULLET_INDENT,
      fontSize: itemSize,
      minFontSize: ITEM_SIZE_MIN * fontScale,
    }),
  )
  const itemsH = items.length * itemLH + Math.max(0, items.length - 1) * itemGap
  const markerH = panel.intensity ? gapLabelMarker + markerDotR * 2 : 0
  const contentH = padTop + labelSize + markerH + gapHeaderItems + itemsH + padBottom
  return {
    label,
    items,
    intensity: panel.intensity,
    contentH,
    labelSize,
    padTop,
    padBottom,
    gapLabelMarker,
    gapHeaderItems,
    itemSize,
    itemLH,
    itemGap,
    bulletR,
    markerDotR,
    markerDotGap,
  }
}

interface CrossGeom {
  leftW: number
  centerW: number
  rightW: number
  topH: number
  midH: number
  bottomH: number
  layouts: Record<ForceKey, PanelLayout>
}

/** Pure function of `component`'s own real content at width `w`, `fontScale`
 * and `airScale` (both default 1) — the natural (unstretched) 3×3 cross
 * geometry `measure()` and `render()` both derive from, never a hardcoded
 * ratio. */
function crossGeom(
  component: FiveForcesComponent,
  w: number,
  fontScale: number = 1,
  airScale: number = 1,
  fontFamily?: string,
): CrossGeom {
  const usableW = w - GAP * 2
  const leftW = usableW * SIDE_COL_RATIO
  const rightW = usableW * SIDE_COL_RATIO
  const centerW = usableW - leftW - rightW

  const layouts: Record<ForceKey, PanelLayout> = {
    rivalry: panelLayout("rivalry", component.rivalry, centerW, fontScale, airScale, fontFamily),
    new_entrants: panelLayout("new_entrants", component.new_entrants, centerW, fontScale, airScale, fontFamily),
    supplier_power: panelLayout("supplier_power", component.supplier_power, leftW, fontScale, airScale, fontFamily),
    buyer_power: panelLayout("buyer_power", component.buyer_power, rightW, fontScale, airScale, fontFamily),
    substitutes: panelLayout("substitutes", component.substitutes, centerW, fontScale, airScale, fontFamily),
  }

  const topH = layouts.new_entrants.contentH
  const bottomH = layouts.substitutes.contentH
  const midH = Math.max(layouts.supplier_power.contentH, layouts.rivalry.contentH, layouts.buyer_power.contentH)

  return { leftW, centerW, rightW, topH, midH, bottomH, layouts }
}

/** The three governing row bands plus the two gaps between them — the one
 * height number every stage of `render` compares against `box.h`. */
function crossTotal(g: CrossGeom): number {
  return g.topH + GAP + g.midH + GAP + g.bottomH
}

function renderIntensityMarker(
  key: ForceKey,
  intensity: Intensity,
  x: number,
  y: number,
  color: string,
  dotR: number,
  dotGap: number,
) {
  const filled = INTENSITY_LEVEL[intensity]
  return (
    <g data-intensity-group={key}>
      {Array.from({ length: MARKER_DOTS }, (_, i) => {
        const cx = x + i * (dotR * 2 + dotGap) + dotR
        const cy = y + dotR
        const isFilled = i < filled
        return (
          <circle
            key={i}
            data-intensity-dot={isFilled ? "filled" : "empty"}
            cx={cx}
            cy={cy}
            r={dotR}
            fill={isFilled ? color : "none"}
            stroke={color}
            strokeWidth={1.2}
          />
        )
      })}
    </g>
  )
}

function renderPanel(
  key: ForceKey,
  layout: PanelLayout,
  x: number,
  y: number,
  w: number,
  h: number,
  ctx: ComponentCtx,
  r: number,
): React.ReactElement {
  const panel = panelFill(key, ctx)
  const token = forceToken(key, ctx)
  const labelInk = accessibleInk(ctx.colors.text, panel, layout.labelSize)
  const itemInk = accessibleInk(ctx.colors.text, panel, layout.itemSize)
  const labelBaseline = y + layout.padTop + layout.labelSize
  let cursorY = labelBaseline
  // The marker's top edge, not its center — `renderIntensityMarker` takes a
  // top-left origin and derives `cy` from it. Drawn air and declared air are
  // the same number on purpose: `panelLayout`'s `markerH` reserves exactly
  // `gapLabelMarker + markerDotR * 2` below the title baseline, so anything
  // subtracted here would silently spend part of the gap the constant
  // promises (it used to subtract `markerDotR / 2` — see GAP_LABEL_MARKER's
  // own note).
  const markerRow =
    layout.intensity != null ? (
      <g key="marker">
        {renderIntensityMarker(
          key,
          layout.intensity,
          x + PAD_X,
          cursorY + layout.gapLabelMarker,
          token,
          layout.markerDotR,
          layout.markerDotGap,
        )}
      </g>
    ) : null
  if (layout.intensity != null) cursorY += layout.gapLabelMarker + layout.markerDotR * 2
  let itemY = cursorY + layout.gapHeaderItems
  return (
    <g key={key}>
      <rect data-force={key} x={x} y={y} width={w} height={h} rx={r} fill={panel} />
      <text
        data-truncated={layout.label.truncated ? "1" : undefined}
        x={x + PAD_X}
        y={labelBaseline}
        fontSize={layout.label.fontSize}
        fontWeight="700"
        fill={labelInk}
        fontFamily={ctx.fonts.heading}
        dominantBaseline="alphabetic"
      >
        {layout.label.text}
      </text>
      {markerRow}
      {layout.items.map((item, ii) => {
        const rowY = itemY
        itemY += layout.itemLH + layout.itemGap
        const dotCy = rowY + layout.itemSize * 0.65
        return (
          <g key={ii}>
            <circle cx={x + PAD_X + layout.bulletR} cy={dotCy} r={layout.bulletR} fill={itemInk} />
            <text
              data-truncated={item.truncated ? "1" : undefined}
              x={x + PAD_X + BULLET_INDENT}
              y={rowY + layout.itemSize}
              fontSize={item.fontSize}
              fill={itemInk}
              fontFamily={ctx.fonts.body}
              dominantBaseline="alphabetic"
            >
              {item.text}
            </text>
          </g>
        )
      })}
    </g>
  )
}

export const fiveForces: SvgComponent<FiveForcesComponent> = {
  measure(component, w) {
    return crossTotal(crossGeom(component, w))
  },
  render(component, box, ctx) {
    const natural = crossGeom(component, box.w, 1, 1, ctx.fonts.heading)
    const { leftW, centerW, rightW } = natural
    const naturalTotal = crossTotal(natural)
    const totalH = box.h ?? naturalTotal

    // ── Undersized box, stage 1 of 2: spend air ────────────────────────
    // The two header gaps slide from comfortable toward `_TIGHT` by exactly
    // as much as the box is short by, and no further — a box short by less
    // than the comfort span keeps part of its air, so nothing snaps at
    // exactly-natural height. Solving for `airScale` is plain linear
    // interpolation because the two gaps are the only airScale-dependent
    // term and each panel's `contentH` is linear in them; `tight` is only
    // walked when the box is actually short, so the common (box >= natural)
    // path still costs the one walk it always did.
    // See `GAP_LABEL_MARKER_TIGHT` for why air is spent before type is.
    let airScale = 1
    let aired = natural
    if (naturalTotal > 0 && totalH < naturalTotal) {
      const tight = crossGeom(component, box.w, 1, 0, ctx.fonts.heading)
      const tightTotal = crossTotal(tight)
      const span = naturalTotal - tightTotal
      airScale = span > 0 ? Math.min(1, Math.max(0, (totalH - tightTotal) / span)) : 0
      aired = airScale === 0 ? tight : crossGeom(component, box.w, 1, airScale, ctx.fonts.heading)
    }
    const airedTotal = crossTotal(aired)

    // ── Undersized box, stage 2 of 2: shrink type ──────────────────────
    // bench-driven fix round, defect F, ported from bmc.tsx — see file
    // header. Still short after the air is gone, so every panel's font
    // size/vertical rhythm shrinks by the proportion still missing,
    // floored at MIN_FONT_SCALE, instead of silently drawing past box.h. A
    // box at or above natural size keeps fontScale === 1 and reuses
    // `aired` as-is rather than recomputing (`bmc.tsx`'s own "one walk"
    // efficiency note). Measured against the *air-spent* total, not the
    // comfortable one, so the air already given back is not paid for twice
    // in shrunken type.
    const fontScale = airedTotal > 0 && totalH < airedTotal ? Math.max(MIN_FONT_SCALE, totalH / airedTotal) : 1
    const scaled = fontScale === 1 ? aired : crossGeom(component, box.w, fontScale, airScale, ctx.fonts.heading)
    const { topH: scaledNatTop, midH: scaledNatMid, layouts } = scaled
    const scaledNaturalTotal = crossTotal(scaled)
    const finalTotalH = Math.max(scaledNaturalTotal, totalH)

    // Growth-only stretch (swot.tsx/bmc.tsx's own uncapped idiom): grows all
    // three row bands by the same proportion finalTotalH exceeds the
    // (already fontScale-adjusted) natural total — a no-op (scale === 1)
    // whenever finalTotalH === scaledNaturalTotal, i.e. the undersized-box
    // case above, which has nothing left to grow.
    const growScale = scaledNaturalTotal > 0 ? Math.max(1, finalTotalH / scaledNaturalTotal) : 1
    const scaledTopH = scaledNatTop * growScale
    const scaledMidH = scaledNatMid * growScale
    const scaledBottomH = finalTotalH - GAP * 2 - scaledTopH - scaledMidH

    const leftX = box.x
    const centerX = box.x + leftW + GAP
    const rightX = centerX + centerW + GAP

    const topY = box.y
    const midY = topY + scaledTopH + GAP
    const bottomY = midY + scaledMidH + GAP

    const r = ctx.shape?.radius ?? CARD_RADIUS
    const lineColor = ctx.colors.muted

    const centerCx = centerX + centerW / 2
    const midCy = midY + scaledMidH / 2

    return (
      <g>
        {/* Native `<line>` hub-and-spoke connectors, painted first so every
            panel rect drawn on top visually "swallows" the touching
            endpoint — the spoke reads as running from panel edge to panel
            edge rather than floating over them. */}
        <line
          x1={centerCx}
          y1={midY}
          x2={centerCx}
          y2={topY + scaledTopH}
          stroke={lineColor}
          strokeOpacity={0.45}
          strokeWidth={1.5}
        />
        <line
          x1={centerCx}
          y1={midY + scaledMidH}
          x2={centerCx}
          y2={bottomY}
          stroke={lineColor}
          strokeOpacity={0.45}
          strokeWidth={1.5}
        />
        <line
          x1={centerX}
          y1={midCy}
          x2={leftX + leftW}
          y2={midCy}
          stroke={lineColor}
          strokeOpacity={0.45}
          strokeWidth={1.5}
        />
        <line
          x1={centerX + centerW}
          y1={midCy}
          x2={rightX}
          y2={midCy}
          stroke={lineColor}
          strokeOpacity={0.45}
          strokeWidth={1.5}
        />
        {renderPanel("new_entrants", layouts.new_entrants, centerX, topY, centerW, scaledTopH, ctx, r)}
        {renderPanel("supplier_power", layouts.supplier_power, leftX, midY, leftW, scaledMidH, ctx, r)}
        {renderPanel("rivalry", layouts.rivalry, centerX, midY, centerW, scaledMidH, ctx, r)}
        {renderPanel("buyer_power", layouts.buyer_power, rightX, midY, rightW, scaledMidH, ctx, r)}
        {renderPanel("substitutes", layouts.substitutes, centerX, bottomY, centerW, scaledBottomH, ctx, r)}
      </g>
    )
  },
}

export const renderDef: RenderDef<FiveForcesComponent> = { type: "five_forces", measure: fiveForces.measure, render: fiveForces.render }
