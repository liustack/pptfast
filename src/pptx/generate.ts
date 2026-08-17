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
import { slideToRender } from "@/svg/render-slide"
import type { ImageOp } from "./svg2pptx/image"
import { dedupeMediaInZip } from "./pptx-dedupe-media"
import { applySlideTransitions, applyElementAnimations } from "./pptx-animations"
import { applyEaFontFaces } from "./pptx-ea-fonts"
import { auditPptxPackage } from "./package-audit"
import { finalizePptxZip, normalizePptxTimestamps, PptxSealViolationError } from "./pptx-fixed-timestamps"

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

/** One page that lost content at layout time, for the gate's error message. */
interface DroppedPage {
  page: number
  slideId?: string
  count: number
}

/**
 * Content-drop gate (deep-review P1): refuse to export a deck whose layout
 * had to throw content away to make the rest fit, unless the caller opts in
 * with `{ allowDroppedContent: true }` (`--allow-dropped-content`).
 *
 * Same shape and same reason as `checkDraftGate` in `../api.ts`: shipping a
 * deck that is quietly missing content is a worse failure mode than a loud
 * refusal, and the reader of the finished file is the one person who cannot
 * tell. `layoutContentFit` drops blocks that do not fit and marks them with
 * an invisible `data-dropped-silent` (`DroppedContentMarker` — the visible
 * "+N more" text was removed because a debug marker on a customer-facing
 * slide helps nobody), so before this gate the only trace was an `audit`
 * run nobody was obliged to make.
 *
 * Scoped to the silent kind on purpose. A component that trims its own
 * items still paints "+N more" on the slide (`components/bullets.tsx`,
 * `data-table.tsx`, `timeline.tsx`) — the reader is told, the deck is not
 * pretending to be complete, and `docs/concepts.md` already adjudicated
 * that case as graceful degradation plus an advisory audit finding. This
 * gate is for the case where nothing on the page admits anything is gone.
 *
 * It lives here rather than beside `checkDraftGate` because the question
 * "will this deck lose content?" can only be answered by a real layout, and
 * this is where the export already renders every slide — `slideToRender`
 * hands back the drop count from the same parse that produces the ops, so
 * the check costs no extra render and reads the exact markup that becomes
 * the file. Runs before `pptx.write`, so a refused export never pays for
 * serialization, patching or zipping.
 *
 * Deliberately not applied to `renderSlideSvg` (single-slide preview),
 * `preview --html`, `serve` or the gallery: rendering a deck that still has
 * problems is exactly what those exist for — the gate belongs on the one
 * path that produces a deliverable.
 */
function checkContentDropGate(dropped: DroppedPage[]): void {
  if (dropped.length === 0) return
  const total = dropped.reduce((sum, d) => sum + d.count, 0)
  const refs = dropped
    .map((d) => (d.slideId ? `${d.slideId} (page ${d.page}, ${d.count})` : `page ${d.page} (${d.count})`))
    .join(", ")
  throw new PptfastError(
    `deck drops ${total} content block${total === 1 ? "" : "s"} that do not fit the content area, on ${dropped.length} page${dropped.length === 1 ? "" : "s"}: ${refs} — shorten the content, split the page in two, or pass --allow-dropped-content`,
  )
}

export async function generatePptxBlob(
  input: PptxIR,
  opts?: { allowDroppedContent?: boolean },
): Promise<Blob> {
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
  // Threaded through to `auditPptxPackage` below (alt-emission-closure fix
  // wave) so `image-alt-dropped` can check the ops that actually reached
  // svg2pptx rather than re-deriving them a second time — see that
  // function's own doc comment and `checkImageAltExported`'s in
  // package-audit.ts for why the rule needs this instead of the IR's
  // declared component list.
  const imageOpsBySlide: ImageOp[][] = []
  // Fed to `checkContentDropGate` after the loop — collected here because
  // the render that answers it is the render the export is doing anyway.
  const droppedPages: DroppedPage[] = []
  ir.slides.forEach((slide, index) => {
    const s = pptx.addSlide({ masterName: slide.type })
    const { ops, dropped } = slideToRender(ir, slide, index)
    if (dropped > 0) {
      droppedPages.push({ page: index + 1, ...(slide.id ? { slideId: slide.id } : {}), count: dropped })
    }
    imageOpsBySlide.push(ops.filter((op): op is ImageOp => op.kind === "image"))
    gradientPatches.push(...renderOps(s, ops, index))
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

  if (!opts?.allowDroppedContent) checkContentDropGate(droppedPages)

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
  // chain's own final loadAsync, don't re-unzip."
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
  } catch (e) {
    // Two-tier catch (carried-items wave, fix round — review finding F1):
    // a `PptxSealViolationError` means this call itself ran out of order
    // (reordered to run after `normalizePptxTimestamps` sealed `zip` below
    // — exactly the defect the seal exists to catch) and must propagate,
    // not be absorbed by the *different*, deliberately forgiving catch this
    // block has had since 85ebc1e for a genuine dedupe failure (bad media
    // bytes, malformed `.rels` XML) — "a media-dedupe failure is not a
    // reason to abandon export," the package audit right below still
    // inspects whatever state `zip` ended up in, so a real corruption from
    // a partially-applied dedupe attempt is still caught, just under the
    // audit's own invariant name rather than this one. See
    // `PptxSealViolationError`'s own doc comment (pptx-fixed-timestamps.ts)
    // for why this needed to be its own error class rather than a plain
    // `PptfastError` — this `instanceof` check is the reason.
    if (e instanceof PptxSealViolationError) throw e
  }
  await auditPptxPackage(zip, ir, imageOpsBySlide)
  // Whole-file byte determinism (P0 hardening Task 4 — see
  // pptx-fixed-timestamps.ts's header comment for the full root cause):
  // every entry's zip-metadata date and docProps/core.xml's created/modified
  // text get pinned to one fixed instant here, on the fully-assembled
  // package, right before the chain's one remaining `generateAsync()` — so
  // this step always re-serializes now, even on the (common) path where
  // `dedupeMediaInZip` found nothing to collapse and this stage used to
  // return `elementAnimBlob` unpatched.
  //
  // Must-run-last is no longer convention only (carried-items wave, P0 T4
  // carried item): `normalizePptxTimestamps` seals `zip`'s own mutating
  // methods once it finishes, and `finalizePptxZip` below is the only
  // sanctioned way to reach `generateAsync()` — inserting a new mutating
  // patch here, or reordering `normalizePptxTimestamps` any earlier than
  // this exact line, throws loudly at the exact call site that violated it
  // (see both functions' own doc comments, pptx-fixed-timestamps.ts).
  await normalizePptxTimestamps(zip)
  const ab = await finalizePptxZip(zip, { type: "arraybuffer", compression: "DEFLATE" })
  return new Blob([ab], { type: PPTX_MIME })
}
