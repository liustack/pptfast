// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, requiredContrastRatio } from "../ink"
import { InstitutionalBlockCover, layoutDef } from "./cover-institutional-block"
import type { PptxIR, Slide } from "@/ir"

const HEADING = "季度机构评审"

function slide(heading = HEADING, subheading?: string): Slide {
  return { type: "cover", heading, subheading, components: [] } as Slide
}

function ir(themeId: string, meta: PptxIR["meta"] = {}): PptxIR {
  return {
    version: "4",
    filename: "institutional-block.pptx",
    theme: { id: themeId },
    meta,
    assets: { images: {} },
    slides: [slide()],
  } as unknown as PptxIR
}

const FULL_META: PptxIR["meta"] = {
  organization: "CloudSeek Institutional Review",
  date: "2026-08-22",
  confidentiality: "internal",
  version: "v1",
  authors: [{ name: "战略与运营部", role: "GRID 12" }],
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
      <InstitutionalBlockCover ir={ir(themeId, meta)} slide={s} index={0} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens }
}

describe("cover-institutional-block — board geometry", () => {
  it("places the kicker, giant heading, accent signature block and right byline", () => {
    const { root, tokens } = renderCover("swiss")
    const sign = root.querySelector("rect")!
    expect([sign.getAttribute("x"), sign.getAttribute("y"), sign.getAttribute("width"), sign.getAttribute("height")]).toEqual([
      "84",
      "604",
      "150",
      "14",
    ])
    expect(sign.getAttribute("fill")).toBe(tokens.colors.accent)

    const texts = Array.from(root.querySelectorAll("text"))
    const kicker = texts.find((t) => Number(t.getAttribute("y")) === 96)!
    expect(kicker.textContent).toBe("CLOUDSEEK INSTITUTIONAL REVIEW")
    expect(kicker.getAttribute("x")).toBe("84")
    expect(kicker.getAttribute("font-weight")).toBe("700")

    const headings = texts.filter((t) => t.getAttribute("font-weight") === "700" && t.getAttribute("x") === "76")
    expect(headings.length).toBeGreaterThan(0)
    expect(headings[0]!.getAttribute("font-size")).toBe("172")
    expect(headings.map((t) => t.textContent).join("")).toBe(HEADING)
  })

  it("does not paint a full-height grid line through the body", () => {
    const { root } = renderCover("swiss")
    const vertical = Array.from(root.querySelectorAll("line")).filter((l) => l.getAttribute("x1") === l.getAttribute("x2"))
    expect(vertical).toHaveLength(0)
  })
})

describe("cover-institutional-block — shared pool", () => {
  it("is registered for cover only, as an archetype", () => {
    expect(layoutDef.id).toBe("institutional-block")
    expect(layoutDef.kind).toBe("archetype")
    expect(layoutDef.slideTypes).toEqual(["cover"])
    for (const s of layoutDef.slots) expect(s.accepts).toEqual([])
  })

  it("bakes no hex: the signature block fill is the theme's accent on every theme", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, tokens } = renderCover(themeId)
      expect(root.querySelector("rect")!.getAttribute("fill"), themeId).toBe(tokens.colors.accent)
    }
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
    expect(renderCover("swiss").markup).toBe(renderCover("swiss").markup)
  })
})
