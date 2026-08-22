// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { CampaignMotif, CONFETTI_COUNT, PIECE_REACH } from "./motif-campaign-motif"
import { CONTENT_DECOR_CONTRAST_CEILING, countDecorPieces, leafOpacity, leafPaint, paintedLeaves } from "./decor-budget"
import { blendOver, contrastRatio } from "../ink"
import type { Component, PptxIR, Slide } from "@/ir"

const para = (text: string): Component => ({ type: "paragraph", text }) as Component
const slideOf = (type: Slide["type"], components: Component[] = [], heading = "标题"): Slide =>
  ({ type, heading, components }) as Slide

const coverSlide = slideOf("cover")
const chapterSlide = slideOf("chapter")
const contentSlide = slideOf("content")
const endingSlide = slideOf("ending", [], undefined as unknown as string)
const DRAWN_SLIDES = [coverSlide, contentSlide, endingSlide]

const LOGO_BOXES = [
  { x: 64, y: 48, w: 96, h: 40 },
  { x: 1120, y: 48, w: 96, h: 40 },
  { x: 64, y: 630, w: 96, h: 40 },
  { x: 1120, y: 630, w: 96, h: 40 },
] as const

const LEFT_TEXT = { x: 96, y: 48, w: 900, h: 420 }

const ir = (theme: string, filename = "x.pptx"): PptxIR =>
  ({
    version: "3",
    filename,
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

function draw(theme: string, slide: Slide, filename?: string) {
  const ctx = buildCtx(resolveStyle(theme), {})
  return render(<CampaignMotif ir={ir(theme, filename)} slide={slide} ctx={ctx} />)
}

const num = (el: Element, a: string) => Number(el.getAttribute(a))

type Box = { x0: number; y0: number; x1: number; y1: number }

function pieceBoxes(root: Element): Box[] {
  const out: Box[] = []
  for (const p of Array.from(root.querySelectorAll("path"))) {
    const nums = (p.getAttribute("d") ?? "").match(/-?[\d.]+/g)!.map(Number)
    const xs = nums.filter((_, i) => i % 2 === 0)
    const ys = nums.filter((_, i) => i % 2 === 1)
    out.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) })
  }
  return out
}

const intersects = (b: Box, z: { x: number; y: number; w: number; h: number }) =>
  b.x0 < z.x + z.w && b.x1 > z.x && b.y0 < z.y + z.h && b.y1 > z.y

/**
 * campaign-motif v7「右上一簇纸屑」（第八波批 1）。
 * 设计源：`.issues/design-boards/wave8/b1/Campaign.dc.html`
 */
