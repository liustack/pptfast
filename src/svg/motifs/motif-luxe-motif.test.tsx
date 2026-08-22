// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { LuxeMotif } from "./motif-luxe-motif"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide
const ALL_SLIDES = [coverSlide, chapterSlide, contentSlide, endingSlide]

/** Branding 的四个 logo 盒（branding.tsx 的 logoBox）。 */
const LOGO_BANDS = [
  { x: 64, y: 48, w: 96, h: 40 },
  { x: 1120, y: 48, w: 96, h: 40 },
  { x: 64, y: 630, w: 96, h: 40 },
  { x: 1120, y: 630, w: 96, h: 40 },
]
/** 设计稿四个内容区里与金框最相关的两个（版心左右缘）。 */
const BODY_ZONE = { x: 96, y: 200, w: 1040, h: 420 }
const TITLE_ZONE = { x: 96, y: 48, w: 1040, h: 122 }

const ir = (theme: string): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
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

function draw(theme: string, slide: Slide) {
  const ctx = buildCtx(resolveStyle(theme), {})
  return { ...render(<LuxeMotif ir={ir(theme)} slide={slide} ctx={ctx} />), ctx }
}

/** 两道框（fill="none" 的 rect），按描边宽度分外/内。 */
function frames(root: Element) {
  const rects = Array.from(root.querySelectorAll("rect"))
  const framed = rects.filter((r) => r.getAttribute("fill") === "none")
  const num = (r: Element, a: string) => Number(r.getAttribute(a))
  return {
    outer: framed.find((r) => r.getAttribute("stroke-width") === "1.5")!,
    inner: framed.find((r) => r.getAttribute("stroke-width") === "0.75")!,
    diamond: rects.find((r) => r.getAttribute("transform")?.startsWith("rotate(45"))!,
    num,
  }
}

/**
 * luxe-motif v2「请柬金框」（2026-08-19 深底组皮肤重设计）。
 * 设计源：`.issues/2026-08-18-theme-redesign/skins/group1-dark-boards.dc.html`
 * 的 luxe 设计表。本文件是本轮新建——v1 的烫金细线一直没有自己的测试
 * （poster / constellation 都有），补齐三家对称。
 */
