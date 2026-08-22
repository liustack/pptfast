// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, readableOn, requiredContrastRatio } from "../ink"
import { PillCtaEnding, layoutDef } from "./ending-pill-cta-ending"
import type { PptxIR, Slide } from "@/ir"

const HEADING = "九月一日，全渠道开闸"
const SUBHEADING = "各渠道负责人本周五前交排期表"
const CTA = "进战役群对齐"

function endingSlide(extras: Partial<Slide> = {}): Slide {
  return {
    type: "ending",
    heading: HEADING,
    subheading: SUBHEADING,
    components: [{ type: "bullets", items: [CTA] }],
    ...extras,
  } as Slide
}

function ir(themeId: string, s: Slide): PptxIR {
  return {
    version: "4",
    filename: "pill-cta-ending.pptx",
    theme: { id: themeId },
    meta: {},
    assets: { images: {} },
    slides: [s],
  } as unknown as PptxIR
}

function renderEnding(themeId: string, s: Slide = endingSlide()) {
  const tokens = resolveStyle(themeId)
  const ctx = buildCtx(
    tokens,
    {},
    undefined,
    resolveBackgroundHex(tokens.defaultBackgrounds.ending, tokens.colors.surface),
  )
  const markup = renderSvgMarkup(
    <svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
      <PillCtaEnding ir={ir(themeId, s)} slide={s} index={0} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens, ctx }
}

describe("layoutDef", () => {
  it("declares pinOnly pill-cta-ending on ending, branding none", () => {
    expect(layoutDef.id).toBe("pill-cta-ending")
    expect(layoutDef.kind).toBe("archetype")
    expect(layoutDef.pinOnly).toBe(true)
    expect(layoutDef.branding).toBe("none")
    expect(layoutDef.slideTypes).toEqual(["ending"])
    expect(layoutDef.slots.map((s) => s.name)).toEqual(["heading", "subheading", "body"])
  })
})

describe("ending-pill-cta-ending — board geometry", () => {
  it("centers the date sentence and the supporting line", () => {
    const { root } = renderEnding("campaign")
    const heading = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === HEADING)!
    expect(heading.getAttribute("x")).toBe("640")
    expect(heading.getAttribute("y")).toBe("300")
    expect(heading.getAttribute("text-anchor")).toBe("middle")
    expect(heading.getAttribute("font-weight")).toBe("700")
    const sub = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === SUBHEADING)!
    expect(sub.getAttribute("x")).toBe("640")
    expect(sub.getAttribute("y")).toBe("368")
    expect(sub.getAttribute("text-anchor")).toBe("middle")
  })

  it("draws an accent capsule whose radius follows shape.radius, CTA from the first bullet", () => {
    const { root, tokens } = renderEnding("campaign")
    const pill = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("height") === "62")!
    expect(pill.getAttribute("fill")).toBe(tokens.colors.accent)
    expect(Number(pill.getAttribute("rx"))).toBe(Math.min(31, tokens.shape?.radius ?? 31))
    expect(Number(pill.getAttribute("x")) + Number(pill.getAttribute("width")) / 2).toBe(640)
    const cta = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === CTA)!
    expect(cta.getAttribute("x")).toBe("640")
    expect(cta.getAttribute("text-anchor")).toBe("middle")
    expect(cta.getAttribute("fill")).toBe(readableOn(tokens.colors.accent))
    expect(cta.getAttribute("font-weight")).toBe("700")
  })

  it("empty components draw no pill and invent no thank-you", () => {
    const { root, markup } = renderEnding("campaign", endingSlide({ components: [] }))
    expect(root.querySelectorAll("rect")).toHaveLength(0)
    expect(markup).not.toContain("Thank you")
    expect(markup).not.toContain("谢谢")
    expect(markup).toContain(HEADING)
  })

  it("does not thank the audience", () => {
    const { markup } = renderEnding("campaign")
    expect(markup).not.toContain("Thank you")
    expect(markup).not.toContain("We appreciate")
  })
})

describe("ending-pill-cta-ending — shared pool", () => {
  it("every text run clears its contrast tier against the surface it sits on", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, tokens } = renderEnding(themeId)
      const pageBg = resolveBackgroundHex(tokens.defaultBackgrounds.ending, tokens.colors.surface)
      const pill = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("height") === "62")
      const pillTop = pill ? Number(pill.getAttribute("y")) : -1
      const pillBottom = pill ? pillTop + Number(pill.getAttribute("height")) : -1
      for (const el of Array.from(root.querySelectorAll("text"))) {
        const size = Number(el.getAttribute("font-size"))
        const y = Number(el.getAttribute("y"))
        const bg = y >= pillTop && y <= pillBottom ? tokens.colors.accent : pageBg
        expect(contrastRatio(el.getAttribute("fill")!, bg), `${themeId}: ${el.textContent}`).toBeGreaterThanOrEqual(
          requiredContrastRatio(size),
        )
      }
    }
  })

  it("emits only export-safe primitives and no baked campaign hex under another theme", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, markup } = renderEnding(themeId)
      expect(() => assertSubset(root), themeId).not.toThrow()
      if (themeId !== "campaign") {
        expect(markup, themeId).not.toContain("#E84F8A")
        expect(markup, themeId).not.toContain("#2A1E3F")
      }
    }
  })

  it("renders byte-identically on repeat", () => {
    expect(renderEnding("campaign").markup).toBe(renderEnding("campaign").markup)
  })
})
