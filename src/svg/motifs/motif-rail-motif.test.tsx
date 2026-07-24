// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import type { StyleTokens } from "../../themes/tokens"
import { assertSubset } from "../subset-validate"
import { RailMotif } from "./motif-rail-motif"
import type { PptxIR, Slide } from "@/ir"

// Review fix round (P1 variety wave, task 2 — Moderate finding): the chapter
// branch now derives its ink from `ctx.defaultBg` (`readableOn`, see the
// source file's own doc comment) instead of a hard-coded white literal — a
// bare `buildCtx(tokens, {})` call (as every fixture below used to make, for
// every slide type indiscriminately) resolves `defaultBg` to `tokens.colors.bg`
// unconditionally, which is academic's *cover/content* background
// (`#FAFAF6`), never its actual chapter background (`#006A4E`). Production
// (`full-slide-svg.tsx`) always resolves `defaultBg` per the slide's own
// *actual* type; this helper mirrors that so these fixtures stay a faithful
// simulation of production instead of accidentally exercising `readableOn`
// against the wrong background.
function ctxFor(tokens: StyleTokens, slideType: Slide["type"]): ReturnType<typeof buildCtx> {
  const defaultBg = resolveBackgroundHex(tokens.defaultBackgrounds[slideType], tokens.colors.surface)
  return buildCtx(tokens, {}, undefined, defaultBg)
}

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

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const chapterSlide: Slide = { type: "chapter", heading: "章节", components: [] } as Slide
const contentSlide: Slide = { type: "content", heading: "内容", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide

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
      const ctx = ctxFor(resolveStyle("academic"), slide.type)
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
    const tokens = resolveStyle("academic")
    const deck = ir("academic")

    function renderMotif(slide: Slide): Element {
      const ctx = ctxFor(tokens, slide.type)
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

    // chapter 分支用 readableOn(实际 chapter 背景)（primary 实心背景上
    // primary 半透明会是无操作/完全隐形，见文件头"Review fix round"说明），
    // content/ending 用 primary。academic 的 chapter 背景够暗，readableOn
    // 在此解出纯白，与旧的白字硬编码字节一致。
    const chapterFill = renderMotif(chapterSlide).querySelector("path")?.getAttribute("fill")
    const contentFill = renderMotif(contentSlide).querySelector("path")?.getAttribute("fill")
    const endingFill = renderMotif(endingSlide).querySelector("path")?.getAttribute("fill")
    expect(chapterFill).toBe("#FFFFFF")
    expect(contentFill).toBe(tokens.colors.primary)
    expect(endingFill).toBe(tokens.colors.primary)
    expect(contentFill).not.toBe(chapterFill)
  })

  it("tech tokens 下用 tech 的 primary 驱动 content/ending 弧形色（证明 token 化成立，无 baked hex），chapter readableOn 在 tech 的深色渐变背景下同样解出纯白", () => {
    const techTheme = resolveStyle("tech")
    const deck = ir("tech")

    const contentCtx = ctxFor(techTheme, "content")
    const contentOut = renderSvgMarkup(<RailMotif ir={deck} slide={contentSlide} ctx={contentCtx} />)
    expect(contentOut).toContain(contentCtx.colors.primary as string)
    expect(contentOut).not.toContain("#006A4E") // academic 自己的 primary 烤死色不得残留

    const chapterCtx = ctxFor(techTheme, "chapter")
    const chapterOut = renderSvgMarkup(<RailMotif ir={deck} slide={chapterSlide} ctx={chapterCtx} />)
    // readableOn(tech 的深色渐变 chapter 背景) 解出纯白。
    expect(chapterOut).toContain('fill="#FFFFFF"')
    expect(chapterCtx.colors.primary).not.toBe("#FFFFFF")
    expect(chapterOut).not.toContain(chapterCtx.colors.primary as string)
  })
})
