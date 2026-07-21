import { describe, expect, it } from "vitest"
import JSZip from "jszip"
import type { PptxIR, Slide } from "@/ir"

/**
 * End-to-end check for the a:ea patch (follow-up to borrow-wave Task 3's
 * documented CJK glyph gap, `fonts.ts`'s header comment): the full
 * `generatePptxBlob` pipeline — real pptxgenjs, real `applyEaFontFaces`,
 * no mocked `render-slide`/pptxgenjs — must export a genuine, corrected
 * `<a:ea>` for real CJK content on both a Georgia-heading theme (no CJK
 * glyphs of its own — `<a:ea>` must diverge from `<a:latin>`) and a
 * Microsoft-YaHei-heading theme (already CJK-capable — `<a:ea>` must
 * self-reference `<a:latin>`, per `eaFontFaceFor`'s face-keyed mapping).
 * `pptx-ea-fonts.test.ts` covers the same patch in isolation against a
 * hand-built XML fixture; this is the "it also works through a real theme
 * and real pptxgenjs" integration counterpart, mirroring
 * `generate-gradient-export.test.ts`'s own real-theme integration tests.
 */

function contentSlide(heading: string, paragraph: string, includeCode: boolean): Slide {
  const components: Slide["components"] = [{ type: "paragraph", text: paragraph }]
  if (includeCode) {
    components.push({
      type: "code",
      language: "ts",
      code: "// 中文注释\nconst x = 1",
    } as Slide["components"][number])
  }
  return { type: "content", heading, components }
}

function makeIR(themeId: PptxIR["theme"]["id"], slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "ea-font.pptx",
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

describe("generatePptxBlob CJK east-asian font-slot (a:ea)", () => {
  it("consulting theme (Georgia heading+body, zero CJK glyphs): <a:ea> is corrected to Microsoft YaHei", async () => {
    const { generatePptxBlob } = await import("./generate")
    const ir = makeIR("consulting", [contentSlide("中文标题 CJK Heading", "中文正文 body text 混排", false)])

    const xml = await slideXml(await generatePptxBlob(ir))
    expect(xml).toContain("中文标题 CJK Heading")
    expect(xml).toMatch(/<a:latin typeface="Georgia"[^>]*\/><a:ea typeface="Microsoft YaHei"/)
    expect(xml).not.toContain('<a:ea typeface="Georgia"')
  }, 30000)

  it("tech theme (Microsoft YaHei heading+body): <a:ea> self-references Microsoft YaHei", async () => {
    const { generatePptxBlob } = await import("./generate")
    const ir = makeIR("tech", [contentSlide("中文标题 CJK Heading", "中文正文 body text 混排", false)])

    const xml = await slideXml(await generatePptxBlob(ir))
    expect(xml).toContain("中文标题 CJK Heading")
    expect(xml).toMatch(/<a:latin typeface="Microsoft YaHei"[^>]*\/><a:ea typeface="Microsoft YaHei"/)
  }, 30000)

  it("every theme's Consolas code block: <a:ea> falls back to Microsoft YaHei regardless of the deck's own theme", async () => {
    const { generatePptxBlob } = await import("./generate")
    for (const themeId of ["consulting", "tech"] as const) {
      const ir = makeIR(themeId, [contentSlide("Code", "正文", true)])
      const xml = await slideXml(await generatePptxBlob(ir))
      expect(xml).toContain("// 中文注释")
      expect(xml).toMatch(/<a:latin typeface="Consolas"[^>]*\/><a:ea typeface="Microsoft YaHei"/)
    }
  }, 30000)
})

/**
 * Determinism (same double-render methodology as
 * `generate-gradient-export.test.ts`/`generate-notes-export.test.ts`):
 * `eaFontFaceFor` is a pure function of the latin face alone, and the patch
 * carries no per-shape random/positional state (unlike the gradient patch's
 * pre-fix `objectName`, defect G) — so a CJK deck's two independent renders
 * must still produce byte-identical output.
 */
async function normalizedZipMap(blob: Blob): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const entries = Object.keys(zip.files)
    .filter((p) => !zip.files[p]!.dir && p !== "docProps/core.xml")
    .sort()
  const out: Record<string, string> = {}
  for (const p of entries) out[p] = await zip.files[p]!.async("string")
  return out
}

describe("generatePptxBlob a:ea export determinism", () => {
  it("a CJK deck exports byte-identical slide XML across two renders", async () => {
    const { generatePptxBlob } = await import("./generate")
    const ir = makeIR("consulting", [
      contentSlide("中文标题 CJK Heading", "中文正文 body text 混排", true),
      contentSlide("第二页", "第二段正文", false),
    ])

    const blobA = await generatePptxBlob(ir)
    const blobB = await generatePptxBlob(ir)
    const mapA = await normalizedZipMap(blobA)
    const mapB = await normalizedZipMap(blobB)
    expect(mapA).toEqual(mapB)
  }, 30000)
})
