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

const bgImages: PptxIR["assets"]["images"] = {
  bg: { src: "data:image/png;base64,iVBOR", alt: "背景" },
}
const coverWithColorBg: Slide = { ...coverSlide, background: { kind: "color", value: "#123456" } } as Slide
const coverWithGradientBg: Slide = {
  ...coverSlide,
  background: { kind: "gradient", from: "#111111", to: "#222222" },
} as Slide
const coverWithAssetBg: Slide = {
  ...coverSlide,
  background: { kind: "asset", asset_id: "bg", fit: "cover" },
} as Slide
const coverWithBrokenAssetBg: Slide = {
  ...coverSlide,
  background: { kind: "asset", asset_id: "missing", fit: "cover" },
} as Slide

function ir(theme: string, images: PptxIR["assets"]["images"] = {}): PptxIR {
  return {
    version: "3",
    filename: "deck.pptx",
    theme: { id: theme },
    meta: {},
    assets: { images },
    slides: [coverSlide],
  } as unknown as PptxIR
}

function render(body: React.ReactElement): Element {
  const markup = renderSvgMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      {body}
    </svg>,
  )
  return parseSvgRoot(markup)
}

// BrandChrome's brand logo bands — same constants templates/tech.test.tsx
// used to verify the ending signature motif never collides with the corner
// logos.
const TL_LOGO = { x: 64, y: 48, w: 96, h: 40 }
const TR_LOGO = { x: 1120, y: 48, w: 96, h: 40 }
const BL_LOGO = { x: 64, y: 630, w: 96, h: 40 }
const BR_LOGO = { x: 1120, y: 630, w: 96, h: 40 }
const LOGO_BANDS = [TL_LOGO, TR_LOGO, BL_LOGO, BR_LOGO]

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  )
}

// Captured once from the (now-retired) legacy `BentoTechDecor` — locks the
// byte-identical output the port preserved, without importing templates/.
// cover/chapter/content all render the same "gradient field only" markup —
// Decor's output depends only on slide.type (for the ending-motif toggle),
// nothing else slide-specific.
const GRADIENT_ONLY_MARKUP =
  '<defs><linearGradient id="decor-tech-field" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#04070E"></stop><stop offset="100%" stop-color="#0A1220"></stop></linearGradient></defs><rect x="0" y="0" width="1280" height="720" fill="url(#decor-tech-field)"></rect>'
const GRADIENT_WITH_ENDING_MOTIF_MARKUP =
  '<defs><linearGradient id="decor-tech-field" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#04070E"></stop><stop offset="100%" stop-color="#0A1220"></stop></linearGradient></defs><rect x="0" y="0" width="1280" height="720" fill="url(#decor-tech-field)"></rect><polyline points="1080,108 1140,140 1196,118" fill="none" stroke="#2DD4E6" stroke-width="1" stroke-opacity="0.25"></polyline><circle cx="1080" cy="108" r="3" fill="#2DD4E6"></circle><circle cx="1140" cy="140" r="3" fill="#2DD4E6"></circle><circle cx="1196" cy="118" r="3" fill="#2DD4E6"></circle>'

