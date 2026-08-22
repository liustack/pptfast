// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, requiredContrastRatio } from "../ink"
import type { StyleTokens } from "../../themes/tokens"
import { BandTitleCover, layoutDef } from "./cover-band-title"
import type { PptxIR, Slide } from "@/ir"

const HEADING = "岭原智能 2026 年第二季度业务评审"
const SUBHEADING = "设备预测性维护业务的增长质量与下半年投入方向"

function slide(heading = HEADING): Slide {
  return { type: "cover", heading, subheading: SUBHEADING, components: [] } as Slide
}

function ir(themeId: string, meta: PptxIR["meta"] = {}): PptxIR {
  return {
    version: "4",
    filename: "band-title.pptx",
    theme: { id: themeId },
    chrome: "full",
    meta,
    assets: { images: {} },
    slides: [slide()],
  } as unknown as PptxIR
}

const FULL_META: PptxIR["meta"] = {
  organization: "岭原智能 · 战略与运营部",
  authors: [{ name: "陈砚清", role: "首席技术官" }],
  date: "2026 年 7 月",
  confidentiality: "internal",
}

function renderCover(
  themeId: string,
  s: Slide = slide(),
  meta: PptxIR["meta"] = FULL_META,
  cover?: StyleTokens["shape"] extends infer S ? (S extends { cover?: infer C } ? C : never) : never,
) {
  const tokens = resolveStyle(themeId)
  const shaped: StyleTokens = { ...tokens, shape: { ...tokens.shape, cover: { ...tokens.shape?.cover, ...cover } } }
  const ctx = buildCtx(
    shaped,
    {},
    undefined,
    resolveBackgroundHex(tokens.defaultBackgrounds.cover, tokens.colors.surface),
  )
  const markup = renderSvgMarkup(
    <svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
      <BandTitleCover ir={ir(themeId, meta)} slide={s} index={0} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens }
}

function bandRect(root: Element) {
  return Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("width") === "1280")!
}

describe("cover-band-title — board geometry", () => {
  it("classroom: left title, band at 260/200, accent wave, no punch holes", () => {
    const { root, tokens } = renderCover("classroom", slide(), FULL_META, {
      textAnchor: "start",
      bandY: 260,
      bandH: 200,
      bandWave: true,
    })
    const band = bandRect(root)
    expect([band.getAttribute("x"), band.getAttribute("y"), band.getAttribute("width"), band.getAttribute("height")]).toEqual([
      "0",
      "260",
      "1280",
      "200",
    ])
    expect(band.getAttribute("fill")).toBe(tokens.colors.primary)
    const headings = Array.from(root.querySelectorAll("text")).filter((t) => t.getAttribute("font-weight") === "700")
    expect(headings[0]?.getAttribute("x")).toBe("96")
    expect(headings[0]?.getAttribute("text-anchor") ?? "start").not.toBe("middle")
    const wave = root.querySelector("path")!
    expect(wave.getAttribute("stroke")).toBe(tokens.colors.accent)
    expect(wave.getAttribute("d")).toContain("M96,502")
    expect(root.querySelectorAll("circle")).toHaveLength(0)
  })

  it("enterprise: on-band-ink mark on the band, not a baked hex", () => {
    const { root, tokens } = renderCover("enterprise", slide(), FULL_META, {
      textAnchor: "start",
      bandY: 256,
      bandH: 220,
      bandMark: true,
    })
    const band = bandRect(root)
    expect(band.getAttribute("y")).toBe("256")
    expect(band.getAttribute("height")).toBe("220")
    const mark = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("width") === "26")!
    expect(mark.getAttribute("x")).toBe("1180")
    expect(mark.getAttribute("y")).toBe("282")
    const heading = Array.from(root.querySelectorAll("text")).find((t) => t.getAttribute("font-weight") === "700")!
    expect(mark.getAttribute("fill")).toBe(heading.getAttribute("fill"))
    expect(mark.getAttribute("fill")).not.toBe(tokens.colors.accent)
    expect(mark.getAttribute("fill")).not.toBe("#E85D1F")
  })

  it("band mark uses the same on-band ink as the heading, never the accent token", () => {
    const { root, tokens } = renderCover("enterprise", slide(), FULL_META, {
      textAnchor: "start",
      bandY: 256,
      bandH: 220,
      bandMark: true,
    })
    const heading = Array.from(root.querySelectorAll("text")).find((t) => t.getAttribute("font-weight") === "700")!
    const mark = Array.from(root.querySelectorAll("rect")).find((r) => r.getAttribute("width") === "26")!
    expect(mark.getAttribute("fill")).toBe(heading.getAttribute("fill"))
    expect(mark.getAttribute("fill")).not.toBe(tokens.colors.accent)
  })

  it("vermilion: centered title on the band", () => {
    const { root } = renderCover("vermilion", slide(), FULL_META, {
      textAnchor: "middle",
      bandY: 272,
      bandH: 196,
    })
    const band = bandRect(root)
    expect(band.getAttribute("y")).toBe("272")
    expect(band.getAttribute("height")).toBe("196")
    const headings = Array.from(root.querySelectorAll("text")).filter((t) => t.getAttribute("font-weight") === "700")
    expect(headings[0]?.getAttribute("x")).toBe("640")
    expect(headings[0]?.getAttribute("text-anchor")).toBe("middle")
  })

  it("parameter changes move the band", () => {
    const { root } = renderCover("consulting", slide(), FULL_META, { bandY: 100, bandH: 80 })
    const band = bandRect(root)
    expect(band.getAttribute("y")).toBe("100")
    expect(band.getAttribute("height")).toBe("80")
  })
})

describe("cover-band-title — shared pool", () => {
  it("is registered for cover only, as an archetype", () => {
    expect(layoutDef.id).toBe("band-title")
    expect(layoutDef.kind).toBe("archetype")
    expect(layoutDef.slideTypes).toEqual(["cover"])
  })

  it("every text run clears its contrast tier against the field it sits on", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, tokens } = renderCover(themeId)
      const pageBg = resolveBackgroundHex(tokens.defaultBackgrounds.cover, tokens.colors.surface)
      const band = bandRect(root)
      const bandY = Number(band.getAttribute("y"))
      const bandH = Number(band.getAttribute("height"))
      for (const el of Array.from(root.querySelectorAll("text"))) {
        const y = Number(el.getAttribute("y"))
        const surface = y >= bandY && y <= bandY + bandH ? tokens.colors.primary : pageBg
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
      expect(() => assertSubset(renderCover(themeId).root), themeId).not.toThrow()
    }
  })

  it("renders byte-identically on repeat", () => {
    expect(renderCover("classroom").markup).toBe(renderCover("classroom").markup)
  })

  it("CJK title has no letter-spacing", () => {
    const { root } = renderCover("classroom", slide(), FULL_META, { textAnchor: "start", bandY: 260, bandH: 200 })
    for (const t of Array.from(root.querySelectorAll("text")).filter((el) => el.getAttribute("font-weight") === "700")) {
      expect(t.getAttribute("letter-spacing")).toBeNull()
    }
  })
})