describe("LuxeMotif（请柬金框）", () => {
  it("四种页型都画：双层金框 + 框顶金菱（chapter 不再退让）", () => {
    for (const slide of ALL_SLIDES) {
      const { root } = draw("luxe", slide)
      const { outer, inner, diamond } = frames(root)
      expect(outer, `no outer frame on ${slide.type}`).toBeTruthy()
      expect(inner, `no inner frame on ${slide.type}`).toBeTruthy()
      expect(diamond, `no diamond on ${slide.type}`).toBeTruthy()
    }
  })

  it("金框与金菱一律走 accent（v1 取的是 primary——本轮 primary 已退成与底同黑的色块色）", () => {
    const t = resolveStyle("luxe")
    const { root } = draw("luxe", coverSlide)
    const { outer, inner, diamond } = frames(root)
    expect(outer.getAttribute("stroke")).toBe(t.colors.accent)
    expect(inner.getAttribute("stroke")).toBe(t.colors.accent)
    expect(diamond.getAttribute("fill")).toBe(t.colors.accent)
    expect(outer.getAttribute("opacity")).toBe("0.9")
    expect(inner.getAttribute("opacity")).toBe("0.45")
    // primary 不该出现在装饰里
    const { markup } = draw("luxe", coverSlide)
    expect(markup).not.toContain(t.colors.primary)
  })

  it("外框几何：36,24 起，右缘 1244", () => {
    const { root } = draw("luxe", coverSlide)
    const { outer, num } = frames(root)
    expect(num(outer, "x")).toBe(36)
    expect(num(outer, "y")).toBe(24)
    expect(num(outer, "x") + num(outer, "width")).toBe(1244)
  })

  /**
   * 安全区守卫（主会话裁定的两处微调之二）。设计稿原稿把外框下边画在 y650，
   * 那条横边会从右下 logo 盒 (1120,630,96×40) 的竖直区间正中穿过去；裁定
   * 上移到 624。把 `FRAME_BOTTOM` 改回 650 这条立刻红。
   */
  it("安全区微调：外框下边上移到 y624，让开右下 logo 盒的上沿 y630", () => {
    const { root } = draw("luxe", coverSlide)
    const { outer, inner, num } = frames(root)
    const outerBottom = num(outer, "y") + num(outer, "height")
    expect(outerBottom).toBe(624)
    expect(outerBottom).toBeLessThan(LOGO_BANDS[3].y)
    expect(outerBottom).toBeLessThan(LOGO_BANDS[2].y)

    // 内框跟着错位：四边一律内缩 10，上边落在 34，下边落在 614
    expect(num(inner, "x")).toBe(46)
    expect(num(inner, "y")).toBe(34)
    expect(num(inner, "x") + num(inner, "width")).toBe(1234)
    expect(num(inner, "y") + num(inner, "height")).toBe(614)
  })

  /**
   * 安全区守卫（2026-08-20 第四轮评审，批 2 波 H）。上一条只核对了外框上边
   * 与金菱对标题区上沿的净空，漏了内缩 10px 的内框。它落在 y38 时离页面
   * 顶行 kicker 的 em 框顶（正是 TITLE_ZONE.y = 48）只剩 9.6px，用户在
   * heritage p09 上点名的就是这条线。把 FRAME_Y 改回 28 这条立刻红。
   */
  it("安全区：内框上边也要给标题区留出 >=12px 光学净空，不只外框", () => {
    const { root } = draw("luxe", coverSlide)
    const { inner, num } = frames(root)
    const innerInkBottom = num(inner, "y") + Number(inner.getAttribute("stroke-width")) / 2
    expect(TITLE_ZONE.y - innerInkBottom).toBeGreaterThanOrEqual(12)
  })

  it("安全区：左右两轨在版心之外，上边与金菱压在标题区上沿之上", () => {
    const { root } = draw("luxe", coverSlide)
    const { outer, diamond, num } = frames(root)
    const left = num(outer, "x")
    const right = left + num(outer, "width")
    expect(left + 1).toBeLessThan(BODY_ZONE.x)
    expect(right - 1).toBeGreaterThan(BODY_ZONE.x + BODY_ZONE.w)
    expect(num(outer, "y") + 1).toBeLessThan(TITLE_ZONE.y)
    // 金菱旋转 45° 后的外接半径 = 边长/√2 ≈ 8.49
    const half = (num(diamond, "width") / 2) * Math.SQRT2
    const cy = num(diamond, "y") + num(diamond, "height") / 2
    expect(cy + half).toBeLessThan(TITLE_ZONE.y)
  })

  it("金菱居中在框上边中点，且是旋转 45° 的方块", () => {
    const { root } = draw("luxe", coverSlide)
    const { outer, diamond, num } = frames(root)
    const cx = num(diamond, "x") + num(diamond, "width") / 2
    const cy = num(diamond, "y") + num(diamond, "height") / 2
    expect(cx).toBe((num(outer, "x") + num(outer, "x") + num(outer, "width")) / 2)
    expect(cy).toBe(num(outer, "y"))
    expect(diamond.getAttribute("transform")).toBe(`rotate(45 ${cx} ${cy})`)
    expect(num(diamond, "width")).toBe(num(diamond, "height"))
  })

  it("换一家 tokens 渲染时颜色跟着换，luxe 的色一处不残留（零 hex 纪律的实证）", () => {
    const heritage = resolveStyle("heritage")
    const ctx = buildCtx(heritage, {})
    const { markup } = render(<LuxeMotif ir={ir("heritage")} slide={coverSlide} ctx={ctx} />)
    expect(markup).toContain(heritage.colors.accent)
    for (const hex of ["#0B0908", "#14110E", "#171310", "#C6A15B", "#F5EFE3", "#A89A82", "#2E2822"]) {
      expect(markup, `luxe token ${hex} leaked into heritage render`).not.toContain(hex)
    }
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变（v1 的三档 seed 变体已删）", () => {
    const ctx = buildCtx(resolveStyle("luxe"), {})
    const markups = new Set(
      Array.from({ length: 12 }, (_, i) =>
        renderSvgMarkup(
          <LuxeMotif
            ir={{ ...ir("luxe"), filename: `probe-${i}.pptx` } as PptxIR}
            slide={coverSlide}
            ctx={ctx}
          />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })

  it("不画任何左竖条——金框是四边闭合的框，不是一根竖条", () => {
    for (const slide of ALL_SLIDES) {
      const { root } = draw("luxe", slide)
      for (const r of Array.from(root.querySelectorAll("rect"))) {
        const w = Number(r.getAttribute("width"))
        const h = Number(r.getAttribute("height"))
        expect(w < 40 && h > 30, `narrow-tall bar rendered: ${r.outerHTML}`).toBe(false)
      }
    }
  })

  it("Decor body passes subset validation", () => {
    for (const slide of ALL_SLIDES) {
      expect(() => assertSubset(draw("luxe", slide).root)).not.toThrow()
    }
  })
})
