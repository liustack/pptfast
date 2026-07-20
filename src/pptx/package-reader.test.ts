// @vitest-environment node
//
// Runs under the real Node/linkedom platform seam (not the default jsdom
// environment every other test file in this repo gets) — this reader's real
// consumer is the CLI/generatePptxBlob path, and linkedom's XML parsing
// behaves meaningfully differently from a browser/jsdom DOMParser (see
// `package-reader.ts`'s own `readXml` doc comment: linkedom silently
// leniency-repairs malformed XML instead of producing a `parsererror`
// node). Testing against the actual runtime this code ships to is the
// point, not jsdom's more forgiving-in-a-different-way behavior.
import { describe, it, expect, beforeAll } from "vitest"
import JSZip from "jszip"
import { installNodePlatform } from "../platform/node"
import { createPptxPackageReader } from "./package-reader"

beforeAll(() => {
  installNodePlatform()
})

const RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships"

function xmlDoc(root: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><${root}/>`
}

function relsDoc(entries: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${RELS_NS}">${entries}</Relationships>`
}

function buildZip(files: Record<string, string>): JSZip {
  const zip = new JSZip()
  for (const [path, content] of Object.entries(files)) zip.file(path, content)
  return zip
}

describe("createPptxPackageReader", () => {
  describe("listParts / hasPart", () => {
    it("lists every non-directory part", () => {
      const zip = buildZip({
        "[Content_Types].xml": xmlDoc("Types"),
        "ppt/slides/slide1.xml": xmlDoc("p:sld"),
      })
      const reader = createPptxPackageReader(zip)
      const parts = reader.listParts()
      expect(parts).toContain("[Content_Types].xml")
      expect(parts).toContain("ppt/slides/slide1.xml")
    })

    it("excludes directory entries from listParts and hasPart", () => {
      const zip = buildZip({ "ppt/media/image1.png": "x" })
      zip.folder("ppt/media")
      const reader = createPptxPackageReader(zip)
      expect(reader.listParts()).not.toContain("ppt/media/")
      expect(reader.hasPart("ppt/media/")).toBe(false)
    })

    it("hasPart is true for a real part and false for a missing one", () => {
      const zip = buildZip({ "ppt/presentation.xml": xmlDoc("p:presentation") })
      const reader = createPptxPackageReader(zip)
      expect(reader.hasPart("ppt/presentation.xml")).toBe(true)
      expect(reader.hasPart("ppt/nope.xml")).toBe(false)
    })
  })

  describe("readXml", () => {
    it("parses a well-formed part to a Document", async () => {
      const zip = buildZip({ "ppt/presentation.xml": xmlDoc("p:presentation") })
      const reader = createPptxPackageReader(zip)
      const doc = await reader.readXml("ppt/presentation.xml")
      expect(doc.documentElement?.tagName).toBe("p:presentation")
    })

    it("throws when the part does not exist", async () => {
      const zip = buildZip({})
      const reader = createPptxPackageReader(zip)
      await expect(reader.readXml("nope.xml")).rejects.toThrow(/part not found/)
    })

    it("throws when the part has no XML root at all (empty content)", async () => {
      const zip = buildZip({ "empty.xml": "" })
      const reader = createPptxPackageReader(zip)
      await expect(reader.readXml("empty.xml")).rejects.toThrow()
    })

    it("caches parsed documents — repeat reads return the same Document instance", async () => {
      const zip = buildZip({ "a.xml": xmlDoc("root") })
      const reader = createPptxPackageReader(zip)
      const first = await reader.readXml("a.xml")
      const second = await reader.readXml("a.xml")
      expect(second).toBe(first)
    })
  })

  describe("readRelationships", () => {
    it("reads a part's own .rels file, defaulting TargetMode to Internal", async () => {
      const zip = buildZip({
        "ppt/presentation.xml": xmlDoc("p:presentation"),
        "ppt/_rels/presentation.xml.rels": relsDoc(
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>`,
        ),
      })
      const reader = createPptxPackageReader(zip)
      const rels = await reader.readRelationships("ppt/presentation.xml")
      expect(rels).toEqual([
        {
          id: "rId1",
          type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster",
          target: "slideMasters/slideMaster1.xml",
          targetMode: "Internal",
        },
      ])
    })

    it("reports TargetMode=External faithfully (never resolved/checked at the reader layer)", async () => {
      const zip = buildZip({
        "ppt/slides/slide1.xml": xmlDoc("p:sld"),
        "ppt/slides/_rels/slide1.xml.rels": relsDoc(
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>`,
        ),
      })
      const reader = createPptxPackageReader(zip)
      const rels = await reader.readRelationships("ppt/slides/slide1.xml")
      expect(rels[0]!.targetMode).toBe("External")
      expect(rels[0]!.target).toBe("https://example.com")
    })

    it("returns [] for a part with no .rels file (most parts have none)", async () => {
      const zip = buildZip({ "ppt/theme/theme1.xml": xmlDoc("a:theme") })
      const reader = createPptxPackageReader(zip)
      expect(await reader.readRelationships("ppt/theme/theme1.xml")).toEqual([])
    })

    it("resolves the package root's own relationships from _rels/.rels", async () => {
      const zip = buildZip({
        "_rels/.rels": relsDoc(
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>`,
        ),
      })
      const reader = createPptxPackageReader(zip)
      const rels = await reader.readRelationships("")
      expect(rels).toHaveLength(1)
      expect(rels[0]!.target).toBe("ppt/presentation.xml")
    })
  })

  describe("resolveTarget", () => {
    it("resolves a relative target against the source part's own directory, normalizing ..", () => {
      const reader = createPptxPackageReader(new JSZip())
      expect(reader.resolveTarget("ppt/slides/slide1.xml", "../media/foo.png")).toBe("ppt/media/foo.png")
    })

    it("resolves a same-directory relative target", () => {
      const reader = createPptxPackageReader(new JSZip())
      expect(reader.resolveTarget("ppt/presentation.xml", "slideMasters/slideMaster1.xml")).toBe(
        "ppt/slideMasters/slideMaster1.xml",
      )
    })

    it("resolves the package root's own relative target with no leading directory", () => {
      const reader = createPptxPackageReader(new JSZip())
      expect(reader.resolveTarget("", "ppt/presentation.xml")).toBe("ppt/presentation.xml")
    })

    it("treats a leading-slash target as package-root-absolute", () => {
      const reader = createPptxPackageReader(new JSZip())
      expect(reader.resolveTarget("ppt/slides/slide1.xml", "/ppt/media/foo.png")).toBe("ppt/media/foo.png")
    })
  })
})
