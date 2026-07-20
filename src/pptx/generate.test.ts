 
import { describe, expect, it, beforeEach, vi } from "vitest"
import JSZip from "jszip"
import type { PptxIR, Slide } from "@/ir"

// ── Fake PptxGenJS (records master + slide ops; real svg pipeline runs) ──

const pptxState = vi.hoisted(() => ({ instances: [] as FakePptx[] }))

class FakeSlide {
  addText = vi.fn()
  addImage = vi.fn()
  addShape = vi.fn()
  get opCount() {
    return this.addText.mock.calls.length + this.addShape.mock.calls.length + this.addImage.mock.calls.length
  }
}

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

class FakePptx {
  layout = ""
  defineLayout = vi.fn()
  defineSlideMaster = vi.fn()
  addSlide = vi.fn((options?: { masterName?: string }) => {
    const slide = new FakeSlide()
    this.slides.push({ options, slide })
    return slide
  })
  write = vi.fn(async () => buildFakePptxZip(this.slides.length))
  slides: Array<{ options?: { masterName?: string }; slide: FakeSlide }> = []
  constructor() {
    pptxState.instances.push(this)
  }
}

vi.mock("pptxgenjs", () => ({ default: FakePptx }))

function makeSlide(type: Slide["type"], heading?: string): Slide {
  return {
    type,
    heading: heading ?? `${type} 标题`,
    components: [{ type: "paragraph", text: `${type} 正文内容` }],
  }
}

// Theme defaults to "consulting" rather than the legacy "ikb-swiss"
// (→ tech) id: since T7's decor layer, tech/creative/custom
// themes always emit a real gradient fill, and `renderOps`'s returned
// patches now flow into `applyGradientFills` (pptx-generate.ts) — but this
// file's `FakePptx.write()` returns a non-zip placeholder `Blob`, which
// `applyGradientFills` (deliberately, unlike `dedupePptxMedia`) fails loud
// on rather than swallowing. consulting's decor is solid-fill only (grid
// lines / a color band, no gradients), so it keeps this file's generic
// wiring tests (masterName/addSlide/blob-shape — not about any theme's
// rendering) clear of that gradient-patch path entirely.
function makeIR(slides: Slide[], themeId = "consulting"): PptxIR {
  return {
    version: "4",
    filename: "test.pptx",
    theme: { id: themeId as PptxIR["theme"]["id"] },
    meta: {},
    assets: { images: {} },
    slides,
  }
}

describe("generatePptxBlob (single-source svg pipeline)", () => {
  beforeEach(() => {
    pptxState.instances = []
  })

  it("generates one page per slide, each using its type as masterName", async () => {
    const { generatePptxBlob } = await import("./generate")
    const ir = makeIR([makeSlide("cover"), makeSlide("chapter"), makeSlide("content"), makeSlide("ending")])

    await generatePptxBlob(ir)

    const pptx = pptxState.instances.at(-1)!
    expect(pptx.addSlide).toHaveBeenCalledTimes(4)
    expect(pptx.addSlide).toHaveBeenNthCalledWith(1, { masterName: "cover" })
    expect(pptx.addSlide).toHaveBeenNthCalledWith(2, { masterName: "chapter" })
    expect(pptx.addSlide).toHaveBeenNthCalledWith(3, { masterName: "content" })
    expect(pptx.addSlide).toHaveBeenNthCalledWith(4, { masterName: "ending" })
  })

  it("applies svg-derived ops to every slide (background + heading at minimum)", async () => {
    const { generatePptxBlob } = await import("./generate")
    await generatePptxBlob(makeIR([makeSlide("cover"), makeSlide("content")]))

    const pptx = pptxState.instances.at(-1)!
    for (const { slide } of pptx.slides) {
      expect(slide.opCount).toBeGreaterThan(0)
    }
    // a content slide draws text (heading + paragraph)
    expect(pptx.slides[1].slide.addText).toHaveBeenCalled()
  })

  it("defines slide masters without native slide numbers (2026-07-09 删页码)", async () => {
    const { generatePptxBlob } = await import("./generate")
    await generatePptxBlob(makeIR([makeSlide("content")]))

    const pptx = pptxState.instances.at(-1)!
    expect(pptx.defineSlideMaster).toHaveBeenCalled()
    for (const call of pptx.defineSlideMaster.mock.calls) {
      expect(call[0].slideNumber).toBeUndefined()
    }
  })

  it("accepts a generated_file envelope carrying 'kind' (strips it before strict parse)", async () => {
    // Backend builds generated_file = { kind: "pptx", ...IR }. The strict
    // PptxIRSchema rejects the extra root key `kind` ("Unrecognized key: kind"),
    // which made EVERY pptx download fail. Export must strip the envelope key.
    const { generatePptxBlob } = await import("./generate")
    const envelope = { kind: "pptx", ...makeIR([makeSlide("cover"), makeSlide("content")]) } as unknown as PptxIR

    const blob = await generatePptxBlob(envelope)

    expect(blob).toBeInstanceOf(Blob)
    expect(pptxState.instances.at(-1)!.addSlide).toHaveBeenCalledTimes(2)
  })

  it("returns a Blob from write()", async () => {
    const { generatePptxBlob } = await import("./generate")
    const blob = await generatePptxBlob(makeIR([makeSlide("content")]))

    expect(blob).toBeInstanceOf(Blob)
    expect(pptxState.instances.at(-1)!.write).toHaveBeenCalledWith({ outputType: "blob" })
  })
})
