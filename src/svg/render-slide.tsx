import { createElement } from "react"
import type { PptxIR, Slide } from "@/ir"
import { svgToOps, type Op } from "../pptx/svg2pptx/dispatch"
import { FullSlideSvg } from "./FullSlideSvg"
import { renderSvgMarkup, parseSvgRoot } from "./serialize"

/**
 * Export-side entry: render one slide through the single source. `FullSlideSvg`
 * is the same component the preview mounts, so the exported DrawingML matches the
 * preview by construction. Lives in a `.tsx` so `pptx-generate.ts` stays JSX-free.
 */
export function slideToSvgMarkup(ir: PptxIR, slide: Slide, index: number): string {
  return renderSvgMarkup(createElement(FullSlideSvg, { ir, slide, index }))
}

/** Render a slide to pptxgenjs ops via single-source SVG → svg2pptx. */
export function slideToOps(ir: PptxIR, slide: Slide, index: number): Op[] {
  return svgToOps(parseSvgRoot(slideToSvgMarkup(ir, slide, index)))
}
