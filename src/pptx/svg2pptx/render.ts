import JSZip from "jszip"
import type { Op } from "./dispatch"
import type { TextRunData } from "./text"
import { gradientFillXml } from "./gradient"
import { blockMarker, pad4 } from "../pptx-animations"

/**
 * The subset of a pptxgenjs `Slide` that the render layer uses. Keeping it
 * narrow lets us unit-test the op→call translation against a spy without
 * pulling in the whole pptxgenjs runtime.
 */
export interface SlideLike {
  addText(text: unknown, opts: unknown): unknown
  addShape(shape: string, opts: unknown): unknown
  addImage(opts: unknown): unknown
}

/**
 * A pending `a:gradFill` swap for one shape, keyed by the unique `objectName`
 * (`p:cNvPr name=`) `renderOp` assigned it. Produced by `renderOps`, consumed
 * by `applyGradientFills` after the whole presentation has been written.
 */
export interface GradientFillPatch {
  objectName: string
  xml: string
}

/**
 * Deterministic `objectName` for a gradient-patch shape:
 * `svg2pptx-gradient-s{slideIndex}-{n}`, where `n` is `indexInSlide` — this
 * shape's 0-based position among the gradient shapes processed so far *in
 * this slide* (`patches.length` at assignment time, before the push — see
 * the two call sites below). `renderOps` runs once per slide with a fresh
 * `patches` array (see `pptx-generate.ts`'s per-slide `renderOps` call), so
 * `n` alone would collide across slides (slide 2's first gradient and slide
 * 5's first gradient would both be `n=0`); folding in `slideIndex` (this
 * op's slide's own 0-based deck position) keeps the full name unique across
 * the whole multi-slide deck, which `applyGradientFills`'s exact-match
 * lookup across every slide part requires — two patches sharing one name
 * would silently collide in its `objectName → patch` `Map` (last write
 * wins), leaving one slide's gradient un-patched. `slideIndex` defaults to 0
 * only for callers that exercise `renderOp`/`renderOps` directly without a
 * slide context (unit tests); the one production caller (`pptx-generate.ts`)
 * always threads a real index, so this default never fires there.
 *
 * Before this (defect G, 2026-07-20 bench-driven fixes wave), this name
 * folded in a fresh `Math.random().toString(36)` token per shape instead of
 * `s{slideIndex}`: non-deterministic, so rendering the same deck twice
 * produced byte-different slide XML (e.g. `svg2pptx-gradient-54y7li-0` vs
 * `svg2pptx-gradient-zkebt5-0` for the same shape) — a core-promise
 * violation the benchmark's double-render scorer (`tests/bench/score.mts`)
 * caught directly. `slideIndex`+`indexInSlide` are both already stable,
 * already-computed inputs (no new state to thread), and — unlike a random
 * token — provably unique within the file by construction, not merely
 * "astronomically unlikely" to collide.
 */
function gradientObjectName(slideIndex: number | undefined, indexInSlide: number): string {
  return `svg2pptx-gradient-s${pad4(slideIndex ?? 0)}-${pad4(indexInSlide)}`
}

/**
 * Fold wave-C S3's `blk{slideIndex}-{blockIndex}` marker into `opts.objectName`
 * (mutating `opts` in place), if `op` carries a `blockIndex` (set by
 * `svg2pptx/dispatch.ts`'s `walk` when this op's source `<g>` was tagged
 * `data-blk` — only happens when `meta.animation.elements === "auto"`, see
 * `ComponentCtx.blockIndex`'s doc comment). A no-op whenever `op.blockIndex` or
 * `slideIndex` is absent, which is always true on the default (`elements`
 * unset/`"none"`) export path — the whole point being that path never emits
 * `data-blk` in the first place, so this never fires and `objectName` stays
 * exactly what it already was (untouched, or the gradient patch's own name).
 *
 * Appended as a suffix rather than replacing any existing gradient-patch
 * `objectName` so the two markers coexist on one shape (S3: "与渐变的
 * objectName 标记兼容共存"); when there's no existing name, a fresh one is
 * minted as `svg2pptx-{opIndex}-{marker}` — `opIndex` (this op's 0-based
 * position within the whole slide's op list, threaded from `renderOps`) is
 * what keeps multiple shapes belonging to the *same* component (e.g. a
 * chart's several bars, all sharing one `blockIndex`) distinguishable from
 * each other, deterministically, so every component-tagged shape still gets
 * a legible, distinguishable name in PowerPoint's Selection Pane — this used
 * to be a fresh random token per shape (defect G, 2026-07-20 bench-driven
 * fixes wave: same non-determinism as `gradientObjectName`'s, see that
 * function's doc comment), which `opIndex` replaces without losing the
 * distinguishing property, since two ops never share a position within one
 * slide's op list. Defaults to 0 only when a caller exercises `renderOp`
 * directly without threading `opIndex` (unit tests) — the one production
 * path (`renderOps`) always supplies it.
 */
