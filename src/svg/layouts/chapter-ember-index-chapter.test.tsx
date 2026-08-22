// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, requiredContrastRatio } from "../ink"
import { EmberIndexChapter, layoutDef } from "./chapter-ember-index-chapter"
import type { PptxIR, Slide } from "@/ir"

const HEADING = "凭什么是我们"
const SUBHEADING = "数据壁垒 · 选品命中率 · 成本结构"

function chapterSlide(heading = HEADING, extras: Partial<Slide> = {}): Slide {
  return { type: "chapter", heading, subheading: SUBHEADING, components: [], ...extras } as Slide
}

function ir(themeId: string, slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "ember-index-chapter.pptx",
    theme: { id: themeId },
    meta: {},
    assets: { images: {} },
    slides,
  } as unknown as PptxIR
}

function chapterCtx(themeId: string) {
  const tokens = resolveStyle(themeId)
  return buildCtx(
    tokens,
    {},
    undefined,
    resolveBackgroundHex(tokens.defaultBackgrounds.chapter, tokens.colors.surface),
  )
}

function renderChapter(themeId: string, s: Slide = chapterSlide(), index = 0, slides?: Slide[]) {
  const tokens = resolveStyle(themeId)
  const deck = ir(themeId, slides ?? [s])
  const ctx = chapterCtx(themeId)
  const markup = renderSvgMarkup(
    <svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
      <EmberIndexChapter ir={deck} slide={s} index={index} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens }
}

describe("chapter-ember-index-chapter — board geometry", () => {
  it("places the fire index, left title, and small corner wedge", () => {
    const { root, tokens } = renderChapter("ember")
    const numeral = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "01")!
    expect(numeral.getAttribute("x")).toBe("96")
    expect(numeral.getAttribute("y")).toBe("300")
    expect(numeral.getAttribute("font-size")).toBe("120")
    expect(numeral.getAttribute("fill")).toBe(tokens.colors.accent)
    const title = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === HEADING)!
    expect(title.getAttribute("x")).toBe("96")
    expect(title.getAttribute("y")).toBe("400")
    expect(title.getAttribute("text-anchor") ?? "start").not.toBe("middle")
    const wedge = root.querySelector("path")!
    expect(wedge.getAttribute("d")?.replace(/\s+/g, "")).toBe("M1120,720L1280,530L1280,720Z")
    expect(wedge.getAttribute("fill")).toBe(tokens.colors.primary)
    expect(wedge.getAttribute("opacity")).toBe("0.9")
  })

  it("keeps the giant numeral fully inside the canvas", () => {
    const { root } = renderChapter("ember")
    const numeral = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "01")!
    const fs = Number(numeral.getAttribute("font-size"))
    const x = Number(numeral.getAttribute("x"))
    const y = Number(numeral.getAttribute("y"))
    expect(x).toBeGreaterThanOrEqual(0)
    expect(y - fs).toBeGreaterThanOrEqual(0)
    expect(y + fs * 0.2).toBeLessThanOrEqual(720)
    expect(x + fs * 1.4).toBeLessThanOrEqual(1280)
  })

  it("uses tokens, not baked hex", () => {
    const { root, tokens } = renderChapter("consulting")
    const fills = new Set(Array.from(root.querySelectorAll("[fill]")).map((el) => el.getAttribute("fill")))
    expect(fills.has(tokens.colors.accent) || fills.has(tokens.colors.primary)).toBe(true)
    expect(root.innerHTML).not.toMatch(/#E56A2C/i)
    expect(root.innerHTML).not.toMatch(/#8A4A22/i)
  })
})

describe("chapter-ember-index-chapter — shared pool", () => {
  it("is pinOnly for chapter, branding none", () => {
    expect(layoutDef.id).toBe("ember-index-chapter")
    expect(layoutDef.kind).toBe("archetype")
    expect(layoutDef.pinOnly).toBe(true)
    expect(layoutDef.branding).toBe("none")
    expect(layoutDef.slideTypes).toEqual(["chapter"])
  })

  it("every text run clears its contrast tier against the chapter background", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, tokens } = renderChapter(themeId)
      const bg = resolveBackgroundHex(tokens.defaultBackgrounds.chapter, tokens.colors.surface)
      for (const el of Array.from(root.querySelectorAll("text"))) {
        const size = Number(el.getAttribute("font-size"))
        const required = el.getAttribute("data-contrast-tier") === "meta" ? 3 : requiredContrastRatio(size)
        expect(contrastRatio(el.getAttribute("fill")!, bg), `${themeId}: ${el.textContent}`).toBeGreaterThanOrEqual(
          required,
        )
      }
    }
  })

  it("emits only export-safe primitives", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      expect(() => assertSubset(renderChapter(themeId).root), themeId).not.toThrow()
    }
  })

  it("renders byte-identically on repeat", () => {
    expect(renderChapter("ember").markup).toBe(renderChapter("ember").markup)
  })

  it("CJK title has no letter-spacing", () => {
    const { root } = renderChapter("ember")
    const title = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === HEADING)!
    expect(title.getAttribute("letter-spacing")).toBeNull()
  })
})
