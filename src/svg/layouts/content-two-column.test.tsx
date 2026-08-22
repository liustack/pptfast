// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { TwoColumnContent } from "./content-two-column"
import type { PptxIR, Slide } from "@/ir"

// P2/P3 深度自查（2026-07-10）补齐：two-column 是 P3 Item ② 的轮换第二版式，
// 上线时只有 manifest 注册表锁与 FullSlideSvg 分发测试，没有自己的渲染断言。
// 自查发现它曾静默丢 slide.subheading（信息丢失，真机可见），本文件先以
// 失败测试锁住该行为再修复。

const chapter1: Slide = { type: "chapter", heading: "第一部分：市场洞察", components: [] } as Slide
const withSub: Slide = {
  type: "content",
  heading: "三大卖点驱动转化",
  subheading: "从种草到复购的完整链路",
  components: [
    { type: "bullets", items: ["要点一", "要点二"] },
    { type: "paragraph", text: "右栏段落。" },
  ],
} as Slide
const noSub: Slide = {
  type: "content",
  heading: "渠道组合与节奏",
  components: [{ type: "paragraph", text: "单块内容。" }],
} as Slide

function ir(slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: "consulting" },
    meta: {},
    assets: { images: {} },
    slides,
  } as PptxIR
}

function render(slide: Slide, slides: Slide[], index: number): string {
  const deck = ir(slides)
  const ctx = buildCtx(resolveStyle(deck.theme.id), deck.assets.images)
  return renderSvgMarkup(
    <TwoColumnContent ir={deck} slide={slide} index={index} ctx={ctx} />,
  )
}

describe("TwoColumnContent", () => {
  it("渲染 slide.subheading（丢副题回归锁）", () => {
    const markup = render(withSub, [chapter1, withSub], 1)
    expect(markup).toContain("从种草到复购的完整链路")
  })

  it("无 subheading 时不渲染副题槽位，heading/kicker/正文照常", () => {
    const markup = render(noSub, [chapter1, noSub], 1)
    expect(markup).toContain("渠道组合与节奏")
    expect(markup).toContain("第一部分：市场洞察")
    expect(markup).toContain("单块内容。")
  })

  it("gallery English two-column page keeps every authored block and every KPI value, with no silent drop", () => {
    const enSlide: Slide = {
      type: "content",
      layout: "two-column",
      heading: "Competitors are pricing below cost in the mid-market",
      components: [
        {
          type: "bullets",
          items: [
            "Renewals back to 91%, a six-quarter high",
            "Bookings up 23%, still too concentrated",
            "Accuracy at 88%, downtime down 40%",
            "Delivery cut from nine weeks to five",
            "In-house compute cut unit cost by 31%",
          ],
          style: "default",
        },
        {
          type: "kpi_cards",
          items: [
            {
              value: "102k",
              unit: "units",
              label: "Connected equipment",
              delta: "up" as const,
              // Live gallery credits the first card. That source line is
              // what makes a full-width restack miss the content rect, so
              // the page stays two-column and wrapping has to keep the
              // fourth value.
              source: "Lingyuan Intelligence Q2 2026 operating data",
            },
            { value: "91", unit: "%", label: "Renewal rate", delta: "up" as const },
            { value: "88", unit: "%", label: "Prediction accuracy", delta: "up" as const },
            { value: "5", unit: "weeks", label: "Average delivery time", delta: "down" as const },
          ],
        },
      ],
    } as Slide
    const markup = render(enSlide, [enSlide], 0)
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)
    expect(root.querySelector("[data-dropped]")).toBeNull()
    expect(root.querySelector("[data-dropped-silent]")).toBeNull()
    expect(markup).not.toMatch(/\+\d+ …/)
    expect(markup).toContain("Renewals back to 91%")
    expect(markup).toContain("In-house compute cut unit cost by 31%")
    const kpiValueEls = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-weight") === "bold",
    )
    const ownText = (el: Element) =>
      Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join("")
    const kpiValues = kpiValueEls.map(ownText)
    expect(kpiValues).toEqual(expect.arrayContaining(["102k", "91", "88", "5"]))
    // The 165px wrap cell ellipsizes "Average delivery time". The unit
    // tspan on the value "5" is the fourth metric, not the bullet's word
    // "weeks".
    const weeksValue = kpiValueEls.find((t) => ownText(t) === "5")
    expect(weeksValue?.querySelector("tspan")?.textContent).toBe("weeks")
  })

  it("a lone chart on two-column stays on the page and is not glued to the rule line", () => {
    const chartSlide: Slide = {
      type: "content",
      layout: "two-column",
      heading: "预测准确率提升带来的直接停机减少",
      components: [
        {
          type: "chart",
          chart_type: "bar",
          series: [{ name: "冶金", data: [{ x: "Q1", y: 42 }] }],
        },
      ],
    } as Slide
    const markup = render(chartSlide, [chartSlide], 0)
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)
    expect(root.querySelector("[data-dropped-silent]")).toBeNull()
    const rectG = root.querySelector("g[data-audit-rect]")!
    const rectY = Number(rectG.getAttribute("data-audit-rect")!.split(",")[1])
    const body = root.querySelector("g[data-audit-box]")!
    const bodyY = Number(body.getAttribute("data-audit-box")!.split(",")[1])
    expect(bodyY).toBeGreaterThan(rectY)
    expect(bodyY - rectY).toBeGreaterThan(16)
  })

  it("输出在可导出 SVG 子集内", () => {
    for (const [slide, slides, index] of [
      [withSub, [chapter1, withSub], 1],
      [noSub, [chapter1, noSub], 1],
    ] as const) {
      const markup = render(slide, [...slides], index)
      expect(() =>
        assertSubset(parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)),
      ).not.toThrow()
    }
  })
})
