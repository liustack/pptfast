// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, requiredContrastRatio, readableOn } from "../ink"
import { textInkBox } from "../depth-contract/geometry"
import { GhostRuleChapter, layoutDef } from "./chapter-ghost-rule-chapter"
import type { PptxIR, Slide } from "@/ir"

const HEADING = "加盟模式的三处手术"
const SUBHEADING = "小店型单店模型 · 督导线上化 · 县域直配"

function chapterCtx(themeId: string) {
  const tokens = resolveStyle(themeId)
  return {
    tokens,
    ctx: buildCtx(
      tokens,
      {},
      undefined,
      resolveBackgroundHex(tokens.defaultBackgrounds.chapter, tokens.colors.surface),
    ),
  }
}

const chapter1: Slide = { type: "chapter", heading: HEADING, subheading: SUBHEADING, components: [] } as Slide
const content: Slide = { type: "content", heading: "现状", components: [] } as Slide
const chapter2: Slide = { type: "chapter", heading: HEADING, subheading: SUBHEADING, components: [] } as Slide

function ir(themeId: string, slides: Slide[] = [chapter1, content, chapter2]): PptxIR {
  return {
    version: "4",
    filename: "ghost-rule-chapter.pptx",
    theme: { id: themeId },
    meta: {},
    assets: { images: {} },
    slides,
  } as unknown as PptxIR
}

function renderChapter(themeId: string, s: Slide = chapter2, index = 2) {
  const { tokens, ctx } = chapterCtx(themeId)
  const deck = ir(themeId)
  const markup = renderSvgMarkup(
    <svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
      <GhostRuleChapter ir={deck} slide={s} index={index} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens, ctx }
}

describe("chapter-ghost-rule-chapter — board geometry", () => {
  it("places the ghost numeral, accent bar, and left title on the board", () => {
    const { root, tokens, ctx } = renderChapter("consulting")
    const ghost = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "02")
    expect(ghost?.getAttribute("x")).toBe("1170")
    expect(ghost?.getAttribute("y")).toBe("560")
    expect(ghost?.getAttribute("font-size")).toBe("440")
    expect(ghost?.getAttribute("opacity")).toBe("0.06")
    expect(ghost?.getAttribute("text-anchor")).toBe("end")
    expect(ghost?.getAttribute("fill")).toBe(readableOn(ctx.defaultBg ?? tokens.colors.bg))

    const bar = root.querySelector("rect")
    expect(bar?.getAttribute("x")).toBe("96")
    expect(bar?.getAttribute("y")).toBe("300")
    expect(bar?.getAttribute("width")).toBe("96")
    expect(bar?.getAttribute("height")).toBe("8")
    expect(bar?.getAttribute("fill")).toBe(tokens.colors.accent)

    const title = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("加盟模式"))
    expect(title?.getAttribute("x")).toBe("96")
    expect(title?.getAttribute("y")).toBe("392")
    expect(title?.getAttribute("text-anchor")).toBeNull()
    expect(Number(title?.getAttribute("font-size"))).toBe(58)
  })

  it("keeps the ghost glyph box inside the canvas", () => {
    const { root } = renderChapter("consulting")
    const ghost = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "02")!
    const box = textInkBox({
      content: ghost.textContent ?? "",
      x: Number(ghost.getAttribute("x")),
      y: Number(ghost.getAttribute("y")),
      fontSize: Number(ghost.getAttribute("font-size")),
      fontFamily: ghost.getAttribute("font-family") ?? "",
      fontWeight: ghost.getAttribute("font-weight"),
      textAnchor: ghost.getAttribute("text-anchor") ?? "start",
    })
    expect(ghost.hasAttribute("data-bleed")).toBe(false)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.w).toBeLessThanOrEqual(1280)
    expect(box.y + box.h).toBeLessThanOrEqual(720)
  })

  it("uses tokens, not baked consulting hex, when another theme draws it", () => {
    const { root, tokens } = renderChapter("enterprise")
    expect(root.querySelector("rect")?.getAttribute("fill")).toBe(tokens.colors.accent)
    expect(root.innerHTML).not.toMatch(/#F5C518/i)
    expect(root.innerHTML).not.toMatch(/#1E2A4A/i)
  })
})

describe("chapter-ghost-rule-chapter — shared pool", () => {
  it("is a pinOnly chapter archetype", () => {
    expect(layoutDef.id).toBe("ghost-rule-chapter")
    expect(layoutDef.kind).toBe("archetype")
    expect(layoutDef.pinOnly).toBe(true)
    expect(layoutDef.slideTypes).toEqual(["chapter"])
  })

  it("every text run clears its contrast tier against the chapter background", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, tokens, ctx } = renderChapter(themeId)
      const bg = ctx.defaultBg ?? resolveBackgroundHex(tokens.defaultBackgrounds.chapter, tokens.colors.surface)
      for (const el of Array.from(root.querySelectorAll("text"))) {
        if (el.getAttribute("opacity") === "0.06") continue
        const size = Number(el.getAttribute("font-size"))
        const required = el.getAttribute("data-contrast-tier") === "meta" ? 3 : requiredContrastRatio(size)
        expect(contrastRatio(el.getAttribute("fill")!, bg), `${themeId}: ${el.textContent}`).toBeGreaterThanOrEqual(required)
      }
    }
  })

  it("emits only export-safe primitives", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      expect(() => assertSubset(renderChapter(themeId).root), themeId).not.toThrow()
    }
  })

  it("renders byte-identically on repeat", () => {
    expect(renderChapter("consulting").markup).toBe(renderChapter("consulting").markup)
  })
})
