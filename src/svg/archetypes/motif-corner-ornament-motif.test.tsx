// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../FullSlideSvg"
import { getTheme } from "../../themes"
import { CornerOrnamentMotif } from "./motif-corner-ornament-motif"
import type { PptxIR, Slide } from "@/ir"

const coverSlide: Slide = { type: "cover", heading: "封面", blocks: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", blocks: [] } as Slide
const contentSlide: Slide = { type: "content", variant: "single", heading: "内容", blocks: [] } as Slide
const endingSlide: Slide = { type: "ending", blocks: [] } as Slide

// 2026-07-10 构图变体引入后，逐字节锁锚定 variant a（原构图）——运行时
// probe 一个命中 a 的 filename（fixture 自适应，变体算法调整也不会脆断）。
import { cachedDeckSeed, pickBySeed } from "../variety"

function mkIr(theme: string, filename: string): PptxIR {
  return {
    version: "3",
    filename,
    style: { id: theme },
    meta: {},
    assets: { images: {} },
    slides: [coverSlide],
  } as unknown as PptxIR
}

function probeVariantA(theme: string): string {
  for (let i = 0; i < 200; i++) {
    const fn = `corner-lock-${i}.pptx`
    const v = pickBySeed(cachedDeckSeed(mkIr(theme, fn)), "corner-ornament-decor", ["a", "b", "c"] as const)
    if (v === "a") return fn
  }
  throw new Error("no variant-a filename found in 200 probes")
}

const ir = (theme: string): PptxIR => mkIr(theme, probeVariantA(theme))

// MasterChrome's brand logo bands (MasterChrome.tsx logoBox: image at
// width=96 height=40, positioned tl/tr/bl/br). Aligned with the same
// constants/pattern used by academic.test.tsx and creative.test.tsx.
const TL_LOGO = { x: 64, y: 48, w: 96, h: 40 }
const TR_LOGO = { x: 1120, y: 48, w: 96, h: 40 }
const BL_LOGO = { x: 64, y: 630, w: 96, h: 40 }
const BR_LOGO = { x: 1120, y: 630, w: 96, h: 40 }
const LOGO_BANDS = [TL_LOGO, TR_LOGO, BL_LOGO, BR_LOGO]

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/** Corner ornament bounding box: outer bracket at `margin` from the edge,
 * legs 20px, inner bracket 4px further in — union bbox is a 24x24 square. */
function cornerBox(cx: number, cy: number, signX: 1 | -1, signY: 1 | -1) {
  const x = signX === 1 ? cx + 40 : cx + 40 * signX - 24
  const y = signY === 1 ? cy + 40 : cy + 40 * signY - 24
  return { x, y, w: 24, h: 24 }
}

// Captured from CornerOrnamentMotif (magazine tokens, the four slide types
// above) — pinned as literals so this test no longer depends on the legacy
// `templates/magazine` module (slated for deletion).
const MAGAZINE_EXPECTED: Record<string, string> = {
  cover:
    '<line x1="40" y1="40" x2="60" y2="40" stroke="#E4DCD0" stroke-width="1"></line><line x1="40" y1="40" x2="40" y2="60" stroke="#E4DCD0" stroke-width="1"></line><line x1="44" y1="44" x2="64" y2="44" stroke="#E4DCD0" stroke-width="1"></line><line x1="44" y1="44" x2="44" y2="64" stroke="#E4DCD0" stroke-width="1"></line><line x1="1240" y1="40" x2="1220" y2="40" stroke="#E4DCD0" stroke-width="1"></line><line x1="1240" y1="40" x2="1240" y2="60" stroke="#E4DCD0" stroke-width="1"></line><line x1="1236" y1="44" x2="1216" y2="44" stroke="#E4DCD0" stroke-width="1"></line><line x1="1236" y1="44" x2="1236" y2="64" stroke="#E4DCD0" stroke-width="1"></line><line x1="40" y1="680" x2="60" y2="680" stroke="#E4DCD0" stroke-width="1"></line><line x1="40" y1="680" x2="40" y2="660" stroke="#E4DCD0" stroke-width="1"></line><line x1="44" y1="676" x2="64" y2="676" stroke="#E4DCD0" stroke-width="1"></line><line x1="44" y1="676" x2="44" y2="656" stroke="#E4DCD0" stroke-width="1"></line><line x1="1240" y1="680" x2="1220" y2="680" stroke="#E4DCD0" stroke-width="1"></line><line x1="1240" y1="680" x2="1240" y2="660" stroke="#E4DCD0" stroke-width="1"></line><line x1="1236" y1="676" x2="1216" y2="676" stroke="#E4DCD0" stroke-width="1"></line><line x1="1236" y1="676" x2="1236" y2="656" stroke="#E4DCD0" stroke-width="1"></line>',
  chapter:
    '<line x1="40" y1="40" x2="60" y2="40" stroke="#E4DCD0" stroke-width="1"></line><line x1="40" y1="40" x2="40" y2="60" stroke="#E4DCD0" stroke-width="1"></line><line x1="44" y1="44" x2="64" y2="44" stroke="#E4DCD0" stroke-width="1"></line><line x1="44" y1="44" x2="44" y2="64" stroke="#E4DCD0" stroke-width="1"></line><line x1="1240" y1="40" x2="1220" y2="40" stroke="#E4DCD0" stroke-width="1"></line><line x1="1240" y1="40" x2="1240" y2="60" stroke="#E4DCD0" stroke-width="1"></line><line x1="1236" y1="44" x2="1216" y2="44" stroke="#E4DCD0" stroke-width="1"></line><line x1="1236" y1="44" x2="1236" y2="64" stroke="#E4DCD0" stroke-width="1"></line><line x1="40" y1="680" x2="60" y2="680" stroke="#E4DCD0" stroke-width="1"></line><line x1="40" y1="680" x2="40" y2="660" stroke="#E4DCD0" stroke-width="1"></line><line x1="44" y1="676" x2="64" y2="676" stroke="#E4DCD0" stroke-width="1"></line><line x1="44" y1="676" x2="44" y2="656" stroke="#E4DCD0" stroke-width="1"></line><line x1="1240" y1="680" x2="1220" y2="680" stroke="#E4DCD0" stroke-width="1"></line><line x1="1240" y1="680" x2="1240" y2="660" stroke="#E4DCD0" stroke-width="1"></line><line x1="1236" y1="676" x2="1216" y2="676" stroke="#E4DCD0" stroke-width="1"></line><line x1="1236" y1="676" x2="1236" y2="656" stroke="#E4DCD0" stroke-width="1"></line>',
  content:
    '<line x1="1240" y1="40" x2="1220" y2="40" stroke="#E4DCD0" stroke-width="1"></line><line x1="1240" y1="40" x2="1240" y2="60" stroke="#E4DCD0" stroke-width="1"></line><line x1="1236" y1="44" x2="1216" y2="44" stroke="#E4DCD0" stroke-width="1"></line><line x1="1236" y1="44" x2="1236" y2="64" stroke="#E4DCD0" stroke-width="1"></line>',
  ending:
    '<line x1="1240" y1="40" x2="1220" y2="40" stroke="#E4DCD0" stroke-width="1"></line><line x1="1240" y1="40" x2="1240" y2="60" stroke="#E4DCD0" stroke-width="1"></line><line x1="1236" y1="44" x2="1216" y2="44" stroke="#E4DCD0" stroke-width="1"></line><line x1="1236" y1="44" x2="1236" y2="64" stroke="#E4DCD0" stroke-width="1"></line>',
}

describe("CornerOrnamentMotif", () => {
  it.each([
    ["cover", coverSlide],
    ["chapter", chapterSlide],
    ["content", contentSlide],
    ["ending", endingSlide],
  ] as const)(
    "magazine tokens 下 %s slide 与固化的基准 markup 逐字节一致（档位一，档案来自旧 EditorialSerifDecor）",
    (label, slide) => {
      const ctx = buildCtx(getTheme("journal"), {})
      const deck = ir("journal")

      const next = renderSvgMarkup(<CornerOrnamentMotif ir={deck} slide={slide} ctx={ctx} />)
      expect(next).toBe(MAGAZINE_EXPECTED[label])
    },
  )

  it("cover/chapter 渲染四角共 16 段 line，content/ending 只渲染右上角共 4 段 line（装饰几何）", () => {
    const ctx = buildCtx(getTheme("journal"), {})
    const deck = ir("journal")

    function renderMotif(slide: Slide): Element {
      const markup = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
          <CornerOrnamentMotif ir={deck} slide={slide} ctx={ctx} />
        </svg>,
      )
      return parseSvgRoot(markup)
    }

    for (const slide of [coverSlide, chapterSlide]) {
      const root = renderMotif(slide)
      expect(root.querySelectorAll("line")).toHaveLength(16)
    }

    for (const slide of [contentSlide, endingSlide]) {
      const root = renderMotif(slide)
      const lines = Array.from(root.querySelectorAll("line"))
      expect(lines).toHaveLength(4)
      // Every line sits in the top-right quadrant (x > 1216, y < 64).
      for (const l of lines) {
        expect(Number(l.getAttribute("x1"))).toBeGreaterThan(1216)
        expect(Number(l.getAttribute("y1"))).toBeLessThan(64)
      }
    }
  })

  it("every ornament uses the theme's divider/border color at 1px", () => {
    const ctx = buildCtx(getTheme("journal"), {})
    const deck = ir("journal")
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        <CornerOrnamentMotif ir={deck} slide={coverSlide} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    for (const l of Array.from(root.querySelectorAll("line"))) {
      expect(l.getAttribute("stroke")).toBe(ctx.colors.border)
      expect(l.getAttribute("stroke-width")).toBe("1")
    }
  })

  it("all four corner ornaments sit clear of (tangent to, not overlapping) the logo bands", () => {
    const boxes = [
      cornerBox(0, 0, 1, 1),
      cornerBox(1280, 0, -1, 1),
      cornerBox(0, 720, 1, -1),
      cornerBox(1280, 720, -1, -1),
    ]
    for (const box of boxes) {
      for (const band of LOGO_BANDS) {
        expect(rectsOverlap(box, band)).toBe(false)
      }
    }
  })

  it("body passes assertSubset (no forbidden elements)", () => {
    const ctx = buildCtx(getTheme("journal"), {})
    const deck = ir("journal")
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        <CornerOrnamentMotif ir={deck} slide={coverSlide} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("consulting tokens 下用 consulting 的色（证明 token 化成立，无 baked hex）", () => {
    const ctx = buildCtx(getTheme("consulting"), {})
    const deck = ir("consulting")
    const out = renderSvgMarkup(<CornerOrnamentMotif ir={deck} slide={coverSlide} ctx={ctx} />)
    expect(out).toContain("#D5D5CB") // consulting border
    expect(out).not.toContain("#E4DCD0") // magazine border 不得残留
  })
})
