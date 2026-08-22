// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { contrastRatio } from "../ink"
import { PulseMotif } from "./motif-pulse-motif"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide
/** chapter 不画（整版 primary 底）。content/ending 画 ECG+细胞。cover 只画细胞。 */
const BODY_SLIDES = [contentSlide, endingSlide]

/** 设计板上的四条红虚线禁区。 */
const TITLE_ZONE = { x: 96, y: 48, w: 1040, h: 122 }
const BODY_ZONE = { x: 96, y: 200, w: 1040, h: 420 }
/** `branding.tsx` 的右上 logo 带。 */
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
  return { ...render(<PulseMotif ir={ir(theme)} slide={slide} ctx={ctx} />), ctx }
}

const num = (el: Element, a: string) => Number(el.getAttribute(a))

/** 折线 `points` 里的点对。 */
function points(el: Element): [number, number][] {
  return el
    .getAttribute("points")!
    .trim()
    .split(/\s+/)
    .map((p) => p.split(",").map(Number) as [number, number])
}

/**
 * pulse-motif v2「脉搏线」（2026-08-20 冷调组皮肤重设计）。
 * 设计源：`.issues/2026-08-18-theme-redesign/skins/group3-cool-boards.dc.html`
 * 的 pulse 设计表。本文件是本轮新建。
 */
