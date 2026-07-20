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
    // "dumbbell mixed-sign" deliberately excluded: it degenerates through a
    // *different* converter (./text.ts's textToOp, align === "center"
    // branch — `half = Math.min(xPx, CANVAS_W_PX - xPx)` goes negative once
    // `xPx` itself is off-canvas, producing a negative w), not rectToOp.
    // Root cause is dumbbell's own `vx()` mapping a data value straight to
    // an absolute x-coordinate with no clamp, unlike bar/funnel which map a
    // ratio to a bar's *extent* from a fixed anchor — a distinct defect,
    // found by this sweep but out of this fix's scope (rectToOp only).
    // Left as a follow-up; not fixed here.
  ]

  it.each(cases)("$label exports through the real generatePptx without an invalid-shape-transform", async ({ component }) => {
    await expectExports([component])
  })
})
