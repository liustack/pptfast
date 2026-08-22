// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, requiredContrastRatio } from "../ink"
import { CloseWordEnding, layoutDef } from "./ending-close-word-ending"
import type { PptxIR, Slide } from "@/ir"

const HEADING = "数字都在牌面上，下一季看兑现。"
const MARKED = "数字都在牌面上，下一季看**兑现**。"
const SUBHEADING = "附录与数据口径备查 · 经营分析部"

function ending(heading = HEADING, extras: Partial<Slide> = {}): Slide {
  return { type: "ending", heading, subheading: SUBHEADING, components: [], ...extras } as Slide
}

function ir(themeId: string, s: Slide = ending(), meta: PptxIR["meta"] = {}): PptxIR {
  return {
    version: "4",
    filename: "close-word.pptx",
    theme: { id: themeId },
    meta,
    assets: { images: {} },
    slides: [s],
  } as unknown as PptxIR
}

function renderEnding(themeId: string, s: Slide = ending(), meta: PptxIR["meta"] = {}) {
  const tokens = resolveStyle(themeId)
  const ctx = buildCtx(
    tokens,
    {},
    undefined,
    resolveBackgroundHex(tokens.defaultBackgrounds.ending, tokens.colors.surface),
  )
  const markup = renderSvgMarkup(
    <svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
      <CloseWordEnding ir={ir(themeId, s, meta)} slide={s} index={0} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens }
}

describe("ending-close-word-ending — board geometry", () => {
  it("places a left-aligned two-line close, not a thank-you poster", () => {
    const { root, tokens } = renderEnding("insight")
    const lines = Array.from(root.querySelectorAll("text")).filter((t) => {
      const s = t.textContent ?? ""
      return s.includes("数字") || s.includes("兑现") || s.includes("牌面")
    })
    expect(lines.length).toBe(2)
    expect(lines[0]?.getAttribute("x")).toBe("96")
    expect(lines[0]?.getAttribute("y")).toBe("320")
    expect(lines[1]?.getAttribute("y")).toBe("392")
    expect(lines[0]?.getAttribute("text-anchor")).not.toBe("middle")
    expect(Number(lines[0]?.getAttribute("font-size"))).toBe(44)
    expect(lines[0]?.getAttribute("fill")).toBe(tokens.colors.text)
    expect(root.innerHTML).not.toMatch(/Thank you/i)
    expect(root.innerHTML).not.toMatch(/Questions & Discussion/)
  })

  it("with **emphasis** tints only that word in accent, without it does not", () => {
    const marked = renderEnding("insight", ending(MARKED))
    const tspan = Array.from(marked.root.querySelectorAll("tspan")).find((el) => el.textContent === "兑现")
    expect(tspan).not.toBeUndefined()
    expect(tspan?.getAttribute("fill")).toBe(marked.tokens.colors.accent)

    const plain = renderEnding("insight", ending(HEADING))
    expect(plain.root.querySelector("tspan")).toBeNull()
    expect(plain.markup).not.toContain(`fill="${plain.tokens.colors.accent}"`)
  })

  it("does not draw the bottom ticker — that belongs to the motif", () => {
    const { root } = renderEnding("insight")
    expect(root.querySelectorAll("polyline")).toHaveLength(0)
    expect(root.querySelectorAll("line")).toHaveLength(0)
    expect(root.querySelectorAll("rect")).toHaveLength(0)
  })

  it("empty heading does not invent a thank-you line", () => {
    const { root } = renderEnding("insight", { type: "ending", heading: "", components: [] } as Slide)
    const texts = Array.from(root.querySelectorAll("text")).map((t) => t.textContent ?? "")
    expect(texts.join("")).not.toMatch(/Thank/i)
    expect(texts.join("")).not.toMatch(/致谢/)
  })
})

describe("ending-close-word-ending — shared pool", () => {
  it("is registered for ending only, as a pinOnly archetype", () => {
    expect(layoutDef.id).toBe("close-word-ending")
    expect(layoutDef.kind).toBe("archetype")
    expect(layoutDef.pinOnly).toBe(true)
    expect(layoutDef.slideTypes).toEqual(["ending"])
  })

  it("every text run clears its contrast tier against the ending background", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, tokens } = renderEnding(themeId)
      const bg = resolveBackgroundHex(tokens.defaultBackgrounds.ending, tokens.colors.surface)
      for (const el of Array.from(root.querySelectorAll("text"))) {
        const fill = el.getAttribute("fill")
        if (!fill) continue
        const size = Number(el.getAttribute("font-size"))
        const required = el.getAttribute("data-contrast-tier") === "meta" ? 3 : requiredContrastRatio(size)
        expect(contrastRatio(fill, bg), `${themeId}: ${el.textContent}`).toBeGreaterThanOrEqual(required)
      }
    }
  })

  it("emits only export-safe primitives", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      expect(() => assertSubset(renderEnding(themeId).root), themeId).not.toThrow()
    }
  })

  it("renders byte-identically on repeat", () => {
    expect(renderEnding("insight", ending(MARKED)).markup).toBe(renderEnding("insight", ending(MARKED)).markup)
  })

  it("CJK close has no letter-spacing", () => {
    const { root } = renderEnding("insight")
    for (const t of Array.from(root.querySelectorAll("text")).filter((el) => (el.textContent ?? "").includes("数字"))) {
      expect(t.getAttribute("letter-spacing")).toBeNull()
    }
  })

  it("consulting tokens do not leak insight hex", () => {
    const { markup } = renderEnding("consulting")
    for (const hex of ["#0F1216", "#171C22", "#16202B", "#F0A63C", "#F2EFE8", "#9AA7B4", "#2A3440"]) {
      expect(markup, `insight token ${hex} leaked`).not.toContain(hex)
    }
  })
})
