// @vitest-environment node
import JSZip from "jszip"
import { describe, expect, it } from "vitest"
import { PptxIRSchema } from "@/ir"
import { generatePptxBlob } from "@/pptx/generate"
import { installNodePlatform } from "./node"

const ir = PptxIRSchema.parse({
  version: "2",
  filename: "smoke",
  theme: { id: "consulting" },
  slides: [
    { type: "cover", heading: "pptfast smoke", subheading: "node render path" },
    { type: "content", heading: "Bullets", blocks: [{ type: "bullets", items: ["one", "two", "three"] }] },
    { type: "ending", heading: "Thanks" },
  ],
})

describe("node platform smoke", () => {
  it("renders a full deck without any browser global", async () => {
    installNodePlatform()
    const blob = await generatePptxBlob(ir)
    expect(blob.size).toBeGreaterThan(10_000)
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    expect(zip.file("ppt/slides/slide1.xml")).toBeTruthy()
    expect(zip.file("ppt/slides/slide3.xml")).toBeTruthy()
    const slide1 = await zip.file("ppt/slides/slide1.xml")!.async("string")
    expect(slide1).toContain("pptfast smoke")
  })
})
