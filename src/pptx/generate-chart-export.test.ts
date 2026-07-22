// @vitest-environment node
//
// Regression coverage for the post-merge deep-acceptance review's Critical
// finding: a chart (`chart_type: "bar"` — vertical or `direction:
// "horizontal"` — or `"funnel"`) with a zero or negative data value is
// schema-valid IR (`y: z.number()` in the chart series schema carries no
// `.positive()`/`.nonnegative()` constraint — "0 incidents", "-12% YoY" are
// both legitimate business data) but `chart-svg.tsx`'s ratio-based
// bar/funnel geometry (`renderBar`/`renderBarHorizontal`/`renderFunnel`,
// e.g. `barH = (d.y / max) * plotH`) computes a zero or negative-extent
// `<rect>` with no floor of its own. That degenerate rect used to convert
// through `rectToOp` (`./svg2pptx/rect.ts`) into an `a:ext cx=0`/`cy=0` (or
// negative) shape, which the package-audit hard gate then unconditionally
// rejects (`invalid-shape-transform`) — an unrecoverable export failure
// with no workaround, not even `--draft`.
//
// Fixed at the converter layer (`rectToOp` itself — see that file's own
// "zero/negative-extent floor" unit tests), mirroring the exact fix
// path.ts's buildOp/segsToOp and line.ts's lineToOp already got for the
// same defect class in icons/callouts (generate-icon-export.test.ts, this
// file's own template).
//
// Runs the REAL generatePptx (src/api.ts) — never a mock — the same
// production entry point the reviewer's own probe called.
import { beforeAll, describe, expect, it } from "vitest"
import type { Component, PptxIR } from "@/ir"
import { generatePptx } from "@/api"
import { installNodePlatform } from "../platform/node"

beforeAll(() => {
  installNodePlatform()
})

function makeIr(components: Component[]): PptxIR {
  return {
    version: "4",
    filename: "chart-export-fixture",
    theme: { id: "consulting" },
    meta: {},
    assets: { images: {} },
    slides: [
      { type: "cover", heading: "Cover" },
      { type: "content", heading: "Body", components },
      { type: "ending", heading: "Thanks" },
    ],
  } as PptxIR
}

/** A real export (zip magic "PK"), not a thrown PptfastError — the
 *  reviewer's exact repro threw `invalid-shape-transform: ... a:ext cx=0/
 *  cy=0 ...` for every one of these pre-fix. */
async function expectExports(components: Component[]): Promise<void> {
  const bytes = await generatePptx(makeIr(components))
  expect(bytes.length).toBeGreaterThan(10_000)
  expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])
}

describe("chart zero/negative data value through the real generatePptx (deep-acceptance review Critical finding 1)", () => {
  it("vertical bar with one zero-value point exports without an invalid-shape-transform", async () => {
    await expectExports([
      {
        type: "chart",
        chart_type: "bar",
        series: [{ name: "s1", data: [{ x: "A", y: 0 }, { x: "B", y: 5 }, { x: "C", y: 10 }] }],
      },
    ])
  })

  it("vertical bar with all-zero values exports", async () => {
    await expectExports([
      { type: "chart", chart_type: "bar", series: [{ name: "s1", data: [{ x: "A", y: 0 }, { x: "B", y: 0 }] }] },
    ])
  })

  it("vertical bar with a negative value exports (e.g. '-12% YoY')", async () => {
    await expectExports([
      {
        type: "chart",
        chart_type: "bar",
        series: [{ name: "s1", data: [{ x: "YoY", y: -12 }, { x: "QoQ", y: 5 }] }],
      },
    ])
  })

  it("horizontal bar (direction: horizontal) with a zero-value point exports", async () => {
    await expectExports([
      {
        type: "chart",
        chart_type: "bar",
        direction: "horizontal",
        series: [{ name: "s1", data: [{ x: "A", y: 0 }, { x: "B", y: 5 }] }],
      },
    ])
  })

  it("horizontal bar with a negative value exports", async () => {
    await expectExports([
      {
        type: "chart",
        chart_type: "bar",
        direction: "horizontal",
        series: [{ name: "s1", data: [{ x: "YoY", y: -12 }, { x: "QoQ", y: 5 }] }],
      },
    ])
  })

  it("funnel with a zero-value stage exports", async () => {
    await expectExports([
      {
        type: "chart",
        chart_type: "funnel",
        series: [{ name: "s1", data: [{ x: "Stage 1", y: 100 }, { x: "Stage 2", y: 0 }, { x: "Stage 3", y: 10 }] }],
      },
    ])
  })

  it("funnel with all-zero values exports", async () => {
    await expectExports([
      { type: "chart", chart_type: "funnel", series: [{ name: "s1", data: [{ x: "A", y: 0 }, { x: "B", y: 0 }] }] },
    ])
  })
})

