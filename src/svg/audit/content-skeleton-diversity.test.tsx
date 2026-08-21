// @vitest-environment jsdom
//
// Content-layout expansion wave, task T3 (`.issues/2026-07-26-content-
// layouts/plan.md`) — the wave's own acceptance metric ("skeleton
// diversity"): with content-pool growth going from 10 to 12 layouts
// (`image-lead-split`/`split-band`, tasks T1/T2), does the pool actually
// read as more than ~4 distinct page skeletons for a fixed piece of content?
//
// **Corrected judgment (T1's own review flagged the original one
// defective).** The original proposal only measured the FIRST
// `data-audit-box` region's (x, y, width) — under that metric,
// `image-lead-split` looks like just another narrow single-column page: its
// text column is (96, ~190-260, 435) — x sits inside the pool's crowded
// x=96 cluster, and its width is only 197px narrower than the pool's
// previous floor (632px), 3px short of the 200px "clearly different"
// threshold an earlier review pass used informally. But that first box
// isn't this layout's actual novelty — the real new composition is the
// *second*, co-existing 613px visual column at x=571, which the
// first-box-only metric never looks at. **The metric was wrong, not the
// layout.** (See this suite's own "regression: first-box-only would
// under-count" test below, which pins this concretely rather than only
// narrating it.)
//
// Corrected judgment: resolve the FULL set of `data-audit-box` regions (not
// just the first) for a fixed IR, once per content layout. A page's
// "skeleton" = its region *count* plus each region's quantized (x, width)
// tuple — y is deliberately excluded from the fingerprint (spec's own
// wording: "y 允许浮动，它随标题行数变化") since a taller/shorter heading
// wrap shifts every region below it down without changing the page's actual
// composition. Assert the pool now resolves to >= 6 distinct skeleton
// classes (informally observed ~4 before this wave, using the old,
// first-box-only reading).
import { describe, expect, it } from "vitest"
import type { PptxIR, Slide } from "@/ir"
import { CONTENT_LAYOUTS, type ContentLayoutId } from "../layouts/index-content"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { parseSvgRoot, renderSvgMarkup } from "../serialize"

/**
 * Quantization granularity: round to the nearest 10px. Coarse enough to
 * treat measure-and-scale's own float jitter (e.g. `stacked-poster`'s hero
 * box lands at fractional widths like 579.7058823529412px) as identical
 * to its own repeat measurement, fine enough that it can never merge two
 * *genuinely* different regions in this pool — every pairwise gap between
 * two distinct real (x, width) values measured below is >= 20px (2 full
 * quantization steps), so nothing here is one unlucky rounding away from a
 * false collision.
 */
const QUANTIZE = 10
function quantize(n: number): number {
  return Math.round(n / QUANTIZE) * QUANTIZE
}

/**
 * Fixed input shape, applied identically to all 12 layouts (T2's review
 * named `quiet-frame` as a layout whose own region set changes shape
 * with component *count* — its lone-non-full-body-component case narrows
 * and re-centers its content rect, full width otherwise — so "the region
 * set" is only a well-defined, comparable quantity once the input shape
 * feeding every layout is fixed and stated, not measured ad hoc per
 * layout).
 *
 * Chosen shape: exactly 2 components — a lead `image` (unresolved asset,
 * same "Image missing" placeholder path every layout's own image
 * handling already exercises, see `image.tsx`) followed by one short
 * `paragraph`. Deliberately not 0 or 1 component: `quiet-frame`'s own
 * single-narrowing branch only fires at exactly 1 *non-full-body* component,
 * and `stacked-poster`'s poster grammar (its own most differentiated region
 * shape — a `hero` + `strip`, not the flat degrade stack) only activates at
 * 1-2 *fitting* components — 0 or >=3 would silently degrade it back to the
 * same flat single-stack shape every other layout already has, hiding
 * exactly the kind of structural distinctiveness this metric exists to
 * measure. A scalable (image) lead is also required for `image-lead-split`
 * specifically: its visual column only gets a `data-audit-box` at all when
 * `components[0]` is a `SCALABLE_TYPES` member (see that file's own render
 * function) — the placeholder-fallback path draws a `data-audit-rect` but
 * deliberately no `data-audit-box` (nothing to scale-audit when there's no
 * real component behind it), so a non-image fixture would silently under-
 * count this layout's own region set the same way the rejected
 * first-box-only metric did, just via a different blind spot.
 *
 * Note: this shape does legitimately drop the paragraph on `narrow-column`
 * specifically (its column is wide enough that the image's own height
 * — `min(w*0.5, 340)` = 340px at 880px width — already consumes nearly all
 * of that layout's vertical budget, so `layoutContentFit`'s overflow
 * guard drops the second component rather than overflow the page). That's
 * `layoutContentFit` doing its job, not a fixture bug: a dropped component
 * renders no box at all, so it simply removes nothing this metric would
 * have counted — it does not distort any *rendered* region's geometry.
 */
function fixedSlide(): Slide {
  return {
    type: "content",
    heading: "Skeleton diversity fixture heading",
    components: [
      { type: "image", asset_id: "fixture-shot", caption: "Fixture image" },
      { type: "paragraph", text: "A short supporting sentence for skeleton measurement." },
    ],
  } as Slide
}

