// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { contrastRatio } from "../ink"
import { resolveStyle } from "../../themes"
import { LectureMotif } from "./motif-lecture-motif"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide
const ALL_SLIDES = [coverSlide, chapterSlide, contentSlide, endingSlide]

const TITLE_ZONE = { x: 96, y: 48, w: 1040, h: 122 }
const BODY_ZONE = { x: 96, y: 200, w: 1040, h: 420 }
const FOOTER_ZONE = { x: 48, y: 664, w: 1184, h: 44 }
const LOGO_BOX = { x: 1120, y: 630, w: 96, h: 40 }
const FIFTH_BAND = { x: 0, y: 620, w: 1280, h: 44 }

const ir = (theme: string, filename = "x.pptx"): PptxIR =>
  ({
    version: "3",
    filename,
    theme: { id: theme },
    meta: {},
    assets: { images: {} },
    slides: [coverSlide],
  }) as unknown as PptxIR

function render(body: React.ReactElement): { markup: string; root: Element } {
  const markup = renderSvgMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      {body}
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup) }
}

function draw(theme: string, slide: Slide, filename?: string) {
  const ctx = buildCtx(resolveStyle(theme), {})
  return { ...render(<LectureMotif ir={ir(theme, filename)} slide={slide} ctx={ctx} />), ctx }
}

const num = (el: Element, a: string) => Number(el.getAttribute(a))

function frame(root: Element) {
  const rects = Array.from(root.querySelectorAll("rect")).filter((r) => r.getAttribute("fill") === "none")
  return rects[0]
}

/**
 * lecture-motif「粉笔槽细框」（2026-08-21 黑板夜校）。
 * 设计源：`theme-wave7/Lecture.dc.html` 的 26px 内缩 1px 细框。
 */
