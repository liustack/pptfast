// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, requiredContrastRatio } from "../ink"
import { textInkBox } from "../depth-contract/geometry"
import { GhostSectionChapter, layoutDef } from "./chapter-ghost-section-chapter"
import type { PptxIR, Slide } from "@/ir"

const HEADING = "收入结构在换血"
const SUBHEADING = "订阅占比 · 客单结构 · 续约质量"

function chapter(heading = HEADING, extras: Partial<Slide> = {}): Slide {
  return { type: "chapter", heading, subheading: SUBHEADING, components: [], ...extras } as Slide
}

function ir(themeId: string, slides: Slide[]): PptxIR {
  return {
    version: "4",
    filename: "ghost-section.pptx",
    theme: { id: themeId },
    meta: {},
    assets: { images: {} },
    slides,
  } as unknown as PptxIR
}

function renderChapter(themeId: string, slides: Slide[] = [chapter()], index = 0) {
  const tokens = resolveStyle(themeId)
  const ctx = buildCtx(
    tokens,
    {},
    undefined,
    resolveBackgroundHex(tokens.defaultBackgrounds.chapter, tokens.colors.surface),
  )
  const s = slides[index]!
  const markup = renderSvgMarkup(
    <svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
      <GhostSectionChapter ir={ir(themeId, slides)} slide={s} index={index} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens }
}

function ghostEl(root: Element): Element {
  return Array.from(root.querySelectorAll("text")).find(
    (t) => Number(t.getAttribute("font-size")) >= 140 && /^\d{2,}$/.test((t.textContent ?? "").trim()),
  )!
}

describe("chapter-ghost-section-chapter — board geometry", () => {
  it("sinks a ghost index to the bottom right, whole glyph inside the canvas", () => {
    const { root, tokens } = renderChapter("insight", [chapter(), { type: "content", heading: "x", components: [] } as Slide, chapter()], 2)
    const ghost = ghostEl(root)
    expect(ghost.textContent).toBe("02")
    expect(ghost.getAttribute("text-anchor")).toBe("end")
    expect(ghost.getAttribute("x")).toBe("1180")
    expect(Number(ghost.getAttribute("font-size"))).toBe(480)
    expect(ghost.getAttribute("fill")).toBe(tokens.colors.surface)
    expect(ghost.hasAttribute("data-bleed")).toBe(false)
    expect(ghost.getAttribute("data-depth")).toBe("mid")

    const box = textInkBox({
      content: ghost.textContent ?? "",
      x: Number(ghost.getAttribute("x")),
      y: Number(ghost.getAttribute("y")),
      fontSize: Number(ghost.getAttribute("font-size")),
      fontFamily: ghost.getAttribute("font-family") ?? "",
      fontWeight: ghost.getAttribute("font-weight"),
      textAnchor: ghost.getAttribute("text-anchor") ?? "start",
    })
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.w).toBeLessThanOrEqual(1280)
    expect(box.y + box.h).toBeLessThanOrEqual(720)
    expect(Number(ghost.getAttribute("y")) + Number(ghost.getAttribute("font-size")) * 0.25).toBeLessThanOrEqual(720)
  })

  it("paints an amber SECTION kicker and a left-aligned heading", () => {
    const { root, tokens } = renderChapter("insight")
    const kicker = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("SECTION"))!
    expect(kicker.textContent).toBe("SECTION 01")
    expect(kicker.getAttribute("x")).toBe("96")
    expect(kicker.getAttribute("y")).toBe("330")
    expect(kicker.getAttribute("fill")).toBe(tokens.colors.accent)
    expect(kicker.getAttribute("letter-spacing")).toBe("10")

    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("收入结构在换血"),
    )!
    expect(heading.getAttribute("x")).toBe("96")
    expect(heading.getAttribute("y")).toBe("410")
    expect(heading.getAttribute("text-anchor")).not.toBe("middle")
    expect(heading.getAttribute("letter-spacing")).toBeNull()
  })

  it("does not invent a quarter watermark or isolated ticks", () => {
    const { root } = renderChapter("insight")
    const texts = Array.from(root.querySelectorAll("text")).map((t) => t.textContent ?? "")
    expect(texts.some((t) => /^Q[1-4]$/.test(t))).toBe(false)
    expect(root.querySelectorAll("line")).toHaveLength(0)
    expect(root.querySelectorAll("circle")).toHaveLength(0)
  })
})

describe("chapter-ghost-section-chapter — shared pool", () => {
  it("is registered for chapter only, as a pinOnly archetype", () => {
    expect(layoutDef.id).toBe("ghost-section-chapter")
    expect(layoutDef.kind).toBe("archetype")
    expect(layoutDef.pinOnly).toBe(true)
    expect(layoutDef.branding).toBe("none")
    expect(layoutDef.slideTypes).toEqual(["chapter"])
  })

  it("foreground text clears its contrast tier. ghost is skipped (midground, not body ink)", () => {
    const insight = renderChapter("insight")
    const insightBg = resolveBackgroundHex(
      insight.tokens.defaultBackgrounds.chapter,
      insight.tokens.colors.surface,
    )
    const insightGhost = ghostEl(insight.root)
    expect(contrastRatio(insightGhost.getAttribute("fill")!, insightBg)).toBeLessThan(3)

    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, tokens } = renderChapter(themeId)
      const bg = resolveBackgroundHex(tokens.defaultBackgrounds.chapter, tokens.colors.surface)
      for (const el of Array.from(root.querySelectorAll("text"))) {
        if (el.getAttribute("data-depth") === "mid") continue
        const size = Number(el.getAttribute("font-size"))
        const required = el.getAttribute("data-contrast-tier") === "meta" ? 3 : requiredContrastRatio(size)
        expect(contrastRatio(el.getAttribute("fill")!, bg), `${themeId}: ${el.textContent}`).toBeGreaterThanOrEqual(
          required,
        )
      }
    }
  })

  it("emits only export-safe primitives", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      expect(() => assertSubset(renderChapter(themeId).root), themeId).not.toThrow()
    }
  })

  it("renders byte-identically on repeat", () => {
    expect(renderChapter("insight").markup).toBe(renderChapter("insight").markup)
  })

  it("consulting tokens do not leak insight hex", () => {
    const { markup } = renderChapter("consulting")
    for (const hex of ["#0F1216", "#171C22", "#16202B", "#F0A63C", "#F2EFE8", "#9AA7B4", "#2A3440"]) {
      expect(markup, `insight token ${hex} leaked`).not.toContain(hex)
    }
  })
})
