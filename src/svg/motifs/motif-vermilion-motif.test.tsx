// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { VermilionMotif } from "./motif-vermilion-motif"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide
/** chapter 不画（整版 primary 正红底），其余三档画同一张。 */
const DRAWN_SLIDES = [coverSlide, contentSlide, endingSlide]

/** 设计板上的四条红虚线禁区。 */
const TITLE_ZONE = { x: 96, y: 48, w: 1040, h: 122 }
const BODY_ZONE = { x: 96, y: 200, w: 1040, h: 420 }
const FOOTER_ZONE = { x: 48, y: 664, w: 1184, h: 44 }
/** 默认（`br`）品牌 logo 盒，`branding.tsx` 的 `logoBox`；右上盒同尺寸。 */
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
  return { ...render(<VermilionMotif ir={ir(theme)} slide={slide} ctx={ctx} />), ctx }
}

const num = (el: Element, a: string) => Number(el.getAttribute(a))

function parts(root: Element) {
  const lines = Array.from(root.querySelectorAll("line"))
  const rays = lines.filter((l) => num(l, "x1") !== num(l, "x2") && num(l, "y1") !== num(l, "y2"))
  const horiz = lines.filter((l) => !rays.includes(l))
  const rects = Array.from(root.querySelectorAll("rect"))
  return {
    thickRule: horiz.find((l) => l.getAttribute("stroke-width") === "2")!,
    thinRule: horiz.find((l) => l.getAttribute("stroke-width") === "0.75")!,
    footRule: horiz.find((l) => l.getAttribute("stroke-width") === "1")!,
    rays,
    diamond: rects.find((r) => r.getAttribute("transform")?.startsWith("rotate(45"))!,
  }
}

const circumRadius = (r: Element) => (num(r, "width") / 2) * Math.SQRT2

/**
 * vermilion-motif v2「文件金线」（2026-08-19 暖纸组皮肤重设计）。
 * 设计源：`.issues/2026-08-18-theme-redesign/skins/group2-warm-boards.dc.html`
 * 的 vermilion 设计表。本文件是本轮新建。
 */
