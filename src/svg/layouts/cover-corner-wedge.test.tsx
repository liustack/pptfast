// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, requiredContrastRatio } from "../ink"
import type { StyleTokens } from "../../themes/tokens"
import { CornerWedgeCover, layoutDef } from "./cover-corner-wedge"
import type { PptxIR, Slide } from "@/ir"

const HEADING_ARENA = "巅峰之夜"
const HEADING_EMBER = "岭原智能 2026 年第二季度业务评审"
const SUBHEADING = "八强出炉 · 决赛日程与观赛指南"

function slide(heading: string): Slide {
  return { type: "cover", heading, subheading: SUBHEADING, components: [] } as Slide
}

function ir(themeId: string, meta: PptxIR["meta"] = {}, s: Slide): PptxIR {
  return {
    version: "4",
    filename: "corner-wedge.pptx",
    theme: { id: themeId },
    meta,
    assets: { images: {} },
    slides: [s],
  } as unknown as PptxIR
}

const FULL_META: PptxIR["meta"] = {
  organization: "岭原电竞 · 赛事运营部",
  authors: [{ name: "陈砚清", role: "首席技术官" }],
}

function renderCover(
  themeId: string,
  s: Slide,
  cover?: NonNullable<StyleTokens["shape"]>["cover"],
  meta: PptxIR["meta"] = FULL_META,
) {
  const tokens = resolveStyle(themeId)
  const shaped: StyleTokens = { ...tokens, shape: { ...tokens.shape, cover: { ...tokens.shape?.cover, ...cover } } }
  const ctx = buildCtx(
    shaped,
    {},
    undefined,
    resolveBackgroundHex(tokens.defaultBackgrounds.cover, tokens.colors.surface),
  )
  const markup = renderSvgMarkup(
    <svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
      <CornerWedgeCover ir={ir(themeId, meta, s)} slide={s} index={0} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens }
}

describe("cover-corner-wedge — board geometry", () => {
  it("arena: centered title and the small board wedge", () => {
    const { root, tokens } = renderCover(
      "arena",
      slide(HEADING_ARENA),
      { textAnchor: "middle", wedgePeakY: 340, wedgeStartX: 980 },
    )
    const paths = Array.from(root.querySelectorAll("path"))
    expect(paths[0]?.getAttribute("d")?.replace(/\s+/g, "")).toBe("M980,720L1280,340L1280,720Z")
    expect(paths[0]?.getAttribute("fill")).toBe(tokens.colors.primary)
    expect(paths[1]?.getAttribute("fill")).toBe(tokens.colors.accent)
    const headings = Array.from(root.querySelectorAll("text")).filter((t) => t.getAttribute("font-weight") === "700")
    expect(headings[0]?.getAttribute("x")).toBe("640")
    expect(headings[0]?.getAttribute("text-anchor")).toBe("middle")
    expect(root.querySelectorAll("circle")).toHaveLength(0)
  })

  it("ember: left title, tall wedge, meta in the wedge", () => {
    const { root, tokens } = renderCover(
      "ember",
      slide(HEADING_EMBER),
      { textAnchor: "start", wedgePeakY: 120, wedgeStartX: 820, metaInWedge: true },
    )
    const paths = Array.from(root.querySelectorAll("path"))
    expect(paths[0]?.getAttribute("d")?.replace(/\s+/g, "")).toBe("M820,720L1280,120L1280,720Z")
    expect(paths[0]?.getAttribute("fill")).toBe(tokens.colors.primary)
    const headings = Array.from(root.querySelectorAll("text")).filter((t) => t.getAttribute("font-weight") === "700")
    expect(headings[0]?.getAttribute("x")).toBe("96")
    expect(headings[0]?.getAttribute("text-anchor") ?? "start").not.toBe("middle")
    const wedgeMeta = Array.from(root.querySelectorAll("text")).find((t) => t.getAttribute("x") === "1108")
    expect(wedgeMeta?.getAttribute("text-anchor")).toBe("end")
    expect(wedgeMeta?.getAttribute("y")).toBe("700")
  })

  it("does not draw HUD brackets", () => {
    const { root } = renderCover("arena", slide(HEADING_ARENA), { textAnchor: "middle", wedgePeakY: 340, wedgeStartX: 980 })
    expect(root.querySelectorAll("circle")).toHaveLength(0)
    const bracketish = Array.from(root.querySelectorAll("path")).filter((p) => (p.getAttribute("d") ?? "").includes("M12,"))
    expect(bracketish).toHaveLength(0)
  })
})

describe("cover-corner-wedge — shared pool", () => {
  it("is registered for cover only, as an archetype", () => {
    expect(layoutDef.id).toBe("corner-wedge")
    expect(layoutDef.kind).toBe("archetype")
    expect(layoutDef.slideTypes).toEqual(["cover"])
    expect(layoutDef.motifOverLayout).toBe(true)
  })

  it("every text run clears its contrast tier against the field it sits on", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, tokens } = renderCover(themeId, slide(HEADING_ARENA))
      const pageBg = resolveBackgroundHex(tokens.defaultBackgrounds.cover, tokens.colors.surface)
      for (const el of Array.from(root.querySelectorAll("text"))) {
        const onWedge = el.getAttribute("x") === "1108"
        const surface = onWedge ? tokens.colors.primary : pageBg
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
      expect(() => assertSubset(renderCover(themeId, slide(HEADING_ARENA)).root), themeId).not.toThrow()
    }
  })

  it("renders byte-identically on repeat", () => {
    const a = renderCover("arena", slide(HEADING_ARENA), { textAnchor: "middle", wedgePeakY: 340, wedgeStartX: 980 })
    const b = renderCover("arena", slide(HEADING_ARENA), { textAnchor: "middle", wedgePeakY: 340, wedgeStartX: 980 })
    expect(a.markup).toBe(b.markup)
  })

  it("CJK title has no letter-spacing", () => {
    const { root } = renderCover("arena", slide(HEADING_ARENA), { textAnchor: "middle", wedgePeakY: 340, wedgeStartX: 980 })
    for (const t of Array.from(root.querySelectorAll("text")).filter((el) => el.getAttribute("font-weight") === "700")) {
      expect(t.getAttribute("letter-spacing")).toBeNull()
    }
  })
})
