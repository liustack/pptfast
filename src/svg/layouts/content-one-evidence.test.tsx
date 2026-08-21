// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { OneEvidenceContent, layoutDef } from "./content-one-evidence"
import type { PptxIR, Slide } from "@/ir"

const CJK_LONG =
  "微服务架构下的分布式事务一致性保障机制与补偿策略设计规范以及跨可用区容灾演练的完整落地路径说明"
const MIXED_LONG =
  "基于 Kubernetes Operator 的 StatefulSet 滚动升级与 PodDisruptionBudget 联动策略 v2.3.1-rc.4 说明"
const CJK_CLAIM = "迁徙路线在十年里缩短了四成"
const EN_CLAIM = "The corridor shrank by forty percent in a decade."

const BAR_CHART = {
  type: "chart" as const,
  chart_type: "bar" as const,
  axes: { y_title: "万人次" },
  series: [
    {
      name: "观测",
      data: [
        { x: "2016", y: 40 },
        { x: "2021", y: 28 },
        { x: "2026", y: 24 },
      ],
    },
    {
      name: "对照",
      data: [
        { x: "2016", y: 38 },
        { x: "2021", y: 36 },
        { x: "2026", y: 35 },
      ],
    },
  ],
}

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

describe("layoutDef", () => {
  it("declares pinOnly, chrome none, capacity-1 body, content slide type", () => {
    expect(layoutDef.id).toBe("one-evidence")
    expect(layoutDef.pinOnly).toBe(true)
    expect(layoutDef.chrome).toBe("none")
    expect(layoutDef.slideTypes).toEqual(["content"])
    expect(layoutDef.slots.find((s) => s.name === "body")?.capacity).toBe(1)
  })
})

describe("OneEvidenceContent", () => {
  it("CJK claim is left-aligned, chart is the evidence, y-title sits in the header row", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const slide: Slide = {
      type: "content",
      layout: "one-evidence",
      heading: CJK_CLAIM,
      footnote: "来源：监测站年报",
      components: [BAR_CHART],
    } as Slide
    const { markup, root } = render(
      <OneEvidenceContent ir={ir("consulting", [slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(markup).toContain(CJK_CLAIM)
    expect(markup).toContain("万人次")
    expect(markup).toContain("来源：监测站年报")
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("迁徙路线"),
    )!
    expect(heading.getAttribute("x")).toBe("80")
    expect(heading.getAttribute("text-anchor")).toBeNull()
    expect(root.querySelector("g[data-audit-rect]")).not.toBeNull()
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("picks chart over image when both are present (shared pickEvidence order)", () => {
    const ctx = buildCtx(resolveStyle("luxe"), {})
    const slide: Slide = {
      type: "content",
      layout: "one-evidence",
      heading: EN_CLAIM,
      components: [{ type: "image", asset_id: "img1", fit: "cover" }, BAR_CHART],
    } as Slide
    const { root } = render(
      <OneEvidenceContent ir={ir("luxe", [slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(root.querySelectorAll("rect").length).toBeGreaterThan(0)
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("English claim renders on museum without a crash", () => {
    const ctx = buildCtx(resolveStyle("museum"), {})
    const slide: Slide = {
      type: "content",
      layout: "one-evidence",
      heading: EN_CLAIM,
      components: [BAR_CHART],
    } as Slide
    const { markup, root } = render(
      <OneEvidenceContent ir={ir("museum", [slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(markup).toContain("corridor")
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("mixed long heading shrinks/wraps to at most 3 lines and never dumps the raw source verbatim", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const extreme = `${CJK_LONG}${MIXED_LONG}`
    const slide: Slide = {
      type: "content",
      layout: "one-evidence",
      heading: extreme,
      components: [],
    } as Slide
    const { markup, root } = render(
      <OneEvidenceContent ir={ir("insight", [slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(() => assertSubset(root)).not.toThrow()
    const headingTexts = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-weight") === "600",
    )
    expect(headingTexts.length).toBeGreaterThanOrEqual(1)
    expect(headingTexts.length).toBeLessThanOrEqual(3)
    expect(markup).not.toContain(extreme)
  })

  it("0 components: heading still renders, no empty text node", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const slide: Slide = {
      type: "content",
      layout: "one-evidence",
      heading: CJK_CLAIM,
      components: [],
    } as Slide
    const { root } = render(
      <OneEvidenceContent ir={ir("consulting", [slide])} slide={slide} index={0} ctx={ctx} />,
    )
    const texts = Array.from(root.querySelectorAll("text"))
    expect(texts.every((t) => (t.textContent ?? "").trim().length > 0)).toBe(true)
    expect(texts.some((t) => (t.textContent ?? "").includes("迁徙路线"))).toBe(true)
  })

  it("consulting tokens: no luxe baked hex leaks", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const slide: Slide = {
      type: "content",
      layout: "one-evidence",
      heading: CJK_CLAIM,
      components: [BAR_CHART],
    } as Slide
    const out = renderSvgMarkup(
      <OneEvidenceContent ir={ir("consulting", [slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(out).not.toContain("#0B0908")
    expect(out).not.toContain("#C6A15B")
  })
})
