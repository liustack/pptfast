// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { buildCtx } from "../FullSlideSvg"
import { resolveStyle } from "../../themes"
import { assertSubset } from "../subset-validate"
import { RailMotif } from "./motif-rail-motif"
import type { PptxIR, Slide } from "@/ir"

// BrandChrome's bl/br brand logo bands (see templates/academic.test.tsx's
// own LOGO_BANDS / "documents (not asserts false)" precedent) — the arc's
// originating full circle is centered exactly on the page's bottom-right
// corner, so it deliberately bleeds into BR_LOGO by construction.
const BR_LOGO = { x: 1120, y: 630, w: 96, h: 40 }

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

const coverSlide: Slide = { type: "cover", heading: "封面", blocks: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", blocks: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", blocks: [] } as Slide
const endingSlide: Slide = { type: "ending", blocks: [] } as Slide

const ir = (theme: string): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
    theme: { id: theme },
    meta: {},
    assets: { images: {} },
    slides: [coverSlide],
  }) as unknown as PptxIR

// Literal markup fixed from `templates/academic.tsx`'s `BcgEmeraldDecor`
// under academic tokens (captured once, pre-templates-deletion — see task
// report) — this is what `toBe(legacy)` used to assert at runtime. Fixating
// it here keeps the same byte-for-byte assertion strength without importing
// the (soon-to-be-deleted) templates/ module.
const EXPECTED_MOTIF: Record<string, string> = {
  cover: "",
  chapter: '<path d="M 1280,720 L 1280,460 A 260,260 0 0,0 1020,720 Z" fill="#FFFFFF" opacity="0.06"></path>',
  content: '<path d="M 1280,720 L 1280,460 A 260,260 0 0,0 1020,720 Z" fill="#006A4E" opacity="0.06"></path>',
  ending: '<path d="M 1280,720 L 1280,460 A 260,260 0 0,0 1020,720 Z" fill="#006A4E" opacity="0.06"></path>',
}

describe("RailMotif", () => {
  it.each([
    ["cover", coverSlide],
    ["chapter", chapterSlide],
    ["content", contentSlide],
    ["ending", endingSlide],
  ] as const)(
    "academic tokens 下 %s slide 输出与迁移前的 BcgEmeraldDecor 逐字节一致（档位一）",
    (label, slide) => {
      const ctx = buildCtx(resolveStyle("academic"), {})
      const deck = ir("academic")

      const next = renderSvgMarkup(<RailMotif ir={deck} slide={slide} ctx={ctx} />)
      expect(next).toBe(EXPECTED_MOTIF[label])
    },
  )

  it("Decor body passes subset validation (no gradients, plain shapes)（迁移自 academic.test.tsx）", () => {
    const ctx = buildCtx(resolveStyle("academic"), {})
    const deck = ir("academic")
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        <RailMotif ir={deck} slide={contentSlide} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })

  // The arc's originating full circle is centered exactly on the page's
  // bottom-right corner, so only its visible quarter-disc is drawn — its
  // bounding box deliberately bleeds into BrandChrome's br logo band, same
  // precedent as the badge/rail-node non-overlap checks above (a solid-fill
  // area under an opaque logo loses no information, see
  // templates/academic.test.tsx's own "documents (not asserts false)" case).
  // Documented here, not silently skipped.
  it("documents (not asserts false) that the arc overlaps the br logo band by design（迁移自 academic.test.tsx）", () => {
    const ctx = buildCtx(resolveStyle("academic"), {})
    const deck = ir("academic")
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        <RailMotif ir={deck} slide={contentSlide} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(root.querySelector("path")).toBeTruthy()
    const arcBox = { x: 1020, y: 460, w: 260, h: 260 } // bbox of the quarter-disc path
    expect(rectsOverlap(arcBox, BR_LOGO)).toBe(true)
  })

  it("装饰几何：cover 不渲染任何 path，chapter/content/ending 各渲染一段同弧形 path（装饰未隐形）", () => {
    const ctx = buildCtx(resolveStyle("academic"), {})
    const deck = ir("academic")

    function renderMotif(slide: Slide): Element {
      const markup = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
          <RailMotif ir={deck} slide={slide} ctx={ctx} />
        </svg>,
      )
      return parseSvgRoot(markup)
    }

    const coverRoot = renderMotif(coverSlide)
    expect(coverRoot.querySelectorAll("path")).toHaveLength(0)

    for (const slide of [chapterSlide, contentSlide, endingSlide]) {
      const root = renderMotif(slide)
      const paths = root.querySelectorAll("path")
      expect(paths).toHaveLength(1)
      // 弧形几何锚定在右下角：起点/终点坐标出现在 path data 里。
      expect(paths[0].getAttribute("d")).toContain("1280,720")
      // 装饰未隐形：opacity 是可见的低透明度，不是 0。
      expect(paths[0].getAttribute("opacity")).toBe("0.06")
    }

    // chapter 分支用白字例外（primary 实心背景上 primary 半透明会是无操作/
    // 完全隐形，见文件头"白字例外"说明），content/ending 用 primary。
    const chapterFill = renderMotif(chapterSlide).querySelector("path")?.getAttribute("fill")
    const contentFill = renderMotif(contentSlide).querySelector("path")?.getAttribute("fill")
    const endingFill = renderMotif(endingSlide).querySelector("path")?.getAttribute("fill")
    expect(chapterFill).toBe("#FFFFFF")
    expect(contentFill).toBe(ctx.colors.primary)
    expect(endingFill).toBe(ctx.colors.primary)
    expect(contentFill).not.toBe(chapterFill)
  })

  it("tech tokens 下用 tech 的 primary 驱动 content/ending 弧形色（证明 token 化成立，无 baked hex），chapter 白字例外跨主题稳定", () => {
    const techTheme = resolveStyle("tech")
    const ctx = buildCtx(techTheme, {})
    const deck = ir("tech")

    const contentOut = renderSvgMarkup(<RailMotif ir={deck} slide={contentSlide} ctx={ctx} />)
    expect(contentOut).toContain(ctx.colors.primary as string)
    expect(contentOut).not.toContain("#006A4E") // academic 自己的 primary 烤死色不得残留

    const chapterOut = renderSvgMarkup(<RailMotif ir={deck} slide={chapterSlide} ctx={ctx} />)
    // 白字例外：固定纯白，不随主题变化
    expect(chapterOut).toContain('fill="#FFFFFF"')
    expect(ctx.colors.primary).not.toBe("#FFFFFF")
    expect(chapterOut).not.toContain(ctx.colors.primary as string)
  })
})
