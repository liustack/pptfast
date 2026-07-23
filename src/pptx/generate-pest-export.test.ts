// @vitest-environment node
//
// Pathological-input coverage for `pest` (structure-components wave 2 task
// 4 — folding the wave's last two components into generate-chart-export.
// test.ts's own template, the gap flagged by that task's plan item 4) through
// the REAL `generatePptx` (`src/api.ts`), never a mock.
//
// Unlike chart/heatmap/sankey, `pest`'s panel geometry is engine-derived
// from the 2x2 grid ratio alone (`pest.tsx`'s `crossGeom`-equivalent split of
// `box.h`/`box.w`) — never from `items.length` or item text, which only ever
// feed the font-scale shrink pass, not a rect's own extent. There is no
// analogous EMU-overflow/degenerate-rect trap here for an extreme *value* to
// fall into (nothing here is a value at all): this file exists to close a
// different, real gap instead — nothing previously pushed `pest` through the
// full real export chain (svg2pptx's rect/text-box conversion, the package-
// audit hard gate) at its schema extremes — `pest.test.tsx` only ever
// exercises `renderSvgMarkup`+`assertSubset`, and the e2e structure-
// components leg uses one modest, representative fixture, not schema-max.
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
    filename: "pest-export-fixture",
    theme: { id: "consulting" },
    meta: {},
    assets: { images: {} },
    slides: [
      { type: "cover", heading: "Cover" },
      { type: "content", heading: "PEST", components },
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

function quadrant(n: number, title?: string) {
  return {
    ...(title ? { title } : {}),
    items: Array.from({ length: n }, (_, i) => `item ${i}`),
  }
}

describe("pest pathological content through the real generatePptx", () => {
  it("schema-max content (5 items in every one of the 4 quadrants) exports cleanly", async () => {
    await expectExports([
      { type: "pest", political: quadrant(5), economic: quadrant(5), social: quadrant(5), technological: quadrant(5) },
    ])
  })

  it("schema-min content (1 item in every quadrant) exports cleanly", async () => {
    await expectExports([
      { type: "pest", political: quadrant(1), economic: quadrant(1), social: quadrant(1), technological: quadrant(1) },
    ])
  })

  it("every quadrant's title overridden exports cleanly", async () => {
    await expectExports([
      {
        type: "pest",
        political: quadrant(2, "Regulation"),
        economic: quadrant(2, "Macro Economy"),
        social: quadrant(2, "Demographics"),
        technological: quadrant(2, "Innovation"),
      },
    ])
  })

  it("over-long quadrant titles and items truncate and still export cleanly", async () => {
    const longTitle = "一个相当长的象限标题用于测试截断行为一个相当长的象限标题"
    const longItem = "一条相当长的条目内容用于测试截断行为一条相当长的条目内容一条相当长的条目内容"
    await expectExports([
      {
        type: "pest",
        political: { title: longTitle, items: [longItem, "b"] },
        economic: quadrant(2),
        social: quadrant(2),
        technological: quadrant(2),
      },
    ])
  })

  it("schema-max content on the narrowest curated archetype (defect-F fontScale floor) still exports cleanly", async () => {
    const bytes = await generatePptx({
      version: "4",
      filename: "pest-narrow-fixture",
      theme: { id: "consulting" },
      meta: {},
      assets: { images: {} },
      slides: [
        { type: "cover", heading: "Cover" },
        {
          type: "content",
          heading: "PEST Analysis Under A Deliberately Long Heading To Force Two Lines",
          layout: "narrow-column",
          components: [
            { type: "pest", political: quadrant(5), economic: quadrant(5), social: quadrant(5), technological: quadrant(5) },
          ],
        },
        { type: "ending", heading: "Thanks" },
      ],
    } as PptxIR)
    expect(bytes.length).toBeGreaterThan(10_000)
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])
  })
})
