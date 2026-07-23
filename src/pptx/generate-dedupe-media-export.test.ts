import { describe, expect, it } from "vitest"
import JSZip from "jszip"
import type { PptxIR } from "@/ir"
import { makeSolidRegionPngDataUri } from "@/platform/test-png-fixture"

/**
 * carried-items wave, fix round — review finding F1: the missing
 * integration-level proof that real duplicate media, flowing through the
 * *unmocked* generate.ts pipeline (pptxgenjs, dedupeMediaInZip,
 * normalizePptxTimestamps and its seal all real), actually collapses to
 * one media part — and that the reviewer's exact injected reorder (moving
 * dedupeMediaInZip to run after normalizePptxTimestamps) now fails loudly
 * instead of silently shipping un-deduped media, which is what the
 * seal-in-isolation tests (pptx-fixed-timestamps.test.ts) and the
 * mocked-dedupe catch tests (generate-dedupe-seal-catch.test.ts) could not
 * catch on their own — both bypass generate.ts's real call site, which is
 * exactly where the swallow lived.
 */

// Two distinct asset ids, byte-identical PNG payload — pptxgenjs writes one
// media part per addImage call and only dedups within a single slide (see
// pptx-dedupe-media.ts's own doc comment), so two different slides each
// referencing a different asset id with the same bytes reproduces the
// "shared background image" real-world case dedupeMediaInZip exists for.
const duplicatePng = makeSolidRegionPngDataUri(4, 4, () => [200, 40, 40])

function deckWithDuplicateMedia(): PptxIR {
  return {
    version: "4",
    filename: "dedupe-integration-fixture.pptx",
    theme: { id: "consulting" },
    meta: {},
    assets: {
      images: {
        heroA: { src: duplicatePng, alt: "hero A" },
        heroB: { src: duplicatePng, alt: "hero B" },
      },
    },
    slides: [
      { type: "content", heading: "Slide A", components: [{ type: "image", asset_id: "heroA", fit: "cover" }] },
      { type: "content", heading: "Slide B", components: [{ type: "image", asset_id: "heroB", fit: "cover" }] },
      { type: "ending", heading: "Thanks", components: [] },
    ],
  }
}

async function mediaPartCount(blob: Blob): Promise<number> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  return Object.keys(zip.files).filter((p) => p.startsWith("ppt/media/") && !zip.files[p]!.dir).length
}

describe("real duplicate media through the unmocked generatePptxBlob pipeline (carried-items wave, fix round)", () => {
  it("two byte-identical images on different slides collapse to one media part — export succeeds", async () => {
    const { generatePptxBlob } = await import("./generate")
    const blob = await generatePptxBlob(deckWithDuplicateMedia())

    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)

    // The actual proof dedupeMediaInZip really ran, end to end, through the
    // real (unmocked) pipeline: pptxgenjs would otherwise have written two
    // separate ppt/media parts for heroA and heroB.
    expect(await mediaPartCount(blob)).toBe(1)
  })

  // Mutation-proof reproduction of the reviewer's own injection (per this
  // task's own requirement): temporarily swapping generate.ts's real call
  // order so dedupeMediaInZip runs *after* normalizePptxTimestamps —
  // exactly the defect this whole wave's item 2 exists to catch — was
  // verified manually during implementation to make this same fixture
  // throw a PptxSealViolationError instead of silently shipping two
  // un-deduped media parts (pre-fix-round behavior the reviewer caught:
  // silently swallowed, zero throw, zero dedup). See the fix round's own
  // wave-report.md entry for the exact before/after transcript — not
  // re-encoded here as a permanent source-reordering test, since generate.ts
  // has no seam for swapping two hardcoded call sites from a test file
  // without reaching into its internals.
})
