import { describe, it, expect } from "vitest"
import JSZip from "jszip"
import { dedupePptxMedia } from "./pptx-dedupe-media"

const A = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
const B = new Uint8Array([9, 9, 9, 9])

function rels(target: string): string {
  return (
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${target}"/>` +
    `</Relationships>`
  )
}

async function buildPptx(): Promise<Blob> {
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
  const ab = await zip.generateAsync({ type: "arraybuffer" })
  return new Blob([ab])
}

describe("dedupePptxMedia", () => {
  it("collapses byte-identical media and repoints relationships", async () => {
    const out = await dedupePptxMedia(await buildPptx())
    const zip = await JSZip.loadAsync(await out.arrayBuffer())

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

  it("returns the input unchanged when there is nothing to dedupe", async () => {
    const zip = new JSZip()
    zip.file("ppt/media/image-1-1.png", A)
    const ab = await zip.generateAsync({ type: "arraybuffer" })
    const input = new Blob([ab])
    const out = await dedupePptxMedia(input)
    expect(out).toBe(input)
  })

  it("returns the input unchanged on a non-zip blob (never breaks export)", async () => {
    const bad = new Blob(["not a zip"])
    expect(await dedupePptxMedia(bad)).toBe(bad)
  })
})
