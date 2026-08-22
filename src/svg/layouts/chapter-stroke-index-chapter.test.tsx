// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { accessibleInk, contrastRatio, requiredContrastRatio } from "../ink"
import { countDecorPieces } from "../motifs/decor-budget"
import { StrokeIndexChapter, layoutDef } from "./chapter-stroke-index-chapter"
import type { PptxIR, Slide } from "@/ir"

const TECH_HEX = ["#0A0F1E", "#121A30", "#14294A", "#53E0D2", "#EAF1FA", "#93A5C0", "#24304A"]

const chapters: Slide[] = [
  { type: "chapter", heading: "召回为什么要拆三层", components: [] } as Slide,
  { type: "content", heading: "中间页", components: [] } as Slide,
  { type: "chapter", heading: "特征回流怎么压延迟", components: [] } as Slide,
  { type: "content", heading: "中间页", components: [] } as Slide,
  {
    type: "chapter",
    heading: "推理为什么敢上主站",
    subheading: "特征回流 · 边缘缓存 · 降级策略",
    components: [],
  } as Slide,
  { type: "content", heading: "中间页", components: [] } as Slide,
  { type: "chapter", heading: "发布窗口", components: [] } as Slide,
]

function ir(themeId: string, slides: Slide[] = chapters): PptxIR {
  return {
    version: "4",
    filename: "stroke-index-chapter.pptx",
    theme: { id: themeId },
    meta: {},
    assets: { images: {} },
    slides,
  } as unknown as PptxIR
}

function renderChapter(themeId: string, slideIndex = 4, slides: Slide[] = chapters) {
  const tokens = resolveStyle(themeId)
  const ctx = buildCtx(
    tokens,
    {},
    undefined,
    resolveBackgroundHex(tokens.defaultBackgrounds.chapter, tokens.colors.surface),
  )
  const s = slides[slideIndex]!
  const markup = renderSvgMarkup(
    <svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
      <StrokeIndexChapter ir={ir(themeId, slides)} slide={s} index={slideIndex} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens }
}

function textPaint(el: Element): string {
  const fill = el.getAttribute("fill")
  if (fill && fill !== "none") return fill
  return el.getAttribute("stroke") ?? ""
}

describe("chapter-stroke-index-chapter — board geometry", () => {
  it("draws a hollow stroked index at the board coordinates", () => {
    const { root, tokens } = renderChapter("tech")
    const numeral = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "03")
    const chapterBg = resolveBackgroundHex(tokens.defaultBackgrounds.chapter, tokens.colors.surface)
    const numberInk = accessibleInk(tokens.colors.accent, chapterBg, 110)
    expect(numeral).toBeTruthy()
    expect(numeral?.getAttribute("x")).toBe("96")
    expect(numeral?.getAttribute("y")).toBe("316")
    expect(numeral?.getAttribute("font-size")).toBe("110")
    expect(numeral?.getAttribute("fill")).toBe(numberInk)
    expect(numeral?.getAttribute("stroke")).toBe(numberInk)
    expect(numeral?.getAttribute("stroke-width")).toBe("1.5")
  })

  it("places the title and subheading under the index", () => {
    const { root } = renderChapter("tech")
    const title = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("推理为什么敢上主站"))
    expect(title?.getAttribute("x")).toBe("96")
    expect(title?.getAttribute("y")).toBe("414")
    expect(title?.getAttribute("font-size")).toBe("52")
    const sub = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("特征回流"))
    expect(sub?.getAttribute("y")).toBe("466")
  })

  it("draws a border rule with an accent progress segment at 3/4", () => {
    const { root, tokens } = renderChapter("tech")
    const lines = Array.from(root.querySelectorAll("line"))
    expect(lines).toHaveLength(2)
    const border = lines.find((l) => l.getAttribute("stroke") === tokens.colors.border)
    const accent = lines.find((l) => l.getAttribute("stroke") === tokens.colors.accent)
    expect(border?.getAttribute("x1")).toBe("96")
    expect(border?.getAttribute("x2")).toBe("1184")
    expect(border?.getAttribute("y1")).toBe("560")
    expect(border?.getAttribute("stroke-width")).toBe("1")
    expect(accent?.getAttribute("x1")).toBe("96")
    expect(accent?.getAttribute("x2")).toBe("912")
    expect(accent?.getAttribute("y1")).toBe("560")
    expect(accent?.getAttribute("stroke-width")).toBe("2")
  })

  it("counts two decoration pieces (index + progress rule)", () => {
    const { root } = renderChapter("tech")
    expect(countDecorPieces(root)).toBe(2)
  })

  it("keeps the hollow index glyph box inside the canvas", () => {
    const { root } = renderChapter("tech")
    const numeral = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "03")!
    const x = Number(numeral.getAttribute("x"))
    const y = Number(numeral.getAttribute("y"))
    const size = Number(numeral.getAttribute("font-size"))
    expect(x).toBeGreaterThanOrEqual(0)
    expect(y - size).toBeGreaterThanOrEqual(0)
    expect(x + size * 1.3).toBeLessThanOrEqual(1280)
    expect(y + size * 0.2).toBeLessThanOrEqual(720)
  })
})

describe("chapter-stroke-index-chapter — shared pool", () => {
  it("is a pinOnly chapter archetype named by composition, not theme", () => {
    expect(layoutDef.id).toBe("stroke-index-chapter")
    expect(layoutDef.kind).toBe("archetype")
    expect(layoutDef.pinOnly).toBe(true)
    expect(layoutDef.slideTypes).toEqual(["chapter"])
  })

  it("every filled text run clears its contrast tier against the chapter background", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, tokens } = renderChapter(themeId)
      const bg = resolveBackgroundHex(tokens.defaultBackgrounds.chapter, tokens.colors.surface)
      for (const el of Array.from(root.querySelectorAll("text"))) {
        const paint = textPaint(el)
        if (!paint) continue
        const size = Number(el.getAttribute("font-size"))
        const required = el.getAttribute("data-contrast-tier") === "meta" ? 3 : requiredContrastRatio(size)
        expect(contrastRatio(paint, bg), `${themeId}: ${el.textContent}`).toBeGreaterThanOrEqual(required)
      }
    }
  })

  it("emits only export-safe primitives", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      expect(() => assertSubset(renderChapter(themeId).root), themeId).not.toThrow()
    }
  })

  it("renders byte-identically on repeat", () => {
    expect(renderChapter("tech").markup).toBe(renderChapter("tech").markup)
  })

  it("uses tokens, not baked tech hex, when another theme renders it", () => {
    const { markup, tokens } = renderChapter("consulting")
    expect(markup).toContain(tokens.colors.accent)
    expect(markup).toContain(tokens.colors.border)
    for (const hex of TECH_HEX) {
      expect(markup, `tech token ${hex} leaked`).not.toContain(hex)
    }
  })
})
