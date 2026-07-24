import type React from "react"
import type { Component } from "@/ir"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { accessibleInk } from "../ink"
import { mixHex } from "./color-mix"
import type { ComponentCtx, SvgComponent } from "./types"

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
 * full-body component gets the archetype's *fixed* content-rect height
 * verbatim (`svg-content.tsx`), never a box sized to its own `measure()`
 * value, and this component's schema-max content (5 items in every one of
 * the 5 panels) can exceed even the narrowest curated content rect —
 * confirmed empirically the same way bmc's own defect was (this file's
 * dedicated 13-theme schema-max sweep in `../audit/full-matrix-
 * contrast.test.ts` failed with bottom-band v-overflow/page-overflow
 * findings on every theme before this fix, verified during this task's own
 * red-first pass). `render` mirrors `bmc.tsx`'s exact two-stage fix: a
 * `fontScale` (< 1 only when `box.h` is short of the natural total, floored
 * at `MIN_FONT_SCALE`) shrinks every panel's font size/vertical rhythm
 * uniformly before geometry is derived, and a separate `growScale` (>= 1,
 * `swot.tsx`/`bmc.tsx`'s uncapped stretch idiom) grows the row bands when
 * `box.h` instead exceeds the natural total — the two never engage at once
 * (`box.h` is either short of natural, long, or exactly natural).
 * `MIN_FONT_SCALE` absorbs the dedicated 13-theme schema-max sweep cleanly
 * (verified: zero findings, "pest/five_forces schema-max content" describe
 * block). The one compound edge case it doesn't fully absorb — the same
 * residual `bmc.tsx`'s own header already names — is schema-max content
 * *and* a heading long enough to force a 2-line wrap *and* the narrowest
 * curated archetype, all three at once (verified manually during this
 * task: a synthetic 34-char heading shrinks `narrow-column`'s content rect
 * enough to reintroduce a small bottom-band v-overflow even at the
 * font-scale floor; a realistic short heading does not reach it). Out of
 * this task's own scope, same discipline as bmc's residual — documented,
 * not chased.
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
const GAP_LABEL_MARKER = 6
const GAP_HEADER_ITEMS = 8

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
  fontFamily?: string,
): PanelLayout {
  const contentW = Math.max(1, w - PAD_X * 2)
  const labelSize = LABEL_SIZE * fontScale
  const itemSize = ITEM_SIZE * fontScale
  const itemLH = Math.round(itemSize * ITEM_LH_RATIO)
  const padTop = PAD_TOP * fontScale
  const padBottom = PAD_BOTTOM * fontScale
  const gapLabelMarker = GAP_LABEL_MARKER * fontScale
  const gapHeaderItems = GAP_HEADER_ITEMS * fontScale
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

/** Pure function of `component`'s own real content at width `w` and
 * `fontScale` (default 1) — the natural (unstretched) 3×3 cross geometry
 * `measure()` and `render()` both derive from, never a hardcoded ratio. */
function crossGeom(
  component: FiveForcesComponent,
  w: number,
  fontScale: number = 1,
  fontFamily?: string,
): CrossGeom {
  const usableW = w - GAP * 2
  const leftW = usableW * SIDE_COL_RATIO
  const rightW = usableW * SIDE_COL_RATIO
  const centerW = usableW - leftW - rightW

  const layouts: Record<ForceKey, PanelLayout> = {
    rivalry: panelLayout("rivalry", component.rivalry, centerW, fontScale, fontFamily),
    new_entrants: panelLayout("new_entrants", component.new_entrants, centerW, fontScale, fontFamily),
    supplier_power: panelLayout("supplier_power", component.supplier_power, leftW, fontScale, fontFamily),
    buyer_power: panelLayout("buyer_power", component.buyer_power, rightW, fontScale, fontFamily),
    substitutes: panelLayout("substitutes", component.substitutes, centerW, fontScale, fontFamily),
  }

  const topH = layouts.new_entrants.contentH
  const bottomH = layouts.substitutes.contentH
  const midH = Math.max(layouts.supplier_power.contentH, layouts.rivalry.contentH, layouts.buyer_power.contentH)

  return { leftW, centerW, rightW, topH, midH, bottomH, layouts }
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
  const markerRow =
    layout.intensity != null ? (
      <g key="marker">
        {renderIntensityMarker(
          key,
          layout.intensity,
          x + PAD_X,
          cursorY + layout.gapLabelMarker - layout.markerDotR / 2,
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
    const { topH, midH, bottomH } = crossGeom(component, w)
    return topH + GAP + midH + GAP + bottomH
  },
  render(component, box, ctx) {
    const natural = crossGeom(component, box.w, 1, ctx.fonts.heading)
    const { leftW, centerW, rightW } = natural
    const naturalTotal = natural.topH + GAP + natural.midH + GAP + natural.bottomH
    const totalH = box.h ?? naturalTotal

    // bench-driven fix round, defect F, ported from bmc.tsx — see file
    // header. A box shorter than the natural total shrinks every panel's
    // font size/vertical rhythm by the same proportion the box is short by,
    // floored at MIN_FONT_SCALE, instead of silently drawing past box.h. A
    // box at or above natural size keeps fontScale === 1 and reuses
    // `natural` as-is rather than recomputing (`bmc.tsx`'s own "one walk"
    // efficiency note).
    const fontScale = naturalTotal > 0 && totalH < naturalTotal ? Math.max(MIN_FONT_SCALE, totalH / naturalTotal) : 1
    const scaled = fontScale === 1 ? natural : crossGeom(component, box.w, fontScale, ctx.fonts.heading)
    const { topH: scaledNatTop, midH: scaledNatMid, bottomH: scaledNatBottom, layouts } = scaled
    const scaledNaturalTotal = scaledNatTop + GAP + scaledNatMid + GAP + scaledNatBottom
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
