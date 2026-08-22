import type { PptxIR, Slide } from "@/ir"
import { layoutOmitsBranding } from "../layouts/registry"

/** Outer frame bottom when branding paints the logo/footer strip. */
export const FRAME_BOTTOM_BRANDED = 624
/** Lecture board inset: 26px from the 720 canvas. */
export const LECTURE_FRAME_BOTTOM_BOARD = 694
/** Luxe top inset is 24px. Match that on the bottom when branding is off. */
export const LUXE_FRAME_BOTTOM_BOARD = 696

/**
 * Sparse pin-only faces that already paint their own rules. Motifs that
 * carry horizontal furniture yield on these content pins so the face stays
 * inside the 2-group budget (gallery review r2 B4).
 */
export const SPARSE_PIN_LAYOUTS = ["statement", "pull-quote", "stat-hero", "one-evidence", "mono-bleed"] as const

export function yieldsOnSparsePin(slide: Slide): boolean {
  return slide.type === "content" && slide.layout !== undefined && (SPARSE_PIN_LAYOUTS as readonly string[]).includes(slide.layout)
}

/**
 * Outer-frame bottom edge. `ir.branding === "full"` is the only posture that
 * paints the content-page logo/footer, so the frame clears y630. Layout
 * `branding: "none"` skips that fragment even on a full deck (`layoutOmitsBranding`).
 * Omitted branding (gallery default) drops to the board inset.
 */
export function frameBottomY(ir: PptxIR, slide: Slide, boardY: number): number {
  if (layoutOmitsBranding(slide.layout)) return boardY
  return ir.branding === "full" ? FRAME_BOTTOM_BRANDED : boardY
}
