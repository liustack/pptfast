// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, readableOn, requiredContrastRatio } from "../ink"
import { BlockNumeralChapter, layoutDef } from "./chapter-block-numeral-chapter"
import type { PptxIR, Slide } from "@/ir"

function chapter(heading: string, extras: Partial<Slide> = {}): Slide {
  return { type: "chapter", heading, components: [], ...extras } as Slide
}

function ir(themeId: string, slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "block-numeral-chapter.pptx",
    theme: { id: themeId },
    meta: {},
    assets: { images: {} },
    slides,
  } as unknown as PptxIR
}

function chapterCtx(themeId: string) {
  const tokens = resolveStyle(themeId)
  return {
    tokens,
    ctx: buildCtx(
      tokens,
      {},
      undefined,
      resolveBackgroundHex(tokens.defaultBackgrounds.chapter, tokens.colors.surface),
    ),
  }
}

function renderChapter(themeId: string, slides: Slide[], index: number) {
  const { tokens, ctx } = chapterCtx(themeId)
  const s = slides[index]!
  const markup = renderSvgMarkup(
    <svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
      <BlockNumeralChapter ir={ir(themeId, slides)} slide={s} index={index} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens }
}

const FOUR: Slide[] = [
  chapter("门店与运营", { subheading: "门店焕新 · 自有品牌 · 会员体系" }),
  chapter("商品与供应链"),
  chapter("会员与增长"),
  chapter("组织与机制"),
]

describe("chapter-block-numeral-chapter — board geometry", () => {
  it("paints a square primary numeral block with the number inside, matching board coordinates", () => {
    const { root, tokens } = renderChapter("enterprise", FOUR, 0)
    const block = Array.from(root.querySelectorAll("rect")).find(
      (r) => r.getAttribute("width") === "132" && r.getAttribute("height") === "132",
    )
    expect(block?.getAttribute("x")).toBe("96")
    expect(block?.getAttribute("y")).toBe("264")
    expect(block?.getAttribute("fill")).toBe(tokens.colors.primary)
    const num = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "01")!
    expect(num.getAttribute("x")).toBe("162")
    expect(num.getAttribute("y")).toBe("352")
    expect(num.getAttribute("text-anchor")).toBe("middle")
    expect(num.getAttribute("font-size")).toBe("56")
    expect(num.getAttribute("fill")).toBe(readableOn(tokens.colors.primary))
  })

  it("places the heading to the right of the block and leaves the number inside the square", () => {
    const { root } = renderChapter("enterprise", FOUR, 0)
    const title = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("门店与运营"),
    )!
    expect(title.getAttribute("x")).toBe("272")
    expect(title.getAttribute("y")).toBe("330")
    expect(title.getAttribute("text-anchor")).not.toBe("middle")
    const num = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "01")!
    expect(Number(num.getAttribute("x"))).toBeGreaterThan(96)
    expect(Number(num.getAttribute("x"))).toBeLessThan(96 + 132)
  })

  it("draws a four-segment midground tick rule and fills through the current chapter", () => {
    const { root, tokens } = renderChapter("enterprise", FOUR, 1)
    expect(Array.from(root.querySelectorAll("text")).some((t) => t.textContent === "02")).toBe(true)
    const mid = root.querySelector("g[data-depth='mid']")
    expect(mid).toBeTruthy()
    const lines = Array.from(mid!.querySelectorAll("line"))
    expect(lines.length).toBeGreaterThanOrEqual(6)
    const progress = lines.find(
      (l) => l.getAttribute("stroke") === tokens.colors.primary && l.getAttribute("x2") === "640",
    )
    expect(progress).toBeTruthy()
    expect(progress?.getAttribute("y1")).toBe("560")
  })

  it("does not paint a full-bleed field of its own", () => {
    const { root } = renderChapter("enterprise", FOUR, 0)
    expect(root.querySelector("rect[width='1280']")).toBeNull()
  })
})

describe("chapter-block-numeral-chapter — shared pool", () => {
  it("is registered as a pinOnly chapter layout", () => {
    expect(layoutDef.id).toBe("block-numeral-chapter")
    expect(layoutDef.kind).toBe("archetype")
    expect(layoutDef.pinOnly).toBe(true)
    expect(layoutDef.slideTypes).toEqual(["chapter"])
  })

  it("every text run clears its contrast tier against the surface it sits on", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, tokens } = renderChapter(themeId, FOUR, 0)
      const pageBg = resolveBackgroundHex(tokens.defaultBackgrounds.chapter, tokens.colors.surface)
      const field = tokens.colors.primary
      for (const el of Array.from(root.querySelectorAll("text"))) {
        const size = Number(el.getAttribute("font-size"))
        const fill = el.getAttribute("fill")!
        const bg = el.textContent && /^\d{2}$/.test(el.textContent) ? field : pageBg
        expect(contrastRatio(fill, bg), `${themeId}: ${el.textContent}`).toBeGreaterThanOrEqual(
          requiredContrastRatio(size),
        )
      }
    }
  })

  it("uses tokens, not a baked enterprise hex, when another theme borrows it", () => {
    const { markup, tokens } = renderChapter("tech", FOUR, 0)
    expect(markup).toContain(tokens.colors.primary)
    expect(markup).not.toContain("#0032A0")
    expect(markup).not.toContain("#2F6FBF")
    expect(markup).not.toContain("#F7F7F4")
  })

  it("emits only export-safe primitives", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      expect(() => assertSubset(renderChapter(themeId, FOUR, 0).root), themeId).not.toThrow()
    }
  })

  it("renders byte-identically on repeat", () => {
    expect(renderChapter("enterprise", FOUR, 0).markup).toBe(renderChapter("enterprise", FOUR, 0).markup)
  })

  it("CJK title has no letter-spacing", () => {
    const { root } = renderChapter("enterprise", FOUR, 0)
    const title = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("门店"),
    )!
    expect(title.getAttribute("letter-spacing")).toBeNull()
  })

  it("tick leaves stay inside the canvas", () => {
    const { root } = renderChapter("enterprise", FOUR, 3)
    for (const l of Array.from(root.querySelectorAll("line"))) {
      for (const attr of ["x1", "x2", "y1", "y2"] as const) {
        const v = Number(l.getAttribute(attr))
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(attr.startsWith("x") ? 1280 : 720)
      }
    }
  })
})
