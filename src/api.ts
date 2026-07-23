/**
 * Public API surface: validateIr's own logic lives in `./validate-core`
 * (P2 browser-distribution wave, task 1 — see that file's own doc comment
 * for why) and is re-exported below unchanged, so every existing consumer
 * of this module keeps working exactly as before. `renderSlideSvg` and
 * `generatePptx` stay defined here — this is the one file allowed to reach
 * into `./svg/render-slide` and `./pptx/generate` (react-dom/server, jszip,
 * pptxgenjs, dagre).
 */
export {
  validateIr,
  formatIssues,
  formatWarnings,
  listThemes,
  irJsonSchema,
  styleJsonSchema,
  type ValidateResult,
  type ValidationIssue,
  type ThemeInfo,
} from "./validate-core"

import { PptfastError } from "./errors"
import type { PptxIR } from "./ir"
import { generatePptxBlob } from "./pptx/generate"
import { slideToSvgMarkup } from "./svg/render-slide"
import { formatIssues, validateIr } from "./validate-core"

/** Render a single slide to standalone SVG markup (preview / self-check). */
export function renderSlideSvg(ir: PptxIR, slideIndex: number): string {
  const slide = ir.slides[slideIndex]
  if (!slide) {
    throw new PptfastError(`slide index ${slideIndex} out of range — deck has ${ir.slides.length} slides`)
  }
  return slideToSvgMarkup(ir, slide, slideIndex)
}

/**
 * Draft gate (W5 task 1): `generatePptx` refuses to export a deck that still
 * has unfilled `placeholder` pages unless the caller opts in with
 * `{ draft: true }` — a placeholder page is assemble's stand-in for content
 * nobody has written yet, so a plain export silently shipping it would be a
 * worse failure mode than a loud one. `renderSlideSvg` (single-slide
 * preview) deliberately never calls this — an agent iterating on a
 * partially-filled deck needs to preview whatever page it just wrote without
 * every other still-empty page blocking it.
 */
function checkDraftGate(ir: PptxIR): void {
  const placeholders = ir.slides
    .map((slide, i) => ({ slide, page: i + 1 }))
    .filter(({ slide }) => slide.placeholder)
  if (placeholders.length === 0) return
  const refs = placeholders
    .map(({ slide, page }) => (slide.id ? `${slide.id} (page ${page})` : `page ${page}`))
    .join(", ")
  throw new PptfastError(
    `deck has ${placeholders.length} unfilled placeholder page${placeholders.length === 1 ? "" : "s"}: ${refs} — fill them or pass --draft`,
  )
}

/** Full pipeline: validate → SVG → DrawingML → animation patches → pptx bytes. */
export async function generatePptx(input: unknown, opts?: { draft?: boolean }): Promise<Uint8Array> {
  const v = validateIr(input)
  if (!v.ok) throw new PptfastError(`invalid IR:\n${formatIssues(v.errors)}`)
  if (!opts?.draft) checkDraftGate(v.ir!)
  const blob = await generatePptxBlob(v.ir!)
  return new Uint8Array(await blob.arrayBuffer())
}
