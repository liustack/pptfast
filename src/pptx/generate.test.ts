 
import { describe, expect, it, beforeEach, vi } from "vitest"
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

class FakePptx {
  layout = ""
  defineLayout = vi.fn()
  defineSlideMaster = vi.fn()
  addSlide = vi.fn((options?: { masterName?: string }) => {
    const slide = new FakeSlide()
    this.slides.push({ options, slide })
    return slide
  })
  write = vi.fn(async () => new Blob(["pptx"]))
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
    blocks: [{ type: "paragraph", text: `${type} 正文内容` }],
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
    version: "3",
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
