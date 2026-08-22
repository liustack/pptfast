// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { contrastRatio } from "../ink"
import { SwissMotif } from "./motif-swiss-motif"
import { CANVAS_W_PX } from "../../constants"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide
const DRAWN_SLIDES = [coverSlide, chapterSlide, contentSlide, endingSlide]

/** 设计板上的四条红虚线禁区 + 第五带。 */
const TITLE_ZONE = { x: 96, y: 48, w: 1040, h: 122 }
const BODY_ZONE = { x: 96, y: 200, w: 1040, h: 420 }
const FOOTER_ZONE = { x: 48, y: 664, w: 1184, h: 44 }
const LOGO_BOX = { x: 1120, y: 630, w: 96, h: 40 }
const TR_LOGO_BAND = { x: 1120, y: 48, w: 96, h: 40 }
const FIFTH_BAND = { y0: 620, y1: 664 }

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
  return { ...render(<SwissMotif ir={ir(theme)} slide={slide} ctx={ctx} />), ctx }
}

const num = (el: Element, a: string) => Number(el.getAttribute(a))

type Box = { x0: number; y0: number; x1: number; y1: number }

const intersects = (b: Box, z: { x: number; y: number; w: number; h: number }) =>
  b.x0 < z.x + z.w && b.x1 > z.x && b.y0 < z.y + z.h && b.y1 > z.y

function rectBox(r: Element): Box {
  const x = num(r, "x")
  const y = num(r, "y")
  return { x0: x, y0: y, x1: x + num(r, "width"), y1: y + num(r, "height") }
}

function lineBox(l: Element): Box {
  return {
    x0: Math.min(num(l, "x1"), num(l, "x2")),
    y0: Math.min(num(l, "y1"), num(l, "y2")),
    x1: Math.max(num(l, "x1"), num(l, "x2")),
    y1: Math.max(num(l, "y1"), num(l, "y2")),
  }
}

/**
 * swiss-motif「冷白制度」页缘（2026-08-21 wave7）。
 * 设计源：`theme-wave7/Swiss.dc.html` 的封面样例 + 任务书 motif 条款。
 */
