// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { EmberMotif } from "./motif-ember-motif"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide
/** chapter 不画（整版 primary 火橙底），其余三档画同一张。 */
const DRAWN_SLIDES = [coverSlide, contentSlide, endingSlide]

/** 设计板上的四条红虚线禁区。 */
const TITLE_ZONE = { x: 96, y: 48, w: 1040, h: 122 }
const BODY_ZONE = { x: 96, y: 200, w: 1040, h: 420 }
/** 默认（`br`）品牌 logo 盒，`brand-chrome.tsx` 的 `logoBox`；右上盒同尺寸。 */
const LOGO_BOX = { x: 1120, y: 630, w: 96, h: 40 }
const LOGO_BOX_TR = { x: 1120, y: 48, w: 96, h: 40 }

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

const num = (el: Element, a: string) => Number(el.getAttribute(a))

function parts(root: Element) {
  const lines = Array.from(root.querySelectorAll("line"))
  const groups = Array.from(root.querySelectorAll("g"))
  const circles = (fill: string) =>
    Array.from(groups.find((g) => g.getAttribute("fill") === fill)?.querySelectorAll("circle") ?? [])
  return {
    guide: lines.find((l) => num(l, "x1") !== num(l, "x2") && num(l, "y1") !== num(l, "y2"))!,
    tick: lines.find((l) => num(l, "y1") === num(l, "y2"))!,
    circles,
    allCircles: Array.from(root.querySelectorAll("circle")),
  }
}

/**
 * ember-motif v2「上升火星」（2026-08-19 暖纸组皮肤重设计）。
 * 设计源：`.issues/2026-08-18-theme-redesign/skins/group2-warm-boards.dc.html`
 * 的 ember 设计表。本文件是本轮新建。
 */
