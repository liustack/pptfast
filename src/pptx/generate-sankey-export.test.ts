// @vitest-environment node
//
// Pathological-input coverage for `sankey` (structure-components wave 2
// task 3) through the REAL `generatePptx` (`src/api.ts`), never a mock —
// same posture as `generate-heatmap-export.test.ts`'s own template. Cycle
// rejection, self-loop rejection, duplicate-id rejection, and endpoint
// validation are all schema-level (`ir/index.ts`'s `.superRefine`) — covered
// by `ir/index.test.ts` directly, never reaching this file, since a
// rejected document never reaches `generatePptx` at all.
//
// This file's other job (plan task 3's explicit differentiation claim):
// confirm the "sankey ships as native custGeom vectors, never a rasterized
// picture" claim against the real exported XML, not just prose — the
// concrete counterpoint to Anthropic's own official pptx-authoring skill,
// which classifies a sankey as "PowerPoint has no native form for this" and
// ships it as an image.
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
    filename: "sankey-export-fixture",
    theme: { id: "consulting" },
    meta: {},
    assets: { images: {} },
    slides: [
      { type: "cover", heading: "Cover" },
      { type: "content", heading: "Sankey", components },
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

function chain(n: number): Component {
  return {
    type: "sankey",
    nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `Node ${i}` })),
    links: Array.from({ length: n - 1 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}`, value: 10 })),
  }
}

describe("sankey pathological values through the real generatePptx", () => {
  it("schema-max shape (16 nodes, 30 links, dense bipartite fan) exports cleanly", async () => {
    const nodes = Array.from({ length: 16 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}` }))
    const links: { from: string; to: string; value: number }[] = []
    outer: for (let i = 0; i < 8; i++) {
      for (let j = 8; j < 16; j++) {
        if (links.length >= 30) break outer
        links.push({ from: `n${i}`, to: `n${j}`, value: ((i + j) % 9) + 1 })
      }
    }
    await expectExports([{ type: "sankey", nodes, links }])
  })

  it("a minimal two-node one-link graph exports cleanly", async () => {
    await expectExports([
      { type: "sankey", nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], links: [{ from: "a", to: "b", value: 1 }] },
    ])
  })

  it("a disconnected node alongside a normal chain exports cleanly (renders standalone, not rejected)", async () => {
    await expectExports([
      {
        type: "sankey",
        nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }, { id: "orphan", label: "Orphan" }],
        links: [{ from: "a", to: "b", value: 10 }, { from: "b", to: "c", value: 10 }],
      },
    ])
  })

  it("multiple disconnected nodes in the same layer as heavily-loaded real ones export cleanly (the schema-max contrast fixture's own repro)", async () => {
    // Regression fixture for the MIN_NODE_H floor-overpayment bug this task
    // caught empirically (see sankey.tsx's computeValueScale doc comment):
    // several near-zero-weight disconnected nodes stacked alongside a few
    // heavily-loaded real ones in one layer pushed real content past the
    // content box before the floor-aware binary-search fix.
    const nodes = [
      { id: "src1", label: "Source 1" },
      { id: "src2", label: "Source 2" },
      { id: "orphan1", label: "Orphan 1" },
      { id: "orphan2", label: "Orphan 2" },
      { id: "orphan3", label: "Orphan 3" },
      { id: "orphan4", label: "Orphan 4" },
      { id: "sink", label: "Sink" },
    ]
    const links = [
      { from: "src1", to: "sink", value: 500 },
      { from: "src2", to: "sink", value: 500 },
    ]
    await expectExports([{ type: "sankey", nodes, links }])
  })

  it("extreme value ratio (1:10000) exports cleanly — bands floor at a visible minimum, never explode or vanish", async () => {
    await expectExports([
      {
        type: "sankey",
        nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }],
        links: [{ from: "a", to: "c", value: 10000 }, { from: "b", to: "c", value: 1 }],
      },
    ])
  })

  it("a pathologically small value (0.0001) exports cleanly (positive, not zero — schema-legal tiny flow)", async () => {
    await expectExports([
      { type: "sankey", nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], links: [{ from: "a", to: "b", value: 0.0001 }] },
    ])
  })

  it("a long single-node chain (16 nodes, maximal layer count) exports cleanly", async () => {
    await expectExports([chain(16)])
  })

  it("a dense-crossing 3x3 bipartite fan exports cleanly", async () => {
    const nodes = [
      { id: "a1", label: "A1" }, { id: "a2", label: "A2" }, { id: "a3", label: "A3" },
      { id: "b1", label: "B1" }, { id: "b2", label: "B2" }, { id: "b3", label: "B3" },
    ]
    const links: { from: string; to: string; value: number }[] = []
    for (const a of ["a1", "a2", "a3"]) {
      for (const b of ["b1", "b2", "b3"]) links.push({ from: a, to: b, value: 10 + links.length })
    }
    await expectExports([{ type: "sankey", nodes, links }])
  })

  it("a diamond re-convergence (DAG, not a cycle) exports cleanly", async () => {
    await expectExports([
      {
        type: "sankey",
        nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }, { id: "d", label: "D" }],
        links: [
          { from: "a", to: "b", value: 5 },
          { from: "a", to: "c", value: 5 },
          { from: "b", to: "d", value: 5 },
          { from: "c", to: "d", value: 5 },
        ],
      },
    ])
  })

  it("over-long node labels truncate and still export cleanly", async () => {
    await expectExports([
      {
        type: "sankey",
        nodes: [
          { id: "a", label: "一个非常非常非常非常非常长的节点名称用于测试标签截断行为是否生效并正常导出" },
          { id: "b", label: "B" },
        ],
        links: [{ from: "a", to: "b", value: 5 }],
      },
    ])
  })
})

describe("sankey native-vector differentiation claim (plan task 3 — competitor comparison)", () => {
  it("the sankey slide's exported XML carries zero <p:pic> and at least one <a:custGeom> — native editable vectors, never a rasterized image", async () => {
    const ir = makeIr([
      {
        type: "sankey",
        nodes: [
          { id: "coal", label: "Coal" },
          { id: "gas", label: "Gas" },
          { id: "grid", label: "Grid" },
          { id: "homes", label: "Homes" },
          { id: "industry", label: "Industry" },
        ],
        links: [
          { from: "coal", to: "grid", value: 30 },
          { from: "gas", to: "grid", value: 50 },
          { from: "grid", to: "homes", value: 45 },
          { from: "grid", to: "industry", value: 35 },
        ],
      },
    ])
    const blob = await generatePptxBlob(ir)
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    // ir's own slide order: cover, content (sankey), ending — slide2.xml.
    const xml = await zip.files["ppt/slides/slide2.xml"]!.async("string")

    expect(xml).not.toContain("<p:pic>")
    const custGeomCount = xml.match(/<a:custGeom>/g)?.length ?? 0
    // 5 nodes (rects -> prstGeom "rect", not custGeom) + 4 bezier bands
    // (custGeom paths) — every band must land as a real custGeom, not
    // silently drop to some other shape kind.
    expect(custGeomCount).toBe(4)
  })
})
