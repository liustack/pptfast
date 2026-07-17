// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../FullSlideSvg"
import { resolveStyle } from "../../themes"
import { FashionMastheadCover } from "./cover-fashion-masthead"
import { FashionChapter } from "./chapter-fashion-chapter"
import { FashionEnding } from "./ending-fashion-ending"
import type { PptxIR, Slide } from "@/ir"

// fashion 家族（runway 专属新表达，2026-07-10）基本行为锁：满版色块、
// readableOn 自适应前景、出血 data-bleed 声明、subset-clean。

const cover: Slide = { type: "cover", heading: "秋冬特辑", subheading: "解构与重塑", blocks: [] } as Slide
const chapter: Slide = { type: "chapter", heading: "廓形的反叛", blocks: [] } as Slide
const ending: Slide = { type: "ending", heading: "下期预告", subheading: "十月刊", blocks: [] } as Slide
const endingBare: Slide = { type: "ending", blocks: [] } as Slide

function ir(slides: Slide[]): PptxIR {
  return {
    version: "3",
    filename: "f.pptx",
    theme: { id: "runway" },
    meta: { organization: "时尚编辑部", date: "2026-10" },
    assets: { images: {} },
    slides,
  } as PptxIR
}

const ctx = buildCtx(resolveStyle("runway"), {})

describe("fashion 家族（runway）", () => {
  it("cover：满版 primary 色块 + readableOn 白字报头 + accent 色带", () => {
    const deck = ir([cover])
    const markup = renderSvgMarkup(<FashionMastheadCover ir={deck} slide={cover} index={0} ctx={ctx} />)
    // 满版黑底
    expect(markup).toContain('width="1280" height="720" fill="#0A0A0A"')
    // 黑底上报头是白字（readableOn）
    expect(markup).toContain('fill="#FFFFFF"')
    expect(markup).toContain("秋冬特辑")
    // accent 满宽色带
    expect(markup).toContain('width="1168" height="20" fill="#D80027"')
  })

  it("chapter：满版 accent 色块 + 右对齐实色混合水印（导出安全：不出血不半透明）", () => {
    const deck = ir([chapter])
    const markup = renderSvgMarkup(<FashionChapter ir={deck} slide={chapter} index={0} ctx={ctx} />)
    expect(markup).toContain('width="1280" height="720" fill="#D80027"')
    expect(markup).toContain("CHAPTER 01")
    // 水印：anchor=end 贴右缘（svg2pptx 右对齐文本框宽度充裕不裁字）
    expect(markup).toMatch(/text-anchor="end"[^>]*>01</)
    // 实色混合（#D80027 与 #FFFFFF 的 22%）而非 fillOpacity 半透明
    expect(markup).toContain('fill="#E13857"')
    expect(markup).not.toContain("data-bleed")
  })

  it("ending：满版 primary 底 + heading 存在时不兜底", () => {
    const deck = ir([ending])
    const markup = renderSvgMarkup(<FashionEnding ir={deck} slide={ending} index={0} ctx={ctx} />)
    expect(markup).toContain('width="1280" height="720" fill="#0A0A0A"')
    expect(markup).toContain("下期预告")
    expect(markup).not.toContain("谢谢")
  })

  it("ending：heading 缺省时兜底「谢谢」（ending 家族兜底纪律）", () => {
    const deck = ir([endingBare])
    const markup = renderSvgMarkup(<FashionEnding ir={deck} slide={endingBare} index={0} ctx={ctx} />)
    expect(markup).toContain("谢谢")
  })

  it("三版式输出均在可导出 SVG 子集内", () => {
    const deck = ir([cover, chapter, ending])
    for (const [Comp, slide, index] of [
      [FashionMastheadCover, cover, 0],
      [FashionChapter, chapter, 1],
      [FashionEnding, ending, 2],
    ] as const) {
      const markup = renderSvgMarkup(<Comp ir={deck} slide={slide} index={index} ctx={ctx} />)
      expect(() =>
        assertSubset(parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)),
      ).not.toThrow()
    }
  })
})
