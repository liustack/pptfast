// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { readableOn } from "../ink"
import { EnterpriseMotif } from "./motif-enterprise-motif"
import { countDecorPieces, DECOR_PIECE_ATTR, MAX_DECOR_PIECES } from "./decor-budget"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide

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
  return { ...render(<EnterpriseMotif ir={ir(theme)} slide={slide} ctx={ctx} />), ctx }
}

const num = (el: Element, a: string) => Number(el.getAttribute(a))

/**
 * enterprise-motif v3「方块秩序」（第八波制度板对账）。
 */
describe("EnterpriseMotif（方块秩序 v3）", () => {
  it("cover 只画右上三枚方块阶，不画刻度尺，不画左下 accent 方块", () => {
    const { root } = draw("enterprise", coverSlide)
    expect(Array.from(root.querySelectorAll("line"))).toHaveLength(0)
    expect(Array.from(root.querySelectorAll("rect"))).toHaveLength(3)
    expect(root.querySelector(`[${DECOR_PIECE_ATTR}="ikb-steps"]`)).toBeTruthy()
    expect(root.querySelector(`[${DECOR_PIECE_ATTR}="spark"]`)).toBeNull()
    expect(root.querySelector(`[${DECOR_PIECE_ATTR}="ruler"]`)).toBeNull()
  })

  it("cover 方块阶几何与板上一致，opacity 0.28（第三枚再半档）", () => {
    const { root, ctx } = draw("enterprise", coverSlide)
    const ink = readableOn(ctx.colors.primary)
    const rects = Array.from(root.querySelectorAll("rect"))
    expect(rects.map((r) => [num(r, "x"), num(r, "y"), num(r, "width"), num(r, "height")])).toEqual([
      [1120, 64, 26, 26],
      [1154, 98, 26, 26],
      [1086, 98, 26, 26],
    ])
    for (const r of rects) expect(r.getAttribute("fill")).toBe(ink)
    expect(Number(rects[0]?.getAttribute("opacity"))).toBe(0.28)
    expect(Number(rects[1]?.getAttribute("opacity"))).toBe(0.28)
    expect(Number(rects[2]?.getAttribute("opacity"))).toBeCloseTo(0.14)
  })

  it("chapter 浅底画顶缘刻度尺，不画方块阶、不画孤立 accent", () => {
    const { root } = draw("enterprise", chapterSlide)
    expect(Array.from(root.querySelectorAll("line"))).toHaveLength(7)
    expect(Array.from(root.querySelectorAll("rect"))).toHaveLength(0)
    expect(root.querySelector(`[${DECOR_PIECE_ATTR}="ruler"]`)).toBeTruthy()
  })

  it("ending 完全退让", () => {
    const { root } = draw("enterprise", endingSlide)
    expect(Array.from(root.querySelectorAll("rect"))).toHaveLength(0)
    expect(Array.from(root.querySelectorAll("line"))).toHaveLength(0)
  })

  it("content 画尺 + 三枚递减方块阶，不画左下 accent", () => {
    const { root } = draw("enterprise", contentSlide)
    expect(Array.from(root.querySelectorAll("line"))).toHaveLength(7)
    expect(Array.from(root.querySelectorAll("rect"))).toHaveLength(3)
    expect(root.querySelector(`[${DECOR_PIECE_ATTR}="spark"]`)).toBeNull()
  })

  it("content 方块阶仍是 v2 几何：三枚递减方块底边同在 y40", () => {
    const { root } = draw("enterprise", contentSlide)
    const rects = Array.from(root.querySelectorAll("rect")).map((r) => [
      num(r, "x"),
      num(r, "y"),
      num(r, "width"),
      num(r, "height"),
    ])
    expect(rects).toEqual([
      [1150, 12, 28, 28],
      [1188, 20, 20, 20],
      [1218, 26, 14, 14],
    ])
    for (const [, y, , h] of rects) expect(y + h).toBe(40)
  })

  it("颜色一律读 token：尺身 border、齿 muted、content 方块阶 primary", () => {
    const t = resolveStyle("enterprise")
    const { root } = draw("enterprise", contentSlide)
    const rule = Array.from(root.querySelectorAll("line")).find((l) => num(l, "x1") !== num(l, "x2"))!
    expect(rule.getAttribute("stroke")).toBe(t.colors.border)
    const ticks = Array.from(root.querySelectorAll("line")).filter((l) => l.getAttribute("stroke") === t.colors.muted)
    expect(ticks, "ticks must read colors.muted").toHaveLength(6)
    const steps = Array.from(root.querySelectorAll("rect")).filter((r) => r.getAttribute("fill") === t.colors.primary)
    expect(steps, "square steps must read colors.primary").toHaveLength(3)
  })

  it("motif 不读 chartPalette——图表调色板轮转改不动它一个字节", () => {
    const tokens = resolveStyle("enterprise")
    const markups = new Set(
      tokens.colors.chartPalette.map((_, offset) =>
        renderSvgMarkup(
          <EnterpriseMotif
            ir={ir("enterprise")}
            slide={coverSlide}
            ctx={buildCtx(tokens, {}, undefined, undefined, undefined, offset)}
          />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })

  it("chapter 刻度尺几何：y36 一条 x48→1120 的尺身，六枚齿两长四短、等距 214", () => {
    const { root } = draw("enterprise", chapterSlide)
    const lines = Array.from(root.querySelectorAll("line")).map((l) => [
      num(l, "x1"),
      num(l, "y1"),
      num(l, "x2"),
      num(l, "y2"),
    ])
    expect(lines).toEqual([
      [48, 36, 1120, 36],
      [48, 30, 48, 42],
      [262, 32, 262, 40],
      [476, 32, 476, 40],
      [690, 32, 690, 40],
      [904, 32, 904, 40],
      [1118, 30, 1118, 42],
    ])
  })

  it("没有左下 16×16 孤立方块，也没有左竖条", () => {
    for (const slide of [coverSlide, chapterSlide, contentSlide, endingSlide]) {
      const { root } = draw("enterprise", slide)
      for (const r of Array.from(root.querySelectorAll("rect"))) {
        expect([num(r, "x"), num(r, "y"), num(r, "width"), num(r, "height")]).not.toEqual([60, 626, 16, 16])
        expect(num(r, "width") < 40 && num(r, "height") > 30, `narrow-tall bar rendered: ${r.outerHTML}`).toBe(false)
      }
      for (const l of Array.from(root.querySelectorAll("line"))) {
        const vertical = num(l, "x1") === num(l, "x2") && Math.abs(num(l, "y2") - num(l, "y1")) > 30
        expect(vertical, `vertical bar rendered: ${l.outerHTML}`).toBe(false)
      }
    }
  })

  it("每一页件数不超过预算，且每组叶子都包在 data-decor-piece 里", () => {
    for (const slide of [coverSlide, chapterSlide, contentSlide, endingSlide]) {
      const { root } = draw("enterprise", slide)
      expect(countDecorPieces(root)).toBeLessThanOrEqual(MAX_DECOR_PIECES)
      for (const el of Array.from(root.querySelectorAll("rect,line"))) {
        expect(el.closest(`[${DECOR_PIECE_ATTR}]`), el.outerHTML).toBeTruthy()
      }
    }
  })

  it("换一家 tokens 渲染时颜色跟着换，enterprise 的色一处不残留", () => {
    const tech = resolveStyle("tech")
    const ctx = buildCtx(tech, {})
    const { markup } = render(<EnterpriseMotif ir={ir("tech")} slide={contentSlide} ctx={ctx} />)
    expect(markup).toContain(tech.colors.primary)
    for (const hex of ["#F7F7F4", "#0032A0", "#2F6FBF", "#17181A", "#5C6066", "#DEE0DB"]) {
      expect(markup, `enterprise token ${hex} leaked into the tech render`).not.toContain(hex)
    }
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变", () => {
    const ctx = buildCtx(resolveStyle("enterprise"), {})
    const markups = new Set(
      Array.from({ length: 12 }, (_, i) =>
        renderSvgMarkup(
          <EnterpriseMotif
            ir={{ ...ir("enterprise"), filename: `probe-${i}.pptx` } as PptxIR}
            slide={coverSlide}
            ctx={ctx}
          />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })

  it("cover 方块阶整组落在画布内，且在标题主块（y348）之上", () => {
    const { root } = draw("enterprise", coverSlide)
    for (const r of Array.from(root.querySelectorAll("rect"))) {
      expect(num(r, "x")).toBeGreaterThanOrEqual(0)
      expect(num(r, "x") + num(r, "width")).toBeLessThanOrEqual(1280)
      expect(num(r, "y") + num(r, "height")).toBeLessThan(348)
    }
  })

  it("不画幽灵序号，中景没有出血大字", () => {
    for (const slide of [coverSlide, chapterSlide, contentSlide, endingSlide]) {
      const { root } = draw("enterprise", slide)
      expect(Array.from(root.querySelectorAll("text"))).toHaveLength(0)
    }
  })

  it("Decor body passes subset validation", () => {
    for (const slide of [coverSlide, chapterSlide, contentSlide, endingSlide]) {
      expect(() => assertSubset(draw("enterprise", slide).root)).not.toThrow()
    }
  })
})
