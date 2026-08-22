// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, requiredContrastRatio } from "../ink"
import { MemoHeadCover, layoutDef } from "./cover-memo-head"
import { underlineYFromBaseline } from "./underline"
import type { PptxIR, Slide } from "@/ir"

const HEADING = "关于下半年交付侧投入的决定"
const SUBHEADING = "This is a decision, not a discussion."

function slide(heading = HEADING, subheading: string | null = SUBHEADING): Slide {
  return { type: "cover", heading, subheading: subheading ?? undefined, components: [] } as Slide
}

function ir(themeId: string, meta: PptxIR["meta"] = {}): PptxIR {
  return {
    version: "4",
    filename: "memo-head.pptx",
    theme: { id: themeId },
    meta,
    assets: { images: {} },
    slides: [slide()],
  } as unknown as PptxIR
}

const FULL_META: PptxIR["meta"] = {
  organization: "STRATEGY & OPERATIONS",
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
      <MemoHeadCover ir={ir(themeId, meta)} slide={s} index={0} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens }
}

describe("cover-memo-head — board geometry", () => {
  it("draws the MEMORANDUM eyebrow, accent double rules, heading, last-run underline and FROM/RE", () => {
    const { root, tokens } = renderCover("memo")
    const texts = Array.from(root.querySelectorAll("text"))
    const eyebrow = texts.find((t) => t.textContent === "MEMORANDUM")!
    expect(eyebrow.getAttribute("x")).toBe("100")
    expect(eyebrow.getAttribute("y")).toBe("104")
    expect(eyebrow.getAttribute("font-size")).toBe("22")
    expect(eyebrow.getAttribute("fill")).toBe(tokens.colors.accent)

    const lines = Array.from(root.querySelectorAll("line"))
    const thick = lines.find((l) => l.getAttribute("stroke-width") === "3")!
    const thin = lines.find((l) => l.getAttribute("stroke-width") === "1")!
    expect(thick.getAttribute("y1")).toBe("150")
    expect(thin.getAttribute("y1")).toBe("156")
    expect(thick.getAttribute("stroke")).toBe(tokens.colors.accent)

    const from = texts.find((t) => t.textContent?.startsWith("FROM:"))!
    const re = texts.find((t) => t.textContent?.startsWith("RE:"))!
    expect(from.textContent).toContain("STRATEGY & OPERATIONS")
    expect(re.textContent).toContain(SUBHEADING)

    const underline = lines.find((l) => l.getAttribute("stroke-width") === "6")!
    expect(underline.getAttribute("stroke")).toBe(tokens.colors.accent)
    expect(Number(underline.getAttribute("x2"))).toBeGreaterThan(Number(underline.getAttribute("x1")))
  })

  it("sits the last-run underline below glyph ink at descent+air, not a flat 8px gap", () => {
    const { root } = renderCover("memo")
    const headings = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("x") === "96" && t.getAttribute("font-weight") === "400",
    )
    const last = headings[headings.length - 1]!
    const baseline = Number(last.getAttribute("y"))
    const fontSize = Number(last.getAttribute("font-size"))
    const underline = Array.from(root.querySelectorAll("line")).find((l) => l.getAttribute("stroke-width") === "6")!
    expect(Number(underline.getAttribute("y1"))).toBe(
      underlineYFromBaseline(baseline, fontSize, last.textContent ?? ""),
    )
    expect(Number(underline.getAttribute("y1")) - baseline).toBeGreaterThan(8)
  })

  it("underlines the last two CJK characters of a one-word heading", () => {
    const { root } = renderCover("memo", slide("投入的决定", null), {})
    const underline = Array.from(root.querySelectorAll("line")).find((l) => l.getAttribute("stroke-width") === "6")!
    expect(Number(underline.getAttribute("x2")) - Number(underline.getAttribute("x1"))).toBeGreaterThan(0)
  })

  it("paints no accent fill — red stays a line and a letter", () => {
    const { root, tokens } = renderCover("memo")
    for (const rect of Array.from(root.querySelectorAll("rect"))) {
      expect(rect.getAttribute("fill")).not.toBe(tokens.colors.accent)
    }
  })
})

describe("cover-memo-head — shared pool", () => {
  it("is registered for cover only, as an archetype", () => {
    expect(layoutDef.id).toBe("memo-head")
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
    expect(renderCover("memo").markup).toBe(renderCover("memo").markup)
  })
})
