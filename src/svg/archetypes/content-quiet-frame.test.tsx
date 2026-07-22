// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../FullSlideSvg"
import { resolveStyle } from "../../themes"
import { QuietFrameContent } from "./content-quiet-frame"
import type { Slide, PptxIR } from "@/ir"

// P1 variety wave, task 4: quiet-frame's whole reason for existing is a
// symmetric, centered, whitespace-led composition — structurally distinct
// from narrow-column's asymmetric gutter+watermark treatment. This file's
// core assertions are about that symmetry/centering, not the shared
// SvgContent/subheading machinery already covered elsewhere.

const chapter1: Slide = { type: "chapter", heading: "第一部分", components: [] } as Slide
const withSub: Slide = {
  type: "content",
  heading: "静谧留白",
  subheading: "以留白为叙事节奏",
  components: [{ type: "paragraph", text: "正文内容。" }],
} as Slide

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
  return renderSvgMarkup(<QuietFrameContent ir={deck} slide={slide} index={index} ctx={ctx} />)
}

describe("QuietFrameContent", () => {
  it("body column is centered with symmetric 200px margins (x=200, w=880 — never narrower than the pool's existing 880px minimum)", () => {
    const markup = render(ir([chapter1, withSub]), withSub, 1)
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)
    const bodyRect = root.querySelector('[data-audit-rect^="200,"]')
    expect(bodyRect).not.toBeNull()
    const [x, , w] = bodyRect!.getAttribute("data-audit-rect")!.split(",").map(Number)
    expect(x).toBe(200)
    expect(w).toBe(880)
    // Symmetric: right margin (1280 - (200+880)) equals the left margin.
    expect(1280 - (x + w)).toBe(x)
  })

  it("kicker/heading/subheading are all center-anchored (text-anchor=middle) — narrow-column's own kicker/heading are left-anchored, a genuine geometric difference", () => {
    const withKicker = ir([chapter1, withSub])
    const markup = render(withKicker, withSub, 1)
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)
    const centered = Array.from(root.querySelectorAll('text[text-anchor="middle"]'))
    // kicker + 1 heading line + subheading = at least 3 centered text nodes.
    expect(centered.length).toBeGreaterThanOrEqual(3)
    for (const t of centered) expect(t.getAttribute("x")).toBe("640")
  })

  it("renders slide.subheading (not silently dropped)", () => {
    const markup = render(ir([chapter1, withSub]), withSub, 1)
    expect(markup).toContain("以留白为叙事节奏")
  })

  it("arrangement passes through unchanged (registry declares \"all\") — two_column actually splits the centered body", () => {
    const slide: Slide = {
      type: "content",
      heading: "两栏留白",
      arrangement: "two_column",
      components: [{ type: "paragraph", text: "左" }, { type: "paragraph", text: "右" }],
    } as Slide
    const markup = render(ir([chapter1, slide]), slide, 1)
    expect(markup).toContain("左")
    expect(markup).toContain("右")
  })

  it("passes assertSubset (no forbidden elements)", () => {
    const markup = render(ir([chapter1, withSub]), withSub, 1)
    expect(() =>
      assertSubset(parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)),
    ).not.toThrow()
  })
})
