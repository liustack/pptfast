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
// Single-component symmetry fix (fix round, reviewer Minor-1): this
// fixture is now the n=1 case — narrowed+re-centered, not the full 880
// symmetric rect. Kept for the text-content/centered-header assertions
// below (which don't care about width), but the width-880 test uses a
// dedicated 2-component fixture instead (see `withSubTwoComponents`).
const withSub: Slide = {
  type: "content",
  heading: "静谧留白",
  subheading: "以留白为叙事节奏",
  components: [{ type: "paragraph", text: "正文内容。" }],
} as Slide
const withSubTwoComponents: Slide = {
  type: "content",
  heading: "静谧留白",
  subheading: "以留白为叙事节奏",
  components: [{ type: "paragraph", text: "正文内容一。" }, { type: "paragraph", text: "正文内容二。" }],
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
  it("with 2+ components, the body column is centered with symmetric 200px margins (x=200, w=880 — never narrower than the pool's existing 880px minimum)", () => {
    const markup = render(ir([chapter1, withSubTwoComponents]), withSubTwoComponents, 1)
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)
    const bodyRect = root.querySelector('[data-audit-rect^="200,"]')
    expect(bodyRect).not.toBeNull()
    const [x, , w] = bodyRect!.getAttribute("data-audit-rect")!.split(",").map(Number)
    expect(x).toBe(200)
    expect(w).toBe(880)
    // Symmetric: right margin (1280 - (200+880)) equals the left margin.
    expect(1280 - (x + w)).toBe(x)
  })

  // ── single-component symmetry fix (fix round, reviewer Minor-1) ──

  describe("single-component symmetry fix", () => {
    it("with exactly 1 ordinary component, the body narrows to 640 and re-centers on x=640 (not the flush-left 880 rect that broke the centered-header identity at n=1)", () => {
      const markup = render(ir([chapter1, withSub]), withSub, 1)
      const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)
      // The old x=200 full-width rect must be gone.
      expect(root.querySelector('[data-audit-rect^="200,"]')).toBeNull()
      const bodyRect = root.querySelector('[data-audit-rect^="320,"]')
      expect(bodyRect).not.toBeNull()
      const [x, , w] = bodyRect!.getAttribute("data-audit-rect")!.split(",").map(Number)
      expect(x).toBe(320)
      expect(w).toBe(640)
      // Centered on the same axis as the heading (640).
      expect(x + w / 2).toBe(640)
      // Still wider than the pool's existing 424px two-column-half
      // minimum — no new audit/capacity.ts floor introduced.
      expect(w).toBeGreaterThan(424)
    })

    it("a full-body component (e.g. swot) is exempt — keeps the full 880 rect instead of being cramped to 640", () => {
      const slide: Slide = {
        type: "content",
        heading: "全幅组件",
        components: [
          {
            type: "swot",
            strengths: ["优势一"],
            weaknesses: ["劣势一"],
            opportunities: ["机会一"],
            threats: ["威胁一"],
          },
        ],
      } as Slide
      const markup = render(ir([chapter1, slide]), slide, 1)
      const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)
      const bodyRect = root.querySelector('[data-audit-rect^="200,"]')
      expect(bodyRect).not.toBeNull()
      const [, , w] = bodyRect!.getAttribute("data-audit-rect")!.split(",").map(Number)
      expect(w).toBe(880)
    })

    it("byte-inertness: 2+ components render identically whether or not this fix exists — same markup as the pre-fix single-component-unaware rect formula for n=2", () => {
      // Regression pin: the n>=2 branch's rect is computed the exact same
      // way it always was (x=FRAME_X, w=FRAME_W) — this fix only ever
      // touches the n===1-ordinary-component branch.
      const markup = render(ir([chapter1, withSubTwoComponents]), withSubTwoComponents, 1)
      expect(markup).toContain('data-audit-rect="200,')
      expect(markup).not.toContain('data-audit-rect="320,')
    })
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

  it("passes assertSubset (no forbidden elements) at both n=1 (narrowed) and n=2 (full width)", () => {
    for (const slide of [withSub, withSubTwoComponents]) {
      const markup = render(ir([chapter1, slide]), slide, 1)
      expect(() =>
        assertSubset(parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)),
      ).not.toThrow()
    }
  })
})
