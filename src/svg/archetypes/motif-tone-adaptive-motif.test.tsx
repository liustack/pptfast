// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../FullSlideSvg"
import { getTheme } from "../../styles"
import { ToneAdaptiveMotif } from "./motif-tone-adaptive-motif"
import type { PptxIR, Slide } from "@/ir"
import { LEGACY_CUSTOM_TOKENS } from "./legacy-custom-tokens"

function wrap(el: React.ReactElement): React.ReactElement {
  return <svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">{el}</svg>
}

const coverSlide: Slide = { type: "cover", heading: "封面", blocks: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", blocks: [] } as Slide
const contentSlide: Slide = { type: "content", variant: "single", heading: "内容", blocks: [] } as Slide
const endingSlide: Slide = { type: "ending", blocks: [] } as Slide

const bgImages: PptxIR["assets"]["images"] = {
  bg: { src: "data:image/png;base64,iVBOR", alt: "背景" },
}
// hasExplicitBackground 的三种"显式背景"分支：color/gradient 直接为真，
// asset 需要 hasBgImage 解析成功才为真。
const coverWithColorBg: Slide = { ...coverSlide, background: { kind: "color", value: "#123456" } } as Slide
const coverWithGradientBg: Slide = {
  ...coverSlide,
  background: { kind: "gradient", from: "#111111", to: "#222222" },
} as Slide
const coverWithAssetBg: Slide = {
  ...coverSlide,
  background: { kind: "asset", asset_id: "bg", fit: "cover" },
} as Slide
// asset 但解析不到资源（缺 src）：hasBgImage 为假，hasExplicitBackground 也
// 为假——退回渲染渐变场，与源函数行为一致。
const coverWithBrokenAssetBg: Slide = {
  ...coverSlide,
  background: { kind: "asset", asset_id: "missing", fit: "cover" },
} as Slide

function ir(theme: string, images: PptxIR["assets"]["images"] = {}): PptxIR {
  return {
    version: "3",
    filename: "deck.pptx",
    style: { id: theme },
    meta: {},
    assets: { images },
    slides: [coverSlide],
  } as unknown as PptxIR
}

// Frozen literal snapshot of ToneAdaptiveMotif's own output under custom
// tokens when the slide has no explicit background — captured once from this
// component (not from the legacy `templates/custom.tsx` `CustomDecor`, which
// templates/ deletion will remove) so this file has zero runtime dependency
// on templates/. Identical across all four slide.type rows (this archetype
// doesn't vary by slide type) — verified byte-identical to the legacy output
// before this migration (see the "无 CRITICAL 发现" report).
const EXPECTED_MOTIF_DECOR =
  '<defs><linearGradient id="decor-custom-field" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FFFFFF"></stop><stop offset="100%" stop-color="#F0F0F0"></stop></linearGradient></defs><rect x="0" y="0" width="1280" height="720" fill="url(#decor-custom-field)"></rect>'

// 档位判定：见 motif-tone-adaptive-motif.tsx 文件头"#F0F0F0 归属核实"——
// `BG_MIXED_6PCT_BLACK` 是孤儿色，判定①私有常量保留，故为**档位二・观感
// 等价**。在 custom 自己的 tokens 下渲染输出恰好仍与旧 CustomDecor 逐字节
// 相同（因为私有常量的值本就原样保留，未做任何映射），但按约定仍走"结构 +
// 装饰未隐形"断言而非单纯依赖 toBe（同 w1t1 cover-left-anchor.tsx 先例）。
describe("ToneAdaptiveMotif", () => {
  it.each([
    ["cover", coverSlide],
    ["chapter", chapterSlide],
    ["content", contentSlide],
    ["ending", endingSlide],
  ] as const)(
    "custom tokens 下 %s slide（无显式背景）输出锁定（迁移前已与旧 CustomDecor 逐字节核对一致）",
    (_label, slide) => {
      const ctx = buildCtx(LEGACY_CUSTOM_TOKENS, {})
      const deck = ir("custom")

      const next = renderSvgMarkup(<ToneAdaptiveMotif ir={deck} slide={slide} ctx={ctx} />)
      expect(next).toBe(EXPECTED_MOTIF_DECOR)
    },
  )

  it("装饰几何：无显式背景时渲染 1 个 180° 竖直渐变 + 1 个满页 rect，跨 slide.type 装饰未隐形，且无其他装饰元素", () => {
    const ctx = buildCtx(LEGACY_CUSTOM_TOKENS, {})
    const deck = ir("custom")

    function renderMotif(slide: Slide): Element {
      const markup = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
          <ToneAdaptiveMotif ir={deck} slide={slide} ctx={ctx} />
        </svg>,
      )
      return parseSvgRoot(markup)
    }

    for (const slide of [coverSlide, chapterSlide, contentSlide, endingSlide]) {
      const root = renderMotif(slide)
      const gradient = root.querySelector("linearGradient")
      expect(gradient).not.toBeNull()
      expect(gradient?.getAttribute("x1")).toBe("0")
      expect(gradient?.getAttribute("y1")).toBe("0")
      expect(gradient?.getAttribute("x2")).toBe("0")
      expect(gradient?.getAttribute("y2")).toBe("1")

      const stops = Array.from(root.querySelectorAll("stop"))
      expect(stops).toHaveLength(2)
      expect(stops[0]?.getAttribute("offset")).toBe("0%")
      expect(stops[0]?.getAttribute("stop-color")).toBe(ctx.colors.bg)
      expect(stops[1]?.getAttribute("offset")).toBe("100%")
      // 装饰未隐形：孤儿色原样保留，跨 slide.type 稳定出现
      expect(stops[1]?.getAttribute("stop-color")).toBe("#F0F0F0")

      const rect = root.querySelector("rect")
      expect(rect).not.toBeNull()
      expect(rect?.getAttribute("width")).toBe("1280")
      expect(rect?.getAttribute("height")).toBe("720")
      expect(rect?.getAttribute("fill")).toContain("url(#")

      // Ported from templates/custom.test.tsx's "Nothing else: no
      // lines/circles/polygons for this theme's decor".
      expect(root.querySelector("line, circle, polygon, polyline")).toBeNull()
    }
  })

  it("hasExplicitBackground 三种显式背景（color/gradient/有效 asset）均跳过渲染，与旧 CustomDecor 一致返回空 fragment", () => {
    const ctx = buildCtx(LEGACY_CUSTOM_TOKENS, {})
    const ctxWithImg = buildCtx(LEGACY_CUSTOM_TOKENS, bgImages)
    const deckPlain = ir("custom")
    const deckWithImg = ir("custom", bgImages)

    for (const [slide, useCtx, deck] of [
      [coverWithColorBg, ctx, deckPlain],
      [coverWithGradientBg, ctx, deckPlain],
      [coverWithAssetBg, ctxWithImg, deckWithImg],
    ] as const) {
      const next = renderSvgMarkup(<ToneAdaptiveMotif ir={deck} slide={slide} ctx={useCtx} />)
      // Ported from templates/custom.test.tsx's `root.children.length === 0`
      // assertion: an empty `<></>` fragment serializes to the empty string.
      expect(next).toBe("")
      expect(next).not.toContain("linearGradient")
      expect(next).not.toContain("<rect")
    }
  })

  it("asset 背景解析失败（缺资源）时 hasExplicitBackground 仍判假，退回渲染渐变场——与旧 CustomDecor 行为一致", () => {
    const ctx = buildCtx(LEGACY_CUSTOM_TOKENS, {})
    const deck = ir("custom")

    const next = renderSvgMarkup(<ToneAdaptiveMotif ir={deck} slide={coverWithBrokenAssetBg} ctx={ctx} />)
    expect(next).toBe(EXPECTED_MOTIF_DECOR)
    expect(next).toContain("linearGradient")
  })

  // Ported from templates/custom.test.tsx's "Decor body passes subset
  // validation (fill=url() resolves to a declared gradient)".
  it("Decor body passes subset validation (fill=url() resolves to a declared gradient)", () => {
    const ctx = buildCtx(LEGACY_CUSTOM_TOKENS, {})
    const deck = ir("custom")
    const markup = renderSvgMarkup(wrap(<ToneAdaptiveMotif ir={deck} slide={coverSlide} ctx={ctx} />))
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("tech tokens 下渐变起点随主题走 ctx.colors.bg（证明真正 token 化），装饰性孤儿色 #F0F0F0 跨主题保持不变（未被并入任何 tech token）", () => {
    const techTheme = getTheme("tech")
    const ctx = buildCtx(techTheme, {})
    const deck = ir("tech")
    const out = renderSvgMarkup(<ToneAdaptiveMotif ir={deck} slide={coverSlide} ctx={ctx} />)

    expect(out).toContain(ctx.colors.bg) // tech 的 bg 驱动渐变起点
    expect(ctx.colors.bg).not.toBe("#FFFFFF") // custom 自己的 bg 不得残留
    // 装饰豁免色是文件私有常量，不随主题变化——跨主题依然渲染同一个 hex
    expect(out).toContain("#F0F0F0")
  })
})
