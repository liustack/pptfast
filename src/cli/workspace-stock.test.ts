// @vitest-environment node
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeAll, describe, expect, it } from "vitest"
import { PptxIRSchema } from "@/ir"
import { installNodePlatform } from "@/platform/node"
import { runRender, runValidate } from "./commands"
import { resolveLocalAssets } from "./load-ir"

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

beforeAll(() => {
  installNodePlatform()
})

function stockIr(opts: { includeAsset: boolean; assetId: string }): unknown {
  return {
    version: "4",
    filename: "stock",
    theme: { id: "consulting" },
    assets: opts.includeAsset ? { images: { [opts.assetId]: { src: `${opts.assetId}.png` } } } : { images: {} },
    slides: [
      { type: "cover", heading: "Cover" },
      {
        type: "content",
        heading: "Hero",
        layout: "image-top",
        components: [{ type: "image", asset_id: opts.assetId }],
      },
      { type: "ending", heading: "End" },
    ],
  }
}

describe("workspace stock assets at render", () => {
  it("resolveLocalAssets finds a file that exists only in workspace assets", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pptfast-ws-stock-"))
    const workspace = join(dir, ".pptfast", "stock", "assets")
    await mkdir(workspace, { recursive: true })
    await writeFile(join(workspace, "hero.png"), PNG_1PX)
    const ir = PptxIRSchema.parse(stockIr({ includeAsset: true, assetId: "hero" }))
    await resolveLocalAssets(ir, dir, workspace)
    expect(ir.assets.images.hero?.src.startsWith("data:image/png;base64,")).toBe(true)
  })

  it("keeps a missing-asset warning when neither deck nor workspace has the id", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pptfast-ws-missing-"))
    const irPath = join(dir, "ghost.json")
    await writeFile(irPath, JSON.stringify(stockIr({ includeAsset: false, assetId: "ghost" })))
    const out = await runValidate(irPath, dir)
    expect(out).toMatch(/^OK/)
    expect(out).toMatch(/warning:[\s\S]*asset_id "ghost" is not defined/)
  })

  it("merges a workspace-only image into the loaded IR so render embeds it, twice to identical bytes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pptfast-ws-render-"))
    const irPath = join(dir, "stock.json")
    await writeFile(irPath, JSON.stringify(stockIr({ includeAsset: false, assetId: "hero" })))
    const workspace = join(dir, ".pptfast", "stock", "assets")
    await mkdir(workspace, { recursive: true })
    await writeFile(join(workspace, "hero.png"), PNG_1PX)

    const out1 = join(dir, "a.pptx")
    const out2 = join(dir, "b.pptx")
    await runRender(irPath, { output: out1, cwd: dir })
    await runRender(irPath, { output: out2, cwd: dir })
    const a = await readFile(out1)
    const b = await readFile(out2)
    expect(createHash("sha256").update(b).digest("hex")).toBe(createHash("sha256").update(a).digest("hex"))

    const JSZip = (await import("jszip")).default
    const zip = await JSZip.loadAsync(a)
    expect(Object.keys(zip.files).some((k) => k.startsWith("ppt/media/"))).toBe(true)
  })

  it("lets a local/deck image win over a workspace file of the same id", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pptfast-ws-win-"))
    await writeFile(join(dir, "demo.json"), JSON.stringify(stockIr({ includeAsset: true, assetId: "hero" })))
    await writeFile(join(dir, "hero.png"), PNG_1PX)
    const workspace = join(dir, ".pptfast", "demo", "assets")
    await mkdir(workspace, { recursive: true })
    await writeFile(join(workspace, "hero.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]))

    const out = join(dir, "out.pptx")
    await runRender(join(dir, "demo.json"), { output: out, cwd: dir })
    const JSZip = (await import("jszip")).default
    const zip = await JSZip.loadAsync(await readFile(out))
    const media = Object.keys(zip.files).find((k) => k.startsWith("ppt/media/") && !k.endsWith("/"))
    expect(media).toBeTruthy()
    const bytes = Buffer.from(await zip.file(media!)!.async("uint8array"))
    expect(bytes.subarray(0, 8).equals(PNG_1PX.subarray(0, 8))).toBe(true)
  })
})
