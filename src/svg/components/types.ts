import type React from "react"
import type { Component } from "@/ir"
import type { StyleColors } from "../../themes/tokens"

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
  shape?: import("../../themes/tokens").StyleShape
  /** Resolved asset map (from `ir.assets.images`) for image-bearing components. */
  images?: Record<string, { src: string; alt?: string }>
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
