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
const BOARD_TEXT = "#E8DFC9"

function ir(slides: Slide[], meta: { organization?: string; date?: string } = {}): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: "museum" },
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

describe("museum sparse faces", () => {
  const ctx = buildCtx(resolveStyle("museum"), {})

  it("statement is a centered wall label with an accent hairline and org/date footer", () => {
    const chapter: Slide = { type: "chapter", heading: "第二展厅 · 预测", components: [] } as Slide
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE, components: [] } as Slide
    const doc = ir([chapter, slide], { organization: "云觅科技藏", date: "2026" })
    const { markup, root } = render(
      <StatementContent ir={doc} slide={slide} index={1} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const kicker = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("第二展厅"),
    )!
    expect(kicker.getAttribute("x")).toBe("640")
    expect(kicker.getAttribute("text-anchor")).toBe("middle")
    expect(kicker.getAttribute("fill")).toBe(ctx.colors.accent)
    expect(kicker.getAttribute("letter-spacing")).toBeNull()
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("设备不会"),
    )!
    expect(Number(heading.getAttribute("font-size"))).toBe(56)
    expect(heading.getAttribute("fill")).toBe(ctx.colors.text)
    const rule = root.querySelector("line")
    expect(rule?.getAttribute("x1")).toBe("600")
    expect(rule?.getAttribute("x2")).toBe("680")
    expect(rule?.getAttribute("stroke")).toBe(ctx.colors.accent)
    expect(markup).toContain("云觅科技藏")
    expect(markup).toContain("2026")
    expect(markup).not.toContain(LUXE_GOLD)
    expect(markup).not.toContain(BOARD_TEXT)
  })

  it("one-evidence sits the claim on a surface panel with an exhibit number", () => {
    const slide: Slide = {
      type: "content",
      layout: "one-evidence",
      heading: "工单平均提前 **6.5 天**",
      subheading: "试点客户 90 天 · 217 张工单",
      components: [],
    } as Slide
    const { markup, root } = render(
      <OneEvidenceContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const panel = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("width") === "800")
    expect(panel?.getAttribute("fill")).toBe(ctx.colors.surface)
    expect(panel?.getAttribute("stroke")).toBe(ctx.colors.border)
    const claim = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("工单平均提前"),
    )!
    expect(claim.getAttribute("x")).toBe("640")
    expect(claim.getAttribute("text-anchor")).toBe("middle")
    const em = Array.from(root.querySelectorAll("tspan")).find((t) => (t.textContent ?? "").includes("6.5"))
    expect(em?.getAttribute("fill")).toBe(ctx.colors.accent)
    expect(markup).toContain("展品 № 01")
  })

  it("one-evidence without ** keeps the claim on text fill", () => {
    const slide: Slide = {
      type: "content",
      layout: "one-evidence",
      heading: "工单平均提前 6.5 天",
      components: [],
    } as Slide
    const { root } = render(
      <OneEvidenceContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    const claim = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("工单平均提前"),
    )!
    expect(claim.querySelector("tspan")).toBeNull()
    expect(claim.getAttribute("fill")).toBe(ctx.colors.text)
  })

  it("stat-hero is a centered accent numeral over a seam line", () => {
    const slide: Slide = {
      type: "content",
      layout: "stat-hero",
      heading: "43%",
      subheading: "订阅续约率同比回升 · 90 天",
      components: [],
    } as Slide
    const { root } = render(
      <StatHeroContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const hero = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("43"))!
    expect(hero.getAttribute("x")).toBe("640")
    expect(hero.getAttribute("y")).toBe("470")
    expect(hero.getAttribute("text-anchor")).toBe("middle")
    expect(Number(hero.getAttribute("font-size"))).toBe(290)
    expect(hero.getAttribute("fill")).toBe(ctx.colors.accent)
    const seam = root.querySelector("line")
    expect(seam?.getAttribute("x1")).toBe("480")
    expect(seam?.getAttribute("x2")).toBe("800")
    expect(seam?.getAttribute("stroke")).toBe(ctx.colors.border)
  })
})
