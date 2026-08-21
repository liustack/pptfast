// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, requiredContrastRatio } from "../ink"
import { BoardHeadCover, layoutDef } from "./cover-board-head"
import type { PptxIR, Slide } from "@/ir"

const HEADING = "反向传播"
const SUBHEADING = "梯度是什么，从哪来，到哪去"

function slide(heading = HEADING, subheading: string | null = SUBHEADING): Slide {
  return { type: "cover", heading, subheading: subheading ?? undefined, components: [] } as Slide
}

function ir(themeId: string, meta: PptxIR["meta"] = {}): PptxIR {
  return {
    version: "4",
    filename: "board-head.pptx",
    theme: { id: themeId },
    meta,
    assets: { images: {} },
    slides: [slide()],
  } as unknown as PptxIR
}

const FULL_META: PptxIR["meta"] = {
  organization: "INTRO TO MACHINE LEARNING · LECTURE III",
  authors: [{ name: "chalk · board · dusk" }],
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
      <BoardHeadCover ir={ir(themeId, meta)} slide={s} index={0} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens }
}

describe("cover-board-head — board geometry", () => {
  it("places the kicker, light heading, chalk stroke, subtitle and italic byline", () => {
    const { root, tokens } = renderCover("lecture")
    const texts = Array.from(root.querySelectorAll("text"))
    const kicker = texts.find((t) => Number(t.getAttribute("y")) === 118)!
    expect(kicker.textContent).toBe(FULL_META.organization)
    expect(kicker.getAttribute("x")).toBe("110")

    const heading = texts.find((t) => t.textContent === HEADING)!
    expect(heading.getAttribute("x")).toBe("106")
    expect(heading.getAttribute("font-weight")).toBe("400")
    expect(heading.getAttribute("font-size")).toBe("126")

    const path = root.querySelector("path")!
    expect(path.getAttribute("stroke")).toBe(tokens.colors.accent)
    expect(path.getAttribute("fill")).toBe("none")
    expect(path.getAttribute("stroke-width")).toBe("5")

    const subtitle = texts.find((t) => t.textContent === SUBHEADING)!
    expect(subtitle.getAttribute("x")).toBe("106")

    const byline = texts.find((t) => t.getAttribute("font-style") === "italic")!
    expect(byline.getAttribute("text-anchor")).toBe("end")
    expect(byline.getAttribute("x")).toBe("1108")
    expect(byline.getAttribute("y")).toBe("688")
  })

  it("does not draw the chalk-tray frame — that belongs to the motif", () => {
    const { root } = renderCover("lecture")
    expect(root.querySelectorAll("rect")).toHaveLength(0)
  })
})

describe("cover-board-head — shared pool", () => {
  it("is registered for cover only, as an archetype", () => {
    expect(layoutDef.id).toBe("board-head")
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
    expect(renderCover("lecture").markup).toBe(renderCover("lecture").markup)
  })
})