describe("CampaignMotif（右上一簇纸屑）", () => {
  it("满场不超过 3 枚，不再是 120 点", () => {
    expect(CONFETTI_COUNT).toBeLessThanOrEqual(3)
    expect(CONFETTI_COUNT).toBeGreaterThan(0)
    const { root } = draw("campaign", coverSlide)
    expect(root.querySelectorAll("path")).toHaveLength(CONFETTI_COUNT)
    expect(root.querySelectorAll("circle")).toHaveLength(0)
  })

  it("三枚成一组，不是三件孤立小件", () => {
    const { root } = draw("campaign", coverSlide)
    expect(countDecorPieces(root)).toBe(1)
    expect(root.querySelector("[data-decor-piece]")?.getAttribute("data-decor-piece")).toBe("confetti")
  })

  it("颜色取 accent 与 muted，不烤 hex", () => {
    const t = resolveStyle("campaign")
    const { root } = draw("campaign", coverSlide)
    const fills = new Set(Array.from(root.querySelectorAll("path")).map((el) => el.getAttribute("fill")))
    expect([...fills].sort()).toEqual([t.colors.accent, t.colors.muted].sort())
  })

  it("chapter 完全退让", () => {
    const { root } = draw("campaign", chapterSlide)
    expect(root.children).toHaveLength(0)
  })

  it("同一份 IR 两次渲染逐字节相同", () => {
    expect(draw("campaign", coverSlide).markup).toBe(draw("campaign", coverSlide).markup)
  })

  it("装饰位置写死：换 seed（filename）输出逐字节不变", () => {
    const markups = new Set(Array.from({ length: 12 }, (_, i) => draw("campaign", coverSlide, `probe-${i}.pptx`).markup))
    expect(markups.size).toBe(1)
  })

  it("cover/ending 画同一张。内容页件数不变，只退底", () => {
    expect(draw("campaign", coverSlide).markup).toBe(draw("campaign", endingSlide).markup)
    expect(draw("campaign", contentSlide).root.querySelectorAll("path").length).toBe(CONFETTI_COUNT)
  })

  it("motif 不受 chartPaletteOffset 影响", () => {
    const tokens = resolveStyle("campaign")
    const markups = new Set(
      tokens.colors.chartPalette.map((_, offset) =>
        renderSvgMarkup(
          <CampaignMotif
            ir={ir("campaign")}
            slide={coverSlide}
            ctx={buildCtx(tokens, {}, undefined, undefined, undefined, offset)}
          />,
        ),
      ),
    )
    expect(markups.size).toBe(1)
  })

  it("判据纯度：同结构不同文案，输出逐字节相同", () => {
    const short = slideOf("content", [para("短")], "短")
    const long = slideOf(
      "content",
      [para("这一段正文特意写得很长很长很长，长到足以把版式的自动缩字号与换行逻辑整个跑一遍")],
      "这是一个长到会换行、会触发标题自动缩字号的超长标题",
    )
    expect(draw("campaign", long).markup).toBe(draw("campaign", short).markup)
  })

  it("全部落在右上簇内，避左轴文字与四只 logo 盒", () => {
    const { root } = draw("campaign", coverSlide)
    const boxes = pieceBoxes(root)
    expect(boxes).toHaveLength(CONFETTI_COUNT)
    for (const box of boxes) {
      expect(box.x0, `piece too far left: ${JSON.stringify(box)}`).toBeGreaterThanOrEqual(1040)
      expect(box.y1, `piece too low: ${JSON.stringify(box)}`).toBeLessThanOrEqual(190)
      expect(intersects(box, LEFT_TEXT), `piece enters the left text column: ${JSON.stringify(box)}`).toBe(false)
      for (const zone of LOGO_BOXES) {
        expect(intersects(box, zone), `piece enters the logo box at ${zone.x},${zone.y}`).toBe(false)
      }
      expect(box.x0).toBeGreaterThanOrEqual(0)
      expect(box.y0).toBeGreaterThanOrEqual(0)
      expect(box.x1).toBeLessThanOrEqual(1280)
      expect(box.y1).toBeLessThanOrEqual(720)
    }
  })

  it("单枚外扩不超过 PIECE_REACH 的两倍", () => {
    const { root } = draw("campaign", coverSlide)
    for (const box of pieceBoxes(root)) {
      expect(box.x1 - box.x0).toBeLessThanOrEqual(2 * PIECE_REACH + 0.2)
      expect(box.y1 - box.y0).toBeLessThanOrEqual(2 * PIECE_REACH + 0.2)
    }
  })

  it("透明度不超过 0.5", () => {
    const { root } = draw("campaign", coverSlide)
    for (const el of Array.from(root.querySelectorAll("path"))) {
      expect(num(el, "opacity")).toBeLessThanOrEqual(0.5)
    }
  })

  it("内容页中景对比低于 3:1", () => {
    const tokens = resolveStyle("campaign")
    const bg = tokens.colors.bg
    const { root } = draw("campaign", contentSlide)
    for (const el of paintedLeaves(root)) {
      const paint = leafPaint(el)
      if (!paint) continue
      const ratio = contrastRatio(blendOver(paint.color, bg, leafOpacity(el)), bg)
      expect(ratio).toBeLessThan(CONTENT_DECOR_CONTRAST_CEILING)
    }
  })

  it("斜方片不用 rotate transform", () => {
    const { root } = draw("campaign", coverSlide)
    for (const el of Array.from(root.querySelectorAll("path, g"))) {
      expect(el.getAttribute("transform")).toBeNull()
    }
  })

  it("画笔属性写在叶子上，不挂 g", () => {
    const { root } = draw("campaign", coverSlide)
    for (const g of Array.from(root.querySelectorAll("g"))) {
      for (const attr of ["fill", "stroke", "opacity"]) {
        expect(g.getAttribute(attr), `<g> carries ${attr}`).toBeNull()
      }
    }
  })

  it("换一家 tokens 渲染时颜色跟着换，campaign 的色一处不残留", () => {
    const luxe = resolveStyle("luxe")
    const { markup } = render(<CampaignMotif ir={ir("luxe")} slide={coverSlide} ctx={buildCtx(luxe, {})} />)
    for (const hex of ["#2A1E3F", "#35284E", "#23173A", "#E84F8A", "#F6F2F9", "#B3A6C7", "#4A3A66", "#F0B429", "#4FC1E9", "#9BE36D"]) {
      expect(markup, `campaign token ${hex} leaked into the luxe render`).not.toContain(hex)
    }
  })

  it("Decor body passes subset validation", () => {
    for (const slide of [...DRAWN_SLIDES, chapterSlide]) {
      expect(() => assertSubset(draw("campaign", slide).root)).not.toThrow()
    }
  })
})
