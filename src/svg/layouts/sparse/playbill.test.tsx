// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../../serialize"
import { assertSubset } from "../../subset-validate"
import { buildCtx } from "../../full-slide-svg"
import { resolveStyle } from "../../../themes"
import { StatementContent } from "../content-statement"
import { StatHeroContent } from "../content-stat-hero"
import { MonoBleedContent } from "../content-mono-bleed"
import type { PptxIR, Slide } from "@/ir"

const VERSE = "设备不会突然坏，只是没人**听**它说话。"
const VERSE_PLAIN = "设备不会突然坏，只是没人听它说话。"
const LUXE_GOLD = "#C6A15B"
const PLACEHOLDER = "产线现场图"

function ir(slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: "playbill" },
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

describe("playbill sparse faces", () => {
  const ctx = buildCtx(resolveStyle("playbill"), {})

  it("statement is three-line heavy type with an accent run and a closer bar", () => {
    const chapter: Slide = { type: "chapter", heading: "预测性维护 · 开演", components: [] } as Slide
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE, components: [] } as Slide
    const { markup, root } = render(
      <StatementContent ir={ir([chapter, slide])} slide={slide} index={1} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("设备不会"),
    )!
    expect(heading.getAttribute("x")).toBe("96")
    expect(heading.getAttribute("font-weight")).toBe("700")
    expect(Number(heading.getAttribute("font-size"))).toBe(110)
    expect(heading.textContent).toMatch(/，$/)
    const em = Array.from(root.querySelectorAll("tspan")).find((t) => t.textContent === "听")
    expect(em?.getAttribute("fill")).toBe(ctx.colors.accent)
    const bar = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("height") === "4")
    expect(bar?.getAttribute("x")).toBe("96")
    expect(bar?.getAttribute("y")).toBe("610")
    expect(bar?.getAttribute("width")).toBe("1088")
    expect(bar?.getAttribute("fill")).toBe(ctx.colors.text)
    expect(markup).toContain("预测性维护")
    expect(markup).not.toContain(LUXE_GOLD)
    expect(root.querySelector("polygon")).toBeNull()
  })

  it("statement without ** keeps the verse on text fill", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE_PLAIN, components: [] } as Slide
    const { root } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("听"),
    )!
    expect(heading.querySelector("tspan")).toBeNull()
  })

  it("stat-hero bleeds a 560px numeral and bakes a rotated unit chip", () => {
    const slide: Slide = {
      type: "content",
      layout: "stat-hero",
      heading: "-43%",
      subheading: "非计划停机 · 试点 90 天",
      components: [],
    } as Slide
    const { root } = render(
      <StatHeroContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const hero = Array.from(root.querySelectorAll("text")).find((t) => t.getAttribute("font-size") === "560")!
    expect(hero.textContent).toBe("43")
    expect(hero.getAttribute("x")).toBe("640")
    expect(hero.getAttribute("y")).toBe("560")
    expect(hero.getAttribute("text-anchor")).toBe("middle")
    expect(hero.getAttribute("font-weight")).toBe("700")
    expect(root.querySelector("polygon")).not.toBeNull()
    expect(root.querySelector("rect[transform]")).toBeNull()
    const chip = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("%"))
    expect(chip?.textContent).toBe("-43%")
    expect(chip?.getAttribute("transform")).toContain("rotate(4 1100 152)")
    expect(chip?.getAttribute("fill")).toBe(ctx.colors.bg)
  })

  it("mono-bleed paints primary, keeps the caption in bg, and never writes a placeholder", () => {
    const slide: Slide = {
      type: "content",
      layout: "mono-bleed",
      heading: "凌晨两点的巡检，以后交给传感器",
      components: [],
    } as Slide
    const { markup, root } = render(
      <MonoBleedContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const field = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("width") === "1280")
    expect(field?.getAttribute("fill")).toBe(ctx.colors.primary)
    const caption = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("凌晨两点"),
    )!
    expect(caption.getAttribute("x")).toBe("96")
    expect(caption.getAttribute("y")).toBe("672")
    expect(caption.getAttribute("fill")).toBe(ctx.colors.bg)
    expect(markup).not.toContain(PLACEHOLDER)
  })
})
