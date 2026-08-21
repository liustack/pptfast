// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, requiredContrastRatio } from "../ink"
import { BillHeadCover, layoutDef } from "./cover-bill-head"
import type { PptxIR, Slide } from "@/ir"

const HEADING = "开演前十分钟"
const VENUE = "RIVERSIDE WAREHOUSE"

function slide(heading = HEADING, subheading: string | null = VENUE): Slide {
  return { type: "cover", heading, subheading: subheading ?? undefined, components: [] } as Slide
}

function ir(themeId: string, meta: PptxIR["meta"] = {}): PptxIR {
  return {
    version: "4",
    filename: "bill-head.pptx",
    theme: { id: themeId },
    meta,
    assets: { images: {} },
    slides: [slide()],
  } as unknown as PptxIR
}

const FULL_META: PptxIR["meta"] = {
  organization: "城市青年戏剧节 · 主单元",
  date: "9.20—28",
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
      <BillHeadCover ir={ir(themeId, meta)} slide={s} index={0} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens }
}

describe("cover-bill-head — board geometry", () => {
  it("places the bleed heading, thick baseline and split footer, and does not draw a date chip", () => {
    const { root, tokens } = renderCover("playbill")
    const headings = Array.from(root.querySelectorAll("text")).filter((t) => t.getAttribute("x") === "56" && t.getAttribute("font-weight") === "700")
    expect(headings.map((t) => t.textContent).join("")).toContain("开演前")
    expect(Number(headings[0]!.getAttribute("font-size"))).toBeGreaterThanOrEqual(180)

    const rule = root.querySelector("rect")!
    expect([rule.getAttribute("x"), rule.getAttribute("y"), rule.getAttribute("width"), rule.getAttribute("height")]).toEqual([
      "56",
      "610",
      "1168",
      "5",
    ])
    expect(rule.getAttribute("fill")).toBe(tokens.colors.primary)

    const texts = Array.from(root.querySelectorAll("text"))
    expect(texts.some((t) => t.textContent === FULL_META.organization)).toBe(true)
    expect(texts.some((t) => t.textContent === VENUE)).toBe(true)
    expect(texts.some((t) => t.textContent === FULL_META.date)).toBe(false)
    expect(root.querySelectorAll("polygon")).toHaveLength(0)
  })

  it("keeps the thick rule above the fifth band", () => {
    const { root } = renderCover("playbill")
    const rule = root.querySelector("rect")!
    expect(Number(rule.getAttribute("y")) + Number(rule.getAttribute("height"))).toBeLessThanOrEqual(620)
  })
})

describe("cover-bill-head — shared pool", () => {
  it("is registered for cover only, as an archetype", () => {
    expect(layoutDef.id).toBe("bill-head")
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
        expect(contrastRatio(el.getAttribute("fill")!, bg), `${themeId}: ${el.textContent}`).toBeGreaterThanOrEqual(
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
    expect(renderCover("playbill").markup).toBe(renderCover("playbill").markup)
  })
})
