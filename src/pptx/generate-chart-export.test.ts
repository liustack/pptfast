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

// Sibling sweep beyond the matrix above (this fix's own verification, not a
// pre-existing test): mixed-sign values at REALISTIC magnitude (this file's
// own `mixedSign` fixture, and even a 4-figure mixed-sign value) export
// cleanly for every chart_type. But sufficiently large mixed-sign values —
// roughly |value| >= ~4000, exact threshold depends on the specific ratio,
// e.g. `{ y: -9000 }` alongside `{ y: 100 }` — trip `invalid-shape-
// transform` for bar/bar-horizontal/line too, via a THIRD, distinct
// mechanism: a fractional EMU value (`a:xfrm ext@cy="112.66666666666667" is
// not a finite integer`) that some conversion step never rounds to an
// integer. Confirmed this is a magnitude/floating-point-precision defect,
// not the same "unbounded value-to-position domain" class as dumbbell's:
// it reproduces identically for all-negative (no zero-crossing) data at the
// same magnitude, and does NOT reproduce for realistic-magnitude mixed-sign
// data (this suite's own fixtures). Pre-existing, orthogonal to this fix's
// diff, and out of this fix's scope — left as a follow-up, not fixed here,
// not added to the matrix above (it would be a permanently-red case).
