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

const VERSE = "设备不会突然坏，只是没人听它说话。"
const QUOTE = "「最贵的停机，是没人预料到的**那一次**。」"
const QUOTE_PLAIN = "「最贵的停机，是没人预料到的那一次。」"
const LUXE_GOLD = "#C6A15B"

function ir(slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: "memo" },
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

/** Nearby horizontal lines (a 文武 pair) count as one group. Isolated lines and paths each count as one. */
function countHorizontalRuleGroups(root: Element): number {
  const lineYs = Array.from(root.querySelectorAll("line"))
    .filter((l) => Math.abs(Number(l.getAttribute("y1")) - Number(l.getAttribute("y2"))) < 1)
    .map((l) => Number(l.getAttribute("y1")))
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b)
  let groups = 0
  let last = -Infinity
  for (const y of lineYs) {
    if (y - last > 10) groups++
    last = y
  }
  groups += root.querySelectorAll("path, polyline").length
  return groups
}

describe("memo sparse faces", () => {
  const ctx = buildCtx(resolveStyle("memo"), {})

  it("does not redraw MEMORANDUM or the motif's top red double rule", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE, components: [] } as Slide
    const { markup } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(markup).not.toContain("MEMORANDUM")
  })

  it("statement is one Songti line with a baked 已阅/存档 seal", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE, components: [] } as Slide
    const { markup, root } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("设备不会突然坏"),
    )!
    expect(heading.getAttribute("x")).toBe("96")
    expect(heading.getAttribute("y")).toBe("350")
    expect(Number(heading.getAttribute("font-size"))).toBe(54)
    expect(heading.getAttribute("fill")).toBe(ctx.colors.text)
    expect(heading.getAttribute("font-family")).toBe(ctx.fonts.heading)
    expect(markup).toContain("已阅")
    expect(markup).toContain("存档")
    const seal = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("width") === "108")
    expect(seal?.getAttribute("stroke")).toBe(ctx.colors.accent)
    expect(markup).not.toContain(LUXE_GOLD)
  })

  it("pull-quote uses mono type, ink double rules, and an accent underline on **runs**", () => {
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
    const quote = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("最贵的停机"),
    )!
    expect(quote.getAttribute("x")).toBe("96")
    expect(quote.getAttribute("font-family")).toBe(ctx.fonts.mono)
    expect(Number(quote.getAttribute("font-size"))).toBe(44)
    const em = Array.from(root.querySelectorAll("tspan")).find((t) => t.textContent === "那一次")
    expect(em?.getAttribute("fill")).toBe(ctx.colors.accent)
    const underline = Array.from(root.querySelectorAll("line")).find(
      (l) => l.getAttribute("stroke") === ctx.colors.accent && l.getAttribute("stroke-width") === "3",
    )
    expect(underline).toBeTruthy()
    expect(markup).toContain("FROM:")
    expect(markup).toContain("陈砚清")
    const rules = Array.from(root.querySelectorAll("line")).filter((l) => l.getAttribute("stroke") === ctx.colors.text)
    expect(rules.length).toBe(2)
  })

  it("pull-quote keeps at most two horizontal rule groups (文武 pair counts as one)", () => {
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
    expect(countHorizontalRuleGroups(root)).toBeLessThanOrEqual(2)
  })

  it("pull-quote without ** draws no accent underline", () => {
    const slide: Slide = { type: "content", layout: "pull-quote", heading: QUOTE_PLAIN, components: [] } as Slide
    const { root } = render(
      <PullQuoteContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    const underline = Array.from(root.querySelectorAll("line")).find(
      (l) => l.getAttribute("stroke") === ctx.colors.accent,
    )
    expect(underline).toBeUndefined()
  })

  it("stat-hero sandwiches a centered numeral in double rules and a RE line", () => {
    const slide: Slide = {
      type: "content",
      layout: "stat-hero",
      heading: "43%",
      subheading: "席位净流失时长，试点客户 90 天",
      components: [],
    } as Slide
    const { markup, root } = render(
      <StatHeroContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const hero = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("43"))!
    expect(hero.getAttribute("x")).toBe("640")
    expect(hero.getAttribute("text-anchor")).toBe("middle")
    expect(Number(hero.getAttribute("font-size"))).toBe(280)
    expect(markup).toContain("RE:")
  })
})
