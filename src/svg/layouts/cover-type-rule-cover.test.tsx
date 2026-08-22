// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, requiredContrastRatio } from "../ink"
import { TypeRuleCover, layoutDef } from "./cover-type-rule-cover"
import type { PptxIR, Slide } from "@/ir"

const HEADING = "推荐引擎 3.0"
const SUBHEADING = "从热度榜到实时个性化的架构演进"
const TECH_HEX = ["#0A0F1E", "#121A30", "#14294A", "#53E0D2", "#EAF1FA", "#93A5C0", "#24304A"]

function slide(heading = HEADING, extras: Partial<Slide> = {}): Slide {
  return { type: "cover", heading, subheading: SUBHEADING, components: [], ...extras } as Slide
}

function ir(themeId: string, meta: PptxIR["meta"] = {}, s: Slide = slide()): PptxIR {
  return {
    version: "4",
    filename: "type-rule-cover.pptx",
    theme: { id: themeId },
    meta,
    assets: { images: {} },
    slides: [s],
  } as unknown as PptxIR
}

const FULL_META: PptxIR["meta"] = {
  organization: "白帆科技 · 技术白皮书",
  authors: [{ name: "平台架构组", role: "架构" }],
  version: "v3.0",
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
      <TypeRuleCover ir={ir(themeId, meta, s)} slide={s} index={0} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens }
}

function textPaint(el: Element): string {
  const fill = el.getAttribute("fill")
  if (fill && fill !== "none") return fill
  return el.getAttribute("stroke") ?? ""
}

describe("cover-type-rule-cover — board geometry", () => {
  it("places kicker, title, subtitle, short border rule, and foot on the board coordinates", () => {
    const { root, tokens } = renderCover("tech")
    const texts = Array.from(root.querySelectorAll("text"))
    const kicker = texts.find((t) => (t.textContent ?? "").includes("白帆科技"))
    expect(kicker?.getAttribute("x")).toBe("96")
    expect(kicker?.getAttribute("y")).toBe("150")
    expect(kicker?.getAttribute("fill")).toBe(tokens.colors.muted)

    const title = texts.find((t) => t.getAttribute("font-weight") === "700")
    expect(title?.getAttribute("x")).toBe("96")
    expect(title?.getAttribute("y")).toBe("348")
    expect(Number(title?.getAttribute("font-size"))).toBe(62)
    expect(title?.textContent).toContain("推荐引擎")

    const sub = texts.find((t) => (t.textContent ?? "").includes("热度榜"))
    expect(sub?.getAttribute("y")).toBe("428")

    const rule = root.querySelector("line")
    expect(rule?.getAttribute("x1")).toBe("96")
    expect(rule?.getAttribute("x2")).toBe("380")
    expect(rule?.getAttribute("y1")).toBe("486")
    expect(rule?.getAttribute("stroke")).toBe(tokens.colors.border)
    expect(rule?.getAttribute("stroke-width")).toBe("1.5")

    const foot = texts.find((t) => (t.textContent ?? "").includes("平台架构组"))
    expect(foot?.getAttribute("y")).toBe("662")
  })

  it("draws no constellation nodes, orbits, or star-chain", () => {
    const { root } = renderCover("tech")
    expect(root.querySelectorAll("circle")).toHaveLength(0)
    expect(root.querySelectorAll("polyline")).toHaveLength(0)
    expect(root.querySelectorAll("polygon")).toHaveLength(0)
  })
})

describe("cover-type-rule-cover — emphasis", () => {
  it("with **emphasis** in the subtitle tints only that run in accent", () => {
    const marked = slide(HEADING, { subheading: "从热度榜到**实时个性化**的架构演进" })
    const { root, tokens } = renderCover("tech", marked)
    const tspans = Array.from(root.querySelectorAll("tspan"))
    expect(tspans.some((t) => t.textContent === "实时个性化" && t.getAttribute("fill") === tokens.colors.accent)).toBe(
      true,
    )
  })

  it("without **emphasis** does not paint accent on text runs", () => {
    const { root, tokens } = renderCover("tech")
    const fills = Array.from(root.querySelectorAll("text, tspan")).map((el) => el.getAttribute("fill"))
    expect(fills).not.toContain(tokens.colors.accent)
  })
})

describe("cover-type-rule-cover — shared pool", () => {
  it("is a pinOnly cover archetype named by composition, not theme", () => {
    expect(layoutDef.id).toBe("type-rule-cover")
    expect(layoutDef.kind).toBe("archetype")
    expect(layoutDef.pinOnly).toBe(true)
    expect(layoutDef.slideTypes).toEqual(["cover"])
  })

  it("every text run clears its contrast tier against the cover background", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, tokens } = renderCover(themeId)
      const bg = resolveBackgroundHex(tokens.defaultBackgrounds.cover, tokens.colors.surface)
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
      expect(() => assertSubset(renderCover(themeId).root), themeId).not.toThrow()
    }
  })

  it("renders byte-identically on repeat", () => {
    expect(renderCover("tech").markup).toBe(renderCover("tech").markup)
  })

  it("CJK title has no letter-spacing", () => {
    const { root } = renderCover("tech")
    for (const t of Array.from(root.querySelectorAll("text")).filter((el) => el.getAttribute("font-weight") === "700")) {
      expect(t.getAttribute("letter-spacing")).toBeNull()
    }
  })

  it("uses tokens, not baked tech hex, when another theme renders it", () => {
    const { markup, tokens } = renderCover("consulting")
    expect(markup).toContain(tokens.colors.text)
    expect(markup).toContain(tokens.colors.border)
    for (const hex of TECH_HEX) {
      expect(markup, `tech token ${hex} leaked`).not.toContain(hex)
    }
  })
})
