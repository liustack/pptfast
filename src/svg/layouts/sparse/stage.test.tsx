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

const VERSE = "设备不会突然坏，只是没人**听它说话**。"
const VERSE_PLAIN = "设备不会突然坏，只是没人听它说话。"
const QUOTE = "最贵的停机，是没人预料到的那一次。"
const LUXE_GOLD = "#C6A15B"
const BOARD_TEXT = "#EDEAE4"

function ir(slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: "stage" },
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

describe("stage sparse faces", () => {
  const ctx = buildCtx(resolveStyle("stage"), {})

  it("statement is centered light type with a border hairline, accent only on **runs**", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE, components: [] } as Slide
    const { markup, root } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("设备不会"),
    )!
    expect(heading.getAttribute("x")).toBe("640")
    expect(heading.getAttribute("text-anchor")).toBe("middle")
    expect(heading.getAttribute("font-weight")).toBe("400")
    expect(heading.getAttribute("font-style")).not.toBe("italic")
    expect(Number(heading.getAttribute("font-size"))).toBe(64)
    expect(heading.getAttribute("fill")).toBe(ctx.colors.text)
    expect(heading.textContent).toMatch(/，$/)
    const em = Array.from(root.querySelectorAll("tspan")).find((t) => t.textContent === "听它说话")
    expect(em?.getAttribute("fill")).toBe(ctx.colors.accent)
    const hair = root.querySelector("line")
    expect(hair?.getAttribute("x1")).toBe("616")
    expect(hair?.getAttribute("x2")).toBe("664")
    expect(hair?.getAttribute("y1")).toBe("484")
    expect(hair?.getAttribute("stroke")).toBe(ctx.colors.border)
    expect(markup).not.toContain(LUXE_GOLD)
    expect(markup).not.toContain(BOARD_TEXT)
  })

  it("statement without ** keeps the whole verse on text fill", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE_PLAIN, components: [] } as Slide
    const { root } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("听它说话"),
    )!
    expect(heading.getAttribute("fill")).toBe(ctx.colors.text)
    expect(heading.querySelector("tspan")).toBeNull()
  })

  it("stat-hero centers a 300px numeral and splits a trailing % into accent", () => {
    const slide: Slide = {
      type: "content",
      layout: "stat-hero",
      heading: "43%",
      subheading: "试点产线 · 90 天",
      components: [],
    } as Slide
    const { root } = render(
      <StatHeroContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const hero = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("43"))!
    expect(hero.getAttribute("x")).toBe("640")
    expect(hero.getAttribute("y")).toBe("480")
    expect(hero.getAttribute("text-anchor")).toBe("middle")
    expect(hero.getAttribute("font-weight")).toBe("400")
    expect(Number(hero.getAttribute("font-size"))).toBe(300)
    const pct = Array.from(hero.querySelectorAll("tspan")).find((t) => t.textContent === "%")
    expect(pct?.getAttribute("font-size")).toBe("150")
    expect(pct?.getAttribute("fill")).toBe(ctx.colors.accent)
    expect(root.textContent).toContain("试点产线")
  })

  it("pull-quote sandwiches the line between two border hairlines", () => {
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
    const lines = Array.from(root.querySelectorAll("line"))
    expect(lines).toHaveLength(2)
    expect(lines[0]?.getAttribute("x1")).toBe("240")
    expect(lines[0]?.getAttribute("x2")).toBe("1040")
    expect(lines[0]?.getAttribute("y1")).toBe("230")
    expect(lines[1]?.getAttribute("y1")).toBe("420")
    const quote = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("最贵的停机"),
    )!
    expect(quote.getAttribute("x")).toBe("640")
    expect(quote.getAttribute("y")).toBe("360")
    expect(Number(quote.getAttribute("font-size"))).toBe(46)
    expect(quote.getAttribute("font-weight")).toBe("400")
    const attr = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("陈砚清"),
    )!
    expect(attr.getAttribute("x")).toBe("1040")
    expect(attr.getAttribute("text-anchor")).toBe("end")
    expect(attr.getAttribute("fill")).toBe(ctx.colors.muted)
  })
})
