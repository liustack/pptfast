// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, requiredContrastRatio } from "../ink"
import { ActionPadEnding, layoutDef } from "./ending-action-pad-ending"
import type { PptxIR, Slide } from "@/ir"

const ITEMS = ["九月三城再开十家小店型", "十月上线加盟督导系统", "年底跑通县域直配"]
const CTA = "本周定人定责"

function slide(extras: Partial<Slide> = {}): Slide {
  return { type: "ending", heading: ITEMS.join("\n"), subheading: CTA, components: [], ...extras } as Slide
}

function ir(themeId: string, s: Slide, meta: PptxIR["meta"] = {}): PptxIR {
  return {
    version: "4",
    filename: "action-pad-ending.pptx",
    theme: { id: themeId },
    meta,
    assets: { images: {} },
    slides: [s],
  } as unknown as PptxIR
}

const FULL_META: PptxIR["meta"] = {
  organization: "霁川咨询",
  authors: [{ name: "零售消费组" }],
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
      <ActionPadEnding ir={ir(themeId, s, meta)} slide={s} index={0} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens }
}

describe("ending-action-pad-ending — board geometry", () => {
  it("draws NEXT, three actions, an accent pad CTA, and a foot rule", () => {
    const { root, tokens } = renderEnding("consulting")
    const kicker = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "NEXT")
    expect(kicker?.getAttribute("y")).toBe("150")
    expect(kicker?.getAttribute("letter-spacing")).toBe("8")

    const actions = Array.from(root.querySelectorAll("text")).filter((t) => t.getAttribute("font-weight") === "700" && t.getAttribute("x") === "96")
    expect(actions.map((t) => t.getAttribute("y"))).toEqual(["256", "344", "432"])
    expect(actions.map((t) => t.textContent).join("")).toContain("九月三城")

    const pad = root.querySelector("rect")
    expect(pad?.getAttribute("x")).toBe("96")
    expect(pad?.getAttribute("y")).toBe("500")
    expect(pad?.getAttribute("height")).toBe("56")
    expect(Number(pad?.getAttribute("width"))).toBeGreaterThanOrEqual(240)
    expect(pad?.getAttribute("fill")).toBe(tokens.colors.accent)
    expect(Array.from(root.querySelectorAll("text")).some((t) => t.textContent === CTA)).toBe(true)

    const rule = Array.from(root.querySelectorAll("line")).find((l) => l.getAttribute("y1") === "640")
    expect(rule?.getAttribute("x1")).toBe("96")
    expect(rule?.getAttribute("x2")).toBe("1184")
    expect(rule?.getAttribute("stroke")).toBe(tokens.colors.border)

    const foot = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("霁川咨询"))
    expect(foot?.getAttribute("y")).toBe("676")
  })

  it("does not thank the reader", () => {
    const { root } = renderEnding("consulting", { type: "ending", components: [] } as Slide, {})
    const texts = Array.from(root.querySelectorAll("text")).map((t) => t.textContent ?? "").join(" ")
    expect(texts).not.toMatch(/Thank you/i)
    expect(texts).not.toMatch(/appreciate/i)
    expect(texts).not.toMatch(/谢谢/)
    expect(texts).not.toContain("Contact")
  })

  it("reads bullets as the list and heading as the CTA", () => {
    const withBullets = slide({
      heading: CTA,
      subheading: "ignored as list",
      components: [{ type: "bullets", items: ITEMS }],
    })
    const { root } = renderEnding("consulting", withBullets)
    const texts = Array.from(root.querySelectorAll("text")).map((t) => t.textContent ?? "")
    expect(texts).toContain(ITEMS[0])
    expect(texts).toContain(CTA)
    expect(texts).not.toContain("ignored as list")
  })

  it("uses tokens, not baked consulting hex, when another theme draws it", () => {
    const { root, tokens } = renderEnding("enterprise")
    expect(root.querySelector("rect")?.getAttribute("fill")).toBe(tokens.colors.accent)
    expect(root.innerHTML).not.toMatch(/#F5C518/i)
    expect(root.innerHTML).not.toMatch(/#1E2A4A/i)
  })
})

describe("ending-action-pad-ending — shared pool", () => {
  it("is a pinOnly ending archetype with a bullets body slot", () => {
    expect(layoutDef.id).toBe("action-pad-ending")
    expect(layoutDef.kind).toBe("archetype")
    expect(layoutDef.pinOnly).toBe(true)
    expect(layoutDef.slideTypes).toEqual(["ending"])
    const body = layoutDef.slots.find((slot) => slot.name === "body")
    expect(body?.accepts).toEqual(["bullets"])
  })

  it("every text run clears its contrast tier against the ending background", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, tokens } = renderEnding(themeId)
      const bg = resolveBackgroundHex(tokens.defaultBackgrounds.ending, tokens.colors.surface)
      for (const el of Array.from(root.querySelectorAll("text"))) {
        const size = Number(el.getAttribute("font-size"))
        const required = el.getAttribute("data-contrast-tier") === "meta" ? 3 : requiredContrastRatio(size)
        const fill = el.getAttribute("fill")!
        const overPad = el.closest("svg") && el.previousElementSibling?.tagName.toLowerCase() === "rect"
        const ground = overPad ? (el.previousElementSibling?.getAttribute("fill") ?? bg) : bg
        // CTA sits on the accent pad. Sample the pad fill when this run is the CTA.
        const isCta = el.getAttribute("text-anchor") === "middle"
        const against = isCta ? tokens.colors.accent : ground
        expect(contrastRatio(fill, against), `${themeId}: ${el.textContent}`).toBeGreaterThanOrEqual(required)
      }
    }
  })

  it("emits only export-safe primitives", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      expect(() => assertSubset(renderEnding(themeId).root), themeId).not.toThrow()
    }
  })

  it("renders byte-identically on repeat", () => {
    expect(renderEnding("consulting").markup).toBe(renderEnding("consulting").markup)
  })
})
