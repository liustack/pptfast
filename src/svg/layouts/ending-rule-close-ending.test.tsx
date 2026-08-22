// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, requiredContrastRatio } from "../ink"
import { RuleCloseEnding, layoutDef } from "./ending-rule-close-ending"
import type { PptxIR, Slide } from "@/ir"

const HEADING = "架构已经就位，下一步是把它扛过大促。"
const TECH_HEX = ["#0A0F1E", "#121A30", "#14294A", "#53E0D2", "#EAF1FA", "#93A5C0", "#24304A"]

function slide(heading = HEADING, extras: Partial<Slide> = {}): Slide {
  return { type: "ending", heading, components: [], ...extras } as Slide
}

function ir(themeId: string, s: Slide = slide(), meta: PptxIR["meta"] = {}): PptxIR {
  return {
    version: "4",
    filename: "rule-close-ending.pptx",
    theme: { id: themeId },
    meta,
    assets: { images: {} },
    slides: [s],
  } as unknown as PptxIR
}

const FULL_META: PptxIR["meta"] = {
  organization: "平台架构组",
  contact: { name: "RFC", email: "arch@example.com" },
}

function renderEnding(themeId: string, s: Slide = slide(), meta: PptxIR["meta"] = FULL_META) {
  const tokens = resolveStyle(themeId)
  const ctx = buildCtx(
    tokens,
    {},
    undefined,
    resolveBackgroundHex(tokens.defaultBackgrounds.ending, tokens.colors.surface),
  )
  const markup = renderSvgMarkup(
    <svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
      <RuleCloseEnding ir={ir(themeId, s, meta)} slide={s} index={0} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens }
}

function textPaint(el: Element): string {
  const fill = el.getAttribute("fill")
  if (fill && fill !== "none") return fill
  return el.getAttribute("stroke") ?? ""
}

describe("ending-rule-close-ending — board geometry", () => {
  it("places the closing sentence, full-width rule, accent start, and foot", () => {
    const { root, tokens } = renderEnding("tech")
    const title = Array.from(root.querySelectorAll("text")).find((t) => t.getAttribute("font-weight") === "700")
    expect(title?.getAttribute("x")).toBe("96")
    expect(title?.getAttribute("y")).toBe("300")
    expect(title?.getAttribute("font-size")).toBe("46")

    const lines = Array.from(root.querySelectorAll("line"))
    const border = lines.find((l) => l.getAttribute("stroke") === tokens.colors.border)
    const accent = lines.find((l) => l.getAttribute("stroke") === tokens.colors.accent)
    expect(border?.getAttribute("x1")).toBe("96")
    expect(border?.getAttribute("x2")).toBe("1184")
    expect(border?.getAttribute("y1")).toBe("480")
    expect(border?.getAttribute("stroke-width")).toBe("1.5")
    expect(accent?.getAttribute("x1")).toBe("96")
    expect(accent?.getAttribute("x2")).toBe("176")
    expect(accent?.getAttribute("stroke-width")).toBe("3")

    const foot = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("平台架构组"))
    expect(foot?.getAttribute("y")).toBe("580")
  })

  it("tints **emphasis** in accent and does not invent a thank-you", () => {
    const marked = slide("架构已经就位，下一步是把它**扛过大促**。")
    const { root, tokens, markup } = renderEnding("tech", marked)
    const tspans = Array.from(root.querySelectorAll("tspan"))
    expect(tspans.some((t) => t.textContent === "扛过大促" && t.getAttribute("fill") === tokens.colors.accent)).toBe(
      true,
    )
    expect(markup).not.toContain("Thank you")
    expect(markup).not.toContain("谢谢")
  })

  it("draws no floating dots", () => {
    const { root } = renderEnding("tech")
    expect(root.querySelectorAll("circle")).toHaveLength(0)
  })
})

describe("ending-rule-close-ending — shared pool", () => {
  it("is a pinOnly ending archetype named by composition, not theme", () => {
    expect(layoutDef.id).toBe("rule-close-ending")
    expect(layoutDef.kind).toBe("archetype")
    expect(layoutDef.pinOnly).toBe(true)
    expect(layoutDef.slideTypes).toEqual(["ending"])
  })

  it("every text run clears its contrast tier against the ending background", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, tokens } = renderEnding(themeId)
      const bg = resolveBackgroundHex(tokens.defaultBackgrounds.ending, tokens.colors.surface)
      for (const el of Array.from(root.querySelectorAll("text"))) {
        const paint = textPaint(el)
        if (!paint) continue
        const size = Number(el.getAttribute("font-size"))
        const required = el.getAttribute("data-contrast-tier") === "meta" ? 3 : requiredContrastRatio(size)
        expect(contrastRatio(paint, bg), `${themeId}: ${el.textContent}`).toBeGreaterThanOrEqual(required)
      }
    }
  })

  it("emits only export-safe primitives", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      expect(() => assertSubset(renderEnding(themeId).root), themeId).not.toThrow()
    }
  })

  it("renders byte-identically on repeat", () => {
    expect(renderEnding("tech").markup).toBe(renderEnding("tech").markup)
  })

  it("uses tokens, not baked tech hex, when another theme renders it", () => {
    const { markup, tokens } = renderEnding("consulting")
    expect(markup).toContain(tokens.colors.border)
    expect(markup).toContain(tokens.colors.accent)
    for (const hex of TECH_HEX) {
      expect(markup, `tech token ${hex} leaked`).not.toContain(hex)
    }
  })
})
