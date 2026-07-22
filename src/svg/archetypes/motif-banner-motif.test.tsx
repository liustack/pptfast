// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../FullSlideSvg"
import { resolveStyle } from "../../themes"
import type { StyleTokens } from "../../themes/tokens"
import { BannerMotif } from "./motif-banner-motif"
import type { PptxIR, Slide } from "@/ir"

// Review fix round (P1 variety wave, task 2 — Moderate finding): the chapter
// branch now derives its ink from `ctx.defaultBg` (`readableOn`, see the
// source file's own doc comment) instead of a hard-coded white literal — a
// bare `buildCtx(tokens, {})` call (as every fixture below used to make, for
// every slide type indiscriminately) resolves `defaultBg` to `tokens.colors.bg`
// unconditionally, which is consulting's *cover/content* background
// (`#F7F7F2`), never its actual chapter background (`#051C2C`). Production
// (`FullSlideSvg.tsx`) always resolves `defaultBg` per the slide's own
// *actual* type; this helper mirrors that so these fixtures stay a faithful
// simulation of production instead of accidentally exercising `readableOn`
// against the wrong background.
function ctxFor(tokens: StyleTokens, slideType: Slide["type"]): ReturnType<typeof buildCtx> {
  const defaultBg = resolveBackgroundHex(tokens.defaultBackgrounds[slideType], tokens.colors.surface)
  return buildCtx(tokens, {}, undefined, defaultBg)
}

// BrandChrome's brand logo bands (see templates/consulting.test.tsx's own
// LOGO_BANDS block) — re-declared here (self-contained, no cross-import from
// the legacy test file) for the logo-avoidance backfill below.
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

// Captured verbatim from the legacy `MckinseyNavyDecor` (templates/consulting.tsx)
// for these exact fixtures before templates/ was deleted — see P2 Task 26
// dependency-break note (same pattern as cover-banner-title.test.tsx).
// content/ending render nothing (MckinseyNavyDecor returns null for those
// slide types — see source's 2026-07-08 accent-band deletion ruling), so
// their legacy markup is the empty string.
const LEGACY_MOTIF_MARKUP: Record<string, string> = {
  cover: `<line x1="128" y1="100" x2="128" y2="620" stroke="#D5D5CB" stroke-width="1" stroke-opacity="0.25"></line><line x1="384" y1="100" x2="384" y2="620" stroke="#D5D5CB" stroke-width="1" stroke-opacity="0.25"></line><line x1="640" y1="100" x2="640" y2="620" stroke="#D5D5CB" stroke-width="1" stroke-opacity="0.25"></line><line x1="896" y1="100" x2="896" y2="620" stroke="#D5D5CB" stroke-width="1" stroke-opacity="0.25"></line><line x1="1152" y1="100" x2="1152" y2="620" stroke="#D5D5CB" stroke-width="1" stroke-opacity="0.25"></line><line x1="0" y1="120" x2="1280" y2="120" stroke="#D5D5CB" stroke-width="1" stroke-opacity="0.25"></line><line x1="0" y1="600" x2="1280" y2="600" stroke="#D5D5CB" stroke-width="1" stroke-opacity="0.25"></line>`,
  chapter: `<line x1="128" y1="100" x2="128" y2="620" stroke="#FFFFFF" stroke-width="1" stroke-opacity="0.05"></line><line x1="384" y1="100" x2="384" y2="620" stroke="#FFFFFF" stroke-width="1" stroke-opacity="0.05"></line><line x1="640" y1="100" x2="640" y2="620" stroke="#FFFFFF" stroke-width="1" stroke-opacity="0.05"></line><line x1="896" y1="100" x2="896" y2="620" stroke="#FFFFFF" stroke-width="1" stroke-opacity="0.05"></line><line x1="1152" y1="100" x2="1152" y2="620" stroke="#FFFFFF" stroke-width="1" stroke-opacity="0.05"></line><line x1="0" y1="120" x2="1280" y2="120" stroke="#FFFFFF" stroke-width="1" stroke-opacity="0.05"></line><line x1="0" y1="600" x2="1280" y2="600" stroke="#FFFFFF" stroke-width="1" stroke-opacity="0.05"></line>`,
  content: "",
  ending: "",
}

