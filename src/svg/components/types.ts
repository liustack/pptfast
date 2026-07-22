import type React from "react"
import type { Component } from "@/ir"
import type { StyleColors, StyleShape } from "../../themes/tokens"

/**
 * Render context threaded through every SVG component. Colors are hex strings from
 * the resolved theme tokens; fonts are CSS font-family lists whose first member
 * is the Windows-safe face svg2pptx exports (see `../fonts.ts` `resolveFontStack`
 * — the export path's `firstFontFamily` reads only that first member), followed
 * by a macOS preview fallback so the component never re-resolves a stack itself.
 */
export interface ComponentCtx {
  colors: StyleColors
  fonts: { heading: string; body: string; mono: string }
  /** 主题细节 shape token（radius/gapScale），缺省=各消费点 baked 值。 */
  shape?: StyleShape
  /** Resolved asset map (from `ir.assets.images`) for image-bearing components. */
  images?: Record<string, { src: string; alt?: string }>
  /**
   * The resolved background colour (hex) actually painted behind the slide
   * currently rendering, reduced to one representative value. Prefers the
   * slide's own `slide.background` override when it sets one (reduced via
   * `FullSlideSvg.tsx`'s `resolveOverrideBackgroundHex` — a gradient's exact
   * midpoint, not its `from` stop), else falls back to the theme's own
   * `tokens.defaultBackgrounds[slide.type]` (reduced via that file's
   * `resolveBackgroundHex`, `.from` for a gradient — W4 fix round; per-slide
   * override awareness is the post-v0.3 W8 fix round, backlog item 1,
   * `.issues/notes/2026-07-18-post-v03-backlog.md` #1). Consumed by
   * `../ink`'s `readableOn`/`accessibleInk` in archetypes that paint no
   * background panel of their own and so sit directly on whatever
   * `Background.tsx` painted behind them (e.g. `chapter-rail-chapter.tsx`)
   * — an archetype that paints its *own* panel (e.g.
   * `content-banner-heading.tsx`'s banner rect) uses that panel's own color
   * (`ctx.colors.primary`) instead, not this field.
   *
   * Optional, not required: `buildCtx` always sets it (falling back to
   * `tokens.colors.bg` when its own 4th argument is omitted), but a sizable
   * fraction of this repo's component-level tests construct a `ComponentCtx`
   * object literal directly rather than through `buildCtx` (paragraph/kpi/
   * chart/etc. — components that never read this field at all). Requiring
   * it here would force every one of those unrelated test files to grow a
   * throwaway value for a field they never touch. Consumers read
   * `ctx.defaultBg ?? ctx.colors.bg` — the same fallback `buildCtx` itself
   * applies, so a hand-built ctx without this field still resolves to a
   * plausible value instead of `undefined`.
   */
  defaultBg?: string
  /**
   * Body-text baseline font size (px, 1280×720 slide geometry) for the
   * paragraph/bullets/callout trio — "正文" = continuous running text, per
   * spec §5's pacing table body-baseline column (W4 design decision 9).
   * Sourced from a single seam: `FullSlideSvg.tsx`'s `buildCtx` resolves
   * `PACING_BUDGETS[resolveNarrative(ir.narrative).pacing].bodyBaselinePx`
   * (`@/narrative`) — dense=20 / balanced=24 / spacious=32 — and no
   * component recomputes it. Every other component's own bespoke type
   * scale, the heading system (`heading-fit.ts`), and quote's fixed 26px
   * attribution line are untouched by this field; they don't read it.
   *
   * Required, unlike `defaultBg` above — a deliberate divergence from that
   * field's precedent, not an inconsistency: `defaultBg` is an optional
   * contrast *enhancement* with a safe same-family fallback baked into
   * every read site (`ctx.defaultBg ?? ctx.colors.bg`). This field is the
   * *sole* authority for a core sizing dimension that `measure` and
   * `render` both read unconditionally in three components — a silently
   * defaulting fallback here could let `measure` and `render` disagree
   * when only one call site remembered it, and would mask a broken wiring
   * path (a hand-built ctx missing this field) as a plausible-looking
   * render instead of a compile error. Requiring it pushes that failure to
   * compile time everywhere a `ComponentCtx` is built by hand — mostly
   * this repo's component-level tests. `buildCtx` itself keeps its own
   * corresponding parameter optional (defaults to
   * `PACING_BUDGETS.balanced.bodyBaselinePx`), so the many
   * `buildCtx(...)`-calling archetype tests that don't care about
   * body-text sizing are unaffected — only the smaller set of tests that
   * construct a `ComponentCtx` object literal directly needed a value
   * added (W4 task 3 re-pin round).
   */
  bodyFontPx: number
  /**
   * Component → its 0-based index in the slide's own `components` array. `renderComponent`
   * (and tech's exploded kpi/icon-card units, which bypass `renderComponent`
   * — see `bento-layout.ts`'s `BentoUnit.component`) consult this to tag their SVG
   * output with `data-blk="{index}"`, the anchor `svg2pptx/dispatch.ts` walks
   * to stamp each op's `blockIndex` for the wave-C S3 per-component
   * entrance-animation exporter (`pptx/pptx-animations.ts`'s
   * `applyElementAnimations`).
   *
   * `FullSlideSvg` only builds this map when `ir.meta.animation.elements ===
   * "auto"` — everywhere else it's `undefined`, so `renderComponent` never emits
   * `data-blk` and the default export path stays byte-identical (S3's
   * "静态渲染不变" constraint).
   */
  blockIndex?: ReadonlyMap<Component, number>
  /**
   * Seed-derived starting offset into `colors.chartPalette` (P1 variety
   * wave, task 2 — `../chart-palette.ts`'s own header has the full
   * rationale). **Deliberately separate from `colors.chartPalette` itself**
   * (review fix round, Major finding): an earlier version of this feature
   * rotated `colors.chartPalette` directly inside `buildCtx`, which silently
   * leaked into every *other* consumer of that same token —
   * `campaign-motif`/`classroom-motif`/`bloom-motif` all destructure
   * `ctx.colors.chartPalette` by fixed position for their own decorative
   * fills (see each file's own header comment), so a motif's decoration
   * color drifted with the chart's phase even though nothing about motif
   * rendering is supposed to depend on chart state at all — campaign (a
   * settled 1-member candidate set that must render byte-identically across
   * every seed) differed across seeds purely from this leak. The chart
   * component (`../components/chart.tsx`, the only reader of this field) is
   * responsible for rotating `colors.chartPalette` itself before use;
   * every other consumer (every motif, any future component) reads
   * `colors.chartPalette` unrotated, exactly the theme's own declared
   * order, same as before this task existed. `undefined` means "no
   * rotation" — `buildCtx`'s own test callers (every one except this
   * task's) never set it.
   */
  chartPaletteOffset?: number
}

/**
 * Placement box for a component, in the 1280×720 page px coordinate space. Width is
 * fixed by the layout; height is decided by the component's own `measure` — unless
 * the layout granted the component extra height (`h`, 卡片密度拉伸，2026-07-11
 * 用户「卡片页面总是空腔」痛点)：仅卡壳类 component（kpi_cards/icon_cards）消费，
 * 卡片撑到 `h`、内容在卡内垂直居中。其余 component 忽略该字段。
 */
export interface ComponentBox {
  x: number
  y: number
  w: number
  h?: number
}

/**
 * A page-coordinate SVG component. `measure` reports the height (px) the component needs
 * at a given width; `render` returns a `<g transform="translate(x,y)">` whose
 * children use box-relative coordinates. Components must stay within the controlled
 * subset (no nested `<svg viewBox>`, no `<foreignObject>`, no gradient fill).
 */
export interface SvgComponent<B> {
  measure(component: B, w: number, ctx: ComponentCtx): number
  render(component: B, box: ComponentBox, ctx: ComponentCtx): React.ReactElement
}