/**
 * Note-6 sweep from the acceptance report: "chart-svg.tsx's unguarded ratio
 * geometry is worth a general pass ... did not exhaustively fuzz every
 * chart_type × direction × style × multi-series-sign combination." Every
 * chart_type × pathological-value combination `src/svg/components/
 * chart-svg.tsx` actually renders (line/pie/donut/dumbbell were already
 * confirmed safe pre-fix — the review's own finding — and stay in this
 * matrix as regression/contrast coverage, not because they needed fixing).
 */
describe("chart_type × pathological-values matrix (deep-acceptance review Note 6 sweep)", () => {
  const zeroPoint = [{ x: "A", y: 0 }, { x: "B", y: 5 }, { x: "C", y: 10 }]
  const allZero = [{ x: "A", y: 0 }, { x: "B", y: 0 }, { x: "C", y: 0 }]
  const mixedSign = [{ x: "A", y: -8 }, { x: "B", y: 0 }, { x: "C", y: 12 }]

  const cases: Array<{ label: string; component: Component }> = [
    { label: "bar zero-point", component: { type: "chart", chart_type: "bar", series: [{ name: "s1", data: zeroPoint }] } },
    { label: "bar all-zero", component: { type: "chart", chart_type: "bar", series: [{ name: "s1", data: allZero }] } },
    { label: "bar mixed-sign", component: { type: "chart", chart_type: "bar", series: [{ name: "s1", data: mixedSign }] } },
    {
      label: "bar horizontal zero-point",
      component: { type: "chart", chart_type: "bar", direction: "horizontal", series: [{ name: "s1", data: zeroPoint }] },
    },
    {
      label: "bar horizontal all-zero",
      component: { type: "chart", chart_type: "bar", direction: "horizontal", series: [{ name: "s1", data: allZero }] },
    },
    {
      label: "bar horizontal mixed-sign",
      component: { type: "chart", chart_type: "bar", direction: "horizontal", series: [{ name: "s1", data: mixedSign }] },
    },
    { label: "funnel zero-point", component: { type: "chart", chart_type: "funnel", series: [{ name: "s1", data: zeroPoint }] } },
    { label: "funnel all-zero", component: { type: "chart", chart_type: "funnel", series: [{ name: "s1", data: allZero }] } },
    { label: "funnel mixed-sign", component: { type: "chart", chart_type: "funnel", series: [{ name: "s1", data: mixedSign }] } },
    {
      label: "donut (pie+style) zero-point",
      component: { type: "chart", chart_type: "pie", style: "donut", series: [{ name: "s1", data: zeroPoint }] },
    },
    {
      label: "donut all-zero",
      component: { type: "chart", chart_type: "pie", style: "donut", series: [{ name: "s1", data: allZero }] },
    },
    { label: "pie zero-point", component: { type: "chart", chart_type: "pie", series: [{ name: "s1", data: zeroPoint }] } },
    { label: "pie all-zero", component: { type: "chart", chart_type: "pie", series: [{ name: "s1", data: allZero }] } },
    { label: "line zero-point", component: { type: "chart", chart_type: "line", series: [{ name: "s1", data: zeroPoint }] } },
    { label: "line mixed-sign", component: { type: "chart", chart_type: "line", series: [{ name: "s1", data: mixedSign }] } },
    { label: "line all-zero", component: { type: "chart", chart_type: "line", series: [{ name: "s1", data: allZero }] } },
    {
      label: "dumbbell zero-point",
      component: { type: "chart", chart_type: "dumbbell", series: [{ name: "from", data: zeroPoint }, { name: "to", data: zeroPoint }] },
    },
    {
      label: "dumbbell all-zero",
      component: { type: "chart", chart_type: "dumbbell", series: [{ name: "from", data: allZero }, { name: "to", data: allZero }] },
    },
    // "dumbbell mixed-sign" (2026-07-21, was excluded here — see the
    // dedicated reproduction-case describe block at the end of this file for
    // the full root-cause writeup): degenerated through a *different*
    // converter (./text.ts's textToOp, align === "center" branch —
    // `half = Math.min(xPx, CANVAS_W_PX - xPx)` went negative once `xPx`
    // itself was off-canvas, producing a negative w), not rectToOp. Root
    // cause was dumbbell's own `vx()` mapping a data value straight to an
    // absolute x-coordinate with no lower bound, unlike bar/funnel which map
    // a ratio to a bar's *extent* from a fixed anchor. Now fixed at the
    // source (chart-svg.tsx's `renderDumbbell` extends its value domain to
    // `[min(0, ...values), max(...values, 1)]`) — included here like every
    // other already-safe combination in this matrix.
    {
      label: "dumbbell mixed-sign",
      component: { type: "chart", chart_type: "dumbbell", series: [{ name: "from", data: mixedSign }, { name: "to", data: mixedSign }] },
    },
    // pie/donut mixed-sign: swept as part of this fix's sibling-chart-type
    // check (deep-acceptance review Round 2's ask) — both confirmed safe.
    // Neither positions anything via a linear value-to-pixel axis (arc angle
    // is `acc/total`, a running fraction of the sum, not an individual
    // value's own position on a shared min/max domain), so neither was ever
    // at risk of dumbbell's defect class. Added here to close the gap and
    // lock the finding in as regression coverage, not left as a one-off
    // probe result.
    {
      label: "pie mixed-sign",
      component: { type: "chart", chart_type: "pie", series: [{ name: "s1", data: mixedSign }] },
    },
    {
      label: "donut (pie+style) mixed-sign",
      component: { type: "chart", chart_type: "pie", style: "donut", series: [{ name: "s1", data: mixedSign }] },
    },
  ]

  it.each(cases)("$label exports through the real generatePptx without an invalid-shape-transform", async ({ component }) => {
    await expectExports([component])
  })
})

