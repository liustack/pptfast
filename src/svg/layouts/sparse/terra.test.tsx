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

const VERSE = "设备不会突然坏，只是没人听它说话。"
const LUXE_GOLD = "#C6A15B"
const BOARD_CLAIM = "#3D3A30"

function ir(slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: "terra" },
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

describe("terra sparse faces", () => {
  const ctx = buildCtx(resolveStyle("terra"), {})

  it("statement is left olive type over two layout q-curves", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE, components: [] } as Slide
    const { markup, root } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("设备不会"),
    )!
    expect(heading.getAttribute("x")).toBe("96")
    expect(heading.getAttribute("y")).toBe("330")
    expect(heading.getAttribute("font-weight")).toBe("700")
    expect(heading.getAttribute("fill")).toBe(ctx.colors.primary)
    expect(Number(heading.getAttribute("font-size"))).toBe(54)
    const curves = Array.from(root.querySelectorAll("path")).map((p) => p.getAttribute("d"))
    expect(curves).toEqual(["M 60 610 q 220 -40 430 0 t 430 0", "M 20 650 q 260 -34 500 0 t 500 0"])
    expect(Array.from(root.querySelectorAll("path")).every((p) => p.getAttribute("stroke") === ctx.colors.border)).toBe(
      true,
    )
    expect(markup).not.toContain(LUXE_GOLD)
  })

  it("stat-hero is an ochre numeral with an olive structure bar", () => {
    const slide: Slide = {
      type: "content",
      layout: "stat-hero",
      heading: "43%",
      subheading: "订阅续约率同比回升",
      footnote: "试点客户 · 90 天 · 现场实测",
      components: [],
    } as Slide
    const { root } = render(
      <StatHeroContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const hero = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("43"))!
    expect(hero.getAttribute("x")).toBe("96")
    expect(hero.getAttribute("y")).toBe("460")
    expect(Number(hero.getAttribute("font-size"))).toBe(300)
    expect(hero.getAttribute("font-weight")).toBe("700")
    expect(hero.getAttribute("fill")).toBe(ctx.colors.accent)
    const bar = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("width") === "430")
    expect(bar?.getAttribute("x")).toBe("104")
    expect(bar?.getAttribute("y")).toBe("504")
    expect(bar?.getAttribute("height")).toBe("2")
    expect(bar?.getAttribute("fill")).toBe(ctx.colors.primary)
  })

  it("one-evidence is a sample card with an ochre dot and 样点 index", () => {
    const slide: Slide = {
      type: "content",
      layout: "one-evidence",
      heading: "维护工单平均提前 6.5 天生成",
      subheading: "217 张工单全量统计 · 2026 Q2",
      components: [],
    } as Slide
    const { markup, root } = render(
      <OneEvidenceContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const dot = root.querySelector("circle")
    expect(dot?.getAttribute("cx")).toBe("238")
    expect(dot?.getAttribute("cy")).toBe("282")
    expect(dot?.getAttribute("r")).toBe("7")
    expect(dot?.getAttribute("fill")).toBe(ctx.colors.accent)
    const index = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("样点"))!
    expect(index.textContent).toBe("样点 01")
    expect(index.getAttribute("fill")).toBe(ctx.colors.primary)
    const claim = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("维护工单"),
    )!
    expect(claim.getAttribute("fill")).toBe(ctx.colors.text)
    expect(markup).not.toContain(BOARD_CLAIM)
    expect(markup).not.toContain(LUXE_GOLD)
  })
})