describe("SwissMotif（冷白制度页缘）", () => {
  it("四页型画同一张：一条顶边红条 + 三根右缘灰刻度", () => {
    for (const slide of DRAWN_SLIDES) {
      const { root } = draw("swiss", slide)
      expect(Array.from(root.querySelectorAll("rect")), `bar on ${slide.type}`).toHaveLength(1)
      expect(Array.from(root.querySelectorAll("line")), `ticks on ${slide.type}`).toHaveLength(3)
    }
  })

  it("cover/chapter/ending 输出完全相同。内容页退底，件数不变", () => {
    expect(draw("swiss", coverSlide).markup).toBe(draw("swiss", chapterSlide).markup)
    expect(draw("swiss", coverSlide).markup).toBe(draw("swiss", endingSlide).markup)
    expect(draw("swiss", contentSlide).root.querySelectorAll("rect")).toHaveLength(1)
    expect(draw("swiss", contentSlide).root.querySelectorAll("line")).toHaveLength(3)
  })

  it("chapter 硬黑底上红条与灰刻度都过可见度地板（红成边压黑，不是红成面）", () => {
    const t = resolveStyle("swiss")
    expect(t.defaultBackgrounds.chapter).toEqual({ kind: "color", value: t.colors.primary })
    expect(contrastRatio(t.colors.accent, t.colors.primary)).toBeGreaterThan(1.02)
    expect(contrastRatio(t.colors.muted, t.colors.primary)).toBeGreaterThan(1.02)
  })

  it("颜色一律读 token：红条走 accent，刻度走 muted，线宽 1.5", () => {
    const t = resolveStyle("swiss")
    const { root } = draw("swiss", coverSlide)
    const bar = root.querySelector("rect")!
    expect(bar.getAttribute("fill")).toBe(t.colors.accent)
    const ticks = Array.from(root.querySelectorAll("line"))
    expect(ticks).toHaveLength(3)
    for (const l of ticks) {
      expect(l.getAttribute("stroke")).toBe(t.colors.muted)
      expect(l.getAttribute("stroke-width")).toBe("1.5")
    }
  })

  it("motif 不读 chartPalette，调色板轮转改不动它一个字节", () => {
    const tokens = resolveStyle("swiss")
    const markups = new Set(
      tokens.colors.chartPalette.map((_, offset) =>
        renderSvgMarkup(
          <SwissMotif
            ir={ir("swiss")}
            slide={coverSlide}
            ctx={buildCtx(tokens, {}, undefined, undefined, undefined, offset)}
          />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })

  it("红条几何：y0 通栏 1280×12", () => {
    const { root } = draw("swiss", coverSlide)
    const bar = root.querySelector("rect")!
    expect(num(bar, "x")).toBe(0)
    expect(num(bar, "y")).toBe(0)
    expect(num(bar, "width")).toBe(CANVAS_W_PX)
    expect(num(bar, "height")).toBe(12)
  })

  it("三格灰刻度几何：x1252 起向右 16px，y64/96/128", () => {
    const { root } = draw("swiss", coverSlide)
    const lines = Array.from(root.querySelectorAll("line"))
    expect(lines.map((l) => [num(l, "x1"), num(l, "y1"), num(l, "x2"), num(l, "y2")])).toEqual([
      [1252, 64, 1268, 64],
      [1252, 96, 1268, 96],
      [1252, 128, 1268, 128],
    ])
  })

  it("安全区：红条整条在标题区上沿 y48 之上，也不进第五带", () => {
    const { root } = draw("swiss", coverSlide)
    const bar = rectBox(root.querySelector("rect")!)
    expect(bar.y1).toBeLessThanOrEqual(TITLE_ZONE.y)
    expect(bar.y1).toBeLessThanOrEqual(FIFTH_BAND.y0)
  })

  it("安全区：三格短划不进标题区、正文区、页脚、两个 logo 盒", () => {
    const { root } = draw("swiss", coverSlide)
    for (const l of Array.from(root.querySelectorAll("line"))) {
      const b = lineBox(l)
      expect(intersects(b, TITLE_ZONE), `tick vs title: ${l.outerHTML}`).toBe(false)
      expect(intersects(b, BODY_ZONE), `tick vs body: ${l.outerHTML}`).toBe(false)
      expect(intersects(b, FOOTER_ZONE), `tick vs footer: ${l.outerHTML}`).toBe(false)
      expect(intersects(b, LOGO_BOX), `tick vs br logo: ${l.outerHTML}`).toBe(false)
      expect(intersects(b, TR_LOGO_BAND), `tick vs tr logo: ${l.outerHTML}`).toBe(false)
      expect(b.y1).toBeLessThan(FIFTH_BAND.y0)
    }
  })

  it("不画整高裸格线，也不画任何粗平左竖条", () => {
    for (const slide of DRAWN_SLIDES) {
      const { root } = draw("swiss", slide)
      for (const l of Array.from(root.querySelectorAll("line"))) {
        const vertical = num(l, "x1") === num(l, "x2") && Math.abs(num(l, "y2") - num(l, "y1")) > 30
        expect(vertical, `vertical rule rendered: ${l.outerHTML}`).toBe(false)
      }
      for (const r of Array.from(root.querySelectorAll("rect"))) {
        const tallNarrow = num(r, "width") < 40 && num(r, "height") > 30
        expect(tallNarrow, `narrow-tall bar rendered: ${r.outerHTML}`).toBe(false)
      }
    }
  })

  it("换一家 tokens 渲染时颜色跟着换，swiss 的色一处不残留", () => {
    const academic = resolveStyle("academic")
    const ctx = buildCtx(academic, {})
    const { markup } = render(<SwissMotif ir={ir("academic")} slide={coverSlide} ctx={ctx} />)
    expect(markup).toContain(academic.colors.accent)
    expect(markup).toContain(academic.colors.muted)
    for (const hex of ["#F7F7F5", "#101010", "#D7282F", "#5F5F5C", "#E3E3E0", "#4A7A8A", "#C41F26"]) {
      expect(markup, `swiss token ${hex} leaked into the academic render`).not.toContain(hex)
    }
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变", () => {
    const ctx = buildCtx(resolveStyle("swiss"), {})
    const markups = new Set(
      Array.from({ length: 12 }, (_, i) =>
        renderSvgMarkup(
          <SwissMotif ir={{ ...ir("swiss"), filename: `probe-${i}.pptx` } as PptxIR} slide={coverSlide} ctx={ctx} />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })

  it("Decor body passes subset validation", () => {
    for (const slide of DRAWN_SLIDES) {
      expect(() => assertSubset(draw("swiss", slide).root)).not.toThrow()
    }
  })
})
