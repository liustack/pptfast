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

function ir(slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: "heritage" },
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

describe("heritage sparse faces", () => {
  const ctx = buildCtx(resolveStyle("heritage"), {})

  it("pull-quote sits between burgundy double rules with a caramel underline", () => {
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
    const lines = Array.from(root.querySelectorAll("line"))
    expect(lines.some((l) => l.getAttribute("y1") === "80" && l.getAttribute("stroke-width") === "2")).toBe(true)
    expect(lines.some((l) => l.getAttribute("y1") === "88" && l.getAttribute("stroke-width") === "1")).toBe(true)
    expect(lines.every((l) => l.getAttribute("stroke") === ctx.colors.primary)).toBe(true)
    const quote = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("最贵的停机"),
    )!
    expect(quote.getAttribute("x")).toBe("640")
    expect(quote.getAttribute("y")).toBe("340")
    expect(quote.getAttribute("text-anchor")).toBe("middle")
    expect(quote.getAttribute("fill")).toBe(ctx.colors.primary)
    expect(Number(quote.getAttribute("font-size"))).toBe(48)
    const bar = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("width") === "144")
    expect(bar?.getAttribute("x")).toBe("568")
    expect(bar?.getAttribute("y")).toBe("392")
    expect(bar?.getAttribute("height")).toBe("3")
    expect(bar?.getAttribute("fill")).toBe(ctx.colors.accent)
    expect(markup).not.toContain(LUXE_GOLD)
  })

  it("statement uses L florets and left burgundy type", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE, components: [] } as Slide
    const { root } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const florets = Array.from(root.querySelectorAll("path"))
    expect(florets.map((p) => p.getAttribute("d"))).toEqual([
      "M 96 120 l 40 0 M 96 120 l 0 40",
      "M 1184 600 l -40 0 M 1184 600 l 0 -40",
    ])
    expect(florets.every((p) => p.getAttribute("stroke") === ctx.colors.accent)).toBe(true)
    expect(florets.every((p) => p.getAttribute("fill") === "none")).toBe(true)
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("设备不会"),
    )!
    expect(heading.getAttribute("x")).toBe("96")
    expect(heading.getAttribute("y")).toBe("350")
    expect(heading.getAttribute("fill")).toBe(ctx.colors.primary)
    expect(Number(heading.getAttribute("font-size"))).toBe(56)
  })

  it("stat-hero is a centered burgundy numeral between double rules", () => {
    const slide: Slide = {
      type: "content",
      layout: "stat-hero",
      heading: "43%",
      subheading: "订阅续约率同比回升 · 九十日",
      components: [],
    } as Slide
    const { root } = render(
      <StatHeroContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const hero = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("43"))!
    expect(hero.getAttribute("x")).toBe("640")
    expect(hero.getAttribute("y")).toBe("470")
    expect(hero.getAttribute("text-anchor")).toBe("middle")
    expect(Number(hero.getAttribute("font-size"))).toBe(280)
    expect(hero.getAttribute("fill")).toBe(ctx.colors.primary)
    const lines = Array.from(root.querySelectorAll("line"))
    expect(lines.some((l) => l.getAttribute("y1") === "180" && l.getAttribute("x1") === "240")).toBe(true)
    expect(lines.some((l) => l.getAttribute("y1") === "534")).toBe(true)
  })
})
