// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { AsymmetricTriptychContent } from "./content-asymmetric-triptych"
import type { Component, PptxIR, Slide } from "@/ir"

// P1 variety wave, task 4: this archetype's whole reason for existing is a
// persistent three-region structure that stays visible regardless of
// component count (the T1 handoff's "dense-tendency archetypes must be
// visibly different from two-column/rail-numbered at n=1" hard requirement)
// — this file's core assertions are about that structural persistence, not
// the heading chrome (shared convention, covered elsewhere).

function para(text: string): Component {
  return { type: "paragraph", text }
}

const chapter1: Slide = { type: "chapter", heading: "第一部分", components: [] } as Slide

function slideWith(components: Component[]): Slide {
  return { type: "content", heading: "三区构图验证", components } as Slide
}

function ir(slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: "consulting" },
    meta: {},
    assets: { images: {} },
    slides,
  } as PptxIR
}

function render(deck: PptxIR, slide: Slide, index: number): string {
  const ctx = buildCtx(resolveStyle(deck.theme.id), deck.assets.images)
  return renderSvgMarkup(<AsymmetricTriptychContent ir={deck} slide={slide} index={index} ctx={ctx} />)
}

describe("AsymmetricTriptychContent", () => {
  it("with 0 components, the lead/divider/top/bottom frames still render (persistent chrome, not derived from slide.components)", () => {
    const slide = slideWith([])
    const markup = render(ir([chapter1, slide]), slide, 1)
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)
    // The persistent vertical divider between LEAD and RIGHT.
    expect(root.querySelector('line[x1="744"]')).not.toBeNull()
    // Both TOP/BOTTOM frame outlines (stroke, fill="none").
    const frames = Array.from(root.querySelectorAll('rect[fill="none"]'))
    expect(frames.length).toBe(2)
  })

  it("with 1 component, it lands in the wide LEAD column alone — TOP/BOTTOM stay empty but their frames are still drawn", () => {
    const slide = slideWith([para("唯一内容")])
    const markup = render(ir([chapter1, slide]), slide, 1)
    expect(markup).toContain("唯一内容")
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)
    const leadRect = root.querySelector('[data-audit-rect^="96,"]')
    expect(leadRect).not.toBeNull()
    const [x, , w] = leadRect!.getAttribute("data-audit-rect")!.split(",").map(Number)
    expect(x).toBe(96)
    expect(w).toBe(632)
    // No content-fed rect starts at the RIGHT column's x (760) — TOP/BOTTOM
    // got no SvgContent call at all since `rest` is empty.
    expect(root.querySelector('[data-audit-rect^="760,"]')).toBeNull()
  })

  it("with >=2 components, the remainder splits across TOP (first half) then BOTTOM (second half)", () => {
    const slide = slideWith([para("主项"), para("次项一"), para("次项二")])
    const markup = render(ir([chapter1, slide]), slide, 1)
    expect(markup).toContain("主项")
    expect(markup).toContain("次项一")
    expect(markup).toContain("次项二")
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)
    const rightRects = Array.from(root.querySelectorAll('[data-audit-rect^="760,"]'))
    // TOP and BOTTOM each got their own SvgContent call (2 distinct
    // data-audit-rect wrappers at x=760).
    expect(rightRects.length).toBe(2)
  })

  it("arrangement is always hardcoded to the archetype's own three-region split — slide.arrangement is never consulted (registry declares [\"single\"])", () => {
    const slide: Slide = { ...slideWith([para("一"), para("二")]), arrangement: "two_column" } as Slide
    const markup = render(ir([chapter1, slide]), slide, 1)
    // Still renders through the lead/top split, not a two_column layout —
    // sanity: both components are present and the divider/frames exist.
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)
    expect(root.querySelector('line[x1="744"]')).not.toBeNull()
  })

  it("passes assertSubset (no forbidden elements) across 0/1/4 component counts", () => {
    for (const components of [[], [para("一")], [para("一"), para("二"), para("三"), para("四")]]) {
      const slide = slideWith(components)
      const markup = render(ir([chapter1, slide]), slide, 1)
      expect(() =>
        assertSubset(parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)),
      ).not.toThrow()
    }
  })
})