describe("PulseMotif（脉搏线）", () => {
  it("content/ending 画一条心电线 + 三枚细胞圈。封面只留细胞，顶缘心电线让给楔面折线", () => {
    for (const slide of BODY_SLIDES) {
      const { root } = draw("pulse", slide)
      expect(Array.from(root.querySelectorAll("polyline")), `ecg on ${slide.type}`).toHaveLength(1)
      expect(Array.from(root.querySelectorAll("circle")), `cells on ${slide.type}`).toHaveLength(3)
      expect(Array.from(root.querySelectorAll("rect")), `capsules retired on ${slide.type}`).toHaveLength(0)
    }
    const { root: coverRoot } = draw("pulse", coverSlide)
    expect(Array.from(coverRoot.querySelectorAll("polyline")), "no top ECG on cover").toHaveLength(0)
    expect(Array.from(coverRoot.querySelectorAll("circle")), "cells stay on cover").toHaveLength(3)
  })

  it("content 与 ending 几何相同（内容页退底）。封面不画心电线", () => {
    expect(draw("pulse", contentSlide).root.querySelectorAll("polyline")).toHaveLength(1)
    expect(draw("pulse", endingSlide).root.querySelectorAll("polyline")).toHaveLength(1)
    expect(draw("pulse", coverSlide).root.querySelectorAll("polyline")).toHaveLength(0)
    expect(draw("pulse", coverSlide).markup).not.toBe(draw("pulse", contentSlide).markup)
  })

  it("chapter 完全退让——整版 primary 青绿底上画 accent 浅青实测 1.90:1，看不见", () => {
    const t = resolveStyle("pulse")
    const { root } = draw("pulse", chapterSlide)
    expect(root.children).toHaveLength(0)
    expect(Array.from(root.querySelectorAll("polyline"))).toHaveLength(0)
    // 退让的实测依据，而不是「感觉太淡」。
    expect(contrastRatio(t.colors.accent, t.colors.primary)).toBeLessThan(2)
  })

  it("颜色一律读 token：心电线与细胞圈都走 accent（浅青），线宽 1.5 / 1.2", () => {
    const t = resolveStyle("pulse")
    const { root } = draw("pulse", contentSlide)
    const ecg = root.querySelector("polyline")!
    expect(ecg.getAttribute("stroke")).toBe(t.colors.accent)
    expect(ecg.getAttribute("fill")).toBe("none")
    expect(ecg.getAttribute("stroke-width")).toBe("1.5")
    const cells = Array.from(root.querySelectorAll("circle"))
    expect(cells).toHaveLength(3)
    for (const c of cells) {
      expect(c.getAttribute("fill")).toBe("none")
      expect(c.getAttribute("stroke")).toBe(t.colors.accent)
      expect(c.getAttribute("stroke-width")).toBe("1.2")
    }
  })

  it("motif 不读 chartPalette——图表调色板轮转改不动它一个字节（v1 读天青/砂灰两格）", () => {
    const tokens = resolveStyle("pulse")
    const markups = new Set(
      tokens.colors.chartPalette.map((_, offset) =>
        renderSvgMarkup(
          <PulseMotif
            ir={ir("pulse")}
            slide={coverSlide}
            ctx={buildCtx(tokens, {}, undefined, undefined, undefined, offset)}
          />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })

  it("心电线几何：x48→1232 的基线 y30，全页只搏一次（尖峰限 y18-42）", () => {
    const { root } = draw("pulse", contentSlide)
    const pts = points(root.querySelector("polyline")!)
    expect(pts).toEqual([
      [48, 30],
      [1020, 30],
      [1040, 30],
      [1052, 18],
      [1066, 42],
      [1078, 30],
      [1232, 30],
    ])
    const ys = pts.map(([, y]) => y)
    expect(Math.min(...ys)).toBe(18)
    expect(Math.max(...ys)).toBe(42)
    // 「一整页一次心搏」：离开基线的点恰好两枚（R 峰 + Q 谷）。
    expect(ys.filter((y) => y !== 30)).toHaveLength(2)
  })

  it("细胞圈几何：x1245 上三枚空心圆 r9/r6/r4，y310/360/404", () => {
    const { root } = draw("pulse", coverSlide)
    const cells = Array.from(root.querySelectorAll("circle")).map((c) => [num(c, "cx"), num(c, "cy"), num(c, "r")])
    expect(cells).toEqual([
      [1245, 310, 9],
      [1245, 360, 6],
      [1245, 404, 4],
    ])
  })

  /** 安全区守卫（设计板的四条红虚线逐条量）。 */
  it("安全区：心电线整条在标题区上沿 y48 之上", () => {
    const { root } = draw("pulse", contentSlide)
    const ys = points(root.querySelector("polyline")!).map(([, y]) => y)
    expect(Math.max(...ys)).toBeLessThan(TITLE_ZONE.y)
  })

  it("安全区：细胞圈在标题区/正文区右沿 x1136 之外，也在右上 logo 带右沿之外", () => {
    const { root } = draw("pulse", coverSlide)
    for (const c of Array.from(root.querySelectorAll("circle"))) {
      expect(num(c, "cx") - num(c, "r")).toBeGreaterThan(TITLE_ZONE.x + TITLE_ZONE.w)
      expect(num(c, "cx") - num(c, "r")).toBeGreaterThan(BODY_ZONE.x + BODY_ZONE.w)
      expect(num(c, "cx") - num(c, "r")).toBeGreaterThan(TR_LOGO_BAND.x + TR_LOGO_BAND.w)
    }
  })

  it("不画任何左竖条", () => {
    for (const slide of [...BODY_SLIDES, coverSlide]) {
      const { root } = draw("pulse", slide)
      for (const r of Array.from(root.querySelectorAll("rect"))) {
        expect(num(r, "width") < 40 && num(r, "height") > 30, `narrow-tall bar rendered: ${r.outerHTML}`).toBe(false)
      }
      for (const l of Array.from(root.querySelectorAll("line"))) {
        const vertical = num(l, "x1") === num(l, "x2") && Math.abs(num(l, "y2") - num(l, "y1")) > 30
        expect(vertical, `vertical bar rendered: ${l.outerHTML}`).toBe(false)
      }
    }
  })

  it("换一家 tokens 渲染时颜色跟着换，pulse 的色一处不残留（零 hex 纪律的实证）", () => {
    const academic = resolveStyle("academic")
    const ctx = buildCtx(academic, {})
    const { markup } = render(<PulseMotif ir={ir("academic")} slide={coverSlide} ctx={ctx} />)
    expect(markup).toContain(academic.colors.accent)
    for (const hex of ["#F2F7F4", "#FBFDFC", "#0E6B5C", "#3D9B82", "#1E2B27", "#5A6C66", "#D5E2DC"]) {
      expect(markup, `pulse token ${hex} leaked into the academic render`).not.toContain(hex)
    }
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变（v1 的三档 seed 变体已删）", () => {
    const ctx = buildCtx(resolveStyle("pulse"), {})
    const markups = new Set(
      Array.from({ length: 12 }, (_, i) =>
        renderSvgMarkup(
          <PulseMotif ir={{ ...ir("pulse"), filename: `probe-${i}.pptx` } as PptxIR} slide={coverSlide} ctx={ctx} />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })

  it("Decor body passes subset validation", () => {
    for (const slide of [...BODY_SLIDES, coverSlide, chapterSlide]) {
      expect(() => assertSubset(draw("pulse", slide).root)).not.toThrow()
    }
  })
})
