// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { contrastRatio } from "../audit/deck-audit"
import { ConstellationMotif } from "./motif-constellation-motif"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide
const ALL_SLIDES = [coverSlide, chapterSlide, contentSlide, endingSlide]

/** Branding 的四个 logo 盒 + 设计稿的标题/正文禁区右缘。 */
const LOGO_BR = { x: 1120, y: 630, w: 96, h: 40 }
const BODY_ZONE_RIGHT = 96 + 1040 // 版心右缘 x1136
const TITLE_ZONE_TOP = 48

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

function draw(theme: string, slide: Slide, deck?: Partial<PptxIR>) {
  const ctx = buildCtx(resolveStyle(theme), {})
  return { ...render(<ConstellationMotif ir={{ ...ir(theme), ...deck } as PptxIR} slide={slide} ctx={ctx} />), ctx }
}

const circles = (root: Element) => Array.from(root.querySelectorAll("circle"))
/** 节点 = 有 fill 的圆；轨道弧 = fill="none" 的大圆。 */
const nodes = (root: Element) => circles(root).filter((c) => c.getAttribute("fill") !== "none")
const orbits = (root: Element) => circles(root).filter((c) => c.getAttribute("fill") === "none")

/**
 * constellation-motif v2「星座链」（2026-08-19 深底组皮肤重设计）。
 * 设计源：`.issues/2026-08-18-theme-redesign/skins/group1-dark-boards.dc.html`
 * 的 tech 设计表。
 */
