// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../../serialize"
import { assertSubset } from "../../subset-validate"
import { buildCtx } from "../../full-slide-svg"
import { resolveStyle } from "../../../themes"
import { StatementContent } from "../content-statement"
import { StatHeroContent } from "../content-stat-hero"
import { OneEvidenceContent } from "../content-one-evidence"
import { measureTextUnits } from "../../../lib/svg-text-layout"
import type { PptxIR, Slide } from "@/ir"

const VERSE = "设备不会突然坏，只是没人**听它说话**。"
const VERSE_PLAIN = "设备不会突然坏，只是没人听它说话。"
const LUXE_GOLD = "#C6A15B"
const BOARD_TEXT = "#EDEAE0"

function ir(slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: "lecture" },
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

describe("lecture sparse faces", () => {
  const ctx = buildCtx(resolveStyle("lecture"), {})

  it("statement is left-axis chalkboard type with a chalk arc only when emphasized", () => {
    const slide: Slide = {
      type: "content",
      layout: "statement",
      heading: VERSE,
      components: [{ type: "paragraph", text: "工作区订阅开课第一句" }],
    } as Slide
    const { markup, root } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("设备不会"),
    )!
    expect(heading.getAttribute("x")).toBe("120")
    expect(Number(heading.getAttribute("font-size"))).toBe(58)
    expect(heading.getAttribute("fill")).toBe(ctx.colors.text)
    expect(heading.getAttribute("font-family")).toBe(ctx.fonts.heading)
    const em = Array.from(root.querySelectorAll("tspan")).find((t) => t.textContent === "听它说话")
    expect(em?.getAttribute("fill")).toBe(ctx.colors.accent)
    const arc = root.querySelector("path")
    expect(arc?.getAttribute("stroke")).toBe(ctx.colors.accent)
    expect(arc?.getAttribute("stroke-width")).toBe("4")
    expect(markup).toContain("工作区订阅开课第一句")
    expect(markup).not.toContain(LUXE_GOLD)
    expect(markup).not.toContain(BOARD_TEXT)
  })

  it("statement attribution fits inside the page instead of running past x=1280", () => {
    const long =
      "试点客户九十天运行数据表明席位净流失从每周两次降到每月不到一次，维护工单平均提前六点五天生成，并且故障预测准确率已经稳定在百分之八十八以上。"
    const slide: Slide = {
      type: "content",
      layout: "statement",
      heading: VERSE_PLAIN,
      components: [{ type: "paragraph", text: long }],
    } as Slide
    const { root } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    const attr = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").length > 20 && !(t.textContent ?? "").includes("设备不会"))!
    const x = Number(attr.getAttribute("x"))
    const size = Number(attr.getAttribute("font-size"))
    const w = measureTextUnits(attr.textContent ?? "", { fontFamily: ctx.fonts.body }) * size
    expect(x + w).toBeLessThanOrEqual(1280)
  })

  it("statement without ** draws no chalk arc", () => {
    const slide: Slide = { type: "content", layout: "statement", heading: VERSE_PLAIN, components: [] } as Slide
    const { root } = render(
      <StatementContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(root.querySelector("path")).toBeNull()
  })

  it("stat-hero is a left yellow numeral with a hand stroke underneath", () => {
    const slide: Slide = {
      type: "content",
      layout: "stat-hero",
      heading: "43%",
      subheading: "订阅续约率同比回升",
      components: [],
    } as Slide
    const { root } = render(
      <StatHeroContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const hero = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("43"))!
    expect(hero.getAttribute("x")).toBe("120")
    expect(hero.getAttribute("y")).toBe("470")
    expect(Number(hero.getAttribute("font-size"))).toBe(260)
    expect(hero.getAttribute("fill")).toBe(ctx.colors.accent)
    const stroke = root.querySelector("path")
    expect(stroke?.getAttribute("stroke")).toBe(ctx.colors.accent)
    expect(stroke?.getAttribute("stroke-width")).toBe("5")
  })

  it("one-evidence uses a dashed muted frame and centers the claim when there is no visual", () => {
    const slide: Slide = {
      type: "content",
      layout: "one-evidence",
      heading: "维护工单平均提前 **6.5 天** 生成",
      subheading: "试点客户 90 天 · 全部 217 张工单",
      footnote: "来源：2026 Q2 运行数据",
      components: [],
    } as Slide
    const { root } = render(
      <OneEvidenceContent ir={ir([slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const frame = root.querySelector("rect")
    expect(frame?.getAttribute("x")).toBe("200")
    expect(frame?.getAttribute("y")).toBe("200")
    expect(frame?.getAttribute("width")).toBe("880")
    expect(frame?.getAttribute("height")).toBe("300")
    expect(frame?.getAttribute("stroke-dasharray")).toBe("10 8")
    expect(frame?.getAttribute("stroke")).toBe(ctx.colors.muted)
    const claim = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("维护工单"),
    )!
    expect(claim.getAttribute("x")).toBe("640")
    expect(claim.getAttribute("text-anchor")).toBe("middle")
    expect(Number(claim.getAttribute("font-size"))).toBe(40)
    const em = Array.from(root.querySelectorAll("tspan")).find((t) => (t.textContent ?? "").includes("6.5"))
    expect(em?.getAttribute("fill")).toBe(ctx.colors.accent)
  })
})
