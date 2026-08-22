// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, readableOn, requiredContrastRatio } from "../ink"
import { AskEnding, layoutDef } from "./ending-ask-ending"
import type { PptxIR, Slide } from "@/ir"

const HEADING = "我们在募 **3000 万**，用来把数据源扩三倍。"
const SUBHEADING = "18 个月 · 覆盖六大类目 · 现金流转正"

function endingSlide(heading = HEADING, extras: Partial<Slide> = {}): Slide {
  return { type: "ending", heading, subheading: SUBHEADING, components: [], ...extras } as Slide
}

function ir(themeId: string, s: Slide): PptxIR {
  return {
    version: "4",
    filename: "ask-ending.pptx",
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
      <AskEnding ir={ir(themeId, s)} slide={s} index={0} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens }
}

describe("ending-ask-ending — board geometry", () => {
  it("places the ask heading left and a primary CTA block", () => {
    const { root, tokens } = renderEnding("ember")
    const headings = Array.from(root.querySelectorAll("text")).filter((t) => t.getAttribute("font-weight") === "700")
    expect(headings[0]?.getAttribute("x")).toBe("96")
    expect(headings[0]?.getAttribute("y")).toBe("270")
    expect(root.textContent).toContain("我们在募")
    expect(root.textContent).toContain("3000 万")
    const button = Array.from(root.querySelectorAll("rect")).find((el) => el.getAttribute("y") === "540")!
    expect(button.getAttribute("x")).toBe("96")
    expect(button.getAttribute("height")).toBe("60")
    expect(button.getAttribute("fill")).toBe(tokens.colors.primary)
    const cta = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "Let's talk")!
    expect(cta.getAttribute("text-anchor")).toBe("middle")
    expect(cta.getAttribute("fill")).toBe(readableOn(tokens.colors.primary))
  })

  it("tints **emphasis** and does not thank", () => {
    const { root, tokens } = renderEnding("ember")
    const tspans = Array.from(root.querySelectorAll("tspan"))
    expect(tspans.some((t) => t.textContent === "3000 万" && t.getAttribute("fill") === tokens.colors.accent)).toBe(
      true,
    )
    expect(root.textContent).not.toMatch(/Thank you/i)
    expect(root.textContent).not.toContain("谢谢")
  })

  it("uses tokens, not baked hex", () => {
    const { root, tokens } = renderEnding("consulting")
    const button = Array.from(root.querySelectorAll("rect")).find((el) => el.getAttribute("y") === "540")
    expect(button?.getAttribute("fill")).toBe(tokens.colors.primary)
    expect(root.innerHTML).not.toMatch(/#E56A2C/i)
    expect(root.innerHTML).not.toMatch(/#241B14/i)
  })

  it("falls back to an English ask, not a thank-you", () => {
    const { root } = renderEnding("ember", endingSlide("", { heading: undefined }))
    expect(root.textContent).toContain("We're raising.")
    expect(root.textContent).toContain("Let's talk")
  })
})

describe("ending-ask-ending — shared pool", () => {
  it("is pinOnly for ending", () => {
    expect(layoutDef.id).toBe("ask-ending")
    expect(layoutDef.kind).toBe("archetype")
    expect(layoutDef.pinOnly).toBe(true)
    expect(layoutDef.slideTypes).toEqual(["ending"])
  })

  it("every text run clears its contrast tier against the field it sits on", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, tokens } = renderEnding(themeId)
      const pageBg = resolveBackgroundHex(tokens.defaultBackgrounds.ending, tokens.colors.surface)
      const buttonFill =
        Array.from(root.querySelectorAll("rect")).find((el) => el.getAttribute("y") === "540")?.getAttribute("fill") ??
        tokens.colors.primary
      for (const el of Array.from(root.querySelectorAll("text"))) {
        const onButton = el.textContent === "Let's talk"
        const surface = onButton ? buttonFill : pageBg
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
      expect(() => assertSubset(renderEnding(themeId).root), themeId).not.toThrow()
    }
  })

  it("renders byte-identically on repeat", () => {
    expect(renderEnding("ember").markup).toBe(renderEnding("ember").markup)
  })

  it("CJK title has no letter-spacing", () => {
    const { root } = renderEnding("ember")
    for (const t of Array.from(root.querySelectorAll("text")).filter((el) => el.getAttribute("font-weight") === "700")) {
      if ((t.textContent ?? "").includes("Let's talk")) continue
      expect(t.getAttribute("letter-spacing")).toBeNull()
    }
  })
})
