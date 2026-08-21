// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { MuseumMotif } from "./motif-museum-motif"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide
const ALL_SLIDES = [coverSlide, chapterSlide, contentSlide, endingSlide]

/** 设计板上的五个保护区（`docs/designing-themes.md` 第 5 条）。 */
const TITLE_ZONE = { x: 96, y: 48, w: 1040, h: 122 }
const BODY_ZONE = { x: 96, y: 200, w: 1040, h: 420 }
const FOOTER_ZONE = { x: 48, y: 664, w: 1184, h: 44 }
const LOGO_BR = { x: 1120, y: 630, w: 96, h: 40 }
const FIFTH_BAND = { x: 0, y: 620, w: 1280, h: 44 }

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
  return { ...render(<MuseumMotif ir={ir(theme)} slide={slide} ctx={ctx} />), ctx }
}

const num = (el: Element, a: string) => Number(el.getAttribute(a))

type Box = { x0: number; y0: number; x1: number; y1: number }

const intersects = (b: Box, z: { x: number; y: number; w: number; h: number }) =>
  b.x0 < z.x + z.w && b.x1 > z.x && b.y0 < z.y + z.h && b.y1 > z.y

function circleBox(c: Element): Box {
  const r = num(c, "r")
  return { x0: num(c, "cx") - r, y0: num(c, "cy") - r, x1: num(c, "cx") + r, y1: num(c, "cy") + r }
}

function lineBox(l: Element): Box {
  const half = num(l, "stroke-width") / 2
  return {
    x0: Math.min(num(l, "x1"), num(l, "x2")) - half,
    y0: Math.min(num(l, "y1"), num(l, "y2")) - half,
    x1: Math.max(num(l, "x1"), num(l, "x2")) + half,
    y1: Math.max(num(l, "y1"), num(l, "y2")) + half,
  }
}

function rectBox(r: Element): Box {
  const half = num(r, "stroke-width") / 2
  const x = num(r, "x")
  const y = num(r, "y")
  return { x0: x - half, y0: y - half, x1: x + num(r, "width") + half, y1: y + num(r, "height") + half }
}

function allInk(root: Element): Box[] {
  return [
    ...Array.from(root.querySelectorAll("circle")).map(circleBox),
    ...Array.from(root.querySelectorAll("line")).map(lineBox),
    ...Array.from(root.querySelectorAll("rect")).map(rectBox),
  ]
}

describe("MuseumMotif（展签与标本针）", () => {
  it("四种页型都画同一张：四枚针点 + 展签框 + 茎 + 两道角标 tick", () => {
    const markups = new Set<string>()
    for (const slide of ALL_SLIDES) {
      const { root, markup } = draw("museum", slide)
      markups.add(markup)
      expect(Array.from(root.querySelectorAll("circle")), `pins on ${slide.type}`).toHaveLength(4)
      expect(Array.from(root.querySelectorAll("rect")), `label on ${slide.type}`).toHaveLength(1)
      expect(Array.from(root.querySelectorAll("line")), `stem+ticks on ${slide.type}`).toHaveLength(3)
    }
    expect(markups.size).toBe(1)
  })

  it("颜色一律走 accent，框与 tick 是 0.75 细描边，针点实心", () => {
    const t = resolveStyle("museum")
    const { root, markup } = draw("museum", coverSlide)
    for (const c of Array.from(root.querySelectorAll("circle"))) {
      expect(c.getAttribute("fill")).toBe(t.colors.accent)
      expect(c.getAttribute("r")).toBe("2")
    }
    const label = root.querySelector("rect")!
    expect(label.getAttribute("fill")).toBe("none")
    expect(label.getAttribute("stroke")).toBe(t.colors.accent)
    expect(label.getAttribute("stroke-width")).toBe("0.75")
    expect(label.getAttribute("opacity")).toBe("0.75")
    for (const l of Array.from(root.querySelectorAll("line"))) {
      expect(l.getAttribute("stroke")).toBe(t.colors.accent)
      expect(l.getAttribute("stroke-width")).toBe("0.75")
    }
    expect(markup).not.toContain(t.colors.primary)
  })

  it("几何钉死：针点 (40,18)/(1240,18)/(40,712)/(1240,712)，展签 24,26 56×14", () => {
    const { root } = draw("museum", coverSlide)
    const pins = Array.from(root.querySelectorAll("circle")).map((c) => [num(c, "cx"), num(c, "cy")])
    expect(pins).toEqual([
      [40, 18],
      [1240, 18],
      [40, 712],
      [1240, 712],
    ])
    const label = root.querySelector("rect")!
    expect(num(label, "x")).toBe(24)
    expect(num(label, "y")).toBe(26)
    expect(num(label, "width")).toBe(56)
    expect(num(label, "height")).toBe(14)
  })

  it("安全区：所有墨迹不进五个保护区", () => {
    const { root } = draw("museum", coverSlide)
    const zones = [TITLE_ZONE, BODY_ZONE, FOOTER_ZONE, LOGO_BR, FIFTH_BAND]
    for (const box of allInk(root)) {
      for (const z of zones) {
        expect(intersects(box, z), `ink ${JSON.stringify(box)} hits ${JSON.stringify(z)}`).toBe(false)
      }
    }
  })

  it("不画任何左竖条", () => {
    const { root } = draw("museum", coverSlide)
    for (const r of Array.from(root.querySelectorAll("rect"))) {
      expect(num(r, "width") < 40 && num(r, "height") > 30, `narrow-tall bar: ${r.outerHTML}`).toBe(false)
    }
    for (const l of Array.from(root.querySelectorAll("line"))) {
      const vertical = num(l, "x1") === num(l, "x2") && Math.abs(num(l, "y2") - num(l, "y1")) > 30
      expect(vertical, `vertical bar: ${l.outerHTML}`).toBe(false)
    }
  })

  it("导出子集干净，换一家 tokens 时颜色跟着换（零 hex 纪律）", () => {
    const { markup } = draw("museum", coverSlide)
    expect(() => assertSubset(parseSvgRoot(markup))).not.toThrow()
    const academic = resolveStyle("academic")
    const ctx = buildCtx(academic, {})
    const swapped = render(<MuseumMotif ir={ir("academic")} slide={coverSlide} ctx={ctx} />)
    expect(swapped.markup).toContain(academic.colors.accent)
    expect(swapped.markup).not.toContain("#BE7A28")
  })

  it("不读 chartPalette：轮转改不动它一个字节", () => {
    const tokens = resolveStyle("museum")
    const markups = new Set(
      tokens.colors.chartPalette.map((_, offset) =>
        renderSvgMarkup(
          <MuseumMotif
            ir={ir("museum")}
            slide={coverSlide}
            ctx={buildCtx(tokens, {}, undefined, undefined, undefined, offset)}
          />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })
})
