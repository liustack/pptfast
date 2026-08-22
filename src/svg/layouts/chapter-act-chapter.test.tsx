// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, requiredContrastRatio } from "../ink"
import { ActChapter, layoutDef } from "./chapter-act-chapter"
import type { PptxIR, Slide } from "@/ir"

const HEADING = "内容打法"
const SUBHEADING = "短视频 · 直播 · 案例长文的分工"

function chapterSlide(heading = HEADING, extras: Partial<Slide> = {}): Slide {
  return { type: "chapter", heading, subheading: SUBHEADING, components: [], ...extras } as Slide
}

function ir(themeId: string, slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "act-chapter.pptx",
    theme: { id: themeId },
    meta: {},
    assets: { images: {} },
    slides,
  } as unknown as PptxIR
}

function renderChapter(themeId: string, slides: Slide[] = [chapterSlide()], index = 0) {
  const tokens = resolveStyle(themeId)
  const ctx = buildCtx(
    tokens,
    {},
    undefined,
    resolveBackgroundHex(tokens.defaultBackgrounds.chapter, tokens.colors.surface),
  )
  const s = slides[index]!
  const markup = renderSvgMarkup(
    <svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
      <ActChapter ir={ir(themeId, slides)} slide={s} index={index} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens, ctx }
}

describe("layoutDef", () => {
  it("declares pinOnly act-chapter on chapter, branding none, no body slot", () => {
    expect(layoutDef.id).toBe("act-chapter")
    expect(layoutDef.kind).toBe("archetype")
    expect(layoutDef.pinOnly).toBe(true)
    expect(layoutDef.branding).toBe("none")
    expect(layoutDef.slideTypes).toEqual(["chapter"])
    expect(layoutDef.slots.map((s) => s.name)).toEqual(["kicker", "heading", "subheading"])
  })
})

describe("chapter-act-chapter — board geometry", () => {
  it("places mirrored accent bars around the act kicker at the board coordinates", () => {
    const { root, tokens } = renderChapter("campaign")
    expect(Array.from(root.querySelectorAll("text")).some((t) => t.textContent === "第一幕")).toBe(true)
    const act = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "第一幕")!
    expect(act.getAttribute("x")).toBe("640")
    expect(act.getAttribute("y")).toBe("298")
    expect(act.getAttribute("text-anchor")).toBe("middle")
    const bars = Array.from(root.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("width") === "28" && r.getAttribute("height") === "4",
    )
    expect(bars).toHaveLength(2)
    expect(bars[0]!.getAttribute("fill")).toBe(tokens.colors.accent)
    expect(bars[1]!.getAttribute("fill")).toBe(tokens.colors.accent)
    expect(bars.every((b) => b.getAttribute("y") === "286")).toBe(true)
    const xs = bars.map((b) => Number(b.getAttribute("x"))).sort((a, b) => a - b)
    expect(xs[0]!).toBeLessThan(640)
    expect(xs[1]!).toBeGreaterThan(640)
    expect(640 - (xs[0]! + 28)).toBe(xs[1]! - 640)
    expect(xs[0]).toBe(530)
    expect(xs[1]).toBe(722)
  })

  it("centers the heading on the mirror axis at the board baseline", () => {
    const { root } = renderChapter("campaign")
    const heading = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === HEADING)!
    expect(heading.getAttribute("x")).toBe("640")
    expect(heading.getAttribute("y")).toBe("392")
    expect(heading.getAttribute("text-anchor")).toBe("middle")
    expect(heading.getAttribute("font-weight")).toBe("700")
    expect(Number(heading.getAttribute("font-size"))).toBeGreaterThanOrEqual(32)
  })

  it("second chapter in a deck is 第二幕", () => {
    const first = chapterSlide("开场")
    const second = chapterSlide(HEADING)
    const { markup } = renderChapter("campaign", [first, second], 1)
    expect(markup).toContain("第二幕")
    expect(markup).not.toContain("第一幕")
  })

  it("Latin heading uses ACT N, not 第 N 幕", () => {
    const slide = chapterSlide("Content playbook")
    const { markup } = renderChapter("consulting", [slide])
    expect(markup).toContain("ACT 1")
    expect(markup).not.toContain("第")
  })

  it("empty subheading degrades to kicker + heading + bars", () => {
    const slide = chapterSlide(HEADING, { subheading: undefined })
    const { root } = renderChapter("campaign", [slide])
    const texts = Array.from(root.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).toContain("第一幕")
    expect(texts).toContain(HEADING)
    expect(texts).toHaveLength(2)
    expect(root.querySelectorAll("rect")).toHaveLength(2)
  })
})

describe("chapter-act-chapter — shared pool", () => {
  it("every text run clears its contrast tier against the chapter background", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, tokens } = renderChapter(themeId)
      const bg = resolveBackgroundHex(tokens.defaultBackgrounds.chapter, tokens.colors.surface)
      for (const el of Array.from(root.querySelectorAll("text"))) {
        const size = Number(el.getAttribute("font-size"))
        expect(contrastRatio(el.getAttribute("fill")!, bg), `${themeId}: ${el.textContent}`).toBeGreaterThanOrEqual(
          requiredContrastRatio(size),
        )
      }
    }
  })

  it("emits only export-safe primitives and no baked campaign hex under another theme", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, markup } = renderChapter(themeId)
      expect(() => assertSubset(root), themeId).not.toThrow()
      if (themeId !== "campaign") {
        expect(markup, themeId).not.toContain("#E84F8A")
        expect(markup, themeId).not.toContain("#2A1E3F")
      }
    }
  })

  it("renders byte-identically on repeat", () => {
    expect(renderChapter("campaign").markup).toBe(renderChapter("campaign").markup)
  })

  it("CJK title has no letter-spacing", () => {
    const { root } = renderChapter("campaign")
    const heading = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === HEADING)!
    expect(heading.getAttribute("letter-spacing")).toBeNull()
  })
})
