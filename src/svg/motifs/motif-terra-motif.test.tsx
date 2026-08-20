// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { TerraMotif } from "./motif-terra-motif"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide
/** chapter 不画（整版 primary 底），其余三档画同一张。 */
const DRAWN_SLIDES = [coverSlide, contentSlide, endingSlide]

/** 设计板上的四条红虚线禁区。 */
const TITLE_ZONE = { x: 96, y: 48, w: 1040, h: 122 }
const BODY_ZONE = { x: 96, y: 200, w: 1040, h: 420 }
const FOOTER_ZONE = { x: 48, y: 664, w: 1184, h: 44 }
/** 默认（`br`）品牌 logo 盒，`brand-chrome.tsx` 的 `logoBox`。 */
const LOGO_BOX = { x: 1120, y: 630, w: 96, h: 40 }

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
  return { ...render(<TerraMotif ir={ir(theme)} slide={slide} ctx={ctx} />), ctx }
}

const num = (el: Element, a: string) => Number(el.getAttribute(a))

/**
 * 一条二次贝塞尔折线的纵向极值，沿路径密集采样求得（控制点上的 622/630/632
 * 不落在曲线上，所以不能直接读 `d` 里的数字）。
 */
function pathYRange(d: string): { min: number; max: number } {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
  // "M x0,y0 (Q cx,cy x1,y1)*" — only the y coordinates matter here.
  let y0 = nums[1]!
  let min = y0
  let max = y0
  for (let i = 2; i + 3 < nums.length + 1; i += 4) {
    const cy = nums[i + 1]!
    const y1 = nums[i + 3]!
    for (let s = 0; s <= 200; s++) {
      const t = s / 200
      const mt = 1 - t
      const y = mt * mt * y0 + 2 * mt * t * cy + t * t * y1
      min = Math.min(min, y)
      max = Math.max(max, y)
    }
    y0 = y1
  }
  return { min, max }
}

/**
 * terra-motif v2「等高线」（2026-08-19 暖纸组皮肤重设计）。
 * 设计源：`.issues/2026-08-18-theme-redesign/skins/group2-warm-boards.dc.html`
 * 的 terra 设计表。本文件是本轮新建。
 */
