// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { ConstellationMotif } from "./motif-constellation-motif"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide
const ALL_SLIDES = [coverSlide, chapterSlide, contentSlide, endingSlide]

/** BrandChrome 的四个 logo 盒 + 设计稿的标题/正文禁区右缘。 */
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

  it("四种页型都画右缘节点链：主链 + 三条支链，连线走 border", () => {
    const tokens = resolveStyle("tech")
    for (const slide of ALL_SLIDES) {
      const { root } = draw("tech", slide)
      const chains = Array.from(root.querySelectorAll("polyline"))
      expect(chains).toHaveLength(4)
      for (const c of chains) {
        expect(c.getAttribute("stroke")).toBe(tokens.colors.border)
        expect(c.getAttribute("fill")).toBe("none")
        expect(c.getAttribute("stroke-width")).toBe("1.5")
      }
      // 主链七个折点
      expect(chains[0].getAttribute("points")!.trim().split(/\s+/)).toHaveLength(7)
    }
  })

  it("节点分三档着色：accent / chartPalette[1] / chartPalette[2]，疏星走 muted", () => {
    const t = resolveStyle("tech")
    const { root } = draw("tech", contentSlide)
    const fills = nodes(root).map((c) => c.getAttribute("fill"))
    expect(fills.filter((f) => f === t.colors.accent).length).toBe(7) // 5 枚 + 2 圈辉光
    expect(fills.filter((f) => f === t.colors.chartPalette[1]).length).toBe(5) // 4 枚 + 1 圈辉光
    expect(fills.filter((f) => f === t.colors.chartPalette[2]).length).toBe(1)
    expect(fills.filter((f) => f === t.colors.muted).length).toBe(4) // 顶带疏星
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

  it("安全区：顶带疏星压在标题区上沿之上", () => {
    const { root } = draw("tech", contentSlide)
    const stars = nodes(root).filter((c) => c.getAttribute("fill") === resolveStyle("tech").colors.muted)
    expect(stars).toHaveLength(4)
    for (const s of stars) {
      expect(Number(s.getAttribute("cy")) + Number(s.getAttribute("r"))).toBeLessThan(TITLE_ZONE_TOP)
    }
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
