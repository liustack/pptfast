// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../../serialize"
import { assertSubset } from "../../subset-validate"
import { buildCtx } from "../../full-slide-svg"
import { resolveStyle } from "../../../themes"
import { StatementContent } from "../content-statement"
import { PullQuoteContent } from "../content-pull-quote"
import { StatHeroContent } from "../content-stat-hero"
import type { PptxIR, Slide } from "@/ir"

const VERSE = "席位不会突然掉，只是没人看它沉默。"
const QUOTE = "最贵的停机，是没人预料到的那一次。"
const LUXE_GOLD = "#C6A15B"
const BAKED_COLOPHON = "丙午夏云觅"

function ir(slides: Slide[], organization?: string): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: "ink" },
    meta: organization ? { organization } : {},
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

describe("ink sparse faces", () => {
  const ctx = buildCtx(resolveStyle("ink"), {})

  it("statement sets CJK vertically from the right, with a vermilion opener", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE, components: [] } as Slide
    const { markup, root } = render(
      <StatementContent ir={ir([slide], "云觅科技")} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    expect(markup).not.toContain("writing-mode")
    const opener = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("width") === "18")
    expect(opener?.getAttribute("x")).toBe("1042")
    expect(opener?.getAttribute("fill")).toBe(ctx.colors.accent)
    const first = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "席")
    expect(first?.getAttribute("x")).toBe("1000")
    expect(first?.getAttribute("y")).toBe("150")
    expect(Number(first?.getAttribute("font-size"))).toBe(52)
    expect(first?.getAttribute("fill")).toBe(ctx.colors.primary)
    expect(Array.from(root.querySelectorAll("text")).some((t) => t.textContent === "，")).toBe(false)
    const org = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "云")
    expect(org?.getAttribute("x")).toBe("180")
    const emptySeal = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("width") === "34")
    expect(emptySeal?.getAttribute("stroke")).toBe(ctx.colors.accent)
    expect(markup).not.toContain(BAKED_COLOPHON)
    expect(markup).not.toContain(LUXE_GOLD)
    const rightmost = Math.max(
      ...Array.from(root.querySelectorAll("text"))
        .filter((t) => (t.textContent ?? "").length === 1)
        .map((t) => Number(t.getAttribute("x"))),
    )
    expect(rightmost).toBeLessThanOrEqual(1000)
  })

  it("statement paints **emphasized** CJK glyphs in accent", () => {
    const slide: Slide = {
      type: "content",
      layout: "statement",
      heading: "席位不会突然掉，只是没人**看它沉默**",
      components: [],
    } as Slide
    const { root } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    const listen = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "看")
    expect(listen?.getAttribute("fill")).toBe(ctx.colors.accent)
    const first = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "席")
    expect(first?.getAttribute("fill")).toBe(ctx.colors.primary)
  })

  it("statement without organization omits the left colophon column", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE, components: [] } as Slide
    const { root } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    const leftCol = Array.from(root.querySelectorAll("text")).filter((t) => t.getAttribute("x") === "180")
    expect(leftCol).toHaveLength(0)
  })

  it("Latin statement stays horizontal and centered", () => {
    const slide: Slide = {
      type: "content",
      layout: "statement",
      heading: "Machines fail in silence.",
      components: [],
    } as Slide
    const { root } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("Machines"),
    )!
    expect(heading.getAttribute("x")).toBe("640")
    expect(heading.getAttribute("text-anchor")).toBe("middle")
  })

  it("stat-hero is a 300px numeral with a baked 验 seal", () => {
    const slide: Slide = {
      type: "content",
      layout: "stat-hero",
      heading: "43%",
      subheading: "订阅续约率同比回升 · 九十日为期",
      components: [],
    } as Slide
    const { markup, root } = render(
      <StatHeroContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const hero = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("43"))!
    expect(hero.getAttribute("x")).toBe("140")
    expect(hero.getAttribute("y")).toBe("480")
    expect(Number(hero.getAttribute("font-size"))).toBe(300)
    expect(hero.getAttribute("fill")).toBe(ctx.colors.primary)
    expect(markup).toContain("验")
    const seal = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("width") === "56")
    expect(seal?.getAttribute("fill")).toBe(ctx.colors.accent)
  })

  it("pull-quote is a side mark plus horizontal Kai type", () => {
    const slide: Slide = {
      type: "content",
      layout: "pull-quote",
      heading: QUOTE,
      subheading: "陈砚清 · 首席技术官",
      components: [],
    } as Slide
    const { root } = render(
      <PullQuoteContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const mark = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("width") === "4")
    expect(mark?.getAttribute("x")).toBe("150")
    expect(mark?.getAttribute("fill")).toBe(ctx.colors.accent)
    const quote = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("最贵的停机"),
    )!
    expect(quote.getAttribute("x")).toBe("200")
    expect(Number(quote.getAttribute("font-size"))).toBe(46)
    expect(quote.getAttribute("fill")).toBe(ctx.colors.primary)
  })
})
