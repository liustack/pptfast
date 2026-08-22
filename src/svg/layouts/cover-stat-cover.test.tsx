// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, requiredContrastRatio } from "../ink"
import { StatCover, layoutDef } from "./cover-stat-cover"
import type { PptxIR, Slide } from "@/ir"

const HEADING = "+34%"
const SUBHEADING = "增长的质量，比增长本身更值得看"
const SENTENCE_HEADING = "续约率回到九成一"

function slide(heading = HEADING, extras: Partial<Slide> = {}): Slide {
  return { type: "cover", heading, subheading: SUBHEADING, components: [], ...extras } as Slide
}

function ir(themeId: string, meta: PptxIR["meta"] = {}, s: Slide = slide()): PptxIR {
  return {
    version: "4",
    filename: "stat-cover.pptx",
    theme: { id: themeId },
    meta,
    assets: { images: {} },
    slides: [s],
  } as unknown as PptxIR
}

const FULL_META: PptxIR["meta"] = {
  organization: "云觅科技",
  date: "2026 Q2",
  authors: [{ name: "经营分析部", role: "评审" }],
  version: "v1.0",
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
      <StatCover ir={ir(themeId, meta, s)} slide={s} index={0} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens }
}

describe("cover-stat-cover — board geometry", () => {
  it("places a left-aligned giant heading at the board coordinates and uses tokens, not hex", () => {
    const { root, tokens } = renderCover("insight")
    const heading = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("+34%"))!
    expect(heading.getAttribute("x")).toBe("96")
    expect(heading.getAttribute("y")).toBe("392")
    expect(heading.getAttribute("text-anchor")).not.toBe("middle")
    expect(Number(heading.getAttribute("font-size"))).toBe(200)
    expect(heading.getAttribute("fill")).toBe(tokens.colors.accent)
    expect(root.innerHTML).not.toMatch(/text-anchor="middle"/)
  })

  it("draws the serif conclusion from subheading, not a second invented stat", () => {
    const { root, tokens } = renderCover("insight")
    const conclusion = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("增长的质量"),
    )!
    expect(conclusion.getAttribute("x")).toBe("96")
    expect(conclusion.getAttribute("y")).toBe("470")
    expect(conclusion.getAttribute("fill")).toBe(tokens.colors.text)
    expect(Array.from(root.querySelectorAll("text")).map((t) => t.textContent).join("")).not.toContain("Thank")
  })

  it("does not invent +34% when the heading is a sentence", () => {
    const { root } = renderCover("insight", slide(SENTENCE_HEADING))
    const texts = Array.from(root.querySelectorAll("text")).map((t) => t.textContent ?? "")
    expect(texts.some((t) => t.includes("续约率回到九成一"))).toBe(true)
    expect(texts.join("")).not.toContain("+34%")
  })

  it("draws no ticker polyline or isolated ticks — those belong to the motif", () => {
    const { root } = renderCover("insight")
    expect(root.querySelectorAll("polyline")).toHaveLength(0)
    expect(root.querySelectorAll("line")).toHaveLength(0)
    expect(root.querySelectorAll("circle")).toHaveLength(0)
  })
})

describe("cover-stat-cover — shared pool", () => {
  it("is registered for cover only, as a pinOnly archetype", () => {
    expect(layoutDef.id).toBe("stat-cover")
    expect(layoutDef.kind).toBe("archetype")
    expect(layoutDef.pinOnly).toBe(true)
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
    expect(renderCover("insight").markup).toBe(renderCover("insight").markup)
  })

  it("CJK title has no letter-spacing", () => {
    const { root } = renderCover("insight", slide(SENTENCE_HEADING))
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("续约率"),
    )!
    expect(heading.getAttribute("letter-spacing")).toBeNull()
  })

  it("consulting tokens do not leak insight hex", () => {
    const { markup } = renderCover("consulting")
    for (const hex of ["#0F1216", "#171C22", "#16202B", "#F0A63C", "#F2EFE8", "#9AA7B4", "#2A3440"]) {
      expect(markup, `insight token ${hex} leaked`).not.toContain(hex)
    }
  })
})
