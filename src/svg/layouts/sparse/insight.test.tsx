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
const BOARD_QUOTE = "#E8E2D6"

function ir(slides: Slide[], meta: Record<string, string> = {}): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: "insight" },
    meta,
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

describe("insight sparse faces", () => {
  const ctx = buildCtx(resolveStyle("insight"), {})

  it("statement is a prompt line with a muted >, amber verse, and a cursor", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE, components: [] } as Slide
    const doc = ir([slide], { date: "2026-05-01" })
    const { markup, root } = render(
      <StatementContent ir={doc} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const line = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("设备不会"))!
    expect(line.getAttribute("x")).toBe("96")
    expect(line.getAttribute("y")).toBe("380")
    expect(Number(line.getAttribute("font-size"))).toBe(52)
    const prompt = Array.from(line.querySelectorAll("tspan")).find((t) => t.textContent === ">")
    expect(prompt?.getAttribute("fill")).toBe(ctx.colors.muted)
    const verse = Array.from(line.querySelectorAll("tspan")).find((t) => (t.textContent ?? "").includes("设备不会"))
    expect(verse?.getAttribute("fill")).toBe(ctx.colors.accent)
    expect(verse?.getAttribute("dx")).toBe("24")
    const cursor = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("width") === "26")
    expect(cursor?.getAttribute("x")).toBe("96")
    expect(cursor?.getAttribute("y")).toBe("420")
    expect(cursor?.getAttribute("height")).toBe("6")
    expect(cursor?.getAttribute("fill")).toBe(ctx.colors.accent)
    expect(markup).not.toContain("<animate")
    const hair = root.querySelector("line")
    expect(hair?.getAttribute("x1")).toBe("96")
    expect(hair?.getAttribute("x2")).toBe("1184")
    expect(hair?.getAttribute("y1")).toBe("620")
    expect(hair?.getAttribute("stroke")).toBe(ctx.colors.border)
    expect(markup).toContain("SESSION 2026-Q2 · LIVE")
    expect(markup).not.toContain(LUXE_GOLD)
  })

  it("SESSION and the ghost quarter stay off when the date cannot be read", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE, components: [] } as Slide
    const { markup } = render(
      <StatementContent ir={ir([slide], { date: "sometime soon" })} slide={slide} index={0} ctx={ctx} />,
    )
    expect(markup).not.toContain("SESSION")
    expect(markup).not.toMatch(/\bQ[1-4]\b/)

    const missing: Slide = { type: "content", layout: "stat-hero", heading: "43%", components: [] } as Slide
    const { markup: noDate } = render(
      <StatHeroContent ir={ir([missing])} slide={missing} index={0} ctx={ctx} />,
    )
    expect(noDate).not.toContain("SESSION")
    expect(noDate).not.toMatch(/\bQ[1-4]\b/)
  })

  it("stat-hero paints a ghost quarter from meta.date and keeps a leading minus in the value", () => {
    const slide: Slide = {
      type: "content",
      layout: "stat-hero",
      heading: "-43%",
      subheading: "非计划停机 · 环比",
      footnote: "PILOT LINE · 90D WINDOW",
      components: [],
    } as Slide
    const q2 = ir([slide], { date: "2026-05-01" })
    const { markup, root } = render(
      <StatHeroContent ir={q2} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const ghost = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "Q2")!
    expect(ghost.getAttribute("x")).toBe("1180")
    expect(ghost.getAttribute("y")).toBe("560")
    expect(ghost.getAttribute("text-anchor")).toBe("end")
    expect(Number(ghost.getAttribute("font-size"))).toBe(430)
    expect(ghost.getAttribute("fill")).toBe(ctx.colors.surface)
    expect(ghost.getAttribute("font-weight")).toBe("400")
    const hero = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("-43"))!
    expect(hero.getAttribute("x")).toBe("96")
    expect(hero.getAttribute("y")).toBe("470")
    expect(hero.getAttribute("fill")).toBe(ctx.colors.accent)
    expect(hero.textContent).toBe("-43%")
    expect(markup).toContain("PILOT LINE · 90D WINDOW")

    const q4slide: Slide = { type: "content", layout: "stat-hero", heading: "12%", components: [] } as Slide
    const { root: q4root } = render(
      <StatHeroContent ir={ir([q4slide], { date: "2026-11-20" })} slide={q4slide} index={0} ctx={ctx} />,
    )
    const q4 = Array.from(q4root.querySelectorAll("text")).find((t) => t.textContent === "Q4")
    expect(q4).toBeTruthy()
  })

  it("pull-quote follows the polyline and paints the quote in text, attribution in accent", () => {
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
    const poly = root.querySelector("polyline")
    expect(poly?.getAttribute("points")).toBe(
      "96,150 240,142 390,158 540,138 700,150 860,132 1010,144 1184,128",
    )
    expect(poly?.getAttribute("fill")).toBe("none")
    expect(poly?.getAttribute("stroke")).toBe(ctx.colors.border)
    expect(poly?.getAttribute("stroke-width")).toBe("2")
    const quote = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("最贵的停机"),
    )!
    expect(quote.getAttribute("x")).toBe("640")
    expect(quote.getAttribute("y")).toBe("370")
    expect(quote.getAttribute("text-anchor")).toBe("middle")
    expect(quote.getAttribute("fill")).toBe(ctx.colors.text)
    expect(Number(quote.getAttribute("font-size"))).toBe(46)
    const attr = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("陈砚清"),
    )!
    expect(attr.getAttribute("fill")).toBe(ctx.colors.accent)
    expect(attr.getAttribute("letter-spacing")).toBeNull()
    expect(markup).not.toContain(BOARD_QUOTE)
    expect(markup).not.toContain(LUXE_GOLD)
  })
})
