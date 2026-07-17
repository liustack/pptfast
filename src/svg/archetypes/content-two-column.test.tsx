// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../FullSlideSvg"
import { resolveStyle } from "../../styles"
import { TwoColumnContent } from "./content-two-column"
import type { PptxIR, Slide } from "@/ir"

// P2/P3 深度自查（2026-07-10）补齐：two-column 是 P3 Item ② 的轮换第二版式，
// 上线时只有 manifest 注册表锁与 FullSlideSvg 分发测试，没有自己的渲染断言。
// 自查发现它曾静默丢 slide.subheading（信息丢失，真机可见），本文件先以
// 失败测试锁住该行为再修复。

const chapter1: Slide = { type: "chapter", heading: "第一部分：市场洞察", blocks: [] } as Slide
const withSub: Slide = {
  type: "content",
  variant: "single",
  heading: "三大卖点驱动转化",
  subheading: "从种草到复购的完整链路",
  blocks: [
    { type: "bullets", items: ["要点一", "要点二"] },
    { type: "paragraph", text: "右栏段落。" },
  ],
} as Slide
const noSub: Slide = {
  type: "content",
  variant: "single",
  heading: "渠道组合与节奏",
  blocks: [{ type: "paragraph", text: "单块内容。" }],
} as Slide

function ir(slides: Slide[]): PptxIR {
  return {
    version: "3",
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
