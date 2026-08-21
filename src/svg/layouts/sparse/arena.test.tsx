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
const BOARD_TEXT = "#EFEAFB"

function ir(slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: "arena" },
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

describe("arena sparse faces", () => {
  const ctx = buildCtx(resolveStyle("arena"), {})

  it("stat-hero is a centered green numeral inside inset HUD brackets", () => {
    const slide: Slide = {
      type: "content",
      layout: "stat-hero",
      heading: "43%",
      subheading: "非计划停机 · 降幅",
      components: [],
    } as Slide
    const { markup, root } = render(
      <StatHeroContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const brackets = Array.from(root.querySelectorAll("path")).map((p) => p.getAttribute("d"))
    expect(brackets).toEqual([
      "M 100 100 l 0 -24 l 24 0",
      "M 1180 100 l 0 -24 l -24 0",
      "M 100 620 l 0 24 l 24 0",
      "M 1180 620 l 0 24 l -24 0",
    ])
    const hero = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("43"))!
    expect(hero.getAttribute("x")).toBe("640")
    expect(hero.getAttribute("y")).toBe("470")
    expect(hero.getAttribute("text-anchor")).toBe("middle")
    expect(Number(hero.getAttribute("font-size"))).toBe(330)
    expect(hero.getAttribute("font-weight")).toBe("700")
    expect(hero.getAttribute("fill")).toBe(ctx.colors.accent)
    const caption = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("非计划停机"),
    )!
    expect(caption.getAttribute("y")).toBe("570")
    expect(caption.getAttribute("letter-spacing")).toBeNull()
    expect(markup).not.toContain(LUXE_GOLD)
    expect(markup).not.toContain(BOARD_TEXT)
  })

  it("statement is left type with four energy bars and accent on **", () => {
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
    const bars = Array.from(root.querySelectorAll("rect")).filter((r) => r.getAttribute("y") === "540")
    expect(bars.map((b) => b.getAttribute("x"))).toEqual(["96", "134", "172", "210"])
    expect(bars.every((b) => b.getAttribute("width") === "30" && b.getAttribute("height") === "8")).toBe(true)
    expect(bars.map((b) => b.getAttribute("opacity"))).toEqual(["1", "0.7", "0.45", "0.22"])
    expect(bars.every((b) => b.getAttribute("fill") === ctx.colors.accent)).toBe(true)
  })

  it("statement without ** still draws the energy bars", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE_PLAIN, components: [] } as Slide
    const { root } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(Array.from(root.querySelectorAll("rect")).filter((r) => r.getAttribute("y") === "540")).toHaveLength(4)
  })

  it("one-evidence uses diagonal accent brackets and a STAT / index", () => {
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
    const corners = Array.from(root.querySelectorAll("path")).map((p) => p.getAttribute("d"))
    expect(corners).toEqual(["M 160 190 l 0 -14 l 14 0", "M 1120 510 l 0 14 l -14 0"])
    const index = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("STAT"))!
    expect(index.textContent).toBe("STAT / 01")
    expect(index.getAttribute("fill")).toBe(ctx.colors.accent)
    expect(index.getAttribute("font-family")).toBe(ctx.fonts.mono)
    const claim = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("维护工单"),
    )!
    expect(claim.getAttribute("fill")).toBe(ctx.colors.text)
  })
})
