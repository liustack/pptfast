// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { EmberMotif } from "./motif-ember-motif"
import { paintedLeaves } from "./decor-budget"
import { renderSlideSvg } from "../../api"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide
const ALL_SLIDES = [coverSlide, chapterSlide, contentSlide, endingSlide]

const ir = (theme: string): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
    theme: { id: theme },
    meta: {},
    assets: { images: {} },
    slides: [coverSlide],
  }) as unknown as PptxIR

function render(body: React.ReactElement | null): { markup: string; root: Element } {
  const markup = renderSvgMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      {body}
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup) }
}

function draw(theme: string, slide: Slide) {
  const ctx = buildCtx(resolveStyle(theme), {})
  return { ...render(<EmberMotif ir={ir(theme)} slide={slide} ctx={ctx} />), ctx }
}

/**
 * ember-motif v3：上升火星退役。封面楔归版式，章节小楔归章节版式。
 */
describe("EmberMotif（火星退役）", () => {
  it("cover/chapter/content/ending 都不画火星、斜引线、碎点", () => {
    for (const slide of ALL_SLIDES) {
      const { root } = draw("ember", slide)
      expect(root.querySelectorAll("circle"), slide.type).toHaveLength(0)
      expect(root.querySelectorAll("line"), slide.type).toHaveLength(0)
      expect(paintedLeaves(root), slide.type).toHaveLength(0)
    }
  })

  it("chapter 退让：版式自己画小楔，motif 不重画", () => {
    const { root } = draw("ember", chapterSlide)
    expect(root.querySelector("path")).toBeNull()
    expect(root.querySelector("[data-decor-piece]")).toBeNull()
  })

  it("封面整页渲染：中景不再有火星，角楔主体固定进入 fg", () => {
    const svg = renderSlideSvg(
      {
        version: "4",
        filename: "ember-cover.pptx",
        theme: { id: "ember" },
        meta: {},
        assets: { images: {} },
        slides: [{ type: "cover", heading: "封面", components: [] }],
      } as unknown as PptxIR,
      0,
    )
    const root = parseSvgRoot(svg)
    const groups = Array.from(root.querySelectorAll("g[data-depth]"))
    const mid = groups.find((group) => group.getAttribute("data-depth") === "mid")
    const fg = groups.find((group) => group.getAttribute("data-depth") === "fg")!
    expect(mid?.querySelector("circle") ?? null).toBeNull()
    expect(fg.querySelector('[data-archetype="corner-wedge"] path')).not.toBeNull()
  })

  it("不画任何孤立 tick / 左竖条 / 碎点", () => {
    for (const slide of ALL_SLIDES) {
      const { root } = draw("ember", slide)
      expect(root.querySelectorAll("circle")).toHaveLength(0)
      expect(root.querySelectorAll("rect")).toHaveLength(0)
      expect(root.querySelectorAll("line")).toHaveLength(0)
    }
  })

  it("换一家 tokens 渲染时 ember 的色一处不残留（零 hex 纪律的实证）", () => {
    const terra = resolveStyle("terra")
    const ctx = buildCtx(terra, {})
    const { markup } = render(<EmberMotif ir={ir("terra")} slide={coverSlide} ctx={ctx} />)
    for (const hex of ["#241B14", "#2C221A", "#E56A2C", "#F2E9DF", "#C4AE97", "#6B5648", "#FBF5EE", "#BC4620"]) {
      expect(markup, `ember token ${hex} leaked into the terra render`).not.toContain(hex)
    }
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变", () => {
    const ctx = buildCtx(resolveStyle("ember"), {})
    const markups = new Set(
      Array.from({ length: 12 }, (_, i) =>
        renderSvgMarkup(
          <EmberMotif ir={{ ...ir("ember"), filename: `probe-${i}.pptx` } as PptxIR} slide={coverSlide} ctx={ctx} />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })

  it("Decor body passes subset validation", () => {
    for (const slide of ALL_SLIDES) {
      expect(() => assertSubset(draw("ember", slide).root)).not.toThrow()
    }
  })
})
