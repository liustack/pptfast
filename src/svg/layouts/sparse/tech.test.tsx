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
const BOARD_TEXT = "#E6ECF5"

function ir(slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: "tech" },
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

describe("tech sparse faces", () => {
  const ctx = buildCtx(resolveStyle("tech"), {})

  it("stat-hero is a cyan numeral with a four-dot star chain, none of the constellation", () => {
    const slide: Slide = {
      type: "content",
      layout: "stat-hero",
      heading: "43%",
      subheading: "订阅续约率同比回升",
      footnote: "试点客户 · 90 天窗口",
      components: [],
    } as Slide
    const { markup, root } = render(
      <StatHeroContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const hero = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("43"))!
    expect(hero.getAttribute("x")).toBe("96")
    expect(hero.getAttribute("y")).toBe("450")
    expect(Number(hero.getAttribute("font-size"))).toBe(300)
    expect(hero.getAttribute("font-weight")).toBe("700")
    expect(hero.getAttribute("fill")).toBe(ctx.colors.accent)
    const line = root.querySelector("line")
    expect(line?.getAttribute("x1")).toBe("110")
    expect(line?.getAttribute("x2")).toBe("600")
    expect(line?.getAttribute("y1")).toBe("505")
    const circles = Array.from(root.querySelectorAll("circle"))
    expect(circles).toHaveLength(4)
    expect(circles.map((c) => c.getAttribute("cx"))).toEqual(["110", "272", "436", "600"])
    expect(circles.every((c) => Number(c.getAttribute("cx")) < 700)).toBe(true)
    expect(circles.map((c) => c.getAttribute("r"))).toEqual(["5", "3.5", "3.5", "5"])
    expect(circles.every((c) => c.getAttribute("fill") === ctx.colors.accent)).toBe(true)
    expect(markup).not.toContain(LUXE_GOLD)
    expect(markup).not.toContain(BOARD_TEXT)
  })

  it("statement paints orbit arcs and fills the ** run with accent", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE, components: [] } as Slide
    const { root } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("设备不会"),
    )!
    expect(heading.getAttribute("x")).toBe("96")
    expect(heading.getAttribute("y")).toBe("350")
    expect(heading.getAttribute("font-weight")).toBe("700")
    expect(heading.getAttribute("fill")).toBe(ctx.colors.text)
    const em = Array.from(root.querySelectorAll("tspan")).find((t) => t.textContent === "听它说话")
    expect(em?.getAttribute("fill")).toBe(ctx.colors.accent)
    const arcs = Array.from(root.querySelectorAll("path"))
    expect(arcs).toHaveLength(2)
    expect(arcs[0]?.getAttribute("d")).toBe("M 1060 40 a 190 190 0 0 1 180 130")
    expect(arcs[1]?.getAttribute("d")).toBe("M 1120 40 a 130 130 0 0 1 122 88")
  })

  it("statement without ** keeps the verse on text fill", () => {
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

  it("one-evidence is a panel with a node lamp and NODE index", () => {
    const slide: Slide = {
      type: "content",
      layout: "one-evidence",
      heading: "维护工单平均提前 6.5 天生成",
      subheading: "217 张工单全量统计 · 2026 Q2",
      components: [],
    } as Slide
    const { root } = render(
      <OneEvidenceContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const card = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("width") === "960")
    expect(card?.getAttribute("fill")).toBe(ctx.colors.surface)
    const lamp = root.querySelector("circle")
    expect(lamp?.getAttribute("cx")).toBe("224")
    expect(lamp?.getAttribute("cy")).toBe("268")
    expect(lamp?.getAttribute("r")).toBe("6")
    expect(lamp?.getAttribute("fill")).toBe(ctx.colors.accent)
    const stub = root.querySelector("line")
    expect(stub?.getAttribute("x1")).toBe("230")
    expect(stub?.getAttribute("x2")).toBe("300")
    const index = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").startsWith("NODE"))!
    expect(index.textContent).toBe("NODE 01")
    expect(index.getAttribute("fill")).toBe(ctx.colors.accent)
    expect(index.getAttribute("letter-spacing")).toBeNull()
    const claim = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("维护工单"),
    )!
    expect(claim.getAttribute("fill")).toBe(ctx.colors.text)
  })
})
