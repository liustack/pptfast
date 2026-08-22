// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { blendOver, contrastRatio } from "../ink"
import { CONTENT_DECOR_CONTRAST_CEILING, countDecorPieces, leafOpacity, leafPaint, paintedLeaves } from "./decor-budget"
import { ConstellationMotif } from "./motif-constellation-motif"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide
const ALL_SLIDES = [coverSlide, chapterSlide, contentSlide, endingSlide]

const TITLE_ZONE = { x: 96, y: 48, w: 1040, h: 122 }
const BODY_ZONE = { x: 96, y: 200, w: 1040, h: 420 }
const FOOTER_ZONE = { x: 48, y: 664, w: 1184, h: 44 }
const LOGO_BR = { x: 1120, y: 630, w: 96, h: 40 }
const LOGO_TR = { x: 1120, y: 48, w: 96, h: 40 }

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
  return { ...render(<ConstellationMotif ir={ir(theme)} slide={slide} ctx={ctx} />), ctx }
}

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function lineBox(el: Element): { x: number; y: number; w: number; h: number } {
  const pts = (el.getAttribute("points") ?? "")
    .trim()
    .split(/\s+/)
    .map((p) => p.split(",").map(Number))
  const xs = pts.map((p) => p[0]!)
  const ys = pts.map((p) => p[1]!)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y: y - 1, w: Math.max(...xs) - x, h: 2 }
}

describe("ConstellationMotif（细规线，星座链退役）", () => {
  it("不再画节点链、轨道弧、碎点", () => {
    for (const slide of ALL_SLIDES) {
      const { root } = draw("tech", slide)
      const orbits = Array.from(root.querySelectorAll("circle")).filter((c) => c.getAttribute("fill") === "none")
      expect(orbits, slide.type).toHaveLength(0)
      for (const pl of Array.from(root.querySelectorAll("polyline"))) {
        expect(pl.getAttribute("points")!.trim().split(/\s+/).length, slide.type).toBeLessThan(3)
      }
    }
  })

  it("chapter 完全退让", () => {
    const { root } = draw("tech", chapterSlide)
    expect(countDecorPieces(root)).toBe(0)
    expect(root.querySelectorAll("polyline")).toHaveLength(0)
    expect(root.querySelectorAll("circle")).toHaveLength(0)
    expect(root.querySelectorAll("line")).toHaveLength(0)
  })

  it("cover/ending 只画一条 border 规线，不点青", () => {
    const tokens = resolveStyle("tech")
    for (const slide of [coverSlide, endingSlide]) {
      const { root } = draw("tech", slide)
      const chains = Array.from(root.querySelectorAll("polyline"))
      expect(chains).toHaveLength(1)
      expect(chains[0]!.getAttribute("stroke")).toBe(tokens.colors.border)
      expect(chains[0]!.getAttribute("fill")).toBe("none")
      expect(root.querySelectorAll("circle")).toHaveLength(0)
      expect(countDecorPieces(root)).toBe(1)
    }
    expect(draw("tech", coverSlide).markup).toBe(draw("tech", endingSlide).markup)
  })

  it("内容页规线走 border，青点睛骑在线上，件数 1", () => {
    const tokens = resolveStyle("tech")
    const { root } = draw("tech", contentSlide)
    expect(countDecorPieces(root)).toBe(1)
    const chain = root.querySelector("polyline")
    expect(chain?.getAttribute("stroke")).toBe(tokens.colors.border)
    const dots = Array.from(root.querySelectorAll("circle"))
    expect(dots).toHaveLength(2)
    for (const dot of dots) {
      expect(dot.getAttribute("fill")).toBe(tokens.colors.accent)
      expect(dot.getAttribute("cy")).toBe("36")
      const cx = Number(dot.getAttribute("cx"))
      expect(cx).toBeGreaterThanOrEqual(96)
      expect(cx).toBeLessThanOrEqual(1104)
    }
  })

  it("内容页叶子按 3:1 天花板退底，没有孤立小件", () => {
    const { root } = draw("tech", contentSlide)
    const tokens = resolveStyle("tech")
    const bg = tokens.defaultBackgrounds.content
    const ground = bg.kind === "gradient" ? bg.from : tokens.colors.bg
    for (const el of paintedLeaves(root)) {
      const paint = leafPaint(el)
      if (!paint) continue
      const ratio = contrastRatio(blendOver(paint.color, ground, leafOpacity(el)), ground)
      expect(ratio).toBeLessThan(CONTENT_DECOR_CONTRAST_CEILING)
    }
    const piece = root.querySelector("[data-decor-piece]")
    expect(piece).toBeTruthy()
    expect(piece!.querySelector("polyline")).toBeTruthy()
    expect(piece!.querySelectorAll("circle").length).toBe(2)
  })

  it("安全区：规线与点不进标题/正文/页脚/logo", () => {
    const { root } = draw("tech", contentSlide)
    const chain = root.querySelector("polyline")!
    expect(overlaps(lineBox(chain), TITLE_ZONE)).toBe(false)
    expect(overlaps(lineBox(chain), BODY_ZONE)).toBe(false)
    expect(overlaps(lineBox(chain), FOOTER_ZONE)).toBe(false)
    expect(overlaps(lineBox(chain), LOGO_BR)).toBe(false)
    expect(overlaps(lineBox(chain), LOGO_TR)).toBe(false)
    for (const c of Array.from(root.querySelectorAll("circle"))) {
      const r = Number(c.getAttribute("r"))
      const box = {
        x: Number(c.getAttribute("cx")) - r,
        y: Number(c.getAttribute("cy")) - r,
        w: r * 2,
        h: r * 2,
      }
      expect(overlaps(box, TITLE_ZONE)).toBe(false)
      expect(overlaps(box, BODY_ZONE)).toBe(false)
      expect(overlaps(box, FOOTER_ZONE)).toBe(false)
      expect(overlaps(box, LOGO_BR)).toBe(false)
    }
  })

  it("换一家 tokens 渲染时颜色整体跟着换，tech 的色一处不残留", () => {
    const consulting = resolveStyle("consulting")
    const ctx = buildCtx(consulting, {})
    const { markup } = render(
      <ConstellationMotif ir={ir("consulting")} slide={coverSlide} ctx={ctx} />,
    )
    expect(markup).toContain(consulting.colors.border)
    for (const hex of ["#0A0F1E", "#121A30", "#14294A", "#53E0D2", "#EAF1FA", "#93A5C0", "#24304A"]) {
      expect(markup, `tech token ${hex} leaked into consulting render`).not.toContain(hex)
    }
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const markups = new Set(
      Array.from({ length: 12 }, (_, i) =>
        renderSvgMarkup(
          <ConstellationMotif
            ir={{ ...ir("tech"), filename: `probe-${i}.pptx` } as PptxIR}
            slide={contentSlide}
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
