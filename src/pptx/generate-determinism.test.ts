import { describe, expect, it } from "vitest"
import { createHash } from "node:crypto"
import type { PptxIR, Slide } from "@/ir"

/**
 * P0 hardening, Task 4 (whole-file determinism) — pins the robustness
 * deep-review's D4 finding (scratchpad `dr/d-robustness.md` §3): jszip
 * stamps every zip entry's local-file-header date with the real wall-clock
 * instant of the `zip.file()`/`generateAsync()` call that wrote it
 * (`o.date = o.date || new Date()` — jszip's own `lib/object.js`), and
 * pptxgenjs's own `docProps/core.xml` bakes `new Date().toISOString()` into
 * `<dcterms:created>`/`<dcterms:modified>` on every `pptx.write()` call.
 *
 * Part-level *content* (decompressed XML strings) has always been fully
 * deterministic — the 3 sibling `normalizedZipMap`-based determinism tests
 * (`generate-notes-export.test.ts` / `generate-ea-font-export.test.ts` /
 * `generate-gradient-export.test.ts`) prove that and always passed — but
 * they get there by excluding `docProps/core.xml` from the comparison and
 * by never hashing the raw zip bytes, so none of them ever actually
 * exercised whole-*file* byte determinism. Two renders that happen to land
 * in the same 2-second DOS-timestamp granularity window produce identical
 * bytes by coincidence, not by guarantee — two renders whose calls straddle
 * that boundary do not, and this file's second test reproduces that with the
 * investigation's own repro method (a real >=2s gap between two calls)
 * rather than relying on timing luck.
 *
 * This file is the canonical whole-file-hash invariant this task adds. The
 * 3 sibling tests above are separately upgraded (same commit) from their
 * exclusion-based `normalizedZipMap` comparison to the same whole-file
 * SHA256 equality used here, now that there is nothing left to exclude.
 */

function makeIR(slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "determinism.pptx",
    theme: { id: "consulting" },
    meta: {},
    assets: { images: {} },
    slides,
  }
}

async function sha256(blob: Blob): Promise<string> {
  return createHash("sha256").update(Buffer.from(await blob.arrayBuffer())).digest("hex")
}

function deck(): PptxIR {
  return makeIR([
    { type: "cover", heading: "pptfast", subheading: "Whole-file determinism", components: [] },
    {
      type: "content",
      heading: "Design goals",
      components: [{ type: "bullets", items: ["one", "two", "three"] }],
    },
    { type: "ending", heading: "Thanks", components: [] },
  ])
}

describe("generatePptxBlob whole-file byte determinism", () => {
  it("the same IR renders to a byte-identical .pptx across two independent calls", async () => {
    const { generatePptxBlob } = await import("./generate")
    const ir = deck()

    const blobA = await generatePptxBlob(ir)
    const blobB = await generatePptxBlob(ir)

    expect(await sha256(blobB)).toBe(await sha256(blobA))
  }, 15000)

  it("the same IR renders to a byte-identical .pptx across a real >=2s gap (crosses the DOS timestamp's 2-second granularity boundary)", async () => {
    const { generatePptxBlob } = await import("./generate")
    const ir = deck()

    const blobA = await generatePptxBlob(ir)
    await new Promise((resolve) => setTimeout(resolve, 2200))
    const blobB = await generatePptxBlob(ir)

    expect(await sha256(blobB)).toBe(await sha256(blobA))
  }, 15000)
})
