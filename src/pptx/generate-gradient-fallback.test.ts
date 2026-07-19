import { describe, expect, it, vi } from "vitest"
import JSZip from "jszip"
import type { PptxIR, Slide } from "@/ir"
import { gradientMidpointHex } from "./svg2pptx/gradient"

/**
 * Locks `generatePptxBlob`'s gradient-patch wiring (T7, vc-task-7 brief
 * "接线" step): `renderOps` returns a `GradientFillPatch[]` per slide;
 * `generatePptxBlob` accumulates every slide's patches and hands the whole
 * array to `applyGradientFills` right after `pptx.write()`, before the
 * dedupe pass. A gradient shape is still written with a solid placeholder
 * fill up front (pptxgenjs has no gradient-fill API — see render.ts's own
 * doc comment), but that placeholder is now swapped for a real
 * `<a:gradFill>` in the finished .pptx zip, not left in place.
 *
 * `slideToOps` is mocked to hand back a fixed gradient-bearing op directly
 * (bypassing `FullSlideSvg`/SVG parsing) because this test pins down
 * `pptx-generate.ts`'s own wiring in isolation, independent of which
 * theme/template happens to emit a gradient — see
 * `pptx-generate-gradient-export.test.ts` for the end-to-end check through
 * a real theme's Decor layer (vc-task-7's six theme decorations).
 *
 * Until T7, this test asserted the opposite (fallback to the solid
 * placeholder, no `a:gradFill` anywhere) — see git history for that
 * pre-wiring version.
 */

const GRADIENT_FIXTURE = vi.hoisted(() => ({
  gradientFill: {
    kind: "linear" as const,
    angleDeg: 0,
    stops: [
      { pos: 0, hex: "FF0000" },
      { pos: 1, hex: "0000FF" },
    ],
  },
}))

vi.mock("@/svg/render-slide", async () => {
  const { gradientMidpointHex: midpoint } = await import("./svg2pptx/gradient")
  const op = {
    kind: "shape",
    text: "",
    shape: "rect",
    x: 1,
    y: 1,
    w: 2,
    h: 1,
    fill: { color: midpoint(GRADIENT_FIXTURE.gradientFill) },
    gradientFill: GRADIENT_FIXTURE.gradientFill,
  }
  return { slideToOps: vi.fn(() => [op]) }
})

function makeSlide(): Slide {
  return {
    type: "content",
    heading: "标题",
    components: [{ type: "paragraph", text: "正文内容" }],
  }
}

function makeIR(): PptxIR {
  return {
    version: "4",
    filename: "gradient-fallback.pptx",
    theme: { id: "tech" },
    meta: {},
    assets: { images: {} },
    slides: [makeSlide()],
  }
}

describe("generatePptxBlob gradient wiring (applyGradientFills)", () => {
  it("exports a gradient shape as a real a:gradFill, replacing the solid placeholder entirely", async () => {
    const { generatePptxBlob } = await import("./generate")
    const placeholderHex = gradientMidpointHex(GRADIENT_FIXTURE.gradientFill)

    const blob = await generatePptxBlob(makeIR())

    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const slidePaths = Object.keys(zip.files).filter(
      (p) => /^ppt\/slides\/slide\d+\.xml$/.test(p) && !zip.files[p].dir,
    )
    expect(slidePaths.length).toBeGreaterThan(0)
    const xml = (
      await Promise.all(slidePaths.map((p) => zip.files[p].async("string")))
    ).join("\n")

    // The gradient patch replaced the shape's whole <a:solidFill> wholesale
    // with a real <a:gradFill> carrying the fixture's two stops.
    expect(xml).toContain("a:gradFill")
    expect(xml).toContain('<a:srgbClr val="FF0000"/>')
    expect(xml).toContain('<a:srgbClr val="0000FF"/>')
    // The placeholder midpoint color (the pre-T7 fallback) is gone — the
    // patch swaps the whole solidFill block, it doesn't just add alongside.
    expect(xml).not.toContain(`<a:srgbClr val="${placeholderHex}"/>`)
  })
})
