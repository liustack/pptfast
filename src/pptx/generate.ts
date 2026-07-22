/**
 * PPTX generator v3 — single-source SVG.
 *
 * Every slide is rendered by `FullSlideSvg` (the same component the preview
 * mounts) into one flat 1280×720 SVG, then converted to native pptxgenjs objects
 * by svg2pptx. Preview and export therefore share one visual source and cannot
 * drift. The only native object kept is the dynamic slide number (on the master).
 */
import JSZip from "jszip"
import type pptxgen from "pptxgenjs"
import { PptxIRSchema, type PptxIR } from "@/ir"
import { PptfastError } from "../errors"
import { inlinePptxAssets } from "../platform/inline-assets"
import { resolveStyle } from "@/themes"
import { defineMastersForIR } from "./master-builder"
import {
  renderOps,
  applyGradientFills,
  type GradientFillPatch,
} from "./svg2pptx/render"
import { slideToOps } from "@/svg/render-slide"
import { dedupeMediaInZip } from "./pptx-dedupe-media"
import { applySlideTransitions, applyElementAnimations } from "./pptx-animations"
import { applyEaFontFaces } from "./pptx-ea-fonts"
import { auditPptxPackage } from "./package-audit"
import { normalizePptxTimestamps } from "./pptx-fixed-timestamps"

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

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

  const tokens = resolveStyle(ir.theme.id, ir.theme.style)
  defineMastersForIR(pptx, tokens)

  const gradientPatches: GradientFillPatch[] = []
  ir.slides.forEach((slide, index) => {
    const s = pptx.addSlide({ masterName: slide.type })
    gradientPatches.push(...renderOps(s, slideToOps(ir, slide, index), index))
    // Speaker notes (notes+preview wave, task 1): native PowerPoint notes,
    // never drawn onto the canvas SVG — no `slideToOps`/`renderOps`
    // involvement above. pptxgenjs already emits an (empty-text)
    // ppt/notesSlides/notesSlideN.xml part for every slide regardless of
    // whether `addNotes` is ever called (its own `writeToDisk`/`export`
    // path, `zip.file(...makeXmlNotesSlide(slide))` unconditionally per
    // slide) — so this call only ever changes that existing part's text,
    // it never adds a new zip entry. A slide that omits `notes` never calls
    // `addNotes` at all, so its notesSlide part stays exactly the
    // pre-existing empty placeholder: the frozen v3 schema's byte-identity
    // invariant for an omitted-notes deck holds by construction, not by a
    // conditional guard against new structure.
    if (slide.notes) s.addNotes(slide.notes)
  })

  const rawBlob = (await pptx.write({ outputType: "blob" })) as Blob
  // pptxgenjs itself has no gradient-fill API (render.ts, vc-task-6 pre-check
  // A): every gradient shape above was written with a solid placeholder fill
  // plus a unique objectName. Patch the real `<a:gradFill>` back in now that
  // the whole presentation has been serialized to a zip.
  const gradientBlob = await applyGradientFills(rawBlob, gradientPatches)
  // CJK east-asian font-slot patch (follow-up to borrow-wave Task 3's
  // documented CJK glyph gap — `fonts.ts`'s header comment, `pptx-ea-fonts.ts`'s
  // own header comment for the full mechanics): pptxgenjs has no API to set
  // `<a:ea>` independently of `<a:latin>`, so every run's east-asian font
  // slot is corrected here, unconditionally, right after the gradient patch
  // — both touch the same `ppt/slides/*.xml` parts (text runs vs. shape
  // fills, non-overlapping regions of the same XML), so grouping them keeps
  // slide-XML-correcting patches adjacent, ahead of the deck-level
  // transition/animation patches below which only ever *add* new structure.
  const eaFontBlob = await applyEaFontFaces(gradientBlob)
  // Deck-level page-transition switch (wave-C S1/S2): default fade unless
  // meta.animation.transition overrides it ("none" skips injection). Runs
  // right after the a:ea patch — still the same `ppt/slides/*.xml` parts.
  // Ordering relative to the media dedupe pass below is otherwise inert,
  // since dedupe only ever touches `ppt/media/*` and `*.rels` parts.
  const transitionBlob = await applySlideTransitions(
    eaFontBlob,
    ir.meta.animation?.transition ?? "fade"
  )
  // Per-component entrance animations (wave-C S3): opt-in only, default off.
  // `renderOps` above only tagged shapes with a `blk{slideIndex}-{blockIndex}`
  // objectName marker when `elements === "auto"` (`FullSlideSvg` only builds
  // `ctx.blockIndex` in that case — see `ComponentCtx`'s doc comment), so calling
  // `applyElementAnimations` is gated the same way here: every other deck
  // skips this JSZip pass entirely, keeping the default export path exactly
  // what it was before this feature existed.
  const elementAnimBlob =
    ir.meta.animation?.elements === "auto"
      ? await applyElementAnimations(
          transitionBlob,
          ir.slides.map((slide) => slide.components.map((component) => component.type))
        )
      : transitionBlob
  // Collapse identical embedded media (e.g. a shared background image) to one
  // part, then run the package-audit hard gate (Audit v2 spec §4.4/§10.4)
  // before returning bytes. Both steps share this one `JSZip.loadAsync` of
  // the fully-patched package — the audit inspects the exact in-memory zip
  // `dedupeMediaInZip` just mutated (or left alone) rather than the gate
  // re-reading the package from scratch, per §10.4's "piggyback the patch
  // chain's own final loadAsync, don't re-unzip." `dedupePptxMedia`'s
  // Blob-in/Blob-out form (same file) stays exported for its own standalone
  // tests but is no longer called from this pipeline.
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(await elementAnimBlob.arrayBuffer())
  } catch (e) {
    // Mirrors package-audit.ts's own "zip-unreadable" wording — this is the
    // same invariant, just caught one layer up since this is the one load
    // the audit itself piggybacks rather than repeating.
    throw new PptfastError(
      `pptx package audit failed — invariant "zip-unreadable": the generated package is not a readable zip archive (${(e as Error).message})`,
    )
  }
  try {
    await dedupeMediaInZip(zip)
  } catch {
    // Matches dedupePptxMedia's own defensiveness (a media-dedupe failure is
    // not a reason to abandon export) — the package audit right below still
    // inspects whatever state `zip` ended up in, so a real corruption from a
    // partially-applied dedupe attempt is still caught, just under the
    // audit's own invariant name rather than this one.
  }
  await auditPptxPackage(zip)
  // Whole-file byte determinism (P0 hardening Task 4 — see
  // pptx-fixed-timestamps.ts's header comment for the full root cause):
  // every entry's zip-metadata date and docProps/core.xml's created/modified
  // text get pinned to one fixed instant here, on the fully-assembled
  // package, right before the chain's one remaining `generateAsync()` — so
  // this step always re-serializes now, even on the (common) path where
  // `dedupeMediaInZip` found nothing to collapse and this stage used to
  // return `elementAnimBlob` unpatched.
  await normalizePptxTimestamps(zip)
  const ab = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" })
  return new Blob([ab], { type: PPTX_MIME })
}
