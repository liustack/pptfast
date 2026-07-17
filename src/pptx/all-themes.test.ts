import { describe, it, expect } from "vitest"
import { generatePptxBlob } from "./generate"
import { BUILTIN_THEME_IDS, type PptxIR, type Block } from "@/ir"

const blocks: Block[] = [
  { type: "kpi_cards", items: [
    { value: "99.95", unit: "%", label: "可用率", delta: "up" },
    { value: "2,847", label: "运行 Pod" },
  ]},
  { type: "bullets", items: ["第一条", "第二条"] },
  { type: "chart", chart_type: "bar", series: [{ name: "请求", data: [{ x: "M1", y: 8 }, { x: "M2", y: 12 }] }] },
  { type: "flowchart", direction: "TD", nodes: [{ id: "a", label: "入口" }, { id: "b", label: "执行" }], edges: [{ from: "a", to: "b" }] },
  { type: "comparison", columns: ["A", "B"], rows: [{ label: "成本", cells: ["高", "低"] }] },
  { type: "timeline", milestones: [{ date: "Q1", title: "启动" }, { date: "Q2", title: "上线" }] },
  { type: "architecture", layers: [{ title: "接入", items: ["nginx"] }, { title: "服务", items: ["api", "worker"] }] },
  { type: "citation", sources: [{ label: "来源 A", url: "https://example.com" }] },
]

describe("all themes export v2 (download path)", () => {
  for (const id of BUILTIN_THEME_IDS) {
    it(`${id} generates a non-empty blob without throwing`, async () => {
      const ir: PptxIR = {
        version: "3",
        filename: `${id}.pptx`,
        theme: { id },
        meta: {},
        assets: { images: {} },
        slides: [
          { type: "cover", heading: "封面标题", subheading: "副标题", blocks: [] },
          { type: "chapter", heading: "第一章", blocks: [] },
          { type: "content", heading: "数据页", blocks, footnote: "来源：测试" },
          { type: "ending", heading: "Questions", blocks: [] },
        ],
      }
      const blob = await generatePptxBlob(ir)
      expect(blob.size).toBeGreaterThan(1000)
    })
  }
})
