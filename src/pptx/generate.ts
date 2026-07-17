/**
 * PPTX generator v3 — single-source SVG.
 *
 * Every slide is rendered by `FullSlideSvg` (the same component the preview
 * mounts) into one flat 1280×720 SVG, then converted to native pptxgenjs objects
 * by svg2pptx. Preview and export therefore share one visual source and cannot
 * drift. The only native object kept is the dynamic slide number (on the master).
 */
import type pptxgen from "pptxgenjs"
import { PptxIRSchema, type PptxIR } from "@/ir"
import { inlinePptxAssets } from "../platform/inline-assets"
import { getTheme } from "@/styles"
import { defineMastersForIR } from "./master-builder"
import {
  renderOps,
  applyGradientFills,
  type GradientFillPatch,
} from "./svg2pptx/render"
import { slideToOps } from "@/svg/render-slide"
import { dedupePptxMedia } from "./pptx-dedupe-media"
import { applySlideTransitions, applyElementAnimations } from "./pptx-animations"

export async function generatePptxBlob(input: PptxIR): Promise<Blob> {
  // `kind` is an optional file-type discriminator some callers attach to the
  // IR (e.g. `{ kind: "pptx", ...IR }`), not an IR field — the strict
  // PptxIRSchema rejects unrecognized keys, so strip it before the strict
  // parse rather than failing every caller that includes it.
  const { kind: _kind, ...irInput } = input as PptxIR & { kind?: unknown }
  // 导出需要真实字节：把签名 URL 资产取回内联成 data URL（预览不需要这一步）
  const ir = await inlinePptxAssets(PptxIRSchema.parse(irInput))

  const PptxGenJS = (await import("pptxgenjs")).default
  const pptx: pptxgen = new PptxGenJS()

  pptx.defineLayout({ name: "LAYOUT_WIDE", width: 13.33, height: 7.5 })
  pptx.layout = "LAYOUT_WIDE"

  const tokens = getTheme(ir.style.id, ir.style.tokens)
  defineMastersForIR(pptx, tokens)

  const gradientPatches: GradientFillPatch[] = []
  ir.slides.forEach((slide, index) => {
    const s = pptx.addSlide({ masterName: slide.type })
    gradientPatches.push(...renderOps(s, slideToOps(ir, slide, index), index))
  })

  const rawBlob = (await pptx.write({ outputType: "blob" })) as Blob
  // pptxgenjs itself has no gradient-fill API (render.ts, vc-task-6 pre-check
  // A): every gradient shape above was written with a solid placeholder fill
  // plus a unique objectName. Patch the real `<a:gradFill>` back in now that
  // the whole presentation has been serialized to a zip.
  const gradientBlob = await applyGradientFills(rawBlob, gradientPatches)
  // Deck-level page-transition switch (wave-C S1/S2): default fade unless
  // meta.animation.transition overrides it ("none" skips injection). Runs
  // right after the gradient patch — both touch the same `ppt/slides/*.xml`
  // parts, so grouping them keeps slide-XML patches adjacent; ordering
  // relative to the media dedupe pass below is otherwise inert, since dedupe
  // only ever touches `ppt/media/*` and `*.rels` parts.
  const transitionBlob = await applySlideTransitions(
    gradientBlob,
    ir.meta.animation?.transition ?? "fade"
  )
  // Per-block entrance animations (wave-C S3): opt-in only, default off.
  // `renderOps` above only tagged shapes with a `blk{slideIndex}-{blockIndex}`
  // objectName marker when `elements === "auto"` (`FullSlideSvg` only builds
  // `ctx.blockIndex` in that case — see `BlockCtx`'s doc comment), so calling
  // `applyElementAnimations` is gated the same way here: every other deck
  // skips this JSZip pass entirely, keeping the default export path exactly
  // what it was before this feature existed.
  const elementAnimBlob =
    ir.meta.animation?.elements === "auto"
      ? await applyElementAnimations(
          transitionBlob,
          ir.slides.map((slide) => slide.blocks.map((block) => block.type))
        )
      : transitionBlob
  // Collapse identical embedded media (e.g. a shared background image) to one part.
  return dedupePptxMedia(elementAnimBlob)
}
