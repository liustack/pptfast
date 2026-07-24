import type { PptxIR } from "@/ir"
import { renderSlideSvg } from "../../api"
import { CANVAS_H_PX, CANVAS_W_PX } from "../../constants"
import { rasterizeSvgInBrowser } from "../../platform/browser"
import { getPlatform, type RasterizedImage } from "../../platform/registry"
import {
  __collectImageBackedTextRuns,
  blendOver,
  contrastRatio,
  type AuditFinding,
  type ImageBackedTextRun,
} from "./deck-audit"

/**
 * Optional pixel-level contrast audit (audit-v2 phase B, spec §4.3) — the
 * one pixel blind spot the deterministic SVG audit can't see: text painted
 * directly over a bare or too-faintly-scrimmed `<image>`, where
 * `deck-audit.ts`'s own SVG-color walk correctly gives up rather than guess
 * (`ImageBackedTextRun`, `__collectImageBackedTextRuns`). Never imported by
 * `deck-audit.ts` at the top level — `auditDeck`'s `pixels: true` branch
 * reaches this module through a lazy `import("./pixel-audit")` instead
 * (that function's own doc comment explains why: this file statically
 * depends on `deck-audit.ts` for its shared primitives, so a *static*
 * import the other way would form a module cycle; nothing here needs to be
 * loaded at all for the far more common `pixels` left unset case).
 *
 * Flow per spec §4.3, steps 2-6:
 * 1. `__collectImageBackedTextRuns` — reuse the exact same background-
 *    resolution walk the deterministic audit already ran, just reading its
 *    "could not resolve" runs instead of discarding them. A page with none
 *    skips rasterization entirely (no rasterizer call, no risk of that
 *    page's own remote-asset guard ever firing) — real cost only where
 *    there is real work to do.
 * 2. `stripTextNodes` — the "去文字克隆" clone.
 * 3. `rasterizeSvg(stripped, 1280, 720)` — platform primitive (Sharp in
 *    Node, native canvas in a browser — see `resolveRasterizer`).
 * 4/5. `worstCaseSample` — grid-sample each run's estimated box against the
 *    rasterized pixels, tracking the least-favorable (lowest-ratio) point.
 * 6. Only a sample below `PIXEL_HARD_FINDING_MAX_RATIO` becomes a finding —
 *    spec §4.3's own anti-false-positive gate, see that constant's doc
 *    comment.
 */

const PIXEL_CANVAS_W = CANVAS_W_PX
const PIXEL_CANVAS_H = CANVAS_H_PX

/**
 * Below this, a pixel-sampled contrast finding is emitted regardless of the
 * real WCAG target (`ImageBackedTextRun.required`) — spec §4.3's own "为了
 * 控制误报，首版只有低于 1.5:1 才进入 hard finding" gate. Pixel sampling
 * carries antialiasing/rasterizer noise the SVG-only walk never has to deal
 * with (spec §11.10's determinism footnote: no cross-platform byte
 * guarantee for this layer) — `node-rasterize.test.ts`'s own transparency
 * probe found up to ~1/255-per-channel sequential-blend rounding drift,
 * nowhere near enough to move a real ratio across this floor. Deliberately
 * far below either real WCAG floor (3/4.5) so only a genuinely broken
 * pairing fires, not a borderline-but-fine one.
 */
const PIXEL_HARD_FINDING_MAX_RATIO = 1.5

/**
 * Strip every `<text>...</text>` (and self-closing `<text/>`) element from
 * SVG markup — spec §4.3 step 2's "去文字克隆" (clone with text removed). A
 * plain string replace, not a DOM parse/remove/reserialize round-trip:
 * removing an element has zero effect on sibling/ancestor geometry in SVG
 * (no reflow, unlike HTML), so a round-trip would only add risk — a
 * serializer (linkedom in Node) producing markup that doesn't byte-match
 * what a real browser's `XMLSerializer` would, for zero benefit. Sound
 * under two preconditions this renderer's own architecture already
 * guarantees: `renderToStaticMarkup` (React) HTML/XML-escapes every text
 * *node*, so a literal `</text>` substring appearing in `markup` can only
 * ever be a real closing tag, never escaped slide content; and `<text>` is
 * never nested inside another `<text>` anywhere in `src/svg` (verified
 * across every emitter while building this task).
 */
