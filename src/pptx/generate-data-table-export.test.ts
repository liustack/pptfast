// @vitest-environment node
//
// Pathological-input coverage for `data_table` (R1 evidence wave, Task T3 —
// 33rd component, first through the wave-2 domain-file flow) through the
// REAL `generatePptx`/`generatePptxBlob` (`src/api.ts`), never a mock — same
// posture as `generate-heatmap-export.test.ts`'s own template. Cell content
// feeds only text measurement/fitting (`fitSvgLine`) and a bounded row-tint
// color blend (`mixHex`, matrix.tsx's own fractions) — never a coordinate or
// extent of its own the way, say, chart's category count does — so there is
// no analogous EMU-overflow trap for extreme *content* to fall into; this
// file verifies that empirically rather than leaving it as prose only.
import { beforeAll, describe, expect, it } from "vitest"
import JSZip from "jszip"
import type { Component, PptxIR } from "@/ir"
import { generatePptx } from "@/api"
import { generatePptxBlob } from "./generate"
import { installNodePlatform } from "../platform/node"

beforeAll(() => {
  installNodePlatform()
})

function makeIr(components: Component[]): PptxIR {
  return {
    version: "4",
    filename: "data-table-export-fixture",
    theme: { id: "consulting" },
    meta: {},
    assets: { images: {} },
    slides: [
      { type: "cover", heading: "Cover" },
      { type: "content", heading: "Data Table", components },
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

function table(
  cols: number,
  rows: number,
  cell: (r: number, c: number) => string | number,
  overrides: Partial<{ source: string; emphasisAt: (r: number) => "highlight" | "total" | undefined }> = {},
) {
  const columns = Array.from({ length: cols }, (_, i) => ({ key: `c${i}`, label: `Col ${i}` }))
  return {
    type: "data_table" as const,
    columns,
    rows: Array.from({ length: rows }, (_, r) => ({
      cells: Object.fromEntries(columns.map((c, i) => [c.key, cell(r, i)])),
      ...(overrides.emphasisAt?.(r) ? { emphasis: overrides.emphasisAt(r) } : {}),
    })),
    ...(overrides.source ? { source: overrides.source } : {}),
  }
}

describe("data_table pathological content through the real generatePptx", () => {
  it("the minimum legal shape (2 columns, 1 row) exports cleanly", async () => {
    await expectExports([table(2, 1, (r, c) => `r${r}c${c}`)])
  })

  it("schema-max shape (8 columns, 12 rows — the largest legal shape) exports cleanly", async () => {
    await expectExports([table(8, 12, (r, c) => `r${r}c${c}`)])
  })

  it("an emphasis mix (highlight + total rows) exports cleanly", async () => {
    await expectExports([
      table(4, 6, (r, c) => `r${r}c${c}`, {
        emphasisAt: (r) => (r === 5 ? "total" : r % 2 === 0 ? "highlight" : undefined),
      }),
    ])
  })

  it("a source footnote exports cleanly", async () => {
    await expectExports([table(3, 2, (r, c) => `r${r}c${c}`, { source: "Internal finance system, FY26" })])
  })

  it("numeric cell values (unformatted — the renderer never guesses formatting) export cleanly", async () => {
    await expectExports([table(4, 3, (r, c) => r * 1000 + c * 0.5)])
  })

  it("a mix of string and numeric cell values in the same table exports cleanly", async () => {
    await expectExports([table(4, 4, (r, c) => (c % 2 === 0 ? `label-${r}` : r * 100))])
  })

  // Lenient-revision contract: a row whose `cells` omits some declared
  // columns' keys is schema-legal (renders empty, ir-quality.ts warns) —
  // this proves the empty-cell render path itself never throws or corrupts
  // the export, independent of the warn channel (covered separately by
  // ir-quality.test.tsx / api.test.ts).
  it("rows with sparse cells (some declared columns' keys omitted) export cleanly", async () => {
    const columns = [{ key: "a", label: "A" }, { key: "b", label: "B" }, { key: "c", label: "C" }]
    await expectExports([
      {
        type: "data_table",
        columns,
        rows: [{ cells: { a: "only a" } }, { cells: {} }, { cells: { a: "x", b: "y", c: "z" } }],
      },
    ])
  })

  it("over-long CJK header/cell content truncates and still exports cleanly", async () => {
    const longContent = {
      type: "data_table" as const,
      columns: [
        { key: "a", label: "一个非常非常非常非常长的列标题名称用于测试截断行为是否生效" },
        { key: "b", label: "B" },
      ],
      rows: Array.from({ length: 3 }, (_, r) => ({
        cells: { a: `第${r}行一个非常非常非常非常长的单元格内容用于测试截断行为`, b: String(r) },
      })),
    }
    await expectExports([longContent])
  })

  it("all-numeric extreme-magnitude cell values export cleanly (content feeds text/color, never geometry)", async () => {
    await expectExports([table(3, 3, (r, c) => (r === 0 && c === 0 ? 1e15 : r === 2 && c === 2 ? -1e15 : 0))])
  })

  // box.h-aware graceful truncation (comparison.tsx's pattern, reused
  // verbatim by data-table.tsx): a two_column arrangement halves the
  // available width but not row cost, so a schema-max 12-row table sharing
  // a narrow column with a sibling component is a realistic way to force
  // the box.h-constrained drop path through the real layout engine, not
  // just the component-level unit test's synthetic small box.h.
  it("a schema-max table squeezed into a two_column arrangement (drop-path pressure) exports cleanly", async () => {
    const ir = makeIr([
      table(8, 12, (r, c) => `r${r}c${c}`),
      { type: "paragraph", text: "Sibling column content to force a two-column squeeze." },
    ])
    ir.slides[1] = { ...ir.slides[1], arrangement: "two_column" }
    const bytes = await generatePptx(ir)
    expect(bytes.length).toBeGreaterThan(10_000)
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])
  })
})

describe("data_table native-vector differentiation claim (sankey's own T3 precedent — no rasterized image)", () => {
  it("the data_table slide's exported XML carries zero <p:pic> — native rect/line/text, never a rasterized image", async () => {
    const ir = makeIr([table(5, 4, (r, c) => `r${r}c${c}`, { emphasisAt: (r) => (r === 3 ? "total" : undefined) })])
    const blob = await generatePptxBlob(ir)
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    // ir's own slide order: cover, content (data_table), ending -> slide2.xml.
    const xml = await zip.files["ppt/slides/slide2.xml"]!.async("string")

    expect(xml).not.toContain("<p:pic>")
    // Every rendered leaf should be a native rect/line/text run — a coarse
    // but direct confirmation alongside the <p:pic> absence above.
    expect(xml).toMatch(/<p:sp>/)
  })
})
