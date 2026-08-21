// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, requiredContrastRatio } from "../ink"
import { HeaderBandCover, layoutDef } from "./cover-header-band"
import type { PptxIR, Slide } from "@/ir"

const HEADING = "每个孩子都能画出自己的星球"
const SUBHEADING = "星芽美术 4-12 岁分龄课程体系 · 春季班报名开放"

function slide(heading = HEADING): Slide {
  return { type: "cover", heading, subheading: SUBHEADING, components: [] } as Slide
}

function ir(themeId: string, meta: PptxIR["meta"] = {}, s: Slide = slide()): PptxIR {
  return {
    version: "4",
    filename: "header-band.pptx",
    theme: { id: themeId },
    chrome: "full",
    meta,
    assets: { images: {} },
    slides: [s],
  } as unknown as PptxIR
}

const FULL_META: PptxIR["meta"] = {
  organization: "星芽美术 · 春季招生",
  authors: [{ name: "周老师", role: "教学主管" }],
  date: "2026 春",
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
      <HeaderBandCover ir={ir(themeId, meta, s)} slide={s} index={0} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens }
}

describe("cover-header-band — board geometry", () => {
  it("band height is 152, title sits below y=152, meta sits on the band", () => {
    const { root, tokens } = renderCover("crayon")
    const band = root.querySelector("rect")!
    expect([band.getAttribute("x"), band.getAttribute("y"), band.getAttribute("width"), band.getAttribute("height")]).toEqual([
      "0",
      "0",
      "1280",
      "152",
    ])
    expect(band.getAttribute("fill")).toBe(tokens.colors.primary)
    const headings = Array.from(root.querySelectorAll("text")).filter((t) => t.getAttribute("font-weight") === "700")
    expect(headings.length).toBeGreaterThan(0)
    for (const h of headings) {
      expect(Number(h.getAttribute("y"))).toBeGreaterThan(152)
      expect(h.getAttribute("x")).toBe("96")
    }
    const metas = Array.from(root.querySelectorAll("text")).filter((t) => t.getAttribute("data-contrast-tier") === "meta")
    expect(metas.some((t) => t.getAttribute("y") === "62" && t.getAttribute("x") === "64")).toBe(true)
  })

  it("does not draw crayon smear, sun, rainbow, stars, or round stickers", () => {
    const { root } = renderCover("crayon")
    expect(root.querySelectorAll("circle")).toHaveLength(0)
    expect(root.querySelectorAll("polygon")).toHaveLength(0)
  })

  it("emphasized run uses accent and a wave; unmarked heading draws neither", () => {
    const marked = slide("每个孩子都能画出**自己的星球**")
    const { root, tokens } = renderCover("crayon", marked)
    const tspans = Array.from(root.querySelectorAll("tspan"))
    expect(tspans.some((t) => t.getAttribute("fill") === tokens.colors.accent)).toBe(true)
    expect(root.querySelector("path")?.getAttribute("stroke")).toBe(tokens.colors.accent)

    const plain = renderCover("crayon", slide(HEADING))
    expect(plain.root.querySelectorAll("tspan")).toHaveLength(0)
    expect(plain.root.querySelector("path")).toBeNull()
  })
})

describe("cover-header-band — shared pool", () => {
  it("is registered for cover only, as an archetype", () => {
    expect(layoutDef.id).toBe("header-band")
    expect(layoutDef.kind).toBe("archetype")
    expect(layoutDef.slideTypes).toEqual(["cover"])
  })

  it("every text run clears its contrast tier against the field it sits on", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, tokens } = renderCover(themeId)
      const pageBg = resolveBackgroundHex(tokens.defaultBackgrounds.cover, tokens.colors.surface)
      for (const el of Array.from(root.querySelectorAll("text"))) {
        const y = Number(el.getAttribute("y"))
        const surface = y <= 152 ? tokens.colors.primary : pageBg
        const size = Number(el.getAttribute("font-size"))
        const required = el.getAttribute("data-contrast-tier") === "meta" ? 3 : requiredContrastRatio(size)
        expect(contrastRatio(el.getAttribute("fill")!, surface), `${themeId}: ${el.textContent}`).toBeGreaterThanOrEqual(
          required,
        )
      }
    }
  })

  it("emits only export-safe primitives", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      expect(() => assertSubset(renderCover(themeId).root), themeId).not.toThrow()
    }
  })

  it("renders byte-identically on repeat", () => {
    expect(renderCover("crayon").markup).toBe(renderCover("crayon").markup)
  })

  it("CJK title has no letter-spacing", () => {
    const { root } = renderCover("crayon")
    for (const t of Array.from(root.querySelectorAll("text")).filter((el) => el.getAttribute("font-weight") === "700")) {
      expect(t.getAttribute("letter-spacing")).toBeNull()
    }
  })
})
