// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { contrastRatio } from "../audit/deck-audit"
import { CONTENT_DECOR_CONTRAST_CEILING, countDecorPieces } from "./decor-budget"
import { PosterMotif } from "./motif-poster-motif"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide

const LOGO_BR = { x: 1120, y: 630, w: 96, h: 40 }

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

const ir = (theme: string, date?: string): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
    theme: { id: theme },
    meta: date ? { date } : {},
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

function draw(theme: string, slide: Slide, date?: string) {
  const tokens = resolveStyle(theme)
  const ctx = buildCtx(
    tokens,
    {},
    undefined,
    resolveBackgroundHex(tokens.defaultBackgrounds[slide.type], tokens.colors.surface),
  )
  return { ...render(<PosterMotif ir={ir(theme, date)} slide={slide} ctx={ctx} />), ctx, tokens }
}

function polylinePoints(root: Element): [number, number][] {
  const pl = root.querySelector("polyline")!
  return pl
    .getAttribute("points")!
    .trim()
    .split(/\s+/)
    .map((p) => p.split(",").map(Number) as [number, number])
}

/**
 * poster-motif 第八波：顶缘行情带与幽灵季字退役，只留底缘暗线。
 */
describe("PosterMotif（底缘暗线）", () => {
  it("content 稀排钉 pin 整片退让", () => {
    for (const layout of ["statement", "pull-quote", "stat-hero", "one-evidence", "mono-bleed"] as const) {
      const slide = { ...contentSlide, layout } as Slide
      const { root } = draw("insight", slide)
      expect(root.querySelectorAll("polyline"), layout).toHaveLength(0)
      expect(root.querySelectorAll("line"), layout).toHaveLength(0)
      expect(root.querySelectorAll("path"), layout).toHaveLength(0)
      expect(root.querySelectorAll("text"), layout).toHaveLength(0)
    }
    expect(draw("insight", contentSlide).root.querySelectorAll("polyline")).toHaveLength(1)
    expect(draw("insight", coverSlide).root.querySelectorAll("polyline")).toHaveLength(1)
  })

  it("退役顶缘行情带、刻度齿、封面幽灵季字", () => {
    for (const slide of [coverSlide, chapterSlide, contentSlide, endingSlide]) {
      const { root } = draw("insight", slide, "2026-07-15")
      expect(root.querySelectorAll("line"), slide.type).toHaveLength(0)
      expect(root.querySelectorAll("text"), slide.type).toHaveLength(0)
      expect(root.querySelectorAll("path"), slide.type).toHaveLength(0)
      expect(root.querySelectorAll("circle"), slide.type).toHaveLength(0)
    }
  })

  it("chapter 整片退让，幽灵序号改由章节版式画", () => {
    const { root } = draw("insight", chapterSlide, "2026-07-15")
    expect(root.querySelectorAll("polyline")).toHaveLength(0)
    expect(root.children).toHaveLength(0)
  })

  it("封面画板上那根底缘暗线：border，中景，一件", () => {
    const { root, tokens } = draw("insight", coverSlide)
    expect(countDecorPieces(root)).toBe(1)
    const line = root.querySelector("polyline")!
    expect(line.getAttribute("stroke")).toBe(tokens.colors.border)
    expect(line.getAttribute("fill")).toBe("none")
    expect(line.getAttribute("stroke-width")).toBe("2")
    const pts = polylinePoints(root)
    expect(pts[0]).toEqual([0, 545])
    expect(pts[pts.length - 1]).toEqual([1280, 522])
    const minY = Math.min(...pts.map(([, y]) => y))
    const maxY = Math.max(...pts.map(([, y]) => y))
    expect(rectsOverlap({ x: 0, y: minY - 1, w: 1280, h: maxY - minY + 2 }, LOGO_BR)).toBe(false)
  })

  it("ending / content 画 ending 板上那根更贴底缘的线", () => {
    for (const slide of [endingSlide, contentSlide]) {
      const { root, tokens } = draw("insight", slide)
      const pts = polylinePoints(root)
      expect(pts[0], slide.type).toEqual([0, 600])
      expect(pts[pts.length - 1], slide.type).toEqual([1280, 586])
      expect(root.querySelector("polyline")!.getAttribute("stroke")).toBe(tokens.colors.border)
    }
  })

  it("内容页中景对比低于 3:1 上限", () => {
    const t = resolveStyle("insight")
    const { root } = draw("insight", contentSlide)
    const ground = resolveBackgroundHex(t.defaultBackgrounds.content, t.colors.bg)
    const line = root.querySelector("polyline")!
    const hex = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16))
    const blend = (fg: string, a: number) => {
      const f = hex(fg)
      const b = hex(ground)
      return "#" + f.map((c, i) => Math.round(c * a + b[i]! * (1 - a)).toString(16).padStart(2, "0")).join("")
    }
    const opacity = Number(line.getAttribute("opacity") ?? 1)
    const ratio = contrastRatio(blend(line.getAttribute("stroke")!, opacity), ground)
    expect(ratio).toBeLessThan(CONTENT_DECOR_CONTRAST_CEILING)
  })

  it("换一家 tokens 渲染时颜色整体跟着换，insight 的色一处不残留", () => {
    const consulting = resolveStyle("consulting")
    const ctx = buildCtx(consulting, {})
    const { markup } = render(
      <PosterMotif ir={ir("consulting", "2026-07-15")} slide={coverSlide} ctx={ctx} />,
    )
    expect(markup).toContain(consulting.colors.border)
    for (const hex of ["#0F1216", "#171C22", "#16202B", "#F0A63C", "#F2EFE8", "#9AA7B4", "#2A3440"]) {
      expect(markup, `insight token ${hex} leaked into consulting render`).not.toContain(hex)
    }
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const markups = new Set(
      Array.from({ length: 12 }, (_, i) =>
        renderSvgMarkup(
          <PosterMotif
            ir={{ ...ir("insight", "2026-07-15"), filename: `probe-${i}.pptx` } as PptxIR}
            slide={coverSlide}
            ctx={ctx}
          />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })

  it("不画任何左竖条，也不画孤立角标", () => {
    for (const slide of [coverSlide, contentSlide, endingSlide]) {
      const { root } = draw("insight", slide)
      expect(root.querySelectorAll("rect")).toHaveLength(0)
      expect(root.querySelectorAll("circle")).toHaveLength(0)
      expect(root.querySelectorAll("polygon")).toHaveLength(0)
    }
  })

  it("Decor body passes subset validation", () => {
    for (const slide of [coverSlide, chapterSlide, contentSlide, endingSlide]) {
      const { root } = draw("insight", slide, "2026-07-15")
      expect(() => assertSubset(root)).not.toThrow()
    }
  })
})
