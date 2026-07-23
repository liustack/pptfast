// @vitest-environment node
//
// Pathological-input coverage for `heatmap` (structure-components wave 2
// task 2) through the REAL `generatePptx` (`src/api.ts`), never a mock —
// same posture as `generate-chart-export.test.ts`'s own template. Unlike
// chart's bar/line/funnel geometry (`chart-svg.tsx`'s `MAX_CHART_GEOMETRY_PX`
// clamp), a heatmap value feeds only `valueT`'s [0,1]-clamped ratio, which
// then feeds a *color* (`cellFill`/`mixHex`) — never a coordinate or extent.
// Cell rect geometry comes solely from `x_labels.length`/`y_labels.length`
// (schema-capped at 10x10, `ir/index.ts`), so there is no analogous
// EMU-overflow trap for an extreme *value* to fall into here — the "safe by
// construction" claim `heatmap.tsx`'s own file header makes. This file
// verifies that claim empirically rather than leaving it as prose only.
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
    filename: "heatmap-export-fixture",
    theme: { id: "consulting" },
    meta: {},
    assets: { images: {} },
    slides: [
      { type: "cover", heading: "Cover" },
      { type: "content", heading: "Heatmap", components },
      { type: "ending", heading: "Thanks" },
    ],
  } as PptxIR
}

/** A real export (zip magic "PK"), not a thrown PptfastError. */
async function expectExports(components: Component[]): Promise<void> {
  const bytes = await generatePptx(makeIr(components))
  expect(bytes.length).toBeGreaterThan(10_000)
  expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])
}

function grid(rows: number, cols: number, fill: (r: number, c: number) => number) {
  return {
    type: "heatmap" as const,
    x_labels: Array.from({ length: cols }, (_, i) => `x${i}`),
    y_labels: Array.from({ length: rows }, (_, i) => `y${i}`),
    values: Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => fill(r, c))),
  }
}

describe("heatmap pathological values through the real generatePptx", () => {
  it("schema-max 10x10 grid (the largest legal shape) exports cleanly", async () => {
    await expectExports([{ ...grid(10, 10, (r, c) => r * 10 + c), show_values: true }])
  })

  it("degenerate domain — every value identical — exports cleanly (no NaN/Infinity color)", async () => {
    await expectExports([grid(4, 4, () => 7)])
  })

  it("explicit degenerate domain override (min === max) exports cleanly", async () => {
    await expectExports([{ ...grid(3, 3, (r, c) => r + c), domain: { min: 5, max: 5 } }])
  })

  it("single row (1 y_label) exports cleanly", async () => {
    await expectExports([grid(1, 5, (_r, c) => c * 10)])
  })

  it("single column (1 x_label) exports cleanly", async () => {
    await expectExports([grid(5, 1, (r) => r * 10)])
  })

  it("single 1x1 cell exports cleanly", async () => {
    await expectExports([grid(1, 1, () => 42)])
  })

  it("negative values (mixed-sign, e.g. YoY deltas) export cleanly", async () => {
    await expectExports([{ ...grid(3, 3, (r, c) => (r + c) % 2 === 0 ? -(r + c) * 10 : (r + c) * 10), show_values: true }])
  })

  it("all-negative values export cleanly", async () => {
    await expectExports([grid(3, 3, (r, c) => -1000 - r * 10 - c)])
  })

  // Values feed color, never geometry — this is the empirical confirmation
  // of that claim: an extreme magnitude only ever widens `valueT`'s ratio
  // denominator, clamped to [0,1] either way, so cell rect extents never
  // move. No MAX_CHART_GEOMETRY_PX-style clamp exists (or is needed) here.
  it("extreme-magnitude values (1e15 / -1e15) export cleanly — values feed color, not geometry", async () => {
    await expectExports([{ ...grid(3, 3, (r, c) => (r * 3 + c === 0 ? 1e15 : r * 3 + c === 8 ? -1e15 : 0)), show_values: true }])
  })

  it("an explicit domain narrower than the real data range still exports cleanly (out-of-domain values clamp, don't throw)", async () => {
    await expectExports([{ ...grid(3, 3, (r, c) => r * 100 + c), domain: { min: 0, max: 10 } }])
  })

  it("show_values with long numeric text (many decimal places) still exports cleanly (fitSvgLine truncation engages)", async () => {
    await expectExports([{ ...grid(2, 2, () => 3.14159265358979), show_values: true }])
  })

  it("over-long x_labels/y_labels truncate and still export cleanly", async () => {
    const longLabelGrid = {
      type: "heatmap" as const,
      x_labels: ["一个非常非常非常非常长的列标签名称用于测试截断行为", "b", "c"],
      y_labels: ["一个非常非常非常非常长的行标签名称用于测试截断行为", "b"],
      values: [
        [1, 2, 3],
        [4, 5, 6],
      ],
    }
    await expectExports([longLabelGrid])
  })
})