// 档位判定：见 motif-constellation-motif.tsx 文件头"孤儿色归属裁决"——渐变两
// 个 stop 色在 tech token 表里无精确匹配，判定为私有装饰常量保留，故 Decor
// 段为**档位二・观感等价**（Content 段随本任务已提炼进 content-bento-panel.tsx，
// 是档位一）。在 tech 自己的 tokens 下渲染输出恰好仍与旧 BentoTechDecor 逐
// 字节相同（私有常量值本就原样保留，未做任何映射），故下面仍用固化的字面量
// 常量锁死，同 motif-tone-adaptive-motif.tsx 先例的精神一致。
describe("ConstellationMotif", () => {
  it.each([
    ["cover", coverSlide, GRADIENT_ONLY_MARKUP],
    ["chapter", chapterSlide, GRADIENT_ONLY_MARKUP],
    ["content", contentSlide, GRADIENT_ONLY_MARKUP],
    ["ending", endingSlide, GRADIENT_WITH_ENDING_MOTIF_MARKUP],
  ] as const)(
    "tech tokens 下 %s slide（无显式背景）与旧 BentoTechDecor 输出逐字节一致",
    (_label, slide, expected) => {
      const ctx = buildCtx(resolveStyle("tech"), {})
      const deck = ir("tech")

      const next = renderSvgMarkup(<ConstellationMotif ir={deck} slide={slide} ctx={ctx} />)
      expect(next).toBe(expected)
    },
  )

  it("装饰几何：无显式背景时渲染 1 个 135° 对角渐变 + 1 个满页 rect，跨 slide.type 装饰未隐形", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const deck = ir("tech")

    for (const slide of [coverSlide, chapterSlide, contentSlide, endingSlide]) {
      const root = render(<ConstellationMotif ir={deck} slide={slide} ctx={ctx} />)
      const gradient = root.querySelector("linearGradient")
      expect(gradient).not.toBeNull()
      expect(gradient?.getAttribute("x1")).toBe("0")
      expect(gradient?.getAttribute("y1")).toBe("0")
      expect(gradient?.getAttribute("x2")).toBe("1")
      expect(gradient?.getAttribute("y2")).toBe("1")

      const stops = Array.from(root.querySelectorAll("stop"))
      expect(stops).toHaveLength(2)
      expect(stops[0]?.getAttribute("offset")).toBe("0%")
      expect(stops[1]?.getAttribute("offset")).toBe("100%")
      // 装饰未隐形：孤儿渐变色原样保留，跨 slide.type 稳定出现，且与
      // ctx.colors.bg（活的 token）不同——证明这是独立于 bg 的固定装饰值。
      expect(stops[0]?.getAttribute("stop-color")).toBe("#04070E")
      expect(stops[1]?.getAttribute("stop-color")).toBe("#0A1220")
      expect(stops[0]?.getAttribute("stop-color")).not.toBe(ctx.colors.bg)

      const rect = root.querySelector("rect")
      expect(rect).not.toBeNull()
      expect(rect?.getAttribute("width")).toBe("1280")
      expect(rect?.getAttribute("height")).toBe("720")
      expect(rect?.getAttribute("fill")).toContain("url(#")
    }
  })

  it("只有 ending 额外叠加 3 点签名星座（polyline + 3 circle，accent 色），cover/chapter/content 都没有", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const deck = ir("tech")

    for (const slide of [coverSlide, chapterSlide, contentSlide]) {
      const root = render(<ConstellationMotif ir={deck} slide={slide} ctx={ctx} />)
      expect(root.querySelectorAll("polyline")).toHaveLength(0)
      expect(root.querySelectorAll("circle")).toHaveLength(0)
    }

    const endingRoot = render(<ConstellationMotif ir={deck} slide={endingSlide} ctx={ctx} />)
    expect(endingRoot.querySelectorAll("polyline")).toHaveLength(1)
    const dots = Array.from(endingRoot.querySelectorAll("circle"))
    expect(dots).toHaveLength(3)
    dots.forEach((d) => {
      expect(d.getAttribute("r")).toBe("3")
      expect(d.getAttribute("fill")).toBe(ctx.colors.accent)
    })
    const line = endingRoot.querySelector("polyline")!
    expect(line.getAttribute("stroke")).toBe(ctx.colors.accent)
    expect(line.getAttribute("stroke-opacity")).toBe("0.25")
  })

  it("ending's smaller signature motif sits clear of all four BrandChrome logo bands", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const deck = ir("tech")
    const root = render(<ConstellationMotif ir={deck} slide={endingSlide} ctx={ctx} />)
    const dots = Array.from(root.querySelectorAll("circle"))
    expect(dots).toHaveLength(3)
    for (const dot of dots) {
      const box = {
        x: Number(dot.getAttribute("cx")) - 3,
        y: Number(dot.getAttribute("cy")) - 3,
        w: 6,
        h: 6,
      }
      for (const band of LOGO_BANDS) {
        expect(rectsOverlap(box, band)).toBe(false)
      }
    }
  })

  it("hasExplicitBackground 三种显式背景（color/gradient/有效 asset）均跳过渲染，返回空 fragment（与旧 BentoTechDecor 逐字节等价）", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const ctxWithImg = buildCtx(resolveStyle("tech"), bgImages)
    const deckPlain = ir("tech")
    const deckWithImg = ir("tech", bgImages)

    for (const [slide, useCtx, deck] of [
      [coverWithColorBg, ctx, deckPlain],
      [coverWithGradientBg, ctx, deckPlain],
      [coverWithAssetBg, ctxWithImg, deckWithImg],
    ] as const) {
      const next = renderSvgMarkup(<ConstellationMotif ir={deck} slide={slide} ctx={useCtx} />)
      expect(next).toBe("")
      expect(next).not.toContain("linearGradient")
      expect(next).not.toContain("<rect")
    }
  })

  it("asset 背景解析失败（缺资源）时 hasExplicitBackground 仍判假，退回渲染渐变场——与旧 BentoTechDecor 行为一致", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const deck = ir("tech")

    const next = renderSvgMarkup(<ConstellationMotif ir={deck} slide={coverWithBrokenAssetBg} ctx={ctx} />)
    expect(next).toBe(GRADIENT_ONLY_MARKUP)
    expect(next).toContain("linearGradient")
  })

  it("Decor markup passes assertSubset (fill=url() resolves to a declared gradient)", () => {
    const ctx = buildCtx(resolveStyle("tech"), {})
    const deck = ir("tech")
    const root = render(<ConstellationMotif ir={deck} slide={coverSlide} ctx={ctx} />)
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("consulting tokens 下 ending 星座随主题走 ctx.colors.accent（证明真正 token 化），装饰性孤儿渐变色跨主题保持不变（未被并入任何 consulting token）", () => {
    const consultingTheme = resolveStyle("consulting")
    const ctx = buildCtx(consultingTheme, {})
    const deck = ir("consulting")
    const out = renderSvgMarkup(<ConstellationMotif ir={deck} slide={endingSlide} ctx={ctx} />)

    expect(out).toContain(ctx.colors.accent as string) // consulting 的 accent 驱动 ending 星座
    expect(ctx.colors.accent).not.toBe("#2DD4E6") // tech 自己的电光青 accent 不得残留
    // 装饰豁免色是文件私有常量，不随主题变化——跨主题依然渲染同一对 hex
    expect(out).toContain("#04070E")
    expect(out).toContain("#0A1220")
  })
})
