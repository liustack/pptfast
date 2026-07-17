import { describe, expect, it, vi, beforeEach } from "vitest"
import type { PptxIR } from "@/ir"

const pptxState = vi.hoisted(() => ({
  instances: [] as FakePptx[],
}))

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
  write = vi.fn(async () => new Blob(["pptx"]))
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
    // design (render.ts), unlike dedupePptxMedia's own defensive try/catch.
    // consulting's decor is solid-fill only, keeping this master-wiring
    // test clear of that path entirely.
    const ir: PptxIR = {
      version: "3",
      filename: "master.pptx",
      style: { id: "consulting" },
      meta: {},
      assets: { images: {} },
      slides: [
        {
          type: "content",
          heading: "Title",
          blocks: [{ type: "paragraph", text: "Body" }],
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