describe("BannerMotif", () => {
  it.each([
    ["cover", coverSlide],
    ["chapter", chapterSlide],
    ["content", contentSlide],
    ["ending", endingSlide],
  ] as const)(
    "consulting tokens 下 %s slide 与旧 MckinseyNavyDecor 输出逐字节一致（档位一）",
    (label, slide) => {
      const ctx = ctxFor(resolveStyle("consulting"), slide.type)
      const deck = ir("consulting")

      const next = renderSvgMarkup(<BannerMotif ir={deck} slide={slide} ctx={ctx} />)
      expect(next).toBe(LEGACY_MOTIF_MARKUP[label])
    },
  )

  it("装饰几何：cover/chapter 各渲染 5 条竖线 + 2 条横线的极淡网格（跳过标题带的第 3 条候选横线），content/ending 无任何装饰（跨 slide.type 验证装饰未被误删或误增）", () => {
    const tokens = resolveStyle("consulting")
    const deck = ir("consulting")

    function renderMotif(slide: Slide): Element {
      const ctx = ctxFor(tokens, slide.type)
      const markup = renderSvgMarkup(
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
          <BannerMotif ir={deck} slide={slide} ctx={ctx} />
        </svg>,
      )
      return parseSvgRoot(markup)
    }

    for (const slide of [coverSlide, chapterSlide]) {
      const root = renderMotif(slide)
      const lines = Array.from(root.querySelectorAll("line"))
      const verticals = lines.filter((l) => l.getAttribute("x1") === l.getAttribute("x2"))
      const horizontals = lines.filter((l) => l.getAttribute("y1") === l.getAttribute("y2"))
      expect(verticals.map((l) => l.getAttribute("x1")).sort((a, b) => Number(a) - Number(b))).toEqual([
        "128", "384", "640", "896", "1152",
      ])
      // 360（120/360/600 候选里的中间值）落在 y 300-480 标题带内，必须被过滤。
      expect(horizontals.map((l) => l.getAttribute("y1")).sort((a, b) => Number(a) - Number(b))).toEqual([
        "120", "600",
      ])
      expect(root.querySelector("rect")).toBeNull()
    }

    for (const slide of [contentSlide, endingSlide]) {
      const root = renderMotif(slide)
      expect(root.querySelector("line")).toBeNull()
      expect(root.querySelector("rect")).toBeNull()
    }

    // cover 用 border token 描边，chapter（默认深色 primary 背景）改用
    // readableOn(实际 chapter 背景) 描边——同一份网格几何，两种描边色，产品
    // 逻辑不同，不是取巧凑数。consulting 的 chapter 背景是深色 primary，
    // readableOn 在此仍解出纯白，与旧的白字硬编码字节一致。
    const coverStroke = renderMotif(coverSlide).querySelector("line")?.getAttribute("stroke")
    const chapterStroke = renderMotif(chapterSlide).querySelector("line")?.getAttribute("stroke")
    expect(coverStroke).toBe(tokens.colors.border ?? tokens.colors.muted)
    expect(chapterStroke).toBe("#FFFFFF")
    expect(coverStroke).not.toBe(chapterStroke)
    expect(renderMotif(coverSlide).querySelector("line")?.getAttribute("stroke-opacity")).toBe("0.25")
    expect(renderMotif(chapterSlide).querySelector("line")?.getAttribute("stroke-opacity")).toBe("0.05")
  })

  it("tech tokens 下用 tech 的 border（缺省则 muted）驱动 cover 网格描边色（证明 token 化成立，无 baked hex），chapter readableOn 在 tech 的深色渐变背景下同样解出纯白", () => {
    const techTheme = resolveStyle("tech")
    const deck = ir("tech")

    const coverCtx = ctxFor(techTheme, "cover")
    const coverOut = renderSvgMarkup(<BannerMotif ir={deck} slide={coverSlide} ctx={coverCtx} />)
    const expectedStroke = coverCtx.colors.border ?? coverCtx.colors.muted
    expect(coverOut).toContain(expectedStroke as string)
    // consulting 自己的 DIVIDER 烤死色不得残留
    expect(coverOut).not.toContain("#D5D5CB")

    const chapterCtx = ctxFor(techTheme, "chapter")
    const chapterOut = renderSvgMarkup(<BannerMotif ir={deck} slide={chapterSlide} ctx={chapterCtx} />)
    // readableOn(tech 的深色渐变 chapter 背景) 解出纯白——与 consulting 的深色
    // chapter 背景同一结论，不是巧合固定值：两个主题的 chapter 背景都够暗，
    // readableOn 的两枚候选墨色里白墨稳赢。
    expect(chapterOut).toContain('stroke="#FFFFFF"')
    expect(expectedStroke).not.toBe("#FFFFFF")
    expect(chapterOut).not.toContain(`stroke="${expectedStroke}"`)
  })

  // 回填旧测试「the grid (verticals clipped to y 100-620) sits clear of the
  // four logo bands」（旧文件 consulting.test.tsx L628-641）。
  it("网格线（竖线截取在 y 100-620）与四个 logo 带互不重叠", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const deck = ir("consulting")
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        <BannerMotif ir={deck} slide={coverSlide} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    for (const l of Array.from(root.querySelectorAll("line"))) {
      const box = {
        x: Math.min(Number(l.getAttribute("x1")), Number(l.getAttribute("x2"))),
        y: Math.min(Number(l.getAttribute("y1")), Number(l.getAttribute("y2"))),
        w: Math.abs(Number(l.getAttribute("x2")) - Number(l.getAttribute("x1"))) || 1,
        h: Math.abs(Number(l.getAttribute("y2")) - Number(l.getAttribute("y1"))) || 1,
      }
      for (const band of LOGO_BANDS) {
        expect(rectsOverlap(box, band)).toBe(false)
      }
    }
  })

  // 回填旧测试「Decor body passes subset validation」（旧文件
  // consulting.test.tsx L643-646）。
  it("Decor 输出通过 subset validation", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const deck = ir("consulting")
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        <BannerMotif ir={deck} slide={coverSlide} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })
})
