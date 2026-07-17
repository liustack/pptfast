import type React from "react"
import type { Block } from "@/ir"
import type { StyleColors } from "../../styles/tokens"

/**
 * Render context threaded through every SVG block. Colors are hex strings from
 * the resolved theme tokens; fonts are CSS font-family lists whose first member
 * is the Windows-safe face svg2pptx exports (see `../fonts.ts` `resolveFontStack`
 * — the export path's `firstFontFamily` reads only that first member), followed
 * by a macOS preview fallback so the block never re-resolves a stack itself.
 */
export interface BlockCtx {
  colors: StyleColors
  fonts: { heading: string; body: string; mono: string }
  /** 主题细节 shape token（radius/gapScale），缺省=各消费点 baked 值。 */
  shape?: import("../../styles/tokens").StyleShape
  /** Resolved asset map (from `ir.assets.images`) for image-bearing blocks. */
  images?: Record<string, { src: string; alt?: string }>
  /**
   * Block → its 0-based index in the slide's own `blocks` array. `renderBlock`
   * (and tech's exploded kpi/icon-card units, which bypass `renderBlock`
   * — see `bento-layout.ts`'s `BentoUnit.block`) consult this to tag their SVG
   * output with `data-blk="{index}"`, the anchor `svg2pptx/dispatch.ts` walks
   * to stamp each op's `blockIndex` for the wave-C S3 per-block
   * entrance-animation exporter (`pptx/pptx-animations.ts`'s
   * `applyElementAnimations`).
   *
   * `FullSlideSvg` only builds this map when `ir.meta.animation.elements ===
   * "auto"` — everywhere else it's `undefined`, so `renderBlock` never emits
   * `data-blk` and the default export path stays byte-identical (S3's
   * "静态渲染不变" constraint).
   */
  blockIndex?: ReadonlyMap<Block, number>
}

/**
 * Placement box for a block, in the 1280×720 page px coordinate space. Width is
 * fixed by the layout; height is decided by the block's own `measure` — unless
 * the layout granted the block extra height (`h`, 卡片密度拉伸，2026-07-11
 * 用户「卡片页面总是空腔」痛点)：仅卡壳类 block（kpi_cards/icon_cards）消费，
 * 卡片撑到 `h`、内容在卡内垂直居中。其余 block 忽略该字段。
 */
export interface BlockBox {
  x: number
  y: number
  w: number
  h?: number
}

/**
 * A page-coordinate SVG block. `measure` reports the height (px) the block needs
 * at a given width; `render` returns a `<g transform="translate(x,y)">` whose
 * children use box-relative coordinates. Blocks must stay within the controlled
 * subset (no nested `<svg viewBox>`, no `<foreignObject>`, no gradient fill).
 */
export interface SvgBlock<B> {
  measure(block: B, w: number, ctx: BlockCtx): number
  render(block: B, box: BlockBox, ctx: BlockCtx): React.ReactElement
}