/**
 * Deep-acceptance review Round 2 finding: dumbbell + mixed-sign series.
 * Reproduces the reviewer's own independent triage (`probe-dumbbell-
 * triage.mts`, 5 cases, not just the one representative case folded into
 * the matrix above) through the REAL generatePptx — every one of these
 * threw `invalid-shape-transform` pre-fix, through two sub-conditions of
 * the *same* pre-existing package-audit rule: a non-integer EMU value for
 * the connecting line/dot shapes, and a negative-or-zero `cx` for the
 * off-canvas value label's text box.
 *
 * Root cause: `renderDumbbell`'s `vx(v) = plotX + (v/max)*plotW` had no
 * lower domain bound. A *positive* value can never push `vx()` past the
 * plot's right edge (`max = Math.max(...allValues, 1)` always bounds the
 * ratio to <= 1 by construction), but a *negative* value had no such bound
 * and could push `vx()` arbitrarily far left of the canvas — confirmed not
 * limited to extreme magnitudes; case 4 below (`from: -5, to: 10`) is the
 * mildest possible negative value and fails identically to the extreme
 * cases.
 *
 * Fixed by extending the value domain to `[min(0, ...values),
 * max(...values, 1)]` (chart-svg.tsx's `renderDumbbell`) — the same
 * "provably non-degenerate" domain-bound approach gantt.tsx's `axisBounds`
 * already uses for its own `vx()`, generalized from gantt's schema-enforced
 * `end > start` invariant to an explicit `min(0, …)` / `max(…, 1)` pair of
 * floors (dumbbell's data has no such schema guarantee — an all-zero or
 * all-negative series is legal IR).
 */
