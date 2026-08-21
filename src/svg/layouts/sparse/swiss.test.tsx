// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../../serialize"
import { assertSubset } from "../../subset-validate"
import { buildCtx } from "../../full-slide-svg"
import { resolveStyle } from "../../../themes"
import { StatementContent } from "../content-statement"
import { StatHeroContent } from "../content-stat-hero"
import { OneEvidenceContent } from "../content-one-evidence"
import type { PptxIR, Slide } from "@/ir"

const VERSE = "设备不会突然坏，只是没人**听它说话**。"
const VERSE_PLAIN = "设备不会突然坏，只是没人听它说话。"
const LUXE_GOLD = "#C6A15B"

function ir(slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: "swiss" },
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

describe("swiss sparse faces", () => {
  const ctx = buildCtx(resolveStyle("swiss"), {})

  it("does not paint a top accent bar (that belongs to the motif)", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE_PLAIN, components: [] } as Slide
    const { root } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    const topBar = Array.from(root.querySelectorAll("rect")).find(
      (r) => r.getAttribute("y") === "0" && r.getAttribute("height") === "10",
    )
    expect(topBar).toBeUndefined()
  })

  it("statement is left superblack type with a text-fill closer bar", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE, components: [] } as Slide
    const { markup, root } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("设备不会"),
    )!
    expect(heading.getAttribute("x")).toBe("88")
    expect(Number(heading.getAttribute("font-size"))).toBe(84)
    expect(heading.getAttribute("font-weight")).toBe("700")
    expect(heading.getAttribute("fill")).toBe(ctx.colors.text)
    const em = Array.from(root.querySelectorAll("tspan")).find((t) => t.textContent === "听它说话")
    expect(em?.getAttribute("fill")).toBe(ctx.colors.accent)
    const bar = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("width") === "120")
    expect(bar?.getAttribute("x")).toBe("88")
    expect(bar?.getAttribute("y")).toBe("490")
    expect(bar?.getAttribute("height")).toBe("6")
    expect(bar?.getAttribute("fill")).toBe(ctx.colors.text)
    expect(markup).not.toContain(LUXE_GOLD)
  })

  it("statement without ** keeps the verse on text fill", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE_PLAIN, components: [] } as Slide
    const { root } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("听它说话"),
    )!
    expect(heading.querySelector("tspan")).toBeNull()
    expect(heading.getAttribute("fill")).toBe(ctx.colors.text)
  })

  it("stat-hero is a 360px left numeral with a padded page index", () => {
    const slides: Slide[] = [
      { type: "content", layout: "stat-hero", heading: "43%", subheading: "非计划停机时长下降", footnote: "试点产线 · 90 天 · 2026 Q2", components: [] } as Slide,
      { type: "content", heading: "x", components: [] } as Slide,
      { type: "content", heading: "y", components: [] } as Slide,
    ]
    const { root } = render(
      <StatHeroContent ir={ir(slides)} slide={slides[0]} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const hero = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("43"))!
    expect(hero.getAttribute("x")).toBe("88")
    expect(hero.getAttribute("y")).toBe("480")
    expect(Number(hero.getAttribute("font-size"))).toBe(360)
    expect(hero.getAttribute("font-weight")).toBe("700")
    const page = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("/"))!
    expect(page.textContent).toBe("01 / 03")
    expect(page.getAttribute("x")).toBe("1188")
    expect(page.getAttribute("text-anchor")).toBe("end")
  })

  it("one-evidence sits the claim on a surface card with a red index", () => {
    const slide: Slide = {
      type: "content",
      layout: "one-evidence",
      heading: "维护工单平均提前 6.5 天生成",
      subheading: "217 张工单全量统计，无一例外",
      footnote: "来源：2026 Q2 运行数据",
      components: [],
    } as Slide
    const { root } = render(
      <OneEvidenceContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const card = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("width") === "960")
    expect(card?.getAttribute("fill")).toBe(ctx.colors.surface)
    expect(card?.getAttribute("stroke")).toBe(ctx.colors.border)
    const index = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "01")!
    expect(index.getAttribute("fill")).toBe(ctx.colors.accent)
    expect(index.getAttribute("font-weight")).toBe("700")
  })
})
