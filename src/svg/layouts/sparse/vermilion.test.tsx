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
const BOARD_CLAIM = "#3A2E24"

function ir(slides: Slide[], meta: Record<string, string> = {}): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: "vermilion" },
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

describe("vermilion sparse faces", () => {
  const ctx = buildCtx(resolveStyle("vermilion"), {})

  it("statement is a centered red line between gold doubles, with org · date at the end", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE, components: [] } as Slide
    const { markup, root } = render(
      <StatementContent ir={ir([slide], { organization: "岭原智能", date: "2026-08" })} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("设备不会"),
    )!
    expect(heading.getAttribute("x")).toBe("640")
    expect(heading.getAttribute("y")).toBe("360")
    expect(heading.getAttribute("text-anchor")).toBe("middle")
    expect(heading.getAttribute("font-weight")).toBe("700")
    expect(heading.getAttribute("fill")).toBe(ctx.colors.primary)
    expect(Number(heading.getAttribute("font-size"))).toBe(56)
    const lines = Array.from(root.querySelectorAll("line"))
    expect(lines.some((l) => l.getAttribute("y1") === "150" && l.getAttribute("stroke-width") === "2")).toBe(true)
    expect(lines.some((l) => l.getAttribute("y1") === "564")).toBe(true)
    expect(lines.every((l) => l.getAttribute("stroke") === ctx.colors.accent)).toBe(true)
    const meta = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("岭原智能"))!
    expect(meta.textContent).toBe("岭原智能 · 2026-08")
    expect(meta.getAttribute("x")).toBe("1040")
    expect(meta.getAttribute("text-anchor")).toBe("end")
    expect(markup).not.toContain("二〇二六")
    expect(markup).not.toContain(LUXE_GOLD)
  })

  it("statement ** runs stay primary, gold never paints glyphs", () => {
    const slide: Slide = {
      type: "content",
      layout: "statement",
      heading: "设备不会突然坏，只是没人**听它说话**。",
      components: [],
    } as Slide
    const { root } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    const em = Array.from(root.querySelectorAll("tspan")).find((t) => t.textContent === "听它说话")
    expect(em?.getAttribute("fill")).toBe(ctx.colors.primary)
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("听它说话"),
    )!
    expect(heading.getAttribute("fill")).toBe(ctx.colors.primary)
    expect(
      Array.from(heading.querySelectorAll("tspan")).every((t) => t.getAttribute("fill") !== ctx.colors.accent),
    ).toBe(true)
  })

  it("statement omits the meta line when organization and date are both missing", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE, components: [] } as Slide
    const { markup } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(markup).not.toContain(" · ")
  })

  it("stat-hero is a centered red numeral over a gold diamond", () => {
    const slide: Slide = {
      type: "content",
      layout: "stat-hero",
      heading: "43%",
      subheading: "非计划停机时长下降 · 试点产线九十日",
      components: [],
    } as Slide
    const { root } = render(
      <StatHeroContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const hero = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("43"))!
    expect(hero.getAttribute("x")).toBe("640")
    expect(hero.getAttribute("y")).toBe("460")
    expect(hero.getAttribute("text-anchor")).toBe("middle")
    expect(hero.getAttribute("font-weight")).toBe("700")
    expect(hero.getAttribute("fill")).toBe(ctx.colors.primary)
    expect(Number(hero.getAttribute("font-size"))).toBe(300)
    const diamond = root.querySelector("path")
    expect(diamond?.getAttribute("d")).toBe("M 640 520 l 8 14 l -8 14 l -8 -14 z")
    expect(diamond?.getAttribute("fill")).toBe(ctx.colors.accent)
  })

  it("one-evidence is a dossier card with a red spine and 案卷 index", () => {
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
    const spine = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("width") === "10")
    expect(spine?.getAttribute("x")).toBe("160")
    expect(spine?.getAttribute("height")).toBe("320")
    expect(spine?.getAttribute("fill")).toBe(ctx.colors.primary)
    const index = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("案卷"))!
    expect(index.textContent).toBe("案卷 · 01")
    expect(index.getAttribute("letter-spacing")).toBeNull()
    expect(index.getAttribute("fill")).toBe(ctx.colors.primary)
    const claim = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("维护工单"),
    )!
    expect(claim.getAttribute("fill")).toBe(ctx.colors.text)
    expect(markup).not.toContain(BOARD_CLAIM)
    expect(markup).not.toContain(LUXE_GOLD)
  })
})