describe("dumbbell mixed-sign series through the real generatePptx (deep-acceptance review Round 2 finding)", () => {
  it("large negative 'from', modest 'to' — case 1 (from=-5000, to=100)", async () => {
    await expectExports([
      {
        type: "chart",
        chart_type: "dumbbell",
        series: [{ name: "from", data: [{ x: "A", y: -5000 }] }, { name: "to", data: [{ x: "A", y: 100 }] }],
      },
    ])
  })

  it("large negative 'to', modest 'from' — case 2, symmetric (from=100, to=-5000)", async () => {
    await expectExports([
      {
        type: "chart",
        chart_type: "dumbbell",
        series: [{ name: "from", data: [{ x: "A", y: 100 }] }, { name: "to", data: [{ x: "A", y: -5000 }] }],
      },
    ])
  })

  it("extreme magnitude asymmetry, both signs — case 3 (from=-50000, to=3)", async () => {
    await expectExports([
      {
        type: "chart",
        chart_type: "dumbbell",
        series: [{ name: "from", data: [{ x: "A", y: -50000 }] }, { name: "to", data: [{ x: "B", y: 3 }] }],
      },
    ])
  })

  it("mild negative, not just extreme values — case 4 (from=-5, to=10)", async () => {
    await expectExports([
      {
        type: "chart",
        chart_type: "dumbbell",
        series: [{ name: "from", data: [{ x: "A", y: -5 }] }, { name: "to", data: [{ x: "A", y: 10 }] }],
      },
    ])
  })

  it("multi-row, one extreme row mixed with normal rows — case 5", async () => {
    await expectExports([
      {
        type: "chart",
        chart_type: "dumbbell",
        series: [
          { name: "from", data: [{ x: "A", y: 10 }, { x: "B", y: -9000 }, { x: "C", y: 5 }] },
          { name: "to", data: [{ x: "A", y: 20 }, { x: "B", y: 50 }, { x: "C", y: 8 }] },
        ],
      },
    ])
  })
})

/**
 * Deep-acceptance review Round 3 finding (6th defect, now fixed): bar/
 * bar-horizontal/line/funnel at extreme mixed-magnitude ratio.
 *
 * Root cause: `renderBar`/`renderBarHorizontal`/`renderLine`/`renderFunnel`
 * (`chart-svg.tsx`) all compute a bar/point's pixel extent or position as a
 * bare `(d.y / max) * boxDimension` ratio with no ceiling. A value whose
 * magnitude is tens-to-thousands of times its series' own max (legal IR —
 * `y: z.number()` has no magnitude constraint) scales that ratio without
 * bound, pushing the resulting pixel value far enough off-canvas that
 * `svg2pptx`'s `pxToIn()` conversion crosses pptxgenjs's own undocumented
 * `getSmartParseNumber()` heuristic (`node_modules/pptxgenjs`: `size >= 100`
 * ⇒ "this is already EMU, not inches" ⇒ returned completely unconverted and
 * unrounded — 100in * 96px/in = 9600px). Past that line, pptxgenjs writes
 * the raw, un-multiplied-by-914400, un-rounded inches float straight into
 * `a:off`/`a:ext`, producing exactly the "too small to be real EMU, too
 * large to be real inches" fractional value the package-audit gate's
 * invalid-shape-transform rule then rejects. Confirmed this reproduces
 * identically for all-negative (no zero-crossing) data at the same
 * magnitude — a magnitude/ratio defect, not really about sign-mixing,
 * matching the deep-acceptance review's own disambiguation from the
 * dumbbell domain-bound defect class. Also confirmed present in `funnel`
 * (same `(d.y/max)*w` ratio pattern renderFunnel shares with the other
 * three) even though the review's own probe hadn't isolated it — the
 * review's per-chart-type sweep used a two-series construction that
 * accidentally exercised a different (single-point, max=1) shape for
 * funnel/bar-horizontal/line's per-series-max path, masking the family
 * membership; a single-series/multi-point construction (this suite's own
 * `mixedSign` convention) reproduces the identical mechanism in all four.
 *
 * Fixed at the renderer (`chart-svg.tsx`): each of the four ratio
 * computations (`renderBar`'s `barH`, `renderBarHorizontal`'s `barW`,
 * `renderLine`'s per-point `y`, `renderFunnel`'s `barW`) is now clamped to
 * `±MAX_CHART_GEOMETRY_PX` (4800px / 50in) before it's used for a rect
 * extent or a position — half of pptxgenjs's 9600px/100in danger line, wide
 * margin for every other offset (label padding, ascent adjustment, gridline
 * pad) this pipeline adds on top. This is a ceiling, not the dumbbell fix's
 * domain rescale: dumbbell's `vx()` maps a value straight to an absolute
 * x-coordinate with no baseline, so rescaling the whole domain was the only
 * way to keep it on-canvas at every magnitude. Bar/line/funnel instead
 * scale an *extent* from a fixed anchor (a zero baseline / plot edge) —
 * realistic negative values already extend past the plot box today (a
 * pre-existing, untouched-by-this-fix cosmetic property, e.g. the existing
 * "-12% YoY" test above), so rescaling the domain would visibly change
 * every negative-value bar chart's geometry, not just the pathological
 * ones. A ceiling changes nothing for any ratio below it (confirmed clean
 * realistic-magnitude cases — this file's own `mixedSign`, and
 * `-800/1200`, `-3000/1200` — sit at ratios under 3, nowhere near the
 * clamp) and only engages once the math would otherwise blow past
 * pptxgenjs's own conversion threshold.
 */
