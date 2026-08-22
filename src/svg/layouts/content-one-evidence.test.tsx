// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { OneEvidenceContent, layoutDef } from "./content-one-evidence"
import { measureTextUnits } from "../../lib/svg-text-layout"
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
  it("declares pinOnly, branding none, capacity-1 body, content slide type", () => {
    expect(layoutDef.id).toBe("one-evidence")
    expect(layoutDef.pinOnly).toBe(true)
    expect(layoutDef.branding).toBe("none")
    expect(layoutDef.slideTypes).toEqual(["content"])
    expect(layoutDef.slots.find((s) => s.name === "body")?.capacity).toBe(1)
  })
})

describe("OneEvidenceContent", () => {
  it("CJK claim is left-aligned, chart is the evidence, y-title stacks on the plot's left", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const slide: Slide = {
      type: "content",
      layout: "one-evidence",
      heading: CJK_CLAIM,
      footnote: "来源：监测站年报",
      components: [BAR_CHART],
    } as Slide
    const { markup, root } = render(
      <OneEvidenceContent ir={ir("insight", [slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(markup).toContain(CJK_CLAIM)
    expect(markup).toContain(">万</text>")
    expect(markup).toContain(">人</text>")
    expect(markup).toContain(">次</text>")
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
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const slide: Slide = {
      type: "content",
      layout: "one-evidence",
      heading: EN_CLAIM,
      components: [{ type: "image", asset_id: "img1", fit: "cover" }, BAR_CHART],
    } as Slide
    const { root } = render(
      <OneEvidenceContent ir={ir("consulting", [slide])} slide={slide} index={0} ctx={ctx} />,
    )
    expect(root.querySelectorAll("rect").length).toBeGreaterThan(0)
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("English claim renders on academic without a crash", () => {
    const ctx = buildCtx(resolveStyle("academic"), {})
    const slide: Slide = {
      type: "content",
      layout: "one-evidence",
      heading: EN_CLAIM,
      components: [BAR_CHART],
    } as Slide
    const { markup, root } = render(
      <OneEvidenceContent ir={ir("academic", [slide])} slide={slide} index={0} ctx={ctx} />,
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

const ONE_EVIDENCE_FACES = [
  "insight",
  "academic",
  "lecture",
  "swiss",
  "museum",
  "consulting",
  "tech",
  "vermilion",
  "campaign",
  "arena",
  "terra",
] as const

const PARTITION_CLAIM = "竞品在中小客户市场的价格压力已经传导到续约谈判"

function parseBox(attr: string | null): { x: number; y: number; w: number; h: number } {
  const [x, y, w, h] = (attr ?? "0,0,0,0").split(",").map(Number)
  return { x: x ?? 0, y: y ?? 0, w: w ?? 0, h: h ?? 0 }
}

function boxesOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function textBox(el: Element): { x: number; y: number; w: number; h: number; text: string } {
  const x0 = Number(el.getAttribute("x") ?? 0)
  const y = Number(el.getAttribute("y") ?? 0)
  const fs = Number(el.getAttribute("font-size") ?? 16)
  const text = el.textContent ?? ""
  const bold = Number(el.getAttribute("font-weight") ?? 400) >= 600
  const w = Math.max(8, measureTextUnits(text, { bold, fontFamily: el.getAttribute("font-family") ?? undefined }) * fs)
  const anchor = el.getAttribute("text-anchor")
  let x = x0
  if (anchor === "middle") x -= w / 2
  if (anchor === "end") x -= w
  return { x, y: y - fs, w, h: fs * 1.25, text }
}

describe("one-evidence evidence vs assertion partition", () => {
  it.each(ONE_EVIDENCE_FACES)("%s: assertion text does not overlap the evidence rect", (theme) => {
    const ctx = buildCtx(resolveStyle(theme), {})
    const slide: Slide = {
      type: "content",
      layout: "one-evidence",
      heading: PARTITION_CLAIM,
      subheading: "217 张工单全量统计，无一例外",
      footnote: "来源：2026 Q2 运行数据",
      components: [BAR_CHART],
    } as Slide
    const { root } = render(
      <OneEvidenceContent ir={ir(theme, [slide])} slide={slide} index={0} ctx={ctx} />,
    )
    const evG = root.querySelector("g[data-audit-rect]")
    expect(evG, "fitted evidence rect").not.toBeNull()
    const ev = parseBox(evG!.getAttribute("data-audit-rect"))
    const texts = Array.from(root.querySelectorAll("text")).filter((t) => !t.closest("[data-audit-rect]"))
    for (const t of texts) {
      const box = textBox(t)
      expect(boxesOverlap(box, ev), `"${box.text}" vs evidence ${ev.x},${ev.y},${ev.w},${ev.h}`).toBe(false)
    }
  })

  it("generic face keeps heading at x=80 / y=72 and parks evidence below the claim", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const slide: Slide = {
      type: "content",
      layout: "one-evidence",
      heading: CJK_CLAIM,
      components: [BAR_CHART],
    } as Slide
    const { root } = render(
      <OneEvidenceContent ir={ir("insight", [slide])} slide={slide} index={0} ctx={ctx} />,
    )
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("迁徙路线"),
    )!
    expect(heading.getAttribute("x")).toBe("80")
    expect(heading.getAttribute("y")).toBe("72")
    const ev = parseBox(root.querySelector("g[data-audit-rect]")!.getAttribute("data-audit-rect"))
    expect(ev.y).toBeGreaterThanOrEqual(Number(heading.getAttribute("y")))
  })

  it("museum with evidence gives the chart a band at least 140px below the claim", () => {
    const ctx = buildCtx(resolveStyle("museum"), {})
    const slide: Slide = {
      type: "content",
      layout: "one-evidence",
      heading: PARTITION_CLAIM,
      subheading: "试点客户 90 天 · 217 张工单",
      components: [BAR_CHART],
    } as Slide
    const { root } = render(
      <OneEvidenceContent ir={ir("museum", [slide])} slide={slide} index={0} ctx={ctx} />,
    )
    const ev = parseBox(root.querySelector("g[data-audit-rect]")!.getAttribute("data-audit-rect"))
    expect(ev.h).toBeGreaterThanOrEqual(140)
    const claim = Array.from(root.querySelectorAll("text"))
      .filter((t) => !t.closest("[data-audit-rect]"))
      .map(textBox)
      .find((t) => t.text.includes("竞品") || t.text.includes("价格"))
    expect(claim).toBeTruthy()
    expect(claim!.y + claim!.h).toBeLessThanOrEqual(ev.y + 1)
  })
})
