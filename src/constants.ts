/**
 * Shared canvas / coordinate contract for the PPTX preview and the svg2pptx
 * exporter. The SVG render layer works in a 1280×720 px viewBox; PowerPoint
 * works in inches (LAYOUT_WIDE = 13.333×7.5"). The bridge is exactly 96 px/in.
 *
 * Centralizing these removes the previous fragility where the preview viewBox
 * and the exporter's inch dimensions were kept aligned by hand across
 * master-builder / decorations / meta-blocks.
 */

export const PX_PER_IN = 96

export const CANVAS_W_PX = 1280
export const CANVAS_H_PX = 720

export const SLIDE_W_IN = CANVAS_W_PX / PX_PER_IN // 13.333…
export const SLIDE_H_IN = CANVAS_H_PX / PX_PER_IN // 7.5

/** Convert a px length in the 1280×720 canvas to PowerPoint inches. */
export function pxToIn(px: number): number {
  return px / PX_PER_IN
}

/** Points per px (72 pt/in ÷ 96 px/in). For stroke widths and font sizes. */
export const PT_PER_PX = 0.75

/** Convert a px length to PowerPoint points (stroke width, font size). */
export function pxToPt(px: number): number {
  return px * PT_PER_PX
}