describe("LectureMotif（粉笔槽细框）", () => {
  it("四种页型都画同一根单层细框，chapter 不退让", () => {
    const markups = new Set<string>()
    for (const slide of ALL_SLIDES) {
      const { root, markup } = draw("lecture", slide)
      expect(frame(root), `no frame on ${slide.type}`).toBeTruthy()
      expect(root.querySelectorAll("rect")).toHaveLength(1)
      markups.add(markup)
    }
    expect(markups.size).toBe(1)
  })

  it("框走 border（粉笔槽），不走 accent，不加粗", () => {
    const t = resolveStyle("lecture")
    const { root, markup } = draw("lecture", coverSlide)
    const el = frame(root)!
    expect(el.getAttribute("stroke")).toBe(t.colors.border)
    expect(el.getAttribute("stroke-width")).toBe("1")
    expect(el.getAttribute("fill")).toBe("none")
    expect(markup).not.toContain(t.colors.accent)
    expect(markup).not.toContain(t.colors.primary)
  })

  it("几何：26,26 起，右缘 1254，下边 624", () => {
    const { root } = draw("lecture", coverSlide)
    const el = frame(root)!
    expect(num(el, "x")).toBe(26)
    expect(num(el, "y")).toBe(26)
    expect(num(el, "x") + num(el, "width")).toBe(1254)
    expect(num(el, "y") + num(el, "height")).toBe(624)
  })

  it("单层：只有一道框，不是 luxe 的双层金框", () => {
    const { root } = draw("lecture", coverSlide)
    const framed = Array.from(root.querySelectorAll("rect")).filter((r) => r.getAttribute("fill") === "none")
    expect(framed).toHaveLength(1)
    expect(root.querySelector("[transform]")).toBeNull()
  })

  it("无印章体系：不画实心方、不画 path，不是 ink 的落款列", () => {
    const { root } = draw("lecture", coverSlide)
    expect(root.querySelectorAll("path")).toHaveLength(0)
    expect(root.querySelectorAll("text")).toHaveLength(0)
    const filled = Array.from(root.querySelectorAll("rect")).filter((r) => {
      const fill = r.getAttribute("fill")
      return fill !== null && fill !== "none"
    })
    expect(filled).toHaveLength(0)
  })

  it("板上标题下的黄粉笔弧不进 motif（跟随内容，违反恒位红线）", () => {
    const { root, markup } = draw("lecture", coverSlide)
    expect(root.querySelectorAll("path")).toHaveLength(0)
    expect(markup).not.toContain(resolveStyle("lecture").colors.accent)
  })

  it("安全区：左右两轨在版心之外，上边在标题区上沿之上", () => {
    const { root } = draw("lecture", coverSlide)
    const el = frame(root)!
    const left = num(el, "x")
    const right = left + num(el, "width")
    const top = num(el, "y")
    const half = num(el, "stroke-width") / 2
    expect(left + half).toBeLessThan(BODY_ZONE.x)
    expect(right - half).toBeGreaterThan(BODY_ZONE.x + BODY_ZONE.w)
    expect(top + half).toBeLessThan(TITLE_ZONE.y)
  })

  it("安全区：下边上移到 y624，让开右下 logo 盒上沿 y630 和页脚带", () => {
    const { root } = draw("lecture", coverSlide)
    const el = frame(root)!
    const bottom = num(el, "y") + num(el, "height")
    expect(bottom).toBe(624)
    expect(bottom).toBeLessThan(LOGO_BOX.y)
    expect(bottom).toBeLessThan(FOOTER_ZONE.y)
    expect(bottom).toBeGreaterThan(BODY_ZONE.y + BODY_ZONE.h)
  })

  it("第五带发丝豁免：下边落在 y620-664 里，描边 ≤1.5px", () => {
    const { root } = draw("lecture", coverSlide)
    const el = frame(root)!
    const bottom = num(el, "y") + num(el, "height")
    expect(bottom).toBeGreaterThanOrEqual(FIFTH_BAND.y)
    expect(bottom).toBeLessThan(FIFTH_BAND.y + FIFTH_BAND.h)
    expect(num(el, "stroke-width")).toBeLessThanOrEqual(1.5)
  })

  it("正文墨压在框线叠 bg 的合成色上仍 ≥4.5:1（发丝豁免的对比度前提）", () => {
    const t = resolveStyle("lecture")
    expect(contrastRatio(t.colors.text, t.colors.border!)).toBeGreaterThanOrEqual(4.5)
  })

  it("不画任何左竖条——细框是四边闭合的框，不是一根竖条", () => {
    for (const slide of ALL_SLIDES) {
      const { root } = draw("lecture", slide)
      for (const r of Array.from(root.querySelectorAll("rect"))) {
        const w = Number(r.getAttribute("width"))
        const h = Number(r.getAttribute("height"))
        expect(w < 40 && h > 30, `narrow-tall bar rendered: ${r.outerHTML}`).toBe(false)
      }
    }
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变", () => {
    const markups = new Set(Array.from({ length: 12 }, (_, i) => draw("lecture", coverSlide, `probe-${i}.pptx`).markup))
    expect(markups.size).toBe(1)
  })

  it("同一份 IR 两次渲染逐字节相同", () => {
    expect(draw("lecture", coverSlide).markup).toBe(draw("lecture", coverSlide).markup)
  })

  it("换一家 tokens 渲染时颜色跟着换，lecture 的色一处不残留（零 hex 纪律的实证）", () => {
    const luxe = resolveStyle("luxe")
    const ctx = buildCtx(luxe, {})
    const { markup } = render(<LectureMotif ir={ir("luxe")} slide={coverSlide} ctx={ctx} />)
    expect(markup).toContain(luxe.colors.border)
    for (const hex of ["#1C2823", "#26342E", "#2E4038", "#E9C46A", "#EFF3EC", "#A9BCAF", "#35443C"]) {
      expect(markup, `lecture token ${hex} leaked into luxe render`).not.toContain(hex)
    }
  })

  it("Decor body passes subset validation", () => {
    for (const slide of ALL_SLIDES) {
      expect(() => assertSubset(draw("lecture", slide).root)).not.toThrow()
    }
  })
})
