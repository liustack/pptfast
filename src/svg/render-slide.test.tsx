// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { slideToOps, slideToSvgMarkup } from "./render-slide"
import { SLIDE_W_IN, SLIDE_H_IN } from "../constants"
import type { PptxIR, Slide } from "@/ir"

const slide: Slide = {
  type: "content",
  variant: "single",
  heading: "导出验证",
  blocks: [
    { type: "paragraph", text: "段落用于导出 ops。" },
    { type: "bullets", items: ["甲", "乙"] },
  ],
}

// Mirror the exporter: the slide is a member of ir.slides at `index`.
const ir: PptxIR = {
  version: "3",
  filename: "deck.pptx",
  style: { id: "academic" },
  meta: { organization: "ACME" },
  assets: { images: {} },
  slides: [slide],
}

describe("slideToOps export entry", () => {
  it("produces a markup string with no foreignObject", () => {
    const markup = slideToSvgMarkup(ir, slide, 0)
    expect(markup).toContain("<svg")
    expect(markup).not.toContain("foreignObject")
  })

  it("produces in-bounds pptxgenjs ops including text", () => {
    const ops = slideToOps(ir, slide, 0)
    expect(ops.length).toBeGreaterThan(3)
    expect(new Set(ops.map((o) => o.kind)).has("text")).toBe(true)
    for (const op of ops) {
      expect(op.x).toBeGreaterThanOrEqual(0)
      expect(op.x).toBeLessThanOrEqual(SLIDE_W_IN)
    }
  })

  it("keeps a tall flowchart slide within the slide height (no overflow)", () => {
    const flowSlide: Slide = {
      type: "content",
      variant: "single",
      heading: "流程",
      blocks: [
        {
          type: "flowchart",
          direction: "TB",
          nodes: [
            { id: "a", label: "甲" },
            { id: "b", label: "乙" },
            { id: "c", label: "丙" },
            { id: "d", label: "丁" },
            { id: "e", label: "戊" },
            { id: "f", label: "己" },
          ],
          edges: [
            { from: "a", to: "b" },
            { from: "b", to: "c" },
            { from: "c", to: "d" },
            { from: "d", to: "e" },
            { from: "e", to: "f" },
          ],
        },
      ],
    }
    const doc: PptxIR = { ...ir, slides: [flowSlide] }
    const ops = slideToOps(doc, flowSlide, 0)
    for (const op of ops) {
      const bottom = op.y + ("h" in op ? op.h : 0)
      expect(bottom, `op ${op.kind} bottom=${bottom}in overflows slide`).toBeLessThanOrEqual(SLIDE_H_IN + 0.1)
    }
  })
})
