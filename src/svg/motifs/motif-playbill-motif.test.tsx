// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { PlaybillMotif, PLAYBILL_PATCH_POINTS } from "./motif-playbill-motif"
import { svgToOps, type Op } from "../../pptx/svg2pptx/dispatch"
import { applyPoint, parseTransform } from "../../pptx/svg2pptx/transform"
import { PX_PER_IN } from "../../constants"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide
const DRAWN_SLIDES = [coverSlide, endingSlide]

const PATCH_CX = 1136
const PATCH_CY = 25
const PATCH_W = 150
const PATCH_H = 34
const PATCH_DEG = 4
const DATE = "2026 年 7 月"

const ir = (theme: string, date?: string): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
    theme: { id: theme },
    meta: date === undefined ? {} : { date },
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

function draw(theme: string, slide: Slide, date?: string) {
  const ctx = buildCtx(resolveStyle(theme), {})
  return { ...render(<PlaybillMotif ir={ir(theme, date)} slide={slide} ctx={ctx} />), ctx }
}

const num = (el: Element, a: string) => Number(el.getAttribute(a))

const round1 = (v: number) => Math.round(v * 10) / 10

/** Independent clockwise bake of the 150×34 chip. Does not import PATCH_DEG. */
function bakeClockwise(deg: number): string {
  const a = (deg * Math.PI) / 180
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  const hw = PATCH_W / 2
  const hh = PATCH_H / 2
  const corners: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ]
  return corners.map(([lx, ly]) => `${round1(PATCH_CX + lx * ca - ly * sa)},${round1(PATCH_CY + lx * sa + ly * ca)}`).join(" ")
}

function polygonPoints(el: Element): { x: number; y: number }[] {
  return el
    .getAttribute("points")!
    .trim()
    .split(/\s+/)
    .map((p) => {
      const [x, y] = p.split(",").map(Number)
      return { x: x!, y: y! }
    })
}

describe("PlaybillMotif（右上日期贴片）", () => {
  it("有 meta.date 时 cover/ending 画同一张贴片+日期字。content 不画，把斜贴片名额让给版式", () => {
    const markups = new Set(DRAWN_SLIDES.map((slide) => draw("playbill", slide, DATE).markup))
    expect(markups.size).toBe(1)
    const { root } = draw("playbill", coverSlide, DATE)
    expect(root.querySelector("polygon")).toBeTruthy()
    expect(root.querySelector("text")?.textContent).toBe(DATE)
    const content = draw("playbill", contentSlide, DATE).root
    expect(content.querySelector("polygon")).toBeNull()
    expect(content.querySelector("text")).toBeNull()
  })

  it("没有日期整片不画（空黑块不再出现）", () => {
    const { root } = draw("playbill", coverSlide)
    expect(root.children).toHaveLength(0)
    expect(root.querySelector("polygon")).toBeNull()
    expect(root.querySelector("text")).toBeNull()
  })

  it("chapter 完全退让", () => {
    const { root } = draw("playbill", chapterSlide, DATE)
    expect(root.children).toHaveLength(0)
  })

  it("贴片四角与日期字共用顺时针 4°（对齐板上 CSS rotate(4deg)）", () => {
    const expected = bakeClockwise(PATCH_DEG)
    expect(PLAYBILL_PATCH_POINTS).toBe(expected)
    expect(PLAYBILL_PATCH_POINTS).not.toBe(bakeClockwise(-PATCH_DEG))

    const { root } = draw("playbill", coverSlide, DATE)
    const poly = root.querySelector("polygon")!
    expect(poly.getAttribute("points")).toBe(expected)

    const pts = polygonPoints(poly)
    expect(pts).toHaveLength(4)
    const tr = pts[1]!
    const unrotatedTr = { x: PATCH_CX + PATCH_W / 2, y: PATCH_CY - PATCH_H / 2 }
    expect(tr.y, "clockwise 4° drops the unrotated top-right corner").toBeGreaterThan(unrotatedTr.y)
    expect(tr.x).toBeGreaterThan(unrotatedTr.x)

    const text = root.querySelector("text")!
    expect(text.getAttribute("transform")).toBe(`rotate(${PATCH_DEG} ${PATCH_CX} ${PATCH_CY})`)
    expect(num(text, "x")).toBe(PATCH_CX)
  })

  it("颜色一律读 token：贴片走 primary，日期字走 bg", () => {
    const t = resolveStyle("playbill")
    const { root } = draw("playbill", coverSlide, DATE)
    expect(root.querySelector("polygon")!.getAttribute("fill")).toBe(t.colors.primary)
    expect(root.querySelector("text")!.getAttribute("fill")).toBe(t.colors.bg)
  })

  it("导出链把日期字收成 pptxgenjs 顺时针 4°，旋转后基线仍落在贴片上", () => {
    const { root } = draw("playbill", coverSlide, DATE)
    const ops = svgToOps(root)
    const textOp = ops.find((op): op is Extract<Op, { kind: "text" }> => op.kind === "text")
    expect(textOp, "date text must survive svgToOps").toBeTruthy()
    expect(textOp!.rotate).toBeCloseTo(4, 5)
    expect(textOp!.rotate).not.toBe(0)
    expect(textOp!.rotate).not.toBe(90)

    const svgText = root.querySelector("text")!
    const fontSizePx = num(svgText, "font-size")
    const localX = num(svgText, "x")
    const localY = num(svgText, "y")
    const svgAnchor = applyPoint(parseTransform(svgText.getAttribute("transform")!), localX, localY)

    const cx = (textOp!.x + textOp!.w / 2) * PX_PER_IN
    const cy = (textOp!.y + textOp!.h / 2) * PX_PER_IN
    const hPx = textOp!.h * PX_PER_IN
    const ascent = 0.8 * fontSizePx
    const dy = -hPx / 2 + ascent
    const rad = ((textOp!.rotate ?? 0) * Math.PI) / 180
    const baselineX = cx - dy * Math.sin(rad)
    const baselineY = cy + dy * Math.cos(rad)
    expect(baselineX).toBeCloseTo(svgAnchor.x, 5)
    expect(baselineY).toBeCloseTo(svgAnchor.y, 5)

    const pts = polygonPoints(root.querySelector("polygon")!)
    const x0 = Math.min(...pts.map((p) => p.x))
    const x1 = Math.max(...pts.map((p) => p.x))
    const y0 = Math.min(...pts.map((p) => p.y))
    const y1 = Math.max(...pts.map((p) => p.y))
    expect(baselineX).toBeGreaterThan(x0)
    expect(baselineX).toBeLessThan(x1)
    expect(baselineY).toBeGreaterThan(y0)
    expect(baselineY).toBeLessThan(y1)
    expect(textOp!.w * PX_PER_IN).toBeLessThan(PATCH_W)
  })

  it("Decor body passes subset validation", () => {
    for (const slide of [...DRAWN_SLIDES, chapterSlide]) {
      expect(() => assertSubset(draw("playbill", slide, DATE).root)).not.toThrow()
      expect(() => assertSubset(draw("playbill", slide).root)).not.toThrow()
    }
  })
})
