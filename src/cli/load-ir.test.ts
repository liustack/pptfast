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

  it("uses a caller-supplied kind in both failure messages (e.g. runPlanValidate passing \"plan\")", async () => {
    await expect(loadIrFile("/nowhere/missing.json", "plan")).rejects.toThrow(/cannot read plan file/)
    const dir = await mkdtemp(join(tmpdir(), "pptfast-"))
    const p = join(dir, "bad-plan.json")
    await writeFile(p, "{ not json")
    await expect(loadIrFile(p, "plan")).rejects.toThrow(/^plan file .* is not valid JSON/)
  })
})

describe("resolveLocalAssets", () => {
  it("inlines a local png path into a data URI", async () => {
    installNodePlatform()
    const dir = await mkdtemp(join(tmpdir(), "pptfast-"))
    await writeFile(join(dir, "logo.png"), PNG_1PX)
    const ir = PptxIRSchema.parse({
      version: "3",
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
      version: "3",
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
      version: "3",
      filename: "t",
      theme: { id: "consulting" },
      assets: { images: { gone: { src: "missing.png" } } },
      slides: [{ type: "cover", heading: "x" }],
    })
    await expect(resolveLocalAssets(ir, "/nowhere")).rejects.toThrow(/missing\.png/)
  })
})
