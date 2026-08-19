// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { EnterpriseMotif } from "./motif-enterprise-motif"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide
/** chapter 不画，其余三档画同一张（v1 的强/弱档已取消）。 */
const DRAWN_SLIDES = [coverSlide, contentSlide, endingSlide]

/** 设计板上的四条红虚线禁区。 */
const TITLE_ZONE = { x: 96, y: 48, w: 1040, h: 122 }
const BODY_ZONE = { x: 96, y: 200, w: 1040, h: 420 }
const FOOTER_ZONE = { x: 48, y: 664, w: 1184, h: 44 }
/** 默认（`br`）品牌 logo 盒，`brand-chrome.tsx` 的 `logoBox`；右上带同宽同高。 */
const LOGO_BOX = { x: 1120, y: 630, w: 96, h: 40 }
const TR_LOGO_BAND = { x: 1120, y: 48, w: 96, h: 40 }

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
 * enterprise-motif v2「方块秩序」（2026-08-20 冷调组皮肤重设计）。
 * 设计源：`.issues/2026-08-18-theme-redesign/skins/group3-cool-boards.dc.html`
 * 的 enterprise 设计表。本文件是本轮新建。
 */
describe("EnterpriseMotif（方块秩序）", () => {
  it("cover/content/ending 画同一张：尺身一条 + 六枚齿 + 三枚方块阶 + 一枚炸橘方块", () => {
    for (const slide of DRAWN_SLIDES) {
      const { root } = draw("enterprise", slide)
      expect(Array.from(root.querySelectorAll("line")), `ruler on ${slide.type}`).toHaveLength(7) // 尺身 1 + 齿 6
      expect(Array.from(root.querySelectorAll("rect")), `squares on ${slide.type}`).toHaveLength(4) // 阶 3 + 炸橘 1
    }
  })

  it("三档输出完全相同——v1 的强档（仅 cover）/ 弱档（右上一枚小方点）分档已取消", () => {
    const markups = new Set(DRAWN_SLIDES.map((slide) => draw("enterprise", slide).markup))
    expect(markups.size).toBe(1)
  })

  it("chapter 完全退让——顶带正是 chapter 版式摆 org 行与分隔线的地方", () => {
    const { root } = draw("enterprise", chapterSlide)
    expect(root.children).toHaveLength(0)
    expect(Array.from(root.querySelectorAll("rect"))).toHaveLength(0)
    expect(Array.from(root.querySelectorAll("line"))).toHaveLength(0)
  })

  it("颜色一律读 token：尺身 border、齿 muted、方块阶 primary、炸橘方块 accent", () => {
    const t = resolveStyle("enterprise")
    const { root } = draw("enterprise", coverSlide)
    const rule = Array.from(root.querySelectorAll("line")).find((l) => num(l, "x1") !== num(l, "x2"))!
    expect(rule.getAttribute("stroke")).toBe(t.colors.border)
    const tickGroup = Array.from(root.querySelectorAll("g")).find((g) => g.getAttribute("stroke") === t.colors.muted)
    expect(tickGroup, "ticks must read colors.muted").toBeTruthy()
    const stepGroup = Array.from(root.querySelectorAll("g")).find((g) => g.getAttribute("fill") === t.colors.primary)
    expect(stepGroup, "square steps must read colors.primary").toBeTruthy()
    const spark = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("fill") === t.colors.accent)
    expect(spark, "the single spark square must read colors.accent").toBeTruthy()
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

  it("刻度尺几何：y36 一条 x48→1120 的尺身，六枚齿两长四短、等距 214", () => {
    const { root } = draw("enterprise", coverSlide)
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

  it("方块阶与炸橘方块几何：三枚递减方块底边同在 y40，炸橘一枚在 x60,y626", () => {
    const { root } = draw("enterprise", coverSlide)
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
      [60, 626, 16, 16],
    ])
    for (const [, y, , h] of rects.slice(0, 3)) expect(y + h).toBe(40)
  })

  /** 安全区守卫（设计板的四条红虚线逐条量）。 */
  it("安全区：刻度尺与方块阶整组在标题区上沿 y48 之上", () => {
    const { root } = draw("enterprise", coverSlide)
    for (const l of Array.from(root.querySelectorAll("line"))) {
      expect(Math.max(num(l, "y1"), num(l, "y2"))).toBeLessThan(TITLE_ZONE.y)
    }
    for (const r of Array.from(root.querySelectorAll("rect")).slice(0, 3)) {
      expect(num(r, "y") + num(r, "height")).toBeLessThanOrEqual(TITLE_ZONE.y)
    }
  })

  it("安全区：尺身止于右上 logo 带左沿，方块阶在标题区右沿之外", () => {
    const { root } = draw("enterprise", coverSlide)
    const rule = Array.from(root.querySelectorAll("line"))[0]
    expect(num(rule, "x2")).toBeLessThanOrEqual(TR_LOGO_BAND.x)
    for (const r of Array.from(root.querySelectorAll("rect")).slice(0, 3)) {
      expect(num(r, "x")).toBeGreaterThan(TITLE_ZONE.x + TITLE_ZONE.w)
    }
  })

  it("安全区：炸橘方块在正文区左沿之外、下沿之下，且在页脚 meta 带与右下 logo 盒之外", () => {
    const { root } = draw("enterprise", coverSlide)
    const spark = Array.from(root.querySelectorAll("rect")).at(-1)!
    expect(num(spark, "x") + num(spark, "width")).toBeLessThan(BODY_ZONE.x)
    expect(num(spark, "y")).toBeGreaterThan(BODY_ZONE.y + BODY_ZONE.h)
    expect(num(spark, "y") + num(spark, "height")).toBeLessThan(FOOTER_ZONE.y)
    expect(num(spark, "x") + num(spark, "width")).toBeLessThan(LOGO_BOX.x)
  })

  it("不画任何左竖条——v1 的 variant b（x0,y180 的 6×360 竖条）已退役", () => {
    for (const slide of DRAWN_SLIDES) {
      const { root } = draw("enterprise", slide)
      for (const r of Array.from(root.querySelectorAll("rect"))) {
        expect(num(r, "width") < 40 && num(r, "height") > 30, `narrow-tall bar rendered: ${r.outerHTML}`).toBe(false)
      }
      for (const l of Array.from(root.querySelectorAll("line"))) {
        const vertical = num(l, "x1") === num(l, "x2") && Math.abs(num(l, "y2") - num(l, "y1")) > 30
        expect(vertical, `vertical bar rendered: ${l.outerHTML}`).toBe(false)
      }
    }
  })

  it("换一家 tokens 渲染时颜色跟着换，enterprise 的色一处不残留（零 hex 纪律的实证）", () => {
    const tech = resolveStyle("tech")
    const ctx = buildCtx(tech, {})
    const { markup } = render(<EnterpriseMotif ir={ir("tech")} slide={coverSlide} ctx={ctx} />)
    expect(markup).toContain(tech.colors.primary)
    expect(markup).toContain(tech.colors.accent)
    for (const hex of ["#F7F7F4", "#0032A0", "#E85D1F", "#17181A", "#5C6066", "#DEE0DB"]) {
      expect(markup, `enterprise token ${hex} leaked into the tech render`).not.toContain(hex)
    }
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变（v1 的三档 seed 变体已删）", () => {
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

  it("Decor body passes subset validation", () => {
    for (const slide of [...DRAWN_SLIDES, chapterSlide]) {
      expect(() => assertSubset(draw("enterprise", slide).root)).not.toThrow()
    }
  })
})
