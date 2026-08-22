// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, metaInk, readableOn, requiredContrastRatio } from "../ink"
import { IkbFieldCover, layoutDef } from "./cover-ikb-field-cover"
import type { PptxIR, Slide } from "@/ir"

const HEADING = "二〇二六年第二季度业务评审"
const SUBHEADING = "连锁零售业务的增长质量与下半年投入方向"

function slide(heading = HEADING, extras: Partial<Slide> = {}): Slide {
  return { type: "cover", heading, subheading: SUBHEADING, components: [], ...extras } as Slide
}

function ir(themeId: string, meta: PptxIR["meta"] = {}, s: Slide = slide()): PptxIR {
  return {
    version: "4",
    filename: "ikb-field-cover.pptx",
    theme: { id: themeId },
    meta,
    assets: { images: {} },
    slides: [s],
  } as unknown as PptxIR
}

const FULL_META: PptxIR["meta"] = {
  organization: "星桥零售集团 · 集团经营部",
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
      <IkbFieldCover ir={ir(themeId, meta, s)} slide={s} index={0} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens }
}

describe("cover-ikb-field-cover — board geometry", () => {
  it("paints a full-bleed primary field and left-aligned inverted title at the board coordinates", () => {
    const { root, tokens } = renderCover("enterprise")
    const field = root.querySelector("rect[width='1280']")
    expect(field?.getAttribute("fill")).toBe(tokens.colors.primary)
    expect(field?.getAttribute("height")).toBe("720")
    const headings = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-weight") === "700" && t.getAttribute("x") === "96",
    )
    expect(headings[0]?.getAttribute("y")).toBe("348")
    expect(Number(headings[0]?.getAttribute("font-size"))).toBeGreaterThanOrEqual(50)
    expect(headings[0]?.getAttribute("text-anchor")).not.toBe("middle")
    expect(headings.map((t) => t.textContent).join("")).toContain("二〇二六年")
    expect(headings[0]?.getAttribute("fill")).toBe(readableOn(tokens.colors.primary))
  })

  it("draws the title-closing bar under the last heading line in inverted ink", () => {
    const { root, tokens } = renderCover("enterprise")
    const headings = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-weight") === "700" && t.getAttribute("x") === "96",
    )
    const lastY = Number(headings[headings.length - 1]?.getAttribute("y"))
    const bar = Array.from(root.querySelectorAll("rect")).find(
      (r) => r.getAttribute("width") === "120" && r.getAttribute("height") === "8",
    )
    expect(bar).toBeTruthy()
    expect(bar?.getAttribute("x")).toBe("96")
    expect(Number(bar?.getAttribute("y"))).toBe(lastY + 56)
    expect(bar?.getAttribute("fill")).toBe(readableOn(tokens.colors.primary))
  })

  it("places the organization kicker at the board coordinate without CJK tracking", () => {
    const { root } = renderCover("enterprise")
    const kicker = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("星桥零售集团"),
    )
    expect(kicker?.getAttribute("x")).toBe("96")
    expect(kicker?.getAttribute("y")).toBe("132")
    expect(kicker?.getAttribute("letter-spacing")).toBeNull()
    expect(kicker?.getAttribute("data-contrast-tier")).toBe("meta")
  })

  it("does not invent cover copy when heading is empty, and skips the rule", () => {
    const { root, markup } = renderCover("enterprise", slide("", { heading: "", subheading: "" }))
    expect(markup).not.toContain("Thank you")
    expect(markup).not.toContain("谢谢")
    const bars = Array.from(root.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("width") === "120" && r.getAttribute("height") === "8",
    )
    expect(bars).toHaveLength(0)
  })
})

describe("cover-ikb-field-cover — shared pool", () => {
  it("is registered as a pinOnly cover that paints its own background", () => {
    expect(layoutDef.id).toBe("ikb-field-cover")
    expect(layoutDef.kind).toBe("archetype")
    expect(layoutDef.pinOnly).toBe(true)
    expect(layoutDef.paintsOwnBackground).toBe(true)
    expect(layoutDef.branding).toBe("none")
    expect(layoutDef.slideTypes).toEqual(["cover"])
  })

  it("every text run clears its contrast tier against the painted primary field", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, tokens } = renderCover(themeId)
      const field = tokens.colors.primary
      for (const el of Array.from(root.querySelectorAll("text"))) {
        const size = Number(el.getAttribute("font-size"))
        const fill = el.getAttribute("fill")!
        const required = el.getAttribute("data-contrast-tier") === "meta" ? 3 : requiredContrastRatio(size)
        expect(contrastRatio(fill, field), `${themeId}: ${el.textContent}`).toBeGreaterThanOrEqual(required)
      }
    }
  })

  it("uses tokens, not a baked enterprise hex, when another theme borrows it", () => {
    const { markup, tokens } = renderCover("tech")
    expect(markup).toContain(tokens.colors.primary)
    expect(markup).not.toContain("#0032A0")
    expect(markup).not.toContain("#2F6FBF")
    expect(markup).not.toContain("#F7F7F4")
  })

  it("emits only export-safe primitives", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      expect(() => assertSubset(renderCover(themeId).root), themeId).not.toThrow()
    }
  })

  it("renders byte-identically on repeat", () => {
    expect(renderCover("enterprise").markup).toBe(renderCover("enterprise").markup)
  })

  it("CJK title has no letter-spacing", () => {
    const { root } = renderCover("enterprise")
    for (const t of Array.from(root.querySelectorAll("text")).filter(
      (el) => el.getAttribute("font-weight") === "700",
    )) {
      expect(t.getAttribute("letter-spacing")).toBeNull()
    }
  })

  it("kicker meta ink follows metaInk against the field", () => {
    const { root, tokens } = renderCover("enterprise")
    const kicker = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("星桥"),
    )!
    expect(kicker.getAttribute("fill")).toBe(metaInk(tokens.colors.muted, tokens.colors.primary))
  })
})