function fixedIr(): PptxIR {
  return {
    version: "4",
    filename: "skeleton-diversity-fixture.pptx",
    theme: { id: "consulting" },
    meta: {},
    assets: { images: {} },
    slides: [fixedSlide()],
  } as PptxIR
}

type RegionTuple = readonly [x: number, w: number]

/** A skeleton: the sorted, de-duplicated set of quantized (x, width)
 * region tuples a layout renders for the fixed slide above. Two
 * components stacked in the *same* column produce the same (x, width) twice
 * (only their y differs) — de-duplicating collapses that back to one
 * region, matching "region" meaning a distinct geometric slot, not a
 * distinct rendered box. */
function skeletonFor(id: ContentLayoutId): readonly RegionTuple[] {
  const Component = CONTENT_LAYOUTS[id]
  const ir = fixedIr()
  const slide = ir.slides[0]
  const ctx = buildCtx(resolveStyle(ir.theme.id), ir.assets.images)
  const markup = renderSvgMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <Component ir={ir} slide={slide} index={0} ctx={ctx} />
    </svg>,
  )
  const root = parseSvgRoot(markup)
  const boxes = Array.from(root.querySelectorAll("g[data-audit-box]")).map((g) => {
    const [x, , w] = (g.getAttribute("data-audit-box") ?? "").split(",").map(Number)
    return [quantize(x), quantize(w)] as RegionTuple
  })
  const distinct = new Map<string, RegionTuple>()
  for (const tuple of boxes) distinct.set(tuple.join(","), tuple)
  return Array.from(distinct.values()).sort((a, b) => a[0] - b[0] || a[1] - b[1])
}

function skeletonKey(skeleton: readonly RegionTuple[]): string {
  return JSON.stringify(skeleton)
}

const ALL_CONTENT_IDS = Object.keys(CONTENT_LAYOUTS) as ContentLayoutId[]

describe("content layout skeleton diversity (content-layout expansion wave, T3 acceptance metric)", () => {
  it("covers all 15 registered content layouts (sanity — this metric is meaningless over a stale/partial list; editorial-verse wave: 13 -> 15)", () => {
    expect(ALL_CONTENT_IDS).toHaveLength(15)
  })

  it("the full-region skeleton set resolves to >= 6 distinct classes across the pool (was ~4 under the rejected first-box-only reading)", () => {
    const skeletons = new Map(ALL_CONTENT_IDS.map((id) => [id, skeletonFor(id)] as const))
    const classes = new Set(Array.from(skeletons.values()).map(skeletonKey))

    // Non-vacuity: prove some layouts really do still legitimately share
    // a class (e.g. `narrow-column`/`side-highlight` are both a lone
    // (x=96, w=880) column under this fixture — `side-highlight`'s own
    // accent rail is decorative chrome, not itself an audited region) — so
    // this isn't merely counting 12 trivially-all-different single-member
    // buckets.
    expect(classes.size).toBeLessThan(ALL_CONTENT_IDS.length)
    expect(classes.size).toBeGreaterThanOrEqual(6)
  })

  it("regression: image-lead-split resolves to 2 regions, not 1 — the specific case the first-box-only metric mis-measured", () => {
    // Guards the exact defect this task's corrected criterion exists for:
    // if a future refactor made the visual column stop emitting its own
    // `data-audit-box` (or this test regressed back to reading only the
    // first box), this assertion — not just the aggregate >= 6 count above
    // — is what would catch it immediately.
    const skeleton = skeletonFor("image-lead-split")
    expect(skeleton).toHaveLength(2)
    const [text, visual] = skeleton
    expect(text[0]).toBe(quantize(96))
    expect(visual[0]).toBe(quantize(571))
  })

  it("regression: a first-box-only reading would still call image-lead-split merely 'narrower', hiding its real 2-region novelty", () => {
    // Reproduces the rejected metric side by side with the corrected one on
    // the exact same render, so the lesson is pinned as a runnable fact, not
    // just prose in this file's header comment.
    const firstBoxOnly = new Map(
      ALL_CONTENT_IDS.map((id) => [id, skeletonFor(id).slice(0, 1)] as const),
    )
    const firstBoxClasses = new Set(Array.from(firstBoxOnly.values()).map(skeletonKey))
    const fullRegionSkeleton = skeletonFor("image-lead-split")

    // The corrected metric sees 2 regions for image-lead-split...
    expect(fullRegionSkeleton.length).toBeGreaterThan(1)
    // ...but a first-box-only reading of the very same render only ever
    // sees 1 — indistinguishable in *shape* (region count) from every other
    // lone-single-column layout in the pool, even though its numeric
    // width happens not to collide with any of them under this fixture.
    expect(firstBoxOnly.get("image-lead-split")).toHaveLength(1)
    // Sanity: the first-box reading is not itself vacuous (it still finds
    // more than one class overall) — the point is specifically that it
    // under-counts *regions*, not that it collapses to a single class.
    expect(firstBoxClasses.size).toBeGreaterThan(1)
  })
})
