// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../../serialize"
import { assertSubset } from "../../subset-validate"
import { buildCtx } from "../../full-slide-svg"
import { resolveStyle } from "../../../themes"
import { StatementContent } from "../content-statement"
import { StatHeroContent } from "../content-stat-hero"
import { PullQuoteContent } from "../content-pull-quote"
import type { PptxIR, Slide } from "@/ir"

const VERSE = "设备不会突然坏，只是没人听它说话。"
const QUOTE = "最贵的停机，是没人预料到的那一次。"
const LUXE_GOLD = "#C6A15B"
const LDQ = "\u201C"

function ir(slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: "journal" },
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

describe("journal sparse faces", () => {
  const ctx = buildCtx(resolveStyle("journal"), {})

  it("pull-quote uses a giant text quotation mark, not a path", () => {
    const slide: Slide = {
      type: "content",
      layout: "pull-quote",
      heading: QUOTE,
      subheading: "陈砚清 · 首席技术官",
      components: [],
    } as Slide
    const { markup, root } = render(
      <PullQuoteContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const mark = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === LDQ)!
    expect(mark.getAttribute("x")).toBe("150")
    expect(mark.getAttribute("y")).toBe("300")
    expect(Number(mark.getAttribute("font-size"))).toBe(200)
    expect(mark.getAttribute("fill")).toBe(ctx.colors.accent)
    expect(mark.getAttribute("opacity")).toBe("0.9")
    expect(root.querySelector("path")).toBeNull()
    expect(markup).toContain(LDQ)
    const quote = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("最贵的停机"),
    )!
    expect(quote.getAttribute("x")).toBe("300")
    expect(quote.getAttribute("fill")).toBe(ctx.colors.primary)
    const attr = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("陈砚清"),
    )!
    expect(attr.textContent).toBe("\u2014\u2014 陈砚清 · 首席技术官")
    expect(markup).not.toContain(LUXE_GOLD)
  })

  it("pull-quote draws no em-dash prefix when attribution is missing", () => {
    const slide: Slide = { type: "content", layout: "pull-quote", heading: QUOTE, components: [] } as Slide
    const { markup } = render(
      <PullQuoteContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(markup).not.toContain("\u2014\u2014")
  })

  it("stat-hero kicker is № plus a padded index, never a hardcoded 07", () => {
    const chapter: Slide = { type: "chapter", heading: "运行专栏", components: [] } as Slide
    const slide: Slide = {
      type: "content",
      layout: "stat-hero",
      heading: "43%",
      subheading: "非计划停机时长下降 · 九十日为证",
      components: [],
    } as Slide
    const { root } = render(
      <StatHeroContent ir={ir([chapter, slide])} slide={slide} index={1} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const kicker = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("№"))!
    expect(kicker.textContent).toBe("№ 02 · 运行专栏")
    expect(kicker.getAttribute("letter-spacing")).toBeNull()
    expect(kicker.getAttribute("fill")).toBe(ctx.colors.accent)
    const hero = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("43"))!
    expect(hero.getAttribute("x")).toBe("640")
    expect(hero.getAttribute("y")).toBe("480")
    expect(Number(hero.getAttribute("font-size"))).toBe(300)
    expect(hero.getAttribute("fill")).toBe(ctx.colors.primary)
    const hair = root.querySelector("line")
    expect(hair?.getAttribute("x1")).toBe("500")
    expect(hair?.getAttribute("x2")).toBe("780")
    expect(hair?.getAttribute("y1")).toBe("540")
    expect(hair?.getAttribute("stroke")).toBe(ctx.colors.primary)
  })

  it("statement is a centered lead with The Operations Review stamp", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE, components: [] } as Slide
    const { root } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("设备不会"),
    )!
    expect(heading.getAttribute("x")).toBe("640")
    expect(heading.getAttribute("y")).toBe("350")
    expect(heading.getAttribute("text-anchor")).toBe("middle")
    expect(heading.getAttribute("fill")).toBe(ctx.colors.primary)
    expect(Number(heading.getAttribute("font-size"))).toBe(50)
    const bar = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("width") === "150")
    expect(bar?.getAttribute("x")).toBe("565")
    expect(bar?.getAttribute("y")).toBe("400")
    expect(bar?.getAttribute("height")).toBe("3")
    expect(bar?.getAttribute("fill")).toBe(ctx.colors.accent)
    const stamp = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "The Operations Review")!
    expect(stamp.getAttribute("font-style")).toBe("italic")
    expect(stamp.getAttribute("fill")).toBe(ctx.colors.muted)
  })
})
