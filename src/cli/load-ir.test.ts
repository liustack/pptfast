// @vitest-environment node
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { PptxIRSchema } from "@/ir"
import { installNodePlatform } from "@/platform/node"
import { loadIrFile, resolveLocalAssets } from "./load-ir"

// 1x1 红色 PNG
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
)

describe("loadIrFile", () => {
  it("throws a readable error for malformed JSON", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pptfast-"))
    const p = join(dir, "bad.json")
    await writeFile(p, "{ not json")
    await expect(loadIrFile(p)).rejects.toThrow(/not valid JSON/)
  })

  it("defaults kind to IR in both failure messages", async () => {
    await expect(loadIrFile("/nowhere/missing.json")).rejects.toThrow(/cannot read IR file/)
    const dir = await mkdtemp(join(tmpdir(), "pptfast-"))
    const p = join(dir, "bad.json")
    await writeFile(p, "{ not json")
    await expect(loadIrFile(p)).rejects.toThrow(/^IR file .* is not valid JSON/)
  })

  it("uses a caller-supplied kind in both failure messages (e.g. runSpecValidate passing \"spec\")", async () => {
    await expect(loadIrFile("/nowhere/missing.json", "spec")).rejects.toThrow(/cannot read spec file/)
    const dir = await mkdtemp(join(tmpdir(), "pptfast-"))
    const p = join(dir, "bad-spec.json")
    await writeFile(p, "{ not json")
    await expect(loadIrFile(p, "spec")).rejects.toThrow(/^spec file .* is not valid JSON/)
  })
})

describe("resolveLocalAssets", () => {
  it("inlines a local png path into a data URI", async () => {
    installNodePlatform()
    const dir = await mkdtemp(join(tmpdir(), "pptfast-"))
    await writeFile(join(dir, "logo.png"), PNG_1PX)
    const ir = PptxIRSchema.parse({
      version: "4",
      filename: "t",
      theme: { id: "consulting" },
      assets: { images: { logo: { src: "logo.png" } } },
      slides: [{ type: "cover", heading: "x" }],
    })
    await resolveLocalAssets(ir, dir)
    expect(ir.assets.images.logo?.src.startsWith("data:image/png;base64,")).toBe(true)
  })

  it("leaves data URIs and http(s) URLs untouched", async () => {
    const ir = PptxIRSchema.parse({
      version: "4",
      filename: "t",
      theme: { id: "consulting" },
      assets: { images: { a: { src: "data:image/png;base64,AAAA" }, b: { src: "https://x.test/i.png" } } },
      slides: [{ type: "cover", heading: "x" }],
    })
    await resolveLocalAssets(ir, "/nowhere")
    expect(ir.assets.images.a?.src).toBe("data:image/png;base64,AAAA")
    expect(ir.assets.images.b?.src).toBe("https://x.test/i.png")
  })

  it("fails loud with the resolved path for a missing file", async () => {
    const ir = PptxIRSchema.parse({
      version: "4",
      filename: "t",
      theme: { id: "consulting" },
      assets: { images: { gone: { src: "missing.png" } } },
      slides: [{ type: "cover", heading: "x" }],
    })
    await expect(resolveLocalAssets(ir, "/nowhere")).rejects.toThrow(/missing\.png/)
  })

  // Task 2 (borrow wave, D3): magic-byte sniffing for local files, the
  // Node-only counterpart to api.ts's checkAssetBytes (which only sees
  // already-inlined data: URIs). Three probes below are dr/d-robustness.md's
  // exact repro cases — all three previously sailed through this function
  // silently and only surfaced (if at all) deep in the export/audit chain.
  describe("byte-level validation (Task 2, borrow wave — D3)", () => {
    it("rejects a zero-byte local image file", async () => {
      const dir = await mkdtemp(join(tmpdir(), "pptfast-"))
      await writeFile(join(dir, "empty.png"), Buffer.alloc(0))
      const ir = PptxIRSchema.parse({
        version: "4",
        filename: "t",
        theme: { id: "consulting" },
        assets: { images: { photo: { src: "empty.png" } } },
        slides: [{ type: "cover", heading: "x" }],
      })
      await expect(resolveLocalAssets(ir, dir)).rejects.toThrow(/zero bytes/)
    })

    it("rejects a local .png file whose bytes are garbage (corrupt header)", async () => {
      const dir = await mkdtemp(join(tmpdir(), "pptfast-"))
      await writeFile(join(dir, "garbage.png"), Buffer.from([0x00, 0x01, 0x02, 0x03]))
      const ir = PptxIRSchema.parse({
        version: "4",
        filename: "t",
        theme: { id: "consulting" },
        assets: { images: { photo: { src: "garbage.png" } } },
        slides: [{ type: "cover", heading: "x" }],
      })
      await expect(resolveLocalAssets(ir, dir)).rejects.toThrow(/corrupt or unrecognized header/)
    })

    it("rejects a real PNG file saved with a .jpg extension (extension/bytes mismatch — trusts neither, rejects)", async () => {
      const dir = await mkdtemp(join(tmpdir(), "pptfast-"))
      await writeFile(join(dir, "photo.jpg"), PNG_1PX)
      const ir = PptxIRSchema.parse({
        version: "4",
        filename: "t",
        theme: { id: "consulting" },
        assets: { images: { photo: { src: "photo.jpg" } } },
        slides: [{ type: "cover", heading: "x" }],
      })
      await expect(resolveLocalAssets(ir, dir)).rejects.toThrow(
        /is named "\.jpg" but its bytes are actually image\/png/,
      )
    })

    it("leaves a genuinely valid local PNG untouched — byte-inertness for a valid asset (hard requirement)", async () => {
      const dir = await mkdtemp(join(tmpdir(), "pptfast-"))
      await writeFile(join(dir, "logo.png"), PNG_1PX)
      const ir = PptxIRSchema.parse({
        version: "4",
        filename: "t",
        theme: { id: "consulting" },
        assets: { images: { logo: { src: "logo.png" } } },
        slides: [{ type: "cover", heading: "x" }],
      })
      await resolveLocalAssets(ir, dir)
      expect(ir.assets.images.logo?.src).toBe(`data:image/png;base64,${PNG_1PX.toString("base64")}`)
    })
  })
})
