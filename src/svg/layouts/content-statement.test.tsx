// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { accessibleInk } from "../ink"
import { StatementContent, layoutDef } from "./content-statement"
import type { PptxIR, Slide } from "@/ir"

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"
const MIXED_LONG =
  "基于 Kubernetes Operator 的 StatefulSet 滚动升级与 PodDisruptionBudget 联动策略 v2.3.1-rc.4 说明"
const EN_VERSE = "What we choose to remember becomes the weather of the next century."
const CJK_VERSE = "记得的事会变成下个世纪的天气"

function ir(theme: string, slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: theme },
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

const zeroSlide: Slide = {
  type: "content",
  layout: "statement",
  heading: CJK_VERSE,
  components: [],
} as Slide

describe("layoutDef", () => {
  it("declares pinOnly, branding none, capacity-1 body, content slide type", () => {
    expect(layoutDef.id).toBe("statement")
    expect(layoutDef.pinOnly).toBe(true)
    expect(layoutDef.branding).toBe("none")
    expect(layoutDef.slideTypes).toEqual(["content"])
    expect(layoutDef.slots.find((s) => s.name === "body")?.capacity).toBe(1)
  })
})

describe("StatementContent", () => {
  it("CJK verse: centered italic heading, weight 500, colors.text, no accent bar", () => {
    const ctx = buildCtx(resolveStyle("crayon"), {})
    const { markup, root } = render(
      <StatementContent ir={ir("crayon", [zeroSlide])} slide={zeroSlide} index={0} ctx={ctx} />,
    )
    expect(markup).toContain(CJK_VERSE)
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("下个世纪"),
    )!
    expect(heading.getAttribute("text-anchor")).toBe("middle")
    expect(heading.getAttribute("x")).toBe("640")
    expect(heading.getAttribute("font-weight")).toBe("500")
    expect(heading.getAttribute("font-style")).toBe("italic")
    expect(heading.getAttribute("fill")).toBe(ctx.colors.text)
    expect(Array.from(root.querySelectorAll("rect")).length).toBe(0)
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("English verse renders on consulting without a crash", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const slide: Slide = { ...zeroSlide, heading: EN_VERSE } as Slide
    const { markup, root } = render(
      <StatementContent ir={ir("consulting", [slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(markup).toContain("remember")
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("mixed long heading shrinks/wraps to at most 4 lines and never dumps the raw source verbatim", () => {
    const ctx = buildCtx(resolveStyle("crayon"), {})
    const extreme = `${CJK_LONG}${CJK_LONG}${MIXED_LONG}`
    const slide: Slide = { type: "content", layout: "statement", heading: extreme, components: [] } as Slide
    const { markup, root } = render(
      <StatementContent ir={ir("crayon", [slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const headingTexts = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-style") === "italic",
    )
    expect(headingTexts.length).toBeGreaterThanOrEqual(1)
    expect(headingTexts.length).toBeLessThanOrEqual(4)
    expect(markup).not.toContain(extreme)
  })

  it("1 quote component renders as a small accent attribution, not a card", () => {
    const ctx = buildCtx(resolveStyle("crayon"), {})
    const slide: Slide = {
      ...zeroSlide,
      components: [{ type: "quote", text: "unused body", attribution: "Irene Pepperberg" }],
    } as Slide
    const { markup, root } = render(
      <StatementContent ir={ir("crayon", [slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(markup).toContain("IRENE PEPPERBERG")
    expect(markup).not.toContain("unused body")
    expect(root.querySelector("g[data-audit-rect]")).toBeNull()
    const attr = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("PEPPERBERG"),
    )!
    expect(attr.getAttribute("fill")).toBe(
      accessibleInk(ctx.colors.accent, ctx.defaultBg ?? ctx.colors.bg, Number(attr.getAttribute("font-size"))),
    )
    expect(Number(attr.getAttribute("font-size"))).toBeLessThanOrEqual(13)
  })

  it("empty subheading and 0 components: no empty text node, heading still renders", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const { root } = render(
      <StatementContent ir={ir("consulting", [zeroSlide])} slide={zeroSlide} index={0} ctx={ctx} />,
    )
    const texts = Array.from(root.querySelectorAll("text"))
    expect(texts.every((t) => (t.textContent ?? "").trim().length > 0)).toBe(true)
    expect(texts.some((t) => (t.textContent ?? "").includes("天气"))).toBe(true)
  })

  it("consulting tokens: no luxe baked hex leaks", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const out = renderSvgMarkup(
      <StatementContent ir={ir("consulting", [zeroSlide])} slide={zeroSlide} index={0} ctx={ctx} />,
    )
    expect(out).toContain(ctx.colors.primary)
    expect(out).not.toContain("#0B0908")
    expect(out).not.toContain("#C6A15B")
  })
})