describe("EmberMotif（上升火星）", () => {
  it("cover/content/ending 画同一张：斜引线 + 七枚火星 + 顶缘短线", () => {
    for (const slide of DRAWN_SLIDES) {
      const { root } = draw("ember", slide)
      const p = parts(root)
      expect(p.guide, `no guide line on ${slide.type}`).toBeTruthy()
      expect(p.tick, `no top tick on ${slide.type}`).toBeTruthy()
      expect(p.allCircles, `wrong spark count on ${slide.type}`).toHaveLength(7)
    }
  })

  it("chapter 完全退让——整版 primary 火橙底上四枚 primary 火星直接消失", () => {
    const { root } = draw("ember", chapterSlide)
    expect(Array.from(root.querySelectorAll("line"))).toHaveLength(0)
    expect(Array.from(root.querySelectorAll("circle"))).toHaveLength(0)
  })

  it("颜色一律读 token：四枚火星 primary、三枚 accent、斜引线 border、顶缘短线 primary", () => {
    const t = resolveStyle("ember")
    const { root } = draw("ember", coverSlide)
    const p = parts(root)
    expect(p.circles(t.colors.primary)).toHaveLength(4)
    expect(p.circles(t.colors.accent)).toHaveLength(3)
    expect(p.guide.getAttribute("stroke")).toBe(t.colors.border)
    expect(p.tick.getAttribute("stroke")).toBe(t.colors.primary)
  })

  it("点列几何：自下而上渐大，火橙与琥珀相间", () => {
    const t = resolveStyle("ember")
    const { root } = draw("ember", coverSlide)
    const p = parts(root)
    // 横坐标由斜引线解出（见下一条测试），这里钉的是解出来的那一组值。
    expect(p.circles(t.colors.primary).map((c) => [num(c, "cx"), num(c, "cy"), num(c, "r")])).toEqual([
      [1157.39, 560, 2.5],
      [1181.42, 430, 3.5],
      [1207.3, 290, 4.5],
      [1238.72, 120, 6],
    ])
    expect(p.circles(t.colors.accent).map((c) => [num(c, "cx"), num(c, "cy"), num(c, "r")])).toEqual([
      [1169.41, 495, 3],
      [1194.36, 360, 4],
      [1223.01, 205, 5],
    ])
    // 自下而上（y 递减）时半径递增——「上升」的方向感就是这条单调性。
    const byHeight = p.allCircles.map((c) => [num(c, "cy"), num(c, "r")] as const).sort((a, b) => b[0] - a[0])
    for (let i = 1; i < byHeight.length; i++) expect(byHeight[i]![1]).toBeGreaterThan(byHeight[i - 1]![1])
  })

  /**
   * 第四轮评审（ember p01）的返工点：用户原话「能不能让斜线串上圆点啊，
   * 这样一会串上一会没串上，忽左忽右」。改前七枚圆心相对斜引线各偏右
   * 0.7-4.7px，最下面那枚偏得比自己的半径还多。这条测试量的是「圆心落线」
   * 本身，而不是七个抄来的横坐标——常量改了它依然成立，几何错了它当场红。
   */
  it("七枚火星的圆心严格落在斜引线上（第四轮评审：不许一会串上一会悬空）", () => {
    const { root } = draw("ember", coverSlide)
    const { guide, allCircles } = parts(root)
    const [x1, y1, x2, y2] = [num(guide, "x1"), num(guide, "y1"), num(guide, "x2"), num(guide, "y2")]
    for (const c of allCircles) {
      const onLine = x1 + ((x2 - x1) * (num(c, "cy") - y1)) / (y2 - y1)
      // 点到线的垂距（0.01 的坐标取整乘以线的水平/斜长比），远小于 1px 线宽。
      expect(Math.abs(num(c, "cx") - onLine), `spark off the guide line: ${c.outerHTML}`).toBeLessThan(0.01)
    }
  })

  it("斜引线几何：(1150,600) → (1245,86)；顶缘短线 x48→120 的 y14", () => {
    const { root } = draw("ember", coverSlide)
    const { guide, tick } = parts(root)
    expect([num(guide, "x1"), num(guide, "y1"), num(guide, "x2"), num(guide, "y2")]).toEqual([1150, 600, 1245, 86])
    expect([num(tick, "x1"), num(tick, "y1"), num(tick, "x2"), num(tick, "y2")]).toEqual([48, 14, 120, 14])
  })

  /** 安全区守卫（设计板的四条红虚线逐条量）。 */
  it("安全区：右缘整组在正文区右沿 x1136 之外", () => {
    const { root } = draw("ember", coverSlide)
    const { guide, allCircles } = parts(root)
    expect(Math.min(num(guide, "x1"), num(guide, "x2"))).toBeGreaterThan(BODY_ZONE.x + BODY_ZONE.w)
    for (const c of allCircles) {
      expect(num(c, "cx") - num(c, "r"), `spark reaches into the body column: ${c.outerHTML}`).toBeGreaterThan(
        BODY_ZONE.x + BODY_ZONE.w,
      )
    }
  })

  it("安全区：斜引线不进右下 logo 盒，也不进右上 logo 盒", () => {
    const { root } = draw("ember", coverSlide)
    const { guide, allCircles } = parts(root)
    // 下端 y600 在右下 logo 盒上沿 y630 之上。
    expect(Math.max(num(guide, "y1"), num(guide, "y2"))).toBeLessThan(LOGO_BOX.y)
    // 右上盒的下沿 y88 处，引线的横坐标已经越过该盒的右沿 x1216。
    const [x1, y1, x2, y2] = [num(guide, "x1"), num(guide, "y1"), num(guide, "x2"), num(guide, "y2")]
    const tAtBoxBottom = (y1 - (LOGO_BOX_TR.y + LOGO_BOX_TR.h)) / (y1 - y2)
    expect(x1 + tAtBoxBottom * (x2 - x1)).toBeGreaterThan(LOGO_BOX_TR.x + LOGO_BOX_TR.w)
    // 每一枚火星都在右上盒之外（要么在它下面，要么在它右边）。
    for (const c of allCircles) {
      const belowBox = num(c, "cy") - num(c, "r") > LOGO_BOX_TR.y + LOGO_BOX_TR.h
      const rightOfBox = num(c, "cx") - num(c, "r") > LOGO_BOX_TR.x + LOGO_BOX_TR.w
      expect(belowBox || rightOfBox, `spark overlaps the top-right logo box: ${c.outerHTML}`).toBe(true)
    }
  })

  it("安全区：顶缘短线在标题区上沿 y48 之上", () => {
    const { root } = draw("ember", coverSlide)
    expect(num(parts(root).tick, "y1")).toBeLessThan(TITLE_ZONE.y)
  })

  it("不画任何左竖条", () => {
    for (const slide of DRAWN_SLIDES) {
      const { root } = draw("ember", slide)
      for (const l of Array.from(root.querySelectorAll("line"))) {
        const vertical = num(l, "x1") === num(l, "x2") && Math.abs(num(l, "y2") - num(l, "y1")) > 30
        expect(vertical, `vertical bar rendered: ${l.outerHTML}`).toBe(false)
      }
      for (const r of Array.from(root.querySelectorAll("rect"))) {
        expect(num(r, "width") < 40 && num(r, "height") > 30, `narrow-tall bar rendered: ${r.outerHTML}`).toBe(false)
      }
    }
  })

  it("换一家 tokens 渲染时颜色跟着换，ember 的色一处不残留（零 hex 纪律的实证）", () => {
    const terra = resolveStyle("terra")
    const ctx = buildCtx(terra, {})
    const { markup } = render(<EmberMotif ir={ir("terra")} slide={coverSlide} ctx={ctx} />)
    expect(markup).toContain(terra.colors.primary)
    expect(markup).toContain(terra.colors.accent)
    for (const hex of ["#FBF5EE", "#FFFDF9", "#BC4620", "#E8A13C", "#2E241E", "#6E6156", "#E8DCCB"]) {
      expect(markup, `ember token ${hex} leaked into the terra render`).not.toContain(hex)
    }
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变（v1 的三档 seed 变体已删）", () => {
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
    for (const slide of [...DRAWN_SLIDES, chapterSlide]) {
      expect(() => assertSubset(draw("ember", slide).root)).not.toThrow()
    }
  })
})
