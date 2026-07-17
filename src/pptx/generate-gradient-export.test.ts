import { describe, expect, it } from "vitest"
import JSZip from "jszip"
import type { PptxIR, Slide } from "@/ir"

/**
 * End-to-end check (vc-task-7): a real theme's `Decor` layer emits a real
 * SVG gradient (`fill="url(#...)"`, resolved against its own `<defs>`), and
 * the full `generatePptxBlob` pipeline — real pptxgenjs, no `render-slide`
 * mock — carries it all the way through `svgToOps` → `renderOps` →
 * `pptx.write()` → `applyGradientFills` to a genuine `<a:gradFill>` in the
 * exported .pptx's slide XML. `pptx-generate-gradient-fallback.test.ts`
 * covers the same wiring in isolation with a synthetic op; this test is the
 * "it also works with a real theme" integration counterpart the brief asks
 * for.
 */

function slide(type: Slide["type"]): Slide {
  return {
    type,
    heading: "渐变装饰验证",
    blocks: type === "content" || type === "ending" ? [{ type: "paragraph", text: "正文" }] : [],
  }
}

function makeIR(themeId: PptxIR["theme"]["id"], slides: Slide[]): PptxIR {
  return {
    version: "3",
    filename: "decor-gradient.pptx",
    theme: { id: themeId },
    meta: {},
    assets: { images: {} },
    slides,
  }
}

async function slideXml(blob: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const slidePaths = Object.keys(zip.files).filter(
    (p) => /^ppt\/slides\/slide\d+\.xml$/.test(p) && !zip.files[p].dir,
  )
  expect(slidePaths.length).toBeGreaterThan(0)
  return (await Promise.all(slidePaths.map((p) => zip.files[p].async("string")))).join("\n")
}

describe("generatePptxBlob real theme decor gradients", () => {
  it("tech's full-page decor gradient field exports as a real a:gradFill", async () => {
    const { generatePptxBlob } = await import("./generate")
    const blob = await generatePptxBlob(makeIR("tech", [slide("content")]))
    expect(await slideXml(blob)).toContain("a:gradFill")
  }, 30000)

  it("chart bar 渐变柱导出为真实 a:gradFill（2026-07-12 光晕移除后渐变链 fixture 换 chart——insight 的 poster-motif 光晕已按用户裁决删除，渐变导出链由图表渐变持续覆盖）", async () => {
    const { generatePptxBlob } = await import("./generate")
    const chartSlide: Slide = {
      type: "content",
      heading: "渐变柱",
      blocks: [
        {
          type: "chart",
          chart_type: "bar",
          series: [
            { name: "s", data: [{ x: "甲", y: 3 }, { x: "乙", y: 7 }, { x: "丙", y: 5 }] },
          ],
        },
      ],
    } as Slide
    const blob = await generatePptxBlob(makeIR("insight", [chartSlide]))
    expect(await slideXml(blob)).toContain("a:gradFill")
  }, 30000)

  it("enterprise's decor gradient field is skipped (not present) when a slide has a background image", async () => {
    const { generatePptxBlob } = await import("./generate")
    const RED_PNG =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    const ir: PptxIR = {
      version: "3",
      filename: "decor-gradient-bg.pptx",
      theme: { id: "enterprise" },
      meta: {},
      assets: { images: { bg: { src: RED_PNG } } },
      slides: [
        { type: "cover", heading: "背景图覆盖", blocks: [], background: { kind: "asset", asset_id: "bg" } },
      ],
    }
    const blob = await generatePptxBlob(ir)
    expect(await slideXml(blob)).not.toContain("a:gradFill")
  }, 30000)
})
