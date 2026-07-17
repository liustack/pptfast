// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../FullSlideSvg"
import { resolveStyle } from "../../styles"
import { PosterMotif } from "./motif-poster-motif"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", blocks: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", blocks: [] } as Slide
const contentSlide: Slide = { type: "content", variant: "single", heading: "内容", blocks: [] } as Slide
const endingSlide: Slide = { type: "ending", blocks: [] } as Slide

// BrandChrome's brand logo bands (BrandChrome.tsx logoBox).
const LOGO_BANDS = [
  { x: 64, y: 48, w: 96, h: 40 },
  { x: 1120, y: 48, w: 96, h: 40 },
  { x: 64, y: 630, w: 96, h: 40 },
  { x: 1120, y: 630, w: 96, h: 40 },
]

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

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

function motifCircles(deck: PptxIR, ctx: ReturnType<typeof buildCtx>, slide: Slide) {
  const { root } = render(<PosterMotif ir={deck} slide={slide} ctx={ctx} />)
  return Array.from(root.querySelectorAll("circle"))
}

/**
 * 2026-07-12 用户裁决：径向光晕全部移除（预览 0.06-0.12 透明度几乎不可
 * 见、导出后 Office 渐变渲染变实变硬非常难看——预览/导出观感不一致的
 * 装饰不留）。PosterMotif 仅保留 cover 同心光点签名。
 */
describe("PosterMotif（v2 光晕移除后）", () => {
  it("任何页型都不再渲染径向光晕（无 radialGradient、无 url(#) 填充圆）", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const deck = ir("insight")
    for (const slide of [coverSlide, chapterSlide, contentSlide, endingSlide]) {
      const { markup } = render(<PosterMotif ir={deck} slide={slide} ctx={ctx} />)
      expect(markup).not.toContain("radialGradient")
      expect(markup).not.toContain("url(#")
    }
  })

  it("cover 渲染同心光点签名（实心点 + 两圈描边环），chapter/content/ending 什么都不画", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const deck = ir("insight")

    const cover = motifCircles(deck, ctx, coverSlide)
    expect(cover.map((c) => c.getAttribute("r")).sort()).toEqual(["12", "18", "6"])
    const dot = cover.find((c) => c.getAttribute("r") === "6")!
    expect(dot.getAttribute("fill")).toBe(resolveStyle("insight").colors.accent)

    for (const slide of [chapterSlide, contentSlide, endingSlide]) {
      expect(motifCircles(deck, ctx, slide)).toHaveLength(0)
    }
  })

  it("consulting tokens 下光点走 consulting 自己的 accent，insight 烤死色不残留（token 化）", () => {
    const consultingTheme = resolveStyle("consulting")
    const ctx = buildCtx(consultingTheme, {})
    const deck = ir("consulting")
    const coverOut = renderSvgMarkup(<PosterMotif ir={deck} slide={coverSlide} ctx={ctx} />)
    expect(coverOut).toContain(ctx.colors.accent as string)
    expect(coverOut).not.toContain("#D4A57C")
  })

  it("光点位置随 seed 变体镜像（a/c 左下、b 右下），且始终避开 BrandChrome 四个 logo 带", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    // 探测三个变体的 deck（filename 决定 seed）
    const seen = new Set<string>()
    for (let i = 0; i < 40 && seen.size < 2; i++) {
      const deck = {
        ...ir("insight"),
        filename: `probe-${i}.pptx`,
      } as PptxIR
      const cover = motifCircles(deck, ctx, coverSlide)
      const dot = cover.find((c) => c.getAttribute("r") === "6")!
      const cx = Number(dot.getAttribute("cx"))
      seen.add(String(cx))
      expect([200, 1080]).toContain(cx)
      const motifBox = { x: cx - 18, y: 560 - 18, w: 36, h: 36 }
      for (const band of LOGO_BANDS) {
        expect(rectsOverlap(motifBox, band)).toBe(false)
      }
    }
    expect(seen.size).toBe(2)
  })

  it("Decor body passes subset validation", () => {
    const ctx = buildCtx(resolveStyle("insight"), {})
    const deck = ir("insight")
    const { root } = render(<PosterMotif ir={deck} slide={coverSlide} ctx={ctx} />)
    expect(() => assertSubset(root)).not.toThrow()
  })
})
