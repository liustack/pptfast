// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, requiredContrastRatio } from "../ink"
import { PaperMastheadCover, layoutDef } from "./cover-paper-masthead"
import type { PptxIR, Slide } from "@/ir"

const HEADING = "云觅科技季度评审"
const SUBHEADING = "工作区席位订阅业务的增长质量与下半年投入方向"

function slide(heading = HEADING): Slide {
  return { type: "cover", heading, subheading: SUBHEADING, components: [] } as Slide
}

function ir(themeId: string, meta: PptxIR["meta"] = {}, s: Slide = slide()): PptxIR {
  return {
    version: "4",
    filename: "paper-masthead.pptx",
    theme: { id: themeId },
    branding: "full",
    meta,
    assets: { images: {} },
    slides: [s],
  } as unknown as PptxIR
}

const FULL_META: PptxIR["meta"] = {
  organization: "CLOUDSEEK COLLABORATION · Q2 REVIEW",
  authors: [{ name: "陈砚清", role: "首席技术官" }],
  date: "2026-07",
  version: "v1.0",
}

function renderCover(themeId: string, s: Slide = slide(), meta: PptxIR["meta"] = FULL_META) {
  const tokens = resolveStyle(themeId)
  const ctx = buildCtx(
    tokens,
    {},
    undefined,
    resolveBackgroundHex(tokens.defaultBackgrounds.cover, tokens.colors.surface),
  )
  const markup = renderSvgMarkup(
    <svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
      <PaperMastheadCover ir={ir(themeId, meta, s)} slide={s} index={0} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens }
}

describe("cover-paper-masthead — board geometry", () => {
  it("draws no writing-mode, stacks the year as single-char texts, and paints no full-bleed primary", () => {
    const { root, tokens } = renderCover("runway")
    expect(root.innerHTML).not.toMatch(/writing-mode/i)
    const year = Array.from(root.querySelectorAll("text")).filter((t) => t.getAttribute("x") === "1216")
    expect(year.length).toBeGreaterThan(1)
    for (const glyph of year) {
      expect((glyph.textContent ?? "").length).toBe(1)
      expect(glyph.getAttribute("text-anchor")).toBe("middle")
    }
    const fullBleed = Array.from(root.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("width") === "1280" && r.getAttribute("height") === "720",
    )
    expect(fullBleed).toHaveLength(0)
    const headings = Array.from(root.querySelectorAll("text")).filter((t) => t.getAttribute("font-weight") === "700")
    expect(headings[0]?.getAttribute("x")).toBe("96")
    expect(Number(headings[0]?.getAttribute("font-size"))).toBeGreaterThanOrEqual(100)
    expect(headings[0]?.getAttribute("fill")).not.toBe(tokens.colors.primary)
  })

  it("draws nothing on the year rail when the date is missing or unreadable", () => {
    const missing = renderCover("runway", slide(), { organization: "X" })
    expect(Array.from(missing.root.querySelectorAll("text")).filter((t) => t.getAttribute("x") === "1216")).toHaveLength(0)
    const junk = renderCover("runway", slide(), { organization: "X", date: "Q2" })
    expect(Array.from(junk.root.querySelectorAll("text")).filter((t) => t.getAttribute("x") === "1216")).toHaveLength(0)
  })

  it("emphasized run uses accent", () => {
    const { root, tokens } = renderCover("runway", slide("云觅科技季度**评审**"))
    expect(Array.from(root.querySelectorAll("tspan")).some((t) => t.getAttribute("fill") === tokens.colors.accent)).toBe(true)
  })
})

describe("cover-paper-masthead — shared pool", () => {
  it("is registered for cover only, as an archetype", () => {
    expect(layoutDef.id).toBe("paper-masthead")
    expect(layoutDef.kind).toBe("archetype")
    expect(layoutDef.slideTypes).toEqual(["cover"])
  })

  it("every text run clears its contrast tier against the cover background", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, tokens } = renderCover(themeId)
      const bg = resolveBackgroundHex(tokens.defaultBackgrounds.cover, tokens.colors.surface)
      for (const el of Array.from(root.querySelectorAll("text"))) {
        const size = Number(el.getAttribute("font-size"))
        const required = el.getAttribute("data-contrast-tier") === "meta" ? 3 : requiredContrastRatio(size)
        expect(contrastRatio(el.getAttribute("fill")!, bg), `${themeId}: ${el.textContent}`).toBeGreaterThanOrEqual(required)
      }
    }
  })

  it("emits only export-safe primitives", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      expect(() => assertSubset(renderCover(themeId).root), themeId).not.toThrow()
    }
  })

  it("renders byte-identically on repeat", () => {
    expect(renderCover("runway").markup).toBe(renderCover("runway").markup)
  })

  it("CJK title has no letter-spacing", () => {
    const { root } = renderCover("runway")
    for (const t of Array.from(root.querySelectorAll("text")).filter((el) => el.getAttribute("font-weight") === "700")) {
      expect(t.getAttribute("letter-spacing")).toBeNull()
    }
  })
})
