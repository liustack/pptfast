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
const BOARD_TEXT = "#F2EDF7"

function ir(slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: "campaign" },
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

describe("campaign sparse faces", () => {
  const ctx = buildCtx(resolveStyle("campaign"), {})

  it("statement is centered heavy type with a magenta closer bar and accent on **", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE, components: [] } as Slide
    const { markup, root } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("设备不会"),
    )!
    expect(heading.getAttribute("x")).toBe("640")
    expect(heading.getAttribute("y")).toBe("340")
    expect(heading.getAttribute("text-anchor")).toBe("middle")
    expect(heading.getAttribute("font-weight")).toBe("700")
    expect(heading.getAttribute("fill")).toBe(ctx.colors.text)
    const em = Array.from(root.querySelectorAll("tspan")).find((t) => t.textContent === "听它说话")
    expect(em?.getAttribute("fill")).toBe(ctx.colors.accent)
    const bar = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("width") === "128")
    expect(bar?.getAttribute("x")).toBe("576")
    expect(bar?.getAttribute("y")).toBe("490")
    expect(bar?.getAttribute("height")).toBe("6")
    expect(bar?.getAttribute("fill")).toBe(ctx.colors.accent)
    expect(markup).not.toContain(LUXE_GOLD)
    expect(markup).not.toContain(BOARD_TEXT)
  })

  it("statement without ** still draws the closer bar and keeps the verse on text fill", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE_PLAIN, components: [] } as Slide
    const { root } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("听它说话"),
    )!
    expect(heading.querySelector("tspan")).toBeNull()
    expect(heading.getAttribute("fill")).toBe(ctx.colors.text)
    expect(Array.from(root.querySelectorAll("rect")).some((r) => r.getAttribute("width") === "128")).toBe(true)
  })

  it("stat-hero kicker is sectionName only, with a magenta numeral", () => {
    const chapter: Slide = { type: "chapter", heading: "九十天，一个数", components: [] } as Slide
    const slide: Slide = {
      type: "content",
      layout: "stat-hero",
      heading: "43%",
      subheading: "非计划停机时长下降",
      components: [],
    } as Slide
    const { root } = render(
      <StatHeroContent ir={ir([chapter, slide])} slide={slide} index={1} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const kicker = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("九十天"),
    )!
    expect(kicker.getAttribute("x")).toBe("640")
    expect(kicker.getAttribute("y")).toBe("200")
    expect(kicker.getAttribute("letter-spacing")).toBeNull()
    expect(kicker.getAttribute("fill")).toBe(ctx.colors.muted)
    const hero = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("43"))!
    expect(hero.getAttribute("y")).toBe("480")
    expect(Number(hero.getAttribute("font-size"))).toBe(320)
    expect(hero.getAttribute("font-weight")).toBe("700")
    expect(hero.getAttribute("fill")).toBe(ctx.colors.accent)
  })

  it("one-evidence is a side-curtain card with a magenta footer bar", () => {
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
    const footer = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("height") === "8")
    expect(footer?.getAttribute("x")).toBe("160")
    expect(footer?.getAttribute("y")).toBe("502")
    expect(footer?.getAttribute("width")).toBe("960")
    expect(footer?.getAttribute("fill")).toBe(ctx.colors.accent)
    const index = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("实测"))!
    expect(index.textContent).toBe("实测 · 01")
    expect(index.getAttribute("letter-spacing")).toBeNull()
    const claim = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("维护工单"),
    )!
    expect(claim.getAttribute("fill")).toBe(ctx.colors.text)
  })
})
