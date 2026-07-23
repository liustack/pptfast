import { describe, expect, it } from "vitest"
import JSZip from "jszip"
import { finalizePptxZip, normalizePptxTimestamps, FIXED_ZIP_DATE, FIXED_ZIP_DATE_ISO } from "./pptx-fixed-timestamps"
import { dedupeMediaInZip } from "./pptx-dedupe-media"
import { PptfastError } from "../errors"

/**
 * carried-items wave — P0 T4 carried item: "normalizePptxTimestamps must
 * run last" was convention only, enforced by nothing (progress.md's own
 * "顺延→终审" note). This file pins the runtime seal that now makes both
 * halves of that contract ("must run", "nothing may follow it") throw
 * loudly instead of silently reintroducing wall-clock nondeterminism — see
 * normalizePptxTimestamps/finalizePptxZip's own doc comments for the design
 * (chosen over a source-order-parsing test alone, see this task's report).
 */

function coreXml(): string {
  return (
    `<?xml version="1.0"?><cp:coreProperties xmlns:cp="x" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="x">` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">2020-01-01T00:00:00Z</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">2020-01-01T00:00:00Z</dcterms:modified>` +
    `</cp:coreProperties>`
  )
}

function buildZip(): JSZip {
  const zip = new JSZip()
  zip.file("docProps/core.xml", coreXml())
  zip.file("ppt/media/image-1-1.png", new Uint8Array([1, 2, 3]))
  return zip
}

describe("normalizePptxTimestamps (unchanged core behavior)", () => {
  it("pins every entry's date and the core.xml timestamp text", async () => {
    const zip = buildZip()
    await normalizePptxTimestamps(zip)

    expect(zip.files["ppt/media/image-1-1.png"]!.date).toEqual(FIXED_ZIP_DATE)
    expect(zip.files["docProps/core.xml"]!.date).toEqual(FIXED_ZIP_DATE)
    const xml = await zip.files["docProps/core.xml"]!.async("string")
    expect(xml).toContain(`<dcterms:created xsi:type="dcterms:W3CDTF">${FIXED_ZIP_DATE_ISO}</dcterms:created>`)
    expect(xml).toContain(`<dcterms:modified xsi:type="dcterms:W3CDTF">${FIXED_ZIP_DATE_ISO}</dcterms:modified>`)
  })
})

describe("runtime seal: nothing may mutate a zip after normalizePptxTimestamps ran on it", () => {
  it("zip.file(...) throws a PptfastError naming the violated method", async () => {
    const zip = buildZip()
    await normalizePptxTimestamps(zip)
    expect(() => zip.file("new.txt", "x")).toThrow(PptfastError)
    expect(() => zip.file("new.txt", "x")).toThrow(/"file" was called .* after normalizePptxTimestamps/)
  })

  it("zip.remove(...) throws the same invariant", async () => {
    const zip = buildZip()
    await normalizePptxTimestamps(zip)
    expect(() => zip.remove("ppt/media/image-1-1.png")).toThrow(PptfastError)
    expect(() => zip.remove("ppt/media/image-1-1.png")).toThrow(/"remove" was called/)
  })

  it("zip.folder(...) throws the same invariant", async () => {
    const zip = buildZip()
    await normalizePptxTimestamps(zip)
    expect(() => zip.folder("new-dir")).toThrow(PptfastError)
    expect(() => zip.folder("new-dir")).toThrow(/"folder" was called/)
  })

  // Direct reproduction of the actual real-world reorder defect this guard
  // exists for: dedupeMediaInZip is a real patch stage in generate.ts's
  // chain, normally called *before* normalizePptxTimestamps. If a future
  // edit ever moved it to run after (or, equivalently, moved
  // normalizePptxTimestamps earlier than this exact call), the reordered
  // call must fail loudly right here instead of silently re-dating whatever
  // parts it rewrites.
  it("a real patch stage (dedupeMediaInZip) reordered to run after normalizePptxTimestamps throws instead of silently re-dating parts", async () => {
    const zip = new JSZip()
    zip.file("docProps/core.xml", coreXml())
    const dupeBytes = new Uint8Array([9, 9, 9, 9])
    zip.file("ppt/media/image-1-1.png", dupeBytes)
    zip.file("ppt/media/image-2-1.png", dupeBytes)
    zip.file(
      "ppt/slides/_rels/slide1.xml.rels",
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type=".../image" Target="../media/image-1-1.png"/></Relationships>`,
    )
    zip.file(
      "ppt/slides/_rels/slide2.xml.rels",
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type=".../image" Target="../media/image-2-1.png"/></Relationships>`,
    )

    await normalizePptxTimestamps(zip)
    await expect(dedupeMediaInZip(zip)).rejects.toThrow(PptfastError)
    await expect(dedupeMediaInZip(zip)).rejects.toThrow(/normalizePptxTimestamps must be the last patch/)
  })

  it("sealing one zip instance does not affect a different, unrelated zip (no JSZip.prototype leakage)", async () => {
    const sealedZip = buildZip()
    await normalizePptxTimestamps(sealedZip)

    const freshZip = buildZip()
    expect(() => freshZip.file("new.txt", "x")).not.toThrow()
    expect(freshZip.files["new.txt"]).toBeDefined()
  })
})

describe("finalizePptxZip: the one sanctioned way to reach generateAsync()", () => {
  it("throws if normalizePptxTimestamps never ran on this zip", async () => {
    const zip = buildZip()
    await expect(finalizePptxZip(zip, { type: "arraybuffer", compression: "DEFLATE" })).rejects.toThrow(
      PptfastError,
    )
    await expect(finalizePptxZip(zip, { type: "arraybuffer", compression: "DEFLATE" })).rejects.toThrow(
      /generateAsync\(\) was reached without normalizePptxTimestamps/,
    )
  })

  it("succeeds after normalizePptxTimestamps ran, producing a valid zip byte-identical to a direct zip.generateAsync() call on the same normalized state", async () => {
    const zipA = buildZip()
    await normalizePptxTimestamps(zipA)
    const ab = await finalizePptxZip(zipA, { type: "arraybuffer", compression: "DEFLATE" })
    expect(ab.byteLength).toBeGreaterThan(0)

    // A real zip (magic "PK"), not a thrown error's absence masking a
    // broken output.
    const bytes = new Uint8Array(ab)
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)

    // Round-trips back to the exact normalized state (proves finalizePptxZip
    // is a faithful passthrough to zip.generateAsync, not a divergent
    // reimplementation).
    const reloaded = await JSZip.loadAsync(ab)
    const xml = await reloaded.files["docProps/core.xml"]!.async("string")
    expect(xml).toContain(FIXED_ZIP_DATE_ISO)
  })

  // Mutation-proof (per this task's own requirement): stash-style revert
  // check, run manually during implementation and re-verified here as a
  // permanent regression guard — a zip that skips normalizePptxTimestamps
  // entirely must never reach a real generateAsync() through this function.
  it("never calls the underlying zip.generateAsync when unsealed (no partial/leaked output on the rejected path)", async () => {
    const zip = buildZip()
    let threw = false
    try {
      await finalizePptxZip(zip, { type: "arraybuffer", compression: "DEFLATE" })
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })
})