describe("ConstellationMotif（星座链 v2）", () => {
  it("不再画满页渐变场：无 defs / linearGradient / url(#) 填充，主题自己的背景不再被遮死", () => {
    for (const slide of ALL_SLIDES) {
      const { markup } = draw("tech", slide)
      expect(markup).not.toContain("linearGradient")
      expect(markup).not.toContain("<defs")
      expect(markup).not.toContain("url(#")
      // 也不再有任何满页 rect
      expect(markup).not.toContain('width="1280"')
    }
  })

  it("两个旧的孤儿渐变 stop 常量随渐变场一并删除（本文件回到零 hex）", () => {
    const { markup } = draw("tech", coverSlide)
    expect(markup).not.toContain("#04070E")
    expect(markup).not.toContain("#0A1220")
  })

  it("页面有显式背景时不再整块消失——该判断随渐变场一起删了（与 ink/luxe 等其余 motif 一致）", () => {
    const withBg = {
      slides: [coverSlide],
    }
    const bgSlide = { ...coverSlide, background: { kind: "color", value: "#123456" } } as Slide
    const { root } = draw("tech", bgSlide, withBg)
    expect(nodes(root).length).toBeGreaterThan(0)
  })

  it("四种页型都画右缘主链，不画支链", () => {
    const tokens = resolveStyle("tech")
    for (const slide of ALL_SLIDES) {
      const { root } = draw("tech", slide)
      const chains = Array.from(root.querySelectorAll("polyline"))
      expect(chains).toHaveLength(1)
      expect(chains[0]!.getAttribute("stroke")).toBe(tokens.colors.border)
      expect(chains[0]!.getAttribute("fill")).toBe("none")
      expect(chains[0]!.getAttribute("stroke-width")).toBe("1.5")
      expect(chains[0]!.getAttribute("points")!.trim().split(/\s+/)).toHaveLength(7)
    }
  })

  it("节点只留主链：accent / chartPalette[1]，不画疏星与支链紫点", () => {
    const t = resolveStyle("tech")
    const { root } = draw("tech", contentSlide)
    const fills = nodes(root).map((c) => c.getAttribute("fill"))
    expect(fills.filter((f) => f === t.colors.accent).length).toBe(6) // 4 枚 + 2 圈辉光
    expect(fills.filter((f) => f === t.colors.chartPalette[1]).length).toBe(4) // 3 枚 + 1 圈辉光
    expect(fills.filter((f) => f === t.colors.chartPalette[2]).length).toBe(0)
    expect(fills.filter((f) => f === t.colors.muted).length).toBe(0)
  })

  /**
   * 2026-08-21 变淡波：节点整档乘 0.45，几何一 px 不动。accent 满不透明压在
   * tech 底色上是 11.6:1、冷序列两色 5.9:1，都落在正文的判读区间里——「星轨
   * 进前景」说的是这几枚点。0.45 之后三档分别是 2.79 / 2.66 / 2.67:1，全在
   * 4.5:1 的正文地板以下。辉光同乘该系数，节点与自己 halo 的强弱关系不变。
   * 连线（border，1.43:1）与顶带疏星（零相交）不动。
   */
  it("封面节点整档退底 0.45（辉光同乘）。内容页再按 3:1 天花板往下退", () => {
    const cover = draw("tech", coverSlide).root
    const solid = nodes(cover).filter((c) => Number(c.getAttribute("r")) <= 4)
    expect(solid.length).toBe(7)
    for (const c of solid) expect(c.getAttribute("opacity")).toBe("0.45")
    const glows = nodes(cover).filter((c) => Number(c.getAttribute("r")) >= 6)
    expect(glows.map((c) => c.getAttribute("opacity")).sort()).toEqual(["0.1125", "0.1125", "0.135"])
    const content = draw("tech", contentSlide).root
    for (const c of nodes(content).filter((c) => Number(c.getAttribute("r")) <= 4)) {
      expect(Number(c.getAttribute("opacity"))).toBeLessThanOrEqual(0.45)
    }
  })

  /**
   * 「压字检测」：节点混色后压在页面底色上必须低于 4.5:1 的正文地板。
   * 把 `NODE_INK_OPACITY` 改回 1 这条立刻红（accent 11.6:1）。
   */
  it("压字检测：三档节点混色后都低于 4.5:1 的正文地板，正文自己远在其上", () => {
    const t = resolveStyle("tech")
    const bg = t.defaultBackgrounds.content
    const ground = bg.kind === "gradient" ? bg.from : t.colors.bg
    const hex = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16))
    const blend = (fg: string, a: number) => {
      const f = hex(fg)
      const b = hex(ground)
      return "#" + f.map((c, i) => Math.round(c * a + b[i]! * (1 - a)).toString(16).padStart(2, "0")).join("")
    }
    const { root } = draw("tech", contentSlide)
    const discs = nodes(root).filter(
      (c) => c.getAttribute("fill") !== t.colors.muted && Number(c.getAttribute("r")) <= 4,
    )
    expect(discs.length).toBeGreaterThan(0)
    for (const c of discs) {
      const ratio = contrastRatio(blend(c.getAttribute("fill")!, Number(c.getAttribute("opacity"))), ground)
      expect(ratio).toBeLessThan(4.5)
    }
    expect(contrastRatio(t.colors.text, ground)).toBeGreaterThan(4.5)
  })

  it("双轨道弧只进 cover / chapter，圆心在页外右上", () => {
    for (const slide of [coverSlide, chapterSlide]) {
      const { root } = draw("tech", slide)
      const arcs = orbits(root)
      expect(arcs).toHaveLength(2)
      for (const a of arcs) {
        expect(a.getAttribute("cx")).toBe("1420")
        expect(a.getAttribute("cy")).toBe("140")
        expect(a.getAttribute("stroke")).toBe(resolveStyle("tech").colors.border)
      }
      expect(arcs.map((a) => a.getAttribute("r"))).toEqual(["430", "310"])
    }
    for (const slide of [contentSlide, endingSlide]) {
      expect(orbits(draw("tech", slide).root)).toHaveLength(0)
    }
  })

  it("安全区：节点链整条在版心右缘 x1136 之外，且链底让开右下 logo 盒", () => {
    const { root } = draw("tech", contentSlide)
    const chainNodes = nodes(root).filter((c) => Number(c.getAttribute("cy")) > 40)
    expect(chainNodes.length).toBeGreaterThan(0)
    let lowest = 0
    for (const c of chainNodes) {
      const cx = Number(c.getAttribute("cx"))
      const cy = Number(c.getAttribute("cy"))
      const r = Number(c.getAttribute("r"))
      expect(cx - r, `node at ${cx} reaches into the body zone`).toBeGreaterThan(BODY_ZONE_RIGHT)
      lowest = Math.max(lowest, cy + r)
    }
    expect(lowest, "chain bottom must clear the br logo box").toBeLessThan(LOGO_BR.y)

    // 连线折点同样全在版心之外
    for (const pl of Array.from(root.querySelectorAll("polyline"))) {
      for (const pair of pl.getAttribute("points")!.trim().split(/\s+/)) {
        const [x, y] = pair.split(",").map(Number)
        expect(x).toBeGreaterThan(BODY_ZONE_RIGHT)
        expect(y + 1).toBeLessThan(LOGO_BR.y)
      }
    }
  })

  it("不画顶带疏星（r2 预算裁掉的次件）", () => {
    const muted = resolveStyle("tech").colors.muted
    const { root } = draw("tech", contentSlide)
    const stars = nodes(root).filter((c) => c.getAttribute("fill") === muted)
    expect(stars).toHaveLength(0)
    expect(TITLE_ZONE_TOP).toBe(48)
  })

  it("换一家 tokens 渲染时颜色整体跟着换，tech 的色一处不残留（零 hex 纪律的实证）", () => {
    const consulting = resolveStyle("consulting")
    const ctx = buildCtx(consulting, {})
    const { markup } = render(
      <ConstellationMotif ir={ir("consulting")} slide={coverSlide} ctx={ctx} />,
    )
    expect(markup).toContain(consulting.colors.accent)
    expect(markup).toContain(consulting.colors.border)
    for (const hex of ["#0A0F1E", "#121A30", "#14294A", "#53E0D2", "#EAF1FA", "#93A5C0", "#24304A"]) {
      expect(markup, `tech token ${hex} leaked into consulting render`).not.toContain(hex)
    }
  })

  it("读 chartPalette 但不随 chartPaletteOffset 轮转（装饰不因页码变色）", () => {
    const tokens = resolveStyle("tech")
    const markups = new Set(
      Array.from({ length: tokens.colors.chartPalette.length }, (_, offset) =>
        renderSvgMarkup(
          <ConstellationMotif
            ir={ir("tech")}
            slide={coverSlide}
            ctx={buildCtx(tokens, {}, undefined, undefined, undefined, offset)}
          />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const markups = new Set(
      Array.from({ length: 12 }, (_, i) =>
        renderSvgMarkup(
          <ConstellationMotif
            ir={{ ...ir("tech"), filename: `probe-${i}.pptx` } as PptxIR}
            slide={coverSlide}
            ctx={ctx}
          />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })

  it("不画任何左竖条", () => {
    for (const slide of ALL_SLIDES) {
      const { root } = draw("tech", slide)
      for (const r of Array.from(root.querySelectorAll("rect"))) {
        const w = Number(r.getAttribute("width"))
        const h = Number(r.getAttribute("height"))
        expect(w < 40 && h > 30, `narrow-tall bar rendered: ${r.outerHTML}`).toBe(false)
      }
    }
  })

  it("Decor body passes subset validation", () => {
    for (const slide of ALL_SLIDES) {
      expect(() => assertSubset(draw("tech", slide).root)).not.toThrow()
    }
  })
})