const TEXT_ELEMENT_RE = /<text\b[^>]*\/>|<text\b[^>]*>[\s\S]*?<\/text>/g

export function stripTextNodes(markup: string): string {
  return markup.replace(TEXT_ELEMENT_RE, "")
}

function rgbToHex(r: number, g: number, b: number): string {
  // Rounds first: callers now include averaged (non-integer) channel values
  // (`averageWindow`'s own doc comment) alongside the original raw-integer
  // ones — `Math.round` is a no-op for the latter, so this stays byte-for-
  // byte compatible with every pre-existing call shape.
  const toHex = (v: number) => Math.round(v).toString(16).padStart(2, "0")
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

/**
 * Ascent/descent as a fraction of `fontSize`, defining the vertical band
 * `worstCaseSample` grids over — no real font metrics are available at
 * audit time (this renderer never embeds/queries a font file), so both are
 * the same kind of declared-size-relative heuristic `deck-audit.ts`'s own
 * `TEXT_DESCENT_RATIO` (0.25, used for v-overflow/derived-box-height) is —
 * `SAMPLE_DESCENT_RATIO` mirrors it exactly for consistency between the two
 * auditors' notion of "how far below the baseline a glyph's ink extends".
 * `SAMPLE_ASCENT_RATIO` (0.75) is this task's own addition — no existing
 * constant to mirror since nothing before this needed a text run's *top*
 * edge — a standard approximation for common UI sans-serif cap-height/
 * ascender proportion.
 */
const SAMPLE_ASCENT_RATIO = 0.75
const SAMPLE_DESCENT_RATIO = 0.25

/**
 * Minimum contiguous low-contrast patch size (px, both axes, at the
 * 1280×720 rasterization scale) the sampling design below guarantees never
 * to miss — "glyph scale": at or below the narrowest highlight/shadow
 * sliver a single character can plausibly introduce (the deep-acceptance
 * review's own demonstrated miss used a 24px-wide patch, comfortably above
 * this floor with margin to spare). Anchors both `SAMPLE_STRIDE_PX`
 * (coverage) and the `SAMPLE_STRIDE_PX` vs `AGGREGATION_HALF_PX` margin
 * (noise robustness) — see `worstCaseSample`'s own doc comment for the
 * covering argument these three constants together satisfy.
 */
const MIN_GUARANTEED_PATCH_PX = 10

/**
 * Sample-center spacing (px), both axes — half of `MIN_GUARANTEED_PATCH_PX`,
 * computed rather than duplicated as a literal so the two constants can
 * never drift apart. The standard "sample at <= half the feature size"
 * covering rule. Replaces
 * the old fixed 5×3-point grid (`SAMPLE_COLS`/`SAMPLE_ROWS`), whose own
 * justifying comment ("15 points is already enough...") the deep-acceptance
 * review falsified with a hand-verified repro: a real 1.03:1 contrast patch
 * sitting 35px from the nearest sample column (columns were 70px apart at
 * ImageCoverPage's real org-line scale) produced zero findings, yet the
 * identical patch was caught the moment it landed on a column — pure
 * alignment luck, not a real "worst-case band" guarantee. A dense,
 * position-independent stride closes that gap entirely (see the coverage
 * proof below) instead of shrinking it.
 */
const SAMPLE_STRIDE_PX = MIN_GUARANTEED_PATCH_PX / 2

/**
 * Half-width (px) of the small square window averaged at each sample
 * center before the worst-case comparison — the noise-robustness half of
 * this design. A lone single-pixel outlier (rasterizer antialiasing noise
 * under a glyph edge, photo grain) is diluted to at most 1/9 of a 3×3
 * window's mean, never enough on its own to pull a genuinely-safe
 * surrounding patch's averaged ratio under the 1.5 hard-finding floor (this
 * file's own test: a single near-black (8) pixel inside an otherwise-232
 * 3×3 window averages to ~207.5, nowhere near dark enough to fail near-
 * black text). Small enough — window width 3, well under `SAMPLE_STRIDE_PX
 * × 2 = 10` — that it cannot itself straddle a genuine
 * `MIN_GUARANTEED_PATCH_PX`-wide bad patch and a safe neighbor closely
 * enough to dilute a real defect back above the floor (this file's own
 * test: a real 12px-wide dark patch at the same spot the noise test uses
 * still produces a finding).
 */
const AGGREGATION_HALF_PX = 1

interface WorstCaseSample {
  ratio: number
  background: string
}

/**
 * Dense sample-center positions from `lo` to `hi` inclusive, `SAMPLE_STRIDE_PX`
 * apart. Always includes both endpoints, even when the span isn't an exact
 * stride multiple (the last gap can be shorter than the stride, never
 * longer) — a run's own edges are never under-sampled relative to its
 * interior. `[lo]` when the span has collapsed to (or below) a point, same
 * degenerate-input guard the old fixed-fraction grid had.
 */
function samplePositions(lo: number, hi: number): number[] {
  if (hi <= lo) return [lo]
  const positions: number[] = []
  for (let v = lo; v < hi; v += SAMPLE_STRIDE_PX) positions.push(v)
  positions.push(hi)
  return positions
}

/**
 * Mean RGB of the `(2*AGGREGATION_HALF_PX+1)²` pixel block centered at
 * `(cx, cy)` (rounded to the nearest pixel) — the noise-robustness
 * aggregation step, see `AGGREGATION_HALF_PX`'s own doc comment. Skips any
 * pixel that's off-canvas or below full alpha, same indeterminate rule the
 * original single-point design used; a window with at least one usable
 * pixel still contributes its partial average rather than being discarded
 * outright, maximizing real coverage near a run's own box edges. Returns
 * `null` only when the window contained zero usable pixels.
 */
function averageWindow(image: RasterizedImage, cx: number, cy: number): { r: number; g: number; b: number } | null {
  const x0 = Math.round(cx)
  const y0 = Math.round(cy)
  let sumR = 0
  let sumG = 0
  let sumB = 0
  let count = 0
  for (let dy = -AGGREGATION_HALF_PX; dy <= AGGREGATION_HALF_PX; dy++) {
    const y = y0 + dy
    if (y < 0 || y >= image.height) continue
    for (let dx = -AGGREGATION_HALF_PX; dx <= AGGREGATION_HALF_PX; dx++) {
      const x = x0 + dx
      if (x < 0 || x >= image.width) continue
      const i = (y * image.width + x) * 4
      const alpha = image.data[i + 3]!
      if (alpha < 255) continue
      sumR += image.data[i]!
      sumG += image.data[i + 1]!
      sumB += image.data[i + 2]!
      count++
    }
  }
  if (count === 0) return null
  return { r: sumR / count, g: sumG / count, b: sumB / count }
}

/**
 * Grid-sample `run`'s estimated box against `image` at a dense,
 * deterministic stride (`SAMPLE_STRIDE_PX`) — each sample point itself a
 * small-window average (`averageWindow`/`AGGREGATION_HALF_PX`) rather than
 * one raw pixel — tracking the least-favorable (lowest) contrast ratio
 * found overall: spec §4.3 step 6's "WCAG 最不利带" (worst-case band).
 *
 * **Coverage guarantee:** any axis-aligned contiguous low-contrast patch at
 * least `MIN_GUARANTEED_PATCH_PX` (10px) wide *and* tall is always fully
 * covered by at least one sample's aggregation window, regardless of the
 * patch's position relative to the grid — no alignment/phase assumption,
 * unlike the fixed grid this replaces. Proof, one axis at a time: sample
 * centers sit at a fixed stride S=5px; a window centered at `c` is fully
 * inside a patch spanning `[a, a+10]` exactly when
 * `c ∈ [a+1, a+9]` (window half-width 1px each side) — an interval of
 * length 8 >= S, so by the covering property of a grid spaced S apart (any
 * interval of length >= S must contain a grid point, since consecutive
 * centers are only S apart), that interval always contains at least one
 * sample center. The same argument applies independently on the
 * perpendicular axis, so a 2D patch of that minimum size is always hit on
 * both axes at once. (The deep-acceptance review's demonstrated miss used a
 * 24px patch — comfortably inside this guarantee with margin to spare.)
 *
 * **Noise robustness:** see `AGGREGATION_HALF_PX`'s own doc comment — the
 * same small window that provides the guarantee above also means a single
 * noisy pixel can't flip a genuinely-safe patch into a false finding.
 *
 * Returns `null` when *no* sample window anywhere yielded any usable pixel
 * at all (every window skipped, or the run's box fell entirely outside the
 * rasterized canvas) — the caller treats that as "nothing proven either
 * way", not a finding.
 */
function worstCaseSample(run: ImageBackedTextRun, image: RasterizedImage): WorstCaseSample | null {
  const top = run.baseline - run.fontSize * SAMPLE_ASCENT_RATIO
  const bottom = run.baseline + run.fontSize * SAMPLE_DESCENT_RATIO
  let worst: WorstCaseSample | null = null

  const ys = samplePositions(top, bottom)
  const xs = samplePositions(run.left, run.right)

  for (const y of ys) {
    for (const x of xs) {
      const avg = averageWindow(image, x, y)
      if (!avg) continue

      const bgHex = rgbToHex(avg.r, avg.g, avg.b)
      const effective = blendOver(run.fill, bgHex, run.alpha)
      const ratio = contrastRatio(effective, bgHex)
      if (!worst || ratio < worst.ratio) worst = { ratio, background: bgHex }
    }
  }
  return worst
}

export interface PixelContrastIssue {
  text: string
  fill: string
  /** The small-window-averaged RGB (hex) at the worst-case sample center —
   *  a rasterized-and-aggregated sample, never a resolved SVG paint (see
   *  `averageWindow`). */
  background: string
  ratio: number
  required: number
  fontSize: number
}

function pixelContrastMessage(issue: PixelContrastIssue): string {
  return (
    `text "${issue.text}" has a pixel-sampled contrast ratio of ${issue.ratio.toFixed(2)}:1 against its image background ` +
    `(sampled ${issue.background}, target ${issue.required}:1) — this text sits directly on an image with no resolvable ` +
    `solid backing color; reposition it, add an opaque-enough scrim behind it, or recolor the text`
  )
}

type Rasterizer = (svgMarkup: string, width: number, height: number) => Promise<RasterizedImage>

/**
 * `getPlatform().rasterizeSvg` (Sharp once `installNodePlatform()` ran) or
 * the browser default — the exact same `?? fallback` shape `deck-audit.ts`'s
 * `parseSvg` already uses for `domParser`. Never throws itself: an
 * environment with neither capability surfaces through
 * `rasterizeSvgInBrowser`'s own curated "rasterizeSvg unavailable" error the
 * first time the returned function is actually called (its `Image`/canvas
 * capability guards — see `browser.ts`), which is the explicit-failure
 * contract spec §11.7's "契约层" asks for either way.
 */
function resolveRasterizer(): Rasterizer {
  return getPlatform().rasterizeSvg ?? rasterizeSvgInBrowser
}

async function pixelFindingsForPage(
  markup: string,
  page: number,
  slideId: string | undefined,
  rasterize: Rasterizer,
): Promise<AuditFinding[]> {
  const runs = __collectImageBackedTextRuns(markup)
  if (runs.length === 0) return []

  const stripped = stripTextNodes(markup)
  const image = await rasterize(stripped, PIXEL_CANVAS_W, PIXEL_CANVAS_H)

  const findings: AuditFinding[] = []
  for (const run of runs) {
    const sampled = worstCaseSample(run, image)
    if (!sampled) continue
    if (sampled.ratio < PIXEL_HARD_FINDING_MAX_RATIO) {
      const issue: PixelContrastIssue = {
        text: run.text,
        fill: run.fill,
        background: sampled.background,
        ratio: sampled.ratio,
        required: run.required,
        fontSize: run.fontSize,
      }
      findings.push({
        page,
        ...(slideId !== undefined ? { slideId } : {}),
        code: "low-contrast",
        message: pixelContrastMessage(issue),
        // `source: "pixels"` distinguishes this from an SVG-color-resolved
        // low-contrast finding's own `detail` shape (`ContrastIssue`,
        // `deck-audit.ts`) — same `code`, since both are the same category
        // of defect (text fails contrast against its real background), just
        // measured through a different, more reliable source for that
        // background's color.
        detail: { ...issue, source: "pixels" },
      })
    }
  }
  return findings
}

/**
 * Test-only re-export (`__`-prefixed, same "SDK-internal, not part of any
 * public barrel" convention `deck-audit.ts`'s own `__collectBgRegions`/
 * `__pathBoundingBox` establish): lets `pixel-audit.test.ts` exercise the
 * sampling-grid + `PIXEL_HARD_FINDING_MAX_RATIO` threshold logic directly,
 * with a hand-crafted `rasterize` function returning exact, controlled
 * pixel data — real component geometry (`image-pages.tsx`'s `DarkScrim`, in
 * particular) turned out unable to organically produce a sub-1.5 ratio for
 * *any* photo brightness at the org-line's single-scrim-layer position
 * (confirmed empirically while building this task's own test suite: even a
 * pure-white source image only reaches ~1.83), which is the calibration
 * working as designed (spec §4.3's own "control false positives" gate) but
 * makes the threshold-crossing branch unreachable through real IR/archetype
 * fixtures alone.
 */
export const __pixelFindingsForPage = pixelFindingsForPage

/**
 * The pixel-audit pass over an already-valid deck — `auditDeck(ir, {pixels:
 * true})`'s own async branch (`deck-audit.ts`). Independently walks
 * `ir.slides` (skipping placeholders the same way `runDeterministicAudit`
 * does) rather than reusing that function's own loop, so this module has no
 * static dependency back on it beyond the few named imports at the top of
 * this file — `renderSlideSvg` is pure and synchronous, so re-rendering
 * each non-placeholder slide a second time costs a little CPU, never
 * correctness (spec's own "no second renderer" non-goal is about a
 * *different* rendering path, not calling the one true renderer twice).
 *
 * Sequential, not `Promise.all` — deliberately bounds rasterization
 * concurrency to 1 (each Sharp call is real CPU-bound work) and makes the
 * page-order-stable output an obvious property of the code rather than an
 * incidental one `Promise.all`'s array-order guarantee happens to provide.
 *
 * A rasterization failure on any one page (missing platform capability, a
 * remote asset reference, a tainted canvas) propagates out of this function
 * entirely, aborting the whole pixel pass rather than silently skipping
 * just that page — spec §11.7's "契约层": a requested-but-failed pixel audit
 * is an explicit failure, never a partial "clean".
 */
export async function runPixelContrastAudit(ir: PptxIR): Promise<AuditFinding[]> {
  const rasterize = resolveRasterizer()
  const findings: AuditFinding[] = []
  for (let i = 0; i < ir.slides.length; i++) {
    const slide = ir.slides[i]!
    if (slide.placeholder) continue
    const page = i + 1
    const slideId = slide.id
    const markup = renderSlideSvg(ir, i)
    findings.push(...(await pixelFindingsForPage(markup, page, slideId, rasterize)))
  }
  return findings
}
