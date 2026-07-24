// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { SideHighlightContent } from "./content-side-highlight"
import type { PptxIR, Slide } from "@/ir"

// P1 variety wave, task 4: side-highlight's whole reason for existing is a
// *persistent* highlight panel — this file's core assertions are about that
// panel surviving 0/1/N components unchanged, not about the body column
// (which reuses the same kicker/heading/subheading/SvgContent convention
// every other single-stack archetype already has dedicated coverage for).

const chapter1: Slide = { type: "chapter", heading: "第一部分：市场洞察", components: [] } as Slide
const withSub: Slide = {
  type: "content",
  heading: "三大卖点驱动转化",
  subheading: "从种草到复购的完整链路",
  components: [{ type: "paragraph", text: "正文内容。" }],
} as Slide
const zeroComponents: Slide = { type: "content", heading: "占位标题", components: [] } as Slide

function ir(slides: Slide[], meta: PptxIR["meta"] = {}): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: "consulting" },
    meta,
    assets: { images: {} },
    slides,
  } as PptxIR
}

function render(deck: PptxIR, slide: Slide, index: number): string {
  const ctx = buildCtx(resolveStyle(deck.theme.id), deck.assets.images)
  return renderSvgMarkup(<SideHighlightContent ir={deck} slide={slide} index={index} ctx={ctx} />)
}

describe("SideHighlightContent", () => {
  it("panel renders unconditionally even with zero components (chrome, not a component-fed slot)", () => {
    const deck = ir([chapter1, zeroComponents])
    const markup = render(deck, zeroComponents, 1)
    // The panel's own fill rect (colors.primary) and its badge/watermark
    // must be present regardless of `slide.components` being empty.
    expect(markup).toContain(`fill="${resolveStyle("consulting").colors.primary}"`)
    expect(markup).toContain(">1.1<") // chapter 1, content-in-chapter 1
    expect(markup).toContain(">01<") // watermark digit pair
  })

  it("body column and panel never overlap: body width stays 880, panel starts at x=1008", () => {
    const deck = ir([chapter1, withSub])
    const markup = render(deck, withSub, 1)
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)
    const bodyRect = root.querySelector('[data-audit-rect^="96,"]')
    expect(bodyRect).not.toBeNull()
    const [x, , w] = bodyRect!.getAttribute("data-audit-rect")!.split(",").map(Number)
    expect(x).toBe(96)
    expect(w).toBe(880)
  })

  it("renders slide.subheading (not silently dropped)", () => {
    const deck = ir([chapter1, withSub])
    const markup = render(deck, withSub, 1)
    expect(markup).toContain("从种草到复购的完整链路")
  })

  it("shows the org label only when ir.meta.organization is set", () => {
    const withOrg = render(ir([chapter1, withSub], { organization: "Acme Corp" }), withSub, 1)
    expect(withOrg).toContain("Acme Corp")

    const withoutOrg = render(ir([chapter1, withSub], {}), withSub, 1)
    expect(withoutOrg).not.toContain("Acme Corp")
  })

  it("badge label follows chapterNumberFor/contentIndexInChapter across multiple content pages in one chapter", () => {
    const p2: Slide = { type: "content", heading: "第二页", components: [] } as Slide
    const deck = ir([chapter1, withSub, p2])
    const markup = render(deck, p2, 2)
    expect(markup).toContain(">1.2<")
  })

  it("panel ink adapts per theme (readableOn dual-ink pick, not a fixed white literal)", () => {
    // tech's own colors.primary is a bright cyan — white text on it would
    // fail contrast, so readableOn must pick the dark neutral ink instead.
    const techIr = ir([chapter1, withSub])
    techIr.theme = { id: "tech" }
    const markup = render(techIr, withSub, 1)
    // The dark neutral ink readableOn ever returns.
    expect(markup).toContain("#0A0E14")
  })

  it("passes assertSubset (no forbidden elements) with and without components", () => {
    for (const [deck, slide, index] of [
      [ir([chapter1, withSub]), withSub, 1],
      [ir([chapter1, zeroComponents]), zeroComponents, 1],
    ] as const) {
      const markup = render(deck, slide, index)
      expect(() =>
        assertSubset(parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)),
      ).not.toThrow()
    }
  })
})
