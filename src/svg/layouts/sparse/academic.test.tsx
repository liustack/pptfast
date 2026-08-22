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
const BOARD_INK = "#22251F"

function ir(slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: "academic" },
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

describe("academic sparse faces", () => {
  const ctx = buildCtx(resolveStyle("academic"), {})

  it("pull-quote adds a [1] tspan with dy=-18 only when attribution exists", () => {
    const slide: Slide = {
      type: "content",
      layout: "pull-quote",
      heading: QUOTE,
      subheading: "陈砚清，运维成本年度复盘，2026",
      components: [],
    } as Slide
    const { markup, root } = render(
      <PullQuoteContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const bar = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("width") === "6")
    expect(bar?.getAttribute("x")).toBe("96")
    expect(bar?.getAttribute("y")).toBe("240")
    expect(bar?.getAttribute("height")).toBe("220")
    expect(bar?.getAttribute("fill")).toBe(ctx.colors.primary)
    const mark = Array.from(root.querySelectorAll("tspan")).find((t) => t.textContent === "[1]")
    expect(mark?.getAttribute("dy")).toBe("-18")
    expect(mark?.getAttribute("fill")).toBe(ctx.colors.accent)
    expect(mark?.getAttribute("font-size")).toBe("24")
    expect(markup).toContain("[1] 陈砚清，运维成本年度复盘，2026")
    expect(markup).not.toContain("baseline-shift")
    expect(markup).not.toContain(LUXE_GOLD)
    expect(markup).not.toContain(BOARD_INK)
  })

  it("pull-quote draws neither the superscript nor the footnote without attribution", () => {
    const slide: Slide = { type: "content", layout: "pull-quote", heading: QUOTE, components: [] } as Slide
    const { root } = render(
      <PullQuoteContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(Array.from(root.querySelectorAll("tspan")).some((t) => t.textContent === "[1]")).toBe(false)
    expect(Array.from(root.querySelectorAll("text")).some((t) => (t.textContent ?? "").startsWith("[1] "))).toBe(false)
  })

  it("stat-hero splits a trailing % onto a smaller gold-lined numeral", () => {
    const slide: Slide = {
      type: "content",
      layout: "stat-hero",
      heading: "43%",
      subheading: "订阅续约率同比回升",
      footnote: "试点客户 90 天窗口",
      components: [],
    } as Slide
    const { markup, root } = render(
      <StatHeroContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const hero = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("43"))!
    expect(hero.getAttribute("x")).toBe("640")
    expect(hero.getAttribute("y")).toBe("392")
    expect(hero.getAttribute("text-anchor")).toBe("middle")
    expect(Number(hero.getAttribute("font-size"))).toBe(300)
    expect(hero.getAttribute("fill")).toBe(ctx.colors.primary)
    const pct = Array.from(hero.querySelectorAll("tspan")).find((t) => t.textContent === "%")
    expect(pct?.getAttribute("font-size")).toBe("190")
    expect(hero.childNodes[0]?.textContent).toBe("43")
    const hair = root.querySelector("line")
    expect(hair?.getAttribute("x1")).toBe("470")
    expect(hair?.getAttribute("x2")).toBe("810")
    expect(hair?.getAttribute("y1")).toBe("448")
    expect(hair?.getAttribute("stroke")).toBe(ctx.colors.accent)
    expect(markup).not.toContain("图 4.2")
    expect(markup).toContain("试点客户 90 天窗口")
  })

  it("statement stamps 证明见后三页。 and uses sectionName as the kicker", () => {
    const chapter: Slide = { type: "chapter", heading: "命题 3.1", components: [] } as Slide
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE, components: [] } as Slide
    const { root } = render(
      <StatementContent ir={ir([chapter, slide])} slide={slide} index={1} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const kicker = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "命题 3.1")!
    expect(kicker.getAttribute("x")).toBe("640")
    expect(kicker.getAttribute("y")).toBe("200")
    expect(kicker.getAttribute("fill")).toBe(ctx.colors.primary)
    expect(kicker.getAttribute("letter-spacing")).toBeNull()
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("设备不会"),
    )!
    expect(heading.getAttribute("y")).toBe("360")
    expect(heading.getAttribute("fill")).toBe(ctx.colors.text)
    const dots = Array.from(root.querySelectorAll("circle"))
    expect(dots.map((c) => c.getAttribute("cx"))).toEqual(["616", "640", "664"])
    expect(dots.every((c) => c.getAttribute("cy") === "430" && c.getAttribute("r") === "3")).toBe(true)
    const stamp = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "证明见后三页。")!
    expect(stamp.getAttribute("font-style")).toBe("italic")
    expect(stamp.getAttribute("fill")).toBe(ctx.colors.muted)
  })
})