describe("bar/bar-horizontal/line/funnel extreme mixed-magnitude ratio through the real generatePptx (deep-acceptance review Round 3 finding, 6th defect)", () => {
  const extreme = [
    { x: "A", y: -9000 },
    { x: "B", y: 100 },
  ]
  // Binary-searched by the reviewer for `bar`: clean through -4000/100
  // (40x), fails starting at -4500/100 (45x) — kept here as the exact
  // repro at both sides of that boundary, plus a magnitude sweep well past
  // it (100x/1000x/1e9) per this task's own brief.
  const ratios: Array<{ label: string; data: { x: string; y: number }[] }> = [
    { label: "-9000/100", data: extreme },
    { label: "-4500/100 (45x, reviewer's exact boundary)", data: [{ x: "A", y: -4500 }, { x: "B", y: 100 }] },
    { label: "100x", data: [{ x: "A", y: -10000 }, { x: "B", y: 100 }] },
    { label: "1000x", data: [{ x: "A", y: -100000 }, { x: "B", y: 100 }] },
    { label: "1e9", data: [{ x: "A", y: -1e9 }, { x: "B", y: 100 }] },
  ]
  const chartTypes: Array<{ label: string; chart_type: "bar" | "line" | "funnel"; direction?: "horizontal" }> = [
    { label: "bar", chart_type: "bar" },
    { label: "bar-horizontal", chart_type: "bar", direction: "horizontal" },
    { label: "line", chart_type: "line" },
    { label: "funnel", chart_type: "funnel" },
  ]
  for (const { label: ctLabel, chart_type, direction } of chartTypes) {
    for (const { label: rLabel, data } of ratios) {
      it(`${ctLabel} ${rLabel} exports without an invalid-shape-transform`, async () => {
        const component: Component = { type: "chart", chart_type, series: [{ name: "s1", data }] } as Component
        if (direction) (component as { direction?: string }).direction = direction
        await expectExports([component])
      })
    }
  }

  // 40x itself (the reviewer's own "still clean" boundary) is deep into
  // already-pathological territory (a 40x value spread on one shared linear
  // axis) — not re-pinned here as a byte-inertness guard; see
  // chart-svg.test.tsx's own unit tests for the renderer-level geometry
  // bound instead, and this describe block's own doc comment for why
  // realistic-magnitude content (confirmed elsewhere in this file) is the
  // actual byte-inertness contract.
  it("realistic mixed-sign magnitude (this file's own mixedSign fixture) is unaffected — regression guard", async () => {
    await expectExports([
      { type: "chart", chart_type: "bar", series: [{ name: "s1", data: [{ x: "A", y: -8 }, { x: "B", y: 0 }, { x: "C", y: 12 }] }] },
    ])
  })
})
