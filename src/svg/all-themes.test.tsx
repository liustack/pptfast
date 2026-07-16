// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { slideToSvgMarkup, slideToOps } from "./render-slide"
import { parseSvgRoot } from "./serialize"
import { assertSubset } from "./subset-validate"
import { THEME_IDS, type PptxIR, type Slide, type Block } from "@/ir"

// One content slide exercising every block renderer in a single pass.
const allBlocks: Block[] = [
  { type: "paragraph", text: "本页用于覆盖所有 block 类型的导出往返。" },
  { type: "bullets", items: ["要点一", "要点二"], style: "numbered" },
  { type: "quote", text: "引用一句话。", attribution: "某人" },
  { type: "callout", variant: "tip", text: "提示信息。" },
  { type: "code", language: "ts", code: "const a = 1\nconst b = 2" },
  { type: "kpi_cards", items: [{ value: "42", unit: "%", label: "增长", delta: "up" }] },
  { type: "image", asset_id: "hero", caption: "配图", fit: "cover" },
  {
    type: "chart",
    chart_type: "bar",
    series: [{ name: "s", data: [{ x: "A", y: 3 }, { x: "B", y: 6 }] }],
  },
  {
    type: "flowchart",
    nodes: [{ id: "a", label: "开始" }, { id: "b", label: "结束" }],
    edges: [{ from: "a", to: "b" }],
    direction: "TB",
  },
  { type: "architecture", layers: [{ title: "层一", items: ["x", "y"] }] },
  { type: "timeline", milestones: [{ date: "Q1", title: "里程碑" }] },
  {
    type: "comparison",
    columns: ["甲", "乙"],
    rows: [{ label: "行", cells: ["1", "2"] }],
  },
  { type: "citation", sources: [{ label: "来源", url: "https://e.x" }] },
]

function deck(themeId: (typeof THEME_IDS)[number]): { ir: PptxIR; slides: Slide[] } {
  const slides: Slide[] = [
    { type: "cover", heading: "封面标题", subheading: "副标题", blocks: [] },
    { type: "chapter", heading: "第一章", blocks: [] },
    { type: "content", variant: "single", heading: "正文页", blocks: allBlocks, footnote: "注脚" },
    { type: "ending", heading: "谢谢", blocks: [] },
  ]
  const ir: PptxIR = {
    version: "2",
    filename: "deck.pptx",
    theme: { id: themeId },
    meta: { organization: "ACME", confidentiality: "internal", version: "v1", date: "2026" },
    assets: { images: { hero: { src: "data:image/png;base64,AAAA" } } },
    slides,
  }
  return { ir, slides }
}

describe("single-source export across every theme and slide type", () => {
  for (const themeId of THEME_IDS) {
    it(`${themeId}: every slide is subset-clean and round-trips to ops`, () => {
      const { ir, slides } = deck(themeId)
      slides.forEach((slide, index) => {
        const markup = slideToSvgMarkup(ir, slide, index)
        expect(markup, `${themeId} ${slide.type} has no foreignObject`).not.toContain("foreignObject")
        // every slide stays inside the exportable subset
        expect(() => assertSubset(parseSvgRoot(markup)), `${themeId} ${slide.type} subset`).not.toThrow()
        // and yields drawable ops
        const ops = slideToOps(ir, slide, index)
        expect(ops.length, `${themeId} ${slide.type} ops`).toBeGreaterThan(0)
      })
    })
  }
})
