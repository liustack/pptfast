// @vitest-environment node
//
// Pathological-input coverage for `five_forces` (structure-components wave 2
// task 4 — the same generate-chart-export.test.ts-style gap-fill as this
// file's `pest` sibling) through the REAL `generatePptx` (`src/api.ts`),
// never a mock.
//
// Same "safe by construction" geometry as `pest`: the 3x3 cross grid's panel
// rects come from `crossGeom`'s split of `box.h`/`box.w` alone — `items`'s
// length/text only ever drive the font-scale shrink pass (`five-forces.tsx`'s
// own ported defect-F fix), never a rect's own extent, so there is no
// analogous EMU-overflow trap for an extreme value (nothing here is a value
// at all). This file closes the same real gap `pest`'s sibling does — full
// real-export-chain coverage at schema extremes — plus `intensity`'s own
// 3-level enum, the one piece of this component's content space `pest`
// doesn't have an equivalent of.
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
    filename: "five-forces-export-fixture",
    theme: { id: "consulting" },
    meta: {},
    assets: { images: {} },
    slides: [
      { type: "cover", heading: "Cover" },
      { type: "content", heading: "Five Forces", components },
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

function panel(n: number, opts: { label?: string; intensity?: "low" | "medium" | "high" } = {}) {
  return {
    ...opts,
    items: Array.from({ length: n }, (_, i) => `item ${i}`),
  }
}

describe("five_forces pathological content through the real generatePptx", () => {
  it("schema-max content (5 items in every one of the 5 panels) exports cleanly", async () => {
    await expectExports([
      {
        type: "five_forces",
        rivalry: panel(5),
        new_entrants: panel(5),
        supplier_power: panel(5),
        buyer_power: panel(5),
        substitutes: panel(5),
      },
    ])
  })

  it("schema-min content (1 item in every panel) exports cleanly", async () => {
    await expectExports([
      {
        type: "five_forces",
        rivalry: panel(1),
        new_entrants: panel(1),
        supplier_power: panel(1),
        buyer_power: panel(1),
        substitutes: panel(1),
      },
    ])
  })

  it("every panel at high intensity (max dot count, every panel simultaneously) exports cleanly", async () => {
    await expectExports([
      {
        type: "five_forces",
        rivalry: panel(2, { intensity: "high" }),
        new_entrants: panel(2, { intensity: "high" }),
        supplier_power: panel(2, { intensity: "high" }),
        buyer_power: panel(2, { intensity: "high" }),
        substitutes: panel(2, { intensity: "high" }),
      },
    ])
  })

  it("mixed low/medium/high intensity across panels, plus panels omitting it entirely, exports cleanly", async () => {
    await expectExports([
      {
        type: "five_forces",
        rivalry: panel(2, { intensity: "medium" }),
        new_entrants: panel(2, { intensity: "low" }),
        supplier_power: panel(2), // no intensity at all
        buyer_power: panel(2, { intensity: "high" }),
        substitutes: panel(2),
      },
    ])
  })

  it("every panel's label overridden exports cleanly", async () => {
    await expectExports([
      {
        type: "five_forces",
        rivalry: panel(2, { label: "Industry Rivalry" }),
        new_entrants: panel(2, { label: "Threat of New Entrants" }),
        supplier_power: panel(2, { label: "Supplier Bargaining Power" }),
        buyer_power: panel(2, { label: "Buyer Bargaining Power" }),
        substitutes: panel(2, { label: "Threat of Substitutes" }),
      },
    ])
  })

  it("over-long panel labels and items truncate and still export cleanly", async () => {
    const longLabel = "一个相当长的力量名称用于测试截断行为一个相当长的力量名称"
    const longItem = "一条相当长的条目内容用于测试截断行为一条相当长的条目内容一条相当长的条目内容"
    await expectExports([
      {
        type: "five_forces",
        rivalry: { label: longLabel, items: [longItem, "b"] },
        new_entrants: panel(2),
        supplier_power: panel(2),
        buyer_power: panel(2),
        substitutes: panel(2),
      },
    ])
  })

  it("schema-max content on the narrowest curated archetype (defect-F fontScale floor) still exports cleanly", async () => {
    const bytes = await generatePptx({
      version: "4",
      filename: "five-forces-narrow-fixture",
      theme: { id: "consulting" },
      meta: {},
      assets: { images: {} },
      slides: [
        { type: "cover", heading: "Cover" },
        {
          type: "content",
          heading: "Porter's Five Forces Under A Deliberately Long Heading To Force Two Lines",
          layout: "narrow-column",
          components: [
            {
              type: "five_forces",
              rivalry: panel(5),
              new_entrants: panel(5),
              supplier_power: panel(5),
              buyer_power: panel(5),
              substitutes: panel(5),
            },
          ],
        },
        { type: "ending", heading: "Thanks" },
      ],
    } as PptxIR)
    expect(bytes.length).toBeGreaterThan(10_000)
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])
  })
})