function withBlockMarker(
  opts: Record<string, unknown>,
  op: Op,
  slideIndex: number | undefined,
  opIndex: number | undefined,
): void {
  if (op.blockIndex == null || slideIndex == null) return
  const marker = blockMarker(slideIndex, op.blockIndex)
  const existing = opts.objectName as string | undefined
  opts.objectName = existing ? `${existing}-${marker}` : `svg2pptx-${pad4(opIndex ?? 0)}-${marker}`
}

/** Map a styled text run to a pptxgenjs `{ text, options }` entry. */
function runToProp(run: TextRunData): { text: string; options: Record<string, unknown> } {
  const options: Record<string, unknown> = {}
  if (run.bold) options.bold = true
  if (run.italic) options.italic = true
  if (run.underline) options.underline = true
  if (run.color) options.color = run.color
  if (run.fontSize != null) options.fontSize = run.fontSize
  return { text: run.text, options }
}

/**
 * Apply a single op to a slide as the matching pptxgenjs call.
 *
 * `patches` collects any gradient fill this op carries: pptxgenjs has no
 * gradient-fill API (see vc-task-6 report, pre-check A), so a gradient shape
 * is written with its solid placeholder `fill` (already computed by
 * `style.ts`'s `applyFill`) plus a unique `objectName`, and the real
 * `<a:gradFill>` is recorded here for `applyGradientFills` to swap in later,
 * once the whole presentation has been written to a .pptx zip.
 *
 * `slideIndex` is this op's slide's 0-based position in the deck — used both
 * by `gradientObjectName` (when `op.gradientFill` is set) and (via
 * `withBlockMarker`) to fold wave-C S3's component marker into `objectName`
 * when `op.blockIndex` is set; omit it and component-tagged ops just keep
 * whatever `objectName` they'd otherwise get (i.e. the gradient patch's, or
 * none). `opIndex` is this op's own 0-based position within the whole
 * slide's op list (threaded from `renderOps`, see its doc comment) — only
 * used by `withBlockMarker`'s fresh-name branch, to keep multiple
 * component-tagged shapes distinguishable from each other in the Selection
 * Pane.
 */
export function renderOp(
  slide: SlideLike,
  op: Op,
  patches: GradientFillPatch[] = [],
  slideIndex?: number,
  opIndex?: number,
): void {
  switch (op.kind) {
    case "shape": {
      const opts: Record<string, unknown> = { x: op.x, y: op.y, w: op.w, h: op.h }
      if (op.fill) opts.fill = op.fill
      if (op.line) opts.line = op.line
      if ("rectRadius" in op && op.rectRadius != null) opts.rectRadius = op.rectRadius
      if (op.gradientFill) opts.objectName = gradientObjectName(slideIndex, patches.length)
      // Must run before the gradient patch is recorded below: it may append
      // the blk marker onto `opts.objectName`, and the patch has to target
      // whatever name actually ends up in the written XML, not the
      // pre-marker one (`applyGradientFills`'s lookup is an exact match).
      withBlockMarker(opts, op, slideIndex, opIndex)
      if (op.gradientFill) {
        patches.push({ objectName: opts.objectName as string, xml: gradientFillXml(op.gradientFill) })
      }
      slide.addShape(op.shape, opts)
      break
    }
    case "line": {
      const opts: Record<string, unknown> = {
        x: op.x,
        y: op.y,
        w: op.w,
        h: op.h,
        line: op.line,
      }
      if (op.flipH) opts.flipH = true
      if (op.flipV) opts.flipV = true
      withBlockMarker(opts, op, slideIndex, opIndex)
      slide.addShape("line", opts)
      break
    }
    case "path": {
      const opts: Record<string, unknown> = {
        x: op.x,
        y: op.y,
        w: op.w,
        h: op.h,
        points: op.points,
      }
      if (op.fill) opts.fill = op.fill
      if (op.line) opts.line = op.line
      if (op.gradientFill) opts.objectName = gradientObjectName(slideIndex, patches.length)
      // See the "shape" case above: must run before the patch is recorded.
      withBlockMarker(opts, op, slideIndex, opIndex)
      if (op.gradientFill) {
        patches.push({ objectName: opts.objectName as string, xml: gradientFillXml(op.gradientFill) })
      }
      slide.addShape("custGeom", opts)
      break
    }
    case "text": {
      const opts: Record<string, unknown> = {
        x: op.x,
        y: op.y,
        w: op.w,
        h: op.h,
        align: op.align,
        valign: "top",
        fontSize: op.fontSize,
        margin: 0,
      }
      if (op.fontFace) opts.fontFace = op.fontFace
      if (op.color) opts.color = op.color
      if (op.transparency != null) opts.transparency = op.transparency
      // SVG <text> 是逐行预排的单行文本——pptx 文本框的自动换行只会在
      // 字体回退/charSpacing 使字宽变化时把行内文字挤到第二行并被单行高
      // 的框裁掉（2026-07-10 全主题导出审计：runway 6 处截断的根因）。
      // 关闭换行让超宽文字横向溢出显示，与 SVG 语义一致。
      opts.wrap = false
      withBlockMarker(opts, op, slideIndex, opIndex)
      slide.addText(op.runs.map(runToProp), opts)
      break
    }
    case "image": {
      const opts: Record<string, unknown> = { x: op.x, y: op.y, w: op.w, h: op.h, data: op.data }
      if (op.sizing) opts.sizing = op.sizing
      withBlockMarker(opts, op, slideIndex, opIndex)
      slide.addImage(opts)
      break
    }
  }
}

