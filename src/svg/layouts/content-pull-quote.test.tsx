// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { PullQuoteContent, layoutDef } from "./content-pull-quote"
import type { PptxIR, Slide } from "@/ir"

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"
const EN_QUOTE = "A parrot never forgets a face it has chosen to love."
const CJK_QUOTE = "鹦鹉从不忘记一张它决定去爱的脸"
const EN_BODY =
  "Alex could count to six, distinguish seven colors, and ask what color he himself was."

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

describe("layoutDef", () => {
  it("declares pinOnly, chrome none, capacity-1 body, content slide type", () => {
    expect(layoutDef.id).toBe("pull-quote")
    expect(layoutDef.pinOnly).toBe(true)
    expect(layoutDef.chrome).toBe("none")
    expect(layoutDef.slideTypes).toEqual(["content"])
    expect(layoutDef.slots.find((s) => s.name === "body")?.capacity).toBe(1)
  })
})

describe("PullQuoteContent", () => {
  it("CJK quote: italic heading, accent attribution from quote component, muted paragraph body", () => {
    const ctx = buildCtx(resolveStyle("luxe"), {})
    const chapter: Slide = { type: "chapter", heading: "第六章 · 羽毛下的智识", components: [] } as Slide
    const slide: Slide = {
      type: "content",
      layout: "pull-quote",
      heading: CJK_QUOTE,
      components: [
        { type: "paragraph", text: "亚历克斯能数到六，分辨七种颜色，还会问自己是什么颜色。" },
      ],
      subheading: "佩珀伯格",
    } as Slide
    const { markup, root } = render(
      <PullQuoteContent ir={ir("luxe", [chapter, slide])} slide={slide} index={1} ctx={ctx} />,
    )
    expect(markup).toContain(CJK_QUOTE)
    expect(markup).toContain("佩珀伯格")
    expect(markup).toContain("亚历克斯")
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("鹦鹉从不忘记"),
    )!
    expect(heading.getAttribute("font-style")).toBe("italic")
    expect(heading.getAttribute("font-weight")).toBe("400")
    expect(heading.getAttribute("text-anchor")).toBe("middle")
    expect(root.querySelector("g[data-audit-rect]")).toBeNull()
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("English quote + quote.attribution wins over subheading", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const slide: Slide = {
      type: "content",
      layout: "pull-quote",
      heading: EN_QUOTE,
      subheading: "should not appear",
      components: [{ type: "quote", text: EN_QUOTE, attribution: "Irene Pepperberg" }],
    } as Slide
    const { markup } = render(
      <PullQuoteContent ir={ir("consulting", [slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(markup).toContain("IRENE PEPPERBERG")
    expect(markup).not.toContain("should not appear")
    expect(markup).toContain("never forgets")
  })

  it("kicker uppercases a Latin section name from the preceding chapter", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const chapter: Slide = { type: "chapter", heading: "Mind", components: [] } as Slide
    const slide: Slide = {
      type: "content",
      layout: "pull-quote",
      heading: EN_QUOTE,
      components: [{ type: "paragraph", text: EN_BODY }],
    } as Slide
    const { markup } = render(
      <PullQuoteContent ir={ir("consulting", [chapter, slide])} slide={slide} index={1} ctx={ctx} />,
    )
    expect(markup).toContain("MIND")
  })

  it("empty meta fields degrade: no kicker, no attribution, no body, heading remains", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const slide: Slide = { type: "content", layout: "pull-quote", heading: CJK_QUOTE, components: [] } as Slide
    const { root } = render(
      <PullQuoteContent ir={ir("insight", [slide])} slide={slide} index={0} ctx={ctx} />,
    )
    const texts = Array.from(root.querySelectorAll("text"))
    expect(texts.some((t) => (t.textContent ?? "").includes("鹦鹉"))).toBe(true)
    expect(texts.every((t) => (t.textContent ?? "").trim().length > 0)).toBe(true)
  })

  it("pathologically long heading wraps to at most 4 italic lines", () => {
    const ctx = buildCtx(resolveStyle("luxe"), {})
    const slide: Slide = {
      type: "content",
      layout: "pull-quote",
      heading: `${CJK_LONG}${CJK_LONG}`,
      components: [],
    } as Slide
    const { root } = render(
      <PullQuoteContent ir={ir("luxe", [slide])} slide={slide} index={0} ctx={ctx} />,
    )
    const headingTexts = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-style") === "italic",
    )
    expect(headingTexts.length).toBeLessThanOrEqual(4)
    expect(() => assertSubset(root)).not.toThrow()
  })
})