describe("TerraMotif（等高线）", () => {
  it("cover/content/ending 画同一张：三条等高线 + 三枚种子点", () => {
    for (const slide of DRAWN_SLIDES) {
      const { root } = draw("terra", slide)
      expect(Array.from(root.querySelectorAll("path")), `contours on ${slide.type}`).toHaveLength(3)
      expect(Array.from(root.querySelectorAll("circle")), `seeds on ${slide.type}`).toHaveLength(3)
    }
  })

  it("chapter 完全退让——整版 primary 橄榄底上画 primary 装饰等于看不见", () => {
    const { root } = draw("terra", chapterSlide)
    expect(Array.from(root.querySelectorAll("path"))).toHaveLength(0)
    expect(Array.from(root.querySelectorAll("circle"))).toHaveLength(0)
  })

  /**
   * 2026-08-21 变淡波把等高线从 0.5 降到 0.25（1.43:1，与本主题 border 细线
   * 同档），几何一 px 不动——y634-658 这条带压着 49/41/40 页的正文墨盒，
   * 处方是变淡而不是搬位置。种子点零相交，仍是满不透明。
   */
  it("颜色一律读 token：等高线与种子点都走 primary，等高线 0.25 退底档", () => {
    const t = resolveStyle("terra")
    const { root } = draw("terra", coverSlide)
    const group = Array.from(root.querySelectorAll("g")).find((g) => g.getAttribute("fill") === "none")!
    expect(group.getAttribute("stroke")).toBe(t.colors.primary)
    expect(group.getAttribute("stroke-width")).toBe("1.2")
    expect(group.getAttribute("opacity")).toBe("0.25")
    const seedGroup = Array.from(root.querySelectorAll("g")).find((g) => g.getAttribute("fill") === t.colors.primary)!
    expect(seedGroup).toBeTruthy()
  })

  it("等高线几何：三条都自 x48 起，横向不越过 x420", () => {
    const { root } = draw("terra", coverSlide)
    const ds = Array.from(root.querySelectorAll("path")).map((p) => p.getAttribute("d")!)
    expect(ds).toEqual([
      "M48,658 Q160,622 300,640 Q380,650 420,646",
      "M48,650 Q150,630 270,644",
      "M48,642 Q120,632 200,644",
    ])
  })

  it("种子点几何：x1252 上的三枚 r2.5，y64/96/128", () => {
    const { root } = draw("terra", coverSlide)
    const seeds = Array.from(root.querySelectorAll("circle")).map((c) => [num(c, "cx"), num(c, "cy"), num(c, "r")])
    expect(seeds).toEqual([
      [1252, 64, 2.5],
      [1252, 96, 2.5],
      [1252, 128, 2.5],
    ])
  })

  /**
   * 安全区守卫（设计板的四条红虚线逐条量）。等高线的实际极值靠采样求，
   * 不读 `d` 里的控制点——把任何一个控制点往上挪进正文区，这一条立刻红。
   */
  it("安全区：等高线整组落在正文区下沿 y620 与页脚 meta 带上沿 y664 之间", () => {
    const { root } = draw("terra", coverSlide)
    for (const p of Array.from(root.querySelectorAll("path"))) {
      const { min, max } = pathYRange(p.getAttribute("d")!)
      expect(min, `contour rises into the body zone: ${p.getAttribute("d")}`).toBeGreaterThan(BODY_ZONE.y + BODY_ZONE.h)
      expect(max, `contour drops into the footer band: ${p.getAttribute("d")}`).toBeLessThan(FOOTER_ZONE.y)
    }
  })

  it("安全区：等高线横向止于 x420，够不到右下 logo 盒", () => {
    const { root } = draw("terra", coverSlide)
    for (const p of Array.from(root.querySelectorAll("path"))) {
      const xs = p
        .getAttribute("d")!
        .match(/-?\d+(?:\.\d+)?,/g)!
        .map((s) => Number(s.slice(0, -1)))
      expect(Math.max(...xs)).toBeLessThan(LOGO_BOX.x)
    }
  })

  it("安全区：种子点在标题区右沿与右上 logo 盒右沿之外", () => {
    const { root } = draw("terra", coverSlide)
    for (const c of Array.from(root.querySelectorAll("circle"))) {
      expect(num(c, "cx") - num(c, "r")).toBeGreaterThan(TITLE_ZONE.x + TITLE_ZONE.w)
      // 右上 logo 盒 (1120,48,96×40) 的右沿。
      expect(num(c, "cx") - num(c, "r")).toBeGreaterThan(1120 + 96)
    }
  })

  it("不画任何左竖条", () => {
    for (const slide of DRAWN_SLIDES) {
      const { root } = draw("terra", slide)
      for (const r of Array.from(root.querySelectorAll("rect"))) {
        expect(num(r, "width") < 40 && num(r, "height") > 30, `narrow-tall bar rendered: ${r.outerHTML}`).toBe(false)
      }
      for (const l of Array.from(root.querySelectorAll("line"))) {
        const vertical = num(l, "x1") === num(l, "x2") && Math.abs(num(l, "y2") - num(l, "y1")) > 30
        expect(vertical, `vertical bar rendered: ${l.outerHTML}`).toBe(false)
      }
    }
  })

  it("换一家 tokens 渲染时颜色跟着换，terra 的色一处不残留（零 hex 纪律的实证）", () => {
    const heritage = resolveStyle("heritage")
    const ctx = buildCtx(heritage, {})
    const { markup } = render(<TerraMotif ir={ir("heritage")} slide={coverSlide} ctx={ctx} />)
    expect(markup).toContain(heritage.colors.primary)
    for (const hex of ["#EFE9DC", "#F7F3E8", "#4D5D39", "#B25E38", "#2B2A22", "#656155", "#D8D0BC"]) {
      expect(markup, `terra token ${hex} leaked into the heritage render`).not.toContain(hex)
    }
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变（v1 的三档 seed 变体已删）", () => {
    const ctx = buildCtx(resolveStyle("terra"), {})
    const markups = new Set(
      Array.from({ length: 12 }, (_, i) =>
        renderSvgMarkup(
          <TerraMotif ir={{ ...ir("terra"), filename: `probe-${i}.pptx` } as PptxIR} slide={coverSlide} ctx={ctx} />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })

  it("Decor body passes subset validation", () => {
    for (const slide of [...DRAWN_SLIDES, chapterSlide]) {
      expect(() => assertSubset(draw("terra", slide).root)).not.toThrow()
    }
  })
})
