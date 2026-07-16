/**
 * v3 master-builder — single-source SVG era.
 *
 * The full-page SVG (FullSlideSvg → svg2pptx) now paints background, brand logo
 * and footer chrome on every slide, so the masters are intentionally near-empty.
 * The one thing that must stay a native PowerPoint object is the dynamic slide
 * number (it renumbers itself when slides are added/removed), so content masters
 * keep it; the SVG preview draws its own static page number instead.
 */
import type pptxgen from "pptxgenjs"
import type { ThemeTokens, LayoutType } from "../themes"

const SLIDE_TYPES: LayoutType[] = ["cover", "chapter", "content", "ending"]

/** Define one master per slide type. 页码占位已删（2026-07-09 用户裁决）。 */
export function defineMastersForIR(pptx: pptxgen, _tokens: ThemeTokens) {
  for (const type of SLIDE_TYPES) {
    pptx.defineSlideMaster({ title: type })
  }
}
