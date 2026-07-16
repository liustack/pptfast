// @vitest-environment jsdom
//
// Task 5 of the theme redesign hard-deleted ikb-swiss and anthropic-clay
// (tokens + templates) and mapped their ids onto tech / magazine
// respectively (resolveThemeId, themes/index.ts). This guards the
// render path end to end: a full slide rendered under a legacy theme id must
// come out carrying the *new* theme's visual fingerprint, not the deleted
// theme's and not a silent fallback to `custom`.
import { describe, it, expect } from "vitest"
import { slideToSvgMarkup } from "./render-slide"
import type { PptxIR, Slide } from "@/ir"

const contentSlide: Slide = {
  type: "content",
  variant: "single",
  heading: "季度指标回顾",
  blocks: [
    { type: "bullets", items: ["本季度关键指标保持稳定增长。"] },
    { type: "bullets", items: ["成本控制符合预期目标。"] },
  ],
}

function deckWithTheme(themeId: string): { ir: PptxIR; slide: Slide } {
  const ir: PptxIR = {
    version: "2",
    filename: "deck.pptx",
    theme: { id: themeId as PptxIR["theme"]["id"] },
    meta: { organization: "ACME" },
    assets: { images: {} },
    slides: [contentSlide],
  }
  return { ir, slide: contentSlide }
}

describe("legacy theme id rendering (post hard-delete)", () => {
  it("ikb-swiss renders the tech content template (card surface fill)", () => {
    const { ir, slide } = deckWithTheme("ikb-swiss")
    const markup = slideToSvgMarkup(ir, slide, 0)
    // tech's card fill color (TECH_TOKENS.colors.surface) only
    // shows up when the bento card grid actually renders. Task 1 dropped
    // bento's distinct `panel` override, so cards now fall back to
    // `colors.surface`, same as most of the other theme token files.
    expect(markup).toContain("#0A101C")
  })

  it("anthropic-clay renders the journal (ex-magazine) content template (SimSun heading)", () => {
    const { ir, slide } = deckWithTheme("anthropic-clay")
    const markup = slideToSvgMarkup(ir, slide, 0)
    // magazine's heading resolves to SimSun (the ikb tofu lesson: CJK
    // serif headings must use a real CJK-safe face, never a bare Latin stack).
    // The rendered font-family is a preview fallback stack (resolveFontStack);
    // only its first member is what svg2pptx's firstFontFamily exports, so
    // assert on the stack's head rather than an exact single-face string.
    const doc = new DOMParser().parseFromString(markup, "image/svg+xml")
    const heading = Array.from(doc.querySelectorAll("text")).find(
      (t) => t.textContent === slide.heading,
    )!
    expect(heading.getAttribute("font-family")!.split(",")[0].trim()).toBe("SimSun")
  })

  it("tech and journal ids render identically to their legacy aliases", () => {
    const legacyBento = deckWithTheme("ikb-swiss")
    const newBento = deckWithTheme("tech")
    expect(slideToSvgMarkup(legacyBento.ir, legacyBento.slide, 0)).toBe(
      slideToSvgMarkup(newBento.ir, newBento.slide, 0),
    )

    // 2026-07-10 magazine 拆分：anthropic-clay 的人文观感随迁 journal
    // （magazine 已是时尚黑白红新设计，legacy 链不再指向它）。
    const legacyEditorial = deckWithTheme("anthropic-clay")
    const newEditorial = deckWithTheme("journal")
    expect(slideToSvgMarkup(legacyEditorial.ir, legacyEditorial.slide, 0)).toBe(
      slideToSvgMarkup(newEditorial.ir, newEditorial.slide, 0),
    )
  })
})