describe("VermilionMotif（文件金线）", () => {
  it("content 稀排钉 pin 整片退让，不和 statement 等脸的横线叠预算", () => {
    for (const layout of ["statement", "pull-quote", "stat-hero", "one-evidence", "mono-bleed"] as const) {
      const slide = { ...contentSlide, layout } as Slide
      const { root } = draw("vermilion", slide)
      expect(root.querySelectorAll("line"), layout).toHaveLength(0)
      expect(root.querySelectorAll("rect"), layout).toHaveLength(0)
    }
    expect(parts(draw("vermilion", contentSlide).root).thickRule).toBeTruthy()
    expect(parts(draw("vermilion", coverSlide).root).thickRule).toBeTruthy()
  })

  it("cover/content/ending 画同一张：顶缘金双线 + 四条金芒 + 底缘红线带中点金菱", () => {
    for (const slide of DRAWN_SLIDES) {
      const { root } = draw("vermilion", slide)
      const p = parts(root)
      expect(p.thickRule, `no thick rule on ${slide.type}`).toBeTruthy()
      expect(p.thinRule, `no thin rule on ${slide.type}`).toBeTruthy()
      expect(p.footRule, `no foot rule on ${slide.type}`).toBeTruthy()
      expect(p.rays, `wrong ray count on ${slide.type}`).toHaveLength(4)
      expect(p.diamond, `no diamond on ${slide.type}`).toBeTruthy()
    }
  })

  it("chapter 完全退让——整版 primary 正红底上底缘红线消失、金线与巨幅标题抢面", () => {
    const { root } = draw("vermilion", chapterSlide)
    expect(Array.from(root.querySelectorAll("line"))).toHaveLength(0)
    expect(Array.from(root.querySelectorAll("rect"))).toHaveLength(0)
  })

  it("颜色一律读 token：双线/金芒/金菱走 accent，底缘线走 primary", () => {
    const t = resolveStyle("vermilion")
    const { root } = draw("vermilion", coverSlide)
    const p = parts(root)
    expect(p.thickRule.getAttribute("stroke")).toBe(t.colors.accent)
    expect(p.thinRule.getAttribute("stroke")).toBe(t.colors.accent)
    for (const r of p.rays) expect(r.getAttribute("stroke")).toBe(t.colors.accent)
    expect(p.diamond.getAttribute("fill")).toBe(t.colors.accent)
    expect(p.footRule.getAttribute("stroke")).toBe(t.colors.primary)
    expect(p.footRule.getAttribute("opacity")).toBe("0.6")
  })

  it("顶缘双线几何：x48→1232，粗线 y22 / 细线 y30", () => {
    const { root } = draw("vermilion", coverSlide)
    const { thickRule, thinRule } = parts(root)
    for (const l of [thickRule, thinRule]) {
      expect(num(l, "x1")).toBe(48)
      expect(num(l, "x2")).toBe(1232)
    }
    expect(num(thickRule, "y1")).toBe(22)
    expect(num(thinRule, "y1")).toBe(30)
  })

  it("金芒扇几何：四条共起点 (1256,40)，端点逐一给死", () => {
    const { root } = draw("vermilion", coverSlide)
    const { rays } = parts(root)
    for (const r of rays) {
      expect(num(r, "x1")).toBe(1256)
      expect(num(r, "y1")).toBe(40)
    }
    expect(rays.map((r) => [num(r, "x2"), num(r, "y2")])).toEqual([
      [1160, 12],
      [1180, 8],
      [1205, 6],
      [1230, 5],
    ])
  })

  it("底缘线几何：x96→1184 的 y626，金菱压在它的中点 x640", () => {
    const { root } = draw("vermilion", coverSlide)
    const { footRule, diamond } = parts(root)
    expect(num(footRule, "x1")).toBe(96)
    expect(num(footRule, "x2")).toBe(1184)
    expect(num(footRule, "y1")).toBe(626)
    const cx = num(diamond, "x") + num(diamond, "width") / 2
    expect(cx).toBe(640)
    expect(num(diamond, "y") + num(diamond, "height") / 2).toBe(626)
  })

  /** 安全区守卫（设计板的四条红虚线逐条量）。 */
  it("安全区：顶缘双线与金芒扇全在标题区上沿 y48 与右上 logo 盒上沿之上", () => {
    const { root } = draw("vermilion", coverSlide)
    const { thickRule, thinRule, rays } = parts(root)
    expect(num(thickRule, "y1")).toBeLessThan(TITLE_ZONE.y)
    expect(num(thinRule, "y1")).toBeLessThan(TITLE_ZONE.y)
    for (const r of rays) {
      expect(Math.max(num(r, "y1"), num(r, "y2"))).toBeLessThan(LOGO_BOX_TR.y)
      expect(Math.max(num(r, "y1"), num(r, "y2"))).toBeLessThan(TITLE_ZONE.y)
    }
  })

  it("安全区：底缘线让开右下 logo 盒的上沿 y630，金菱不进页脚 meta 带", () => {
    const { root } = draw("vermilion", coverSlide)
    const { footRule, diamond } = parts(root)
    expect(num(footRule, "y1")).toBeLessThan(LOGO_BOX.y)
    expect(num(footRule, "y1")).toBeGreaterThan(BODY_ZONE.y + BODY_ZONE.h)
    const cx = num(diamond, "x") + num(diamond, "width") / 2
    const cy = num(diamond, "y") + num(diamond, "height") / 2
    const r = circumRadius(diamond)
    expect(cx + r).toBeLessThan(LOGO_BOX.x)
    expect(cy + r).toBeLessThan(FOOTER_ZONE.y)
  })

  it("安全区：整幅装饰不进正文区（y200-620 一件不落）", () => {
    for (const slide of DRAWN_SLIDES) {
      const { root } = draw("vermilion", slide)
      for (const l of Array.from(root.querySelectorAll("line"))) {
        const lo = Math.min(num(l, "y1"), num(l, "y2"))
        const hi = Math.max(num(l, "y1"), num(l, "y2"))
        expect(hi < BODY_ZONE.y || lo > BODY_ZONE.y + BODY_ZONE.h, `line inside the body zone: ${l.outerHTML}`).toBe(
          true,
        )
      }
    }
  })

  it("不画任何左竖条——v1 的绸带与本轮的金线都不是竖条", () => {
    for (const slide of DRAWN_SLIDES) {
      const { root } = draw("vermilion", slide)
      for (const l of Array.from(root.querySelectorAll("line"))) {
        const vertical = num(l, "x1") === num(l, "x2") && Math.abs(num(l, "y2") - num(l, "y1")) > 30
        expect(vertical, `vertical bar rendered: ${l.outerHTML}`).toBe(false)
      }
      for (const r of Array.from(root.querySelectorAll("rect"))) {
        expect(num(r, "width") < 40 && num(r, "height") > 30, `narrow-tall bar rendered: ${r.outerHTML}`).toBe(false)
      }
    }
  })

  it("刻意不用五角星等政治符号（gov-theme wave 裁定 2，本轮不变）：零 polygon/star 路径", () => {
    for (const slide of DRAWN_SLIDES) {
      const { root } = draw("vermilion", slide)
      expect(Array.from(root.querySelectorAll("polygon"))).toHaveLength(0)
      expect(Array.from(root.querySelectorAll("path"))).toHaveLength(0)
    }
  })

  it("换一家 tokens 渲染时颜色跟着换，vermilion 的色一处不残留（零 hex 纪律的实证）", () => {
    const heritage = resolveStyle("heritage")
    const ctx = buildCtx(heritage, {})
    const { markup } = render(<VermilionMotif ir={ir("heritage")} slide={coverSlide} ctx={ctx} />)
    expect(markup).toContain(heritage.colors.accent)
    expect(markup).toContain(heritage.colors.primary)
    for (const hex of ["#F6EFE3", "#FCF8EF", "#B02318", "#C79A3B", "#33231C", "#6E5B4B", "#E0D2B8"]) {
      expect(markup, `vermilion token ${hex} leaked into the heritage render`).not.toContain(hex)
    }
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变（v1 的三档 seed 变体已删）", () => {
    const ctx = buildCtx(resolveStyle("vermilion"), {})
    const markups = new Set(
      Array.from({ length: 12 }, (_, i) =>
        renderSvgMarkup(
          <VermilionMotif
            ir={{ ...ir("vermilion"), filename: `probe-${i}.pptx` } as PptxIR}
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
      expect(() => assertSubset(draw("vermilion", slide).root)).not.toThrow()
    }
  })
})
