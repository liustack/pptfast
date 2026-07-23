import { describe, it, expect } from "vitest"
import JSZip from "jszip"
import { dedupeMediaInZip } from "./pptx-dedupe-media"

const A = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
const B = new Uint8Array([9, 9, 9, 9])

function rels(target: string): string {
  return (
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${target}"/>` +
    `</Relationships>`
  )
}

// carried-items wave (P0 T4 carried item): this file used to exercise
// dedupePptxMedia, a standalone Blob-in/Blob-out wrapper around
// dedupeMediaInZip that generate.ts's pipeline stopped calling once it
// switched to running dedupeMediaInZip directly against its own already-
// loaded zip (spec §10.4's "reuse the patch chain's own final loadAsync,
// don't re-unzip") -- every remaining reference to the wrapper anywhere in
// this repo was a comment, so it was dead code and got removed alongside
// this file's own rewrite to exercise the surviving dedupeMediaInZip
// directly (build a JSZip, call it, inspect the same zip instance) instead
// of round-tripping through the deleted Blob wrapper.
describe("dedupeMediaInZip", () => {
  function buildZip(): JSZip {
    const zip = new JSZip()
    // 3 identical media (shared bg on 3 slides) + 1 distinct
    zip.file("ppt/media/image-1-1.png", A)
    zip.file("ppt/media/image-2-1.png", A)
    zip.file("ppt/media/image-3-1.png", A)
    zip.file("ppt/media/image-9-1.png", B)
    zip.file("ppt/slides/_rels/slide1.xml.rels", rels("image-1-1.png"))
    zip.file("ppt/slides/_rels/slide2.xml.rels", rels("image-2-1.png"))
    zip.file("ppt/slides/_rels/slide3.xml.rels", rels("image-3-1.png"))
    zip.file("ppt/slides/_rels/slide9.xml.rels", rels("image-9-1.png"))
    return zip
  }

  it("collapses byte-identical media and repoints relationships, returning true", async () => {
    const zip = buildZip()
    const changed = await dedupeMediaInZip(zip)
    expect(changed).toBe(true)

    const media = Object.keys(zip.files).filter(
      (p) => p.startsWith("ppt/media/") && !zip.files[p].dir,
    )
    // 3 identical → 1, plus the 1 distinct = 2 total
    expect(media.sort()).toEqual(["ppt/media/image-1-1.png", "ppt/media/image-9-1.png"])

    // duplicate slides now point at the canonical media
    const s2 = await zip.files["ppt/slides/_rels/slide2.xml.rels"].async("string")
    const s3 = await zip.files["ppt/slides/_rels/slide3.xml.rels"].async("string")
    expect(s2).toContain("image-1-1.png")
    expect(s2).not.toContain("image-2-1.png")
    expect(s3).toContain("image-1-1.png")
    // the distinct one is untouched
    const s9 = await zip.files["ppt/slides/_rels/slide9.xml.rels"].async("string")
    expect(s9).toContain("image-9-1.png")
  })

  it("returns false and leaves the zip untouched when there is nothing to dedupe (single media file)", async () => {
    const zip = new JSZip()
    zip.file("ppt/media/image-1-1.png", A)
    zip.file("ppt/slides/_rels/slide1.xml.rels", rels("image-1-1.png"))

    const changed = await dedupeMediaInZip(zip)
    expect(changed).toBe(false)

    const media = Object.keys(zip.files).filter(
      (p) => p.startsWith("ppt/media/") && !zip.files[p].dir,
    )
    expect(media).toEqual(["ppt/media/image-1-1.png"])
    const rel = await zip.files["ppt/slides/_rels/slide1.xml.rels"].async("string")
    expect(rel).toContain("image-1-1.png")
  })

  it("returns false when every media part is distinct (no duplicate content, only different byte content)", async () => {
    const zip = new JSZip()
    zip.file("ppt/media/image-1-1.png", A)
    zip.file("ppt/media/image-2-1.png", B)

    const changed = await dedupeMediaInZip(zip)
    expect(changed).toBe(false)

    const media = Object.keys(zip.files).filter(
      (p) => p.startsWith("ppt/media/") && !zip.files[p].dir,
    )
    expect(media.sort()).toEqual(["ppt/media/image-1-1.png", "ppt/media/image-2-1.png"])
  })
})
