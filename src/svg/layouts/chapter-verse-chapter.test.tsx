// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { VerseChapter, layoutDef } from "./chapter-verse-chapter"
import type { PptxIR, Slide } from "@/ir"

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"

function chapterCtx(themeId: string) {
  const tokens = resolveStyle(themeId)
  return buildCtx(tokens, {}, undefined, resolveBackgroundHex(tokens.defaultBackgrounds.chapter, tokens.colors.surface))
}

function ir(theme: string, slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: theme },
    meta: {},
    assets: { images: {} },
    slides,
  } as unknown as PptxIR
}

function render(body: React.ReactElement): { markup: string; root: Element } {
  const markup = renderSvgMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      {body}
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup) }
}

const chapter1: Slide = {
  type: "chapter",
  layout: "verse-chapter",
  heading: "羽毛下的智识",
  subheading: "亚历克斯还在问颜色",
  components: [],
} as Slide

const chapterEn: Slide = {
  type: "chapter",
  layout: "verse-chapter",
  heading: "The weather of the next century",
  components: [],
} as Slide

describe("layoutDef", () => {
  it("declares pinOnly, chrome none, chapter slide type, no body slot", () => {
    expect(layoutDef.id).toBe("verse-chapter")
    expect(layoutDef.pinOnly).toBe(true)
    expect(layoutDef.chrome).toBe("none")
    expect(layoutDef.slideTypes).toEqual(["chapter"])
    expect(layoutDef.slots.map((s) => s.name)).toEqual(["kicker", "heading", "subheading"])
  })
})

describe("VerseChapter", () => {
  it("CJK chapter: tracking 第 N 章 kicker, centered heading weight 500, italic muted subheading, no watermark", () => {
    const ctx = chapterCtx("luxe")
    const { markup, root } = render(
      <VerseChapter ir={ir("luxe", [chapter1])} slide={chapter1} index={0} ctx={ctx} />,
    )
    expect(markup).toContain("第 1 章")
    expect(markup).toContain("羽毛下的智识")
    expect(markup).toContain("亚历克斯还在问颜色")
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("羽毛下的智识"),
    )!
    expect(heading.getAttribute("text-anchor")).toBe("middle")
    expect(heading.getAttribute("font-weight")).toBe("500")
    expect(heading.getAttribute("font-style")).not.toBe("italic")
    const sub = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("亚历克斯"),
    )!
    expect(sub.getAttribute("font-style")).toBe("italic")
    expect(Array.from(root.querySelectorAll("text")).every((t) => Number(t.getAttribute("font-size")) < 120)).toBe(
      true,
    )
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("Latin heading uses CHAPTER 01 kicker, not 第 N 章", () => {
    const ctx = chapterCtx("consulting")
    const { markup } = render(
      <VerseChapter ir={ir("consulting", [chapterEn])} slide={chapterEn} index={0} ctx={ctx} />,
    )
    expect(markup).toContain("CHAPTER 01")
    expect(markup).not.toContain("第 ")
    expect(markup).toContain("weather")
  })

  it("second chapter in a deck is 第 2 章", () => {
    const ctx = chapterCtx("journal")
    const first: Slide = { type: "chapter", heading: "序章", components: [] } as Slide
    const { markup } = render(
      <VerseChapter ir={ir("journal", [first, chapter1])} slide={chapter1} index={1} ctx={ctx} />,
    )
    expect(markup).toContain("第 2 章")
  })

  it("empty subheading degrades: only kicker + heading", () => {
    const ctx = chapterCtx("insight")
    const slide: Slide = { type: "chapter", layout: "verse-chapter", heading: "羽", components: [] } as Slide
    const { root } = render(<VerseChapter ir={ir("insight", [slide])} slide={slide} index={0} ctx={ctx} />)
    const texts = Array.from(root.querySelectorAll("text"))
    expect(texts).toHaveLength(2)
    expect(texts.every((t) => (t.textContent ?? "").trim().length > 0)).toBe(true)
  })

  it("a long CJK heading wraps to at most 2 lines", () => {
    const ctx = chapterCtx("luxe")
    const slide: Slide = { type: "chapter", layout: "verse-chapter", heading: CJK_LONG, components: [] } as Slide
    const { root } = render(<VerseChapter ir={ir("luxe", [slide])} slide={slide} index={0} ctx={ctx} />)
    const headingTexts = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-weight") === "500",
    )
    expect(headingTexts.length).toBeGreaterThanOrEqual(1)
    expect(headingTexts.length).toBeLessThanOrEqual(2)
    expect(() => assertSubset(root)).not.toThrow()
  })
})
