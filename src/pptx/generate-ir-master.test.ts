import { describe, expect, it, vi, beforeEach } from "vitest"
import JSZip from "jszip"
import type { PptxIR } from "@/ir"

const pptxState = vi.hoisted(() => ({
  instances: [] as FakePptx[],
}))

/**
 * A minimal but structurally real pptx zip — enough to satisfy
 * `generatePptxBlob`'s package-audit hard gate (package-audit wave, task 1;
 * spec §4.4/§10.4, no skip switch) — for `slideCount` slides, each empty
 * (zero shapes, so the per-slide cNvPr/transform/animation rules are
 * vacuously satisfied). `FakePptx.write()` below returns this instead of a
 * placeholder `Blob(["pptx"])` (pre-package-audit shape) since that no
 * longer survives the gate's own `JSZip.loadAsync` at all.
 */
async function buildFakePptxZip(slideCount: number): Promise<Blob> {
  const zip = new JSZip()
  const xmlDecl = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  zip.file(
    "[Content_Types].xml",
    `${xmlDecl}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
  )
  zip.file(
    "_rels/.rels",
    `${xmlDecl}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>` +
      `</Relationships>`,
  )
  const sldIds = Array.from({ length: slideCount }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join("")
  zip.file(
    "ppt/presentation.xml",
    `${xmlDecl}<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
      `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
      `<p:sldIdLst>${sldIds}</p:sldIdLst></p:presentation>`,
  )
  const presRels = Array.from(
    { length: slideCount },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`,
  ).join("")
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `${xmlDecl}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${presRels}</Relationships>`,
  )
  for (let i = 1; i <= slideCount; i++) {
    zip.file(
      `ppt/slides/slide${i}.xml`,
      `${xmlDecl}<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
        `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
        `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree/></p:cSld></p:sld>`,
    )
  }
  const ab = await zip.generateAsync({ type: "arraybuffer" })
  return new Blob([ab])
}

class FakeSlide {
  addText = vi.fn()
  addImage = vi.fn()
  addShape = vi.fn()
}

class FakePptx {
  layout = ""
  defineLayout = vi.fn()
  defineSlideMaster = vi.fn()
  addSlide = vi.fn((options?: { masterName?: string }) => {
    const slide = new FakeSlide()
    this.slides.push({ options, slide })
    return slide
  })
  // A minimal but structurally real zip (not a placeholder `Blob(["pptx"])`)
  // — since package-audit wave task 1, `generatePptxBlob`'s final step is an
  // unconditional hard gate (spec §4.4/§10.4, no skip switch) that JSZip-loads
  // whatever `write()` returns, so this mock must produce something that
  // actually satisfies the gate's invariants (core parts present, presentation
  // slide list/relationships/parts three-way consistent) or every test in this
  // file would fail at "zip-unreadable"/"core-part-missing" regardless of what
  // it's actually asserting. `buildFakePptxZip` builds exactly enough
  // structure for that — zero shapes, so the cNvPr/transform/animation rules
  // are vacuously satisfied.
  write = vi.fn(async () => buildFakePptxZip(this.slides.length))
  slides: Array<{ options?: { masterName?: string }; slide: FakeSlide }> = []

  constructor() {
    pptxState.instances.push(this)
  }
}

vi.mock("pptxgenjs", () => ({ default: FakePptx }))

describe("generatePptxBlob v2 master wiring", () => {
  beforeEach(() => {
    pptxState.instances = []
  })

  it("defines masters for each slide type and creates slides by slide.type", async () => {
    const { generatePptxBlob } = await import("./generate")
    // "consulting" rather than the legacy "ikb-swiss" (→ tech) id:
    // since T7's decor layer, tech always emits a real gradient fill,
    // and its patch would flow into applyGradientFills against this file's
    // FakePptx.write() (a non-zip placeholder Blob) — which fails loud by
    // design (render.ts), unlike generate.ts's own try/catch around
    // dedupeMediaInZip. consulting's decor is solid-fill only, keeping this
    // master-wiring test clear of that path entirely.
    const ir: PptxIR = {
      version: "4",
      filename: "master.pptx",
      theme: { id: "consulting" },
      meta: {},
      assets: { images: {} },
      slides: [
        {
          type: "content",
          heading: "Title",
          components: [{ type: "paragraph", text: "Body" }],
        },
      ],
    }

    await generatePptxBlob(ir)

    const pptx = pptxState.instances.at(-1)!
    // master-builder defines masters for all 4 types
    expect(pptx.defineSlideMaster).toHaveBeenCalledWith(
      expect.objectContaining({ title: "content" })
    )
    // Slide uses slide.type as masterName
    expect(pptx.addSlide).toHaveBeenCalledWith({
      masterName: "content",
    })
  })
})