/**
 * Apply every op to a slide, in order. Returns any gradient fill patches
 * collected along the way — pass them to `applyGradientFills` once the whole
 * presentation has been written (see that function's doc comment).
 *
 * `slideIndex` (this slide's 0-based deck position) is threaded straight
 * through to `renderOp`/`withBlockMarker` — see `renderOp`'s doc comment.
 * Each op's own 0-based position in `ops` is threaded through too, as
 * `opIndex` — `withBlockMarker`'s deterministic replacement for the
 * distinguishing role a random token used to play (defect G).
 */
export function renderOps(slide: SlideLike, ops: Op[], slideIndex?: number): GradientFillPatch[] {
  const patches: GradientFillPatch[] = []
  ops.forEach((op, opIndex) => renderOp(slide, op, patches, slideIndex, opIndex))
  return patches
}

/** A `.pptx`'s own slide part path, e.g. `ppt/slides/slide1.xml`. */
const SLIDE_PART_RE = /^ppt\/slides\/slide\d+\.xml$/

/**
 * Match a shape's own fill — the first `<a:solidFill>…</a:solidFill>` (or
 * `<a:noFill/>`, not produced here since a gradient op always sets a
 * placeholder `fill`) inside its `<p:spPr>`. It is always first: pptxgenjs
 * writes fill immediately after the shape's geometry and before its `<a:ln>`
 * (stroke), so a stroke's own `<a:solidFill>` — if any — always comes later.
 */
const SOLID_FILL_RE = /<a:solidFill>.*?<\/a:solidFill>/s

/**
 * Patch a finished `.pptx`'s slide XML, swapping each gradient shape's solid
 * placeholder fill for its real `<a:gradFill>`.
 *
 * Pre-check A (vc-task-6 report) found pptxgenjs 4.0.1 has no gradient-fill
 * API at all: `ShapeFillProps.type` is typed `'none' | 'solid'` and the
 * internal `genXmlColorSelection` has no branch for anything else, so there
 * is no hook — public or private — to ask it to emit `a:gradFill`. Patching
 * the written XML directly is the same shape of fix as the sibling
 * `pptx-animations.ts`'s `applySlideTransitions` (open the zip with JSZip,
 * rewrite parts, re-zip).
 *
 * Unlike that transitions pass, this one fails loud instead of swallowing
 * errors: a missed transition just leaves the deck a little less polished,
 * but a patch miss here would silently ship a solid placeholder where a
 * gradient was authored — a wrong visual, not a crash, and exactly the kind
 * of silent divergence this whole feature exists to prevent.
 */
export async function applyGradientFills(
  pptx: Blob | ArrayBuffer | Uint8Array,
  patches: GradientFillPatch[],
): Promise<Blob> {
  const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  if (patches.length === 0) {
    return pptx instanceof Blob ? pptx : new Blob([pptx as BlobPart], { type: PPTX_MIME })
  }

  const zip = await JSZip.loadAsync(pptx instanceof Blob ? await pptx.arrayBuffer() : pptx)
  const slidePaths = Object.keys(zip.files).filter(
    (p) => SLIDE_PART_RE.test(p) && !zip.files[p].dir,
  )

  const pending = new Map(patches.map((p) => [p.objectName, p]))
  for (const path of slidePaths) {
    let xml = await zip.files[path].async("string")
    let changed = false
    for (const [objectName, patch] of pending) {
      const anchor = xml.indexOf(`name="${objectName}"`)
      if (anchor === -1) continue // this shape lives on a different slide part

      const spStart = xml.lastIndexOf("<p:sp>", anchor)
      const spEnd = xml.indexOf("</p:sp>", anchor)
      if (spStart === -1 || spEnd === -1) {
        throw new Error(
          `svg2pptx: gradient patch target "${objectName}" is not inside a <p:sp>…</p:sp>`,
        )
      }

      const spXml = xml.slice(spStart, spEnd)
      let replaced = false
      const patched = spXml.replace(SOLID_FILL_RE, () => {
        replaced = true
        return patch.xml
      })
      if (!replaced) {
        throw new Error(
          `svg2pptx: gradient patch target "${objectName}" has no <a:solidFill> to replace`,
        )
      }

      xml = xml.slice(0, spStart) + patched + xml.slice(spEnd)
      pending.delete(objectName)
      changed = true
    }
    if (changed) zip.file(path, xml)
  }

  if (pending.size > 0) {
    throw new Error(
      `svg2pptx: gradient patch target(s) not found in any slide: ${Array.from(pending.keys()).join(", ")}`,
    )
  }

  const ab = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" })
  return new Blob([ab], { type: PPTX_MIME })
}
