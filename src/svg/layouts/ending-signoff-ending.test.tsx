// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { blendOver, contrastRatio, readableOn, requiredContrastRatio } from "../ink"
import { SignoffEnding, layoutDef } from "./ending-signoff-ending"
import type { PptxIR, Slide } from "@/ir"

const HEADING = "三件事，下周一前回签"
const ITEMS = ["一、华东首批十家焕新排期确认", "二、自有品牌预算追加审批", "三、季度目标责任书签发"]

function slide(heading = HEADING, extras: Partial<Slide> = {}): Slide {
  return { type: "ending", heading, components: [], ...extras } as Slide
}

function ir(themeId: string, meta: PptxIR["meta"] = {}, s: Slide = slide()): PptxIR {
  return {
    version: "4",
    filename: "signoff-ending.pptx",
    theme: { id: themeId },
    meta,
    assets: { images: {} },
    slides: [s],
  } as unknown as PptxIR
}

const FULL_META: PptxIR["meta"] = {
  organization: "集团经营部",
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
      <SignoffEnding ir={ir(themeId, meta, s)} slide={s} index={0} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens }
}

describe("ending-signoff-ending — board geometry", () => {
  it("paints a full-bleed primary field and left-aligned action heading", () => {
    const { root, tokens } = renderEnding("enterprise")
    const field = root.querySelector("rect[width='1280']")
    expect(field?.getAttribute("fill")).toBe(tokens.colors.primary)
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("三件事"),
    )!
    expect(heading.getAttribute("x")).toBe("96")
    expect(heading.getAttribute("y")).toBe("300")
    expect(heading.getAttribute("font-weight")).toBe("700")
    expect(heading.getAttribute("fill")).toBe(readableOn(tokens.colors.primary))
  })

  it("with 3 bullet items draws the sign-off list at the board rows", () => {
    const withList = slide(HEADING, { components: [{ type: "bullets", items: ITEMS }] })
    const { root } = renderEnding("enterprise", withList)
    const texts = Array.from(root.querySelectorAll("text"))
    expect(texts.some((t) => t.textContent === ITEMS[0] && t.getAttribute("y") === "392")).toBe(true)
    expect(texts.some((t) => t.textContent === ITEMS[1] && t.getAttribute("y") === "436")).toBe(true)
    expect(texts.some((t) => t.textContent === ITEMS[2] && t.getAttribute("y") === "480")).toBe(true)
  })

  it("with components: [] draws no invented list and no thank-you", () => {
    const { root, markup } = renderEnding("enterprise", slide(HEADING, { components: [] }))
    expect(Array.from(root.querySelectorAll("text")).map((t) => t.textContent)).not.toContain("01")
    expect(markup).not.toContain("Thank you")
    expect(markup).not.toContain("谢谢")
    expect(markup).not.toContain("We appreciate")
  })

  it("empty heading does not fall back to a thank-you", () => {
    const { markup, root } = renderEnding("enterprise", slide("", { heading: "", components: [] }))
    expect(markup).not.toContain("Thank you")
    expect(markup).not.toContain("谢谢")
    const bars = Array.from(root.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("width") === "120" && r.getAttribute("height") === "8",
    )
    expect(bars).toHaveLength(1)
  })

  it("draws the closing bar and the colophon", () => {
    const { root } = renderEnding("enterprise")
    const bar = Array.from(root.querySelectorAll("rect")).find(
      (r) => r.getAttribute("width") === "120" && r.getAttribute("height") === "8",
    )
    expect(bar?.getAttribute("x")).toBe("96")
    expect(bar?.getAttribute("y")).toBe("580")
    const foot = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("集团经营部"),
    )
    expect(foot?.getAttribute("data-contrast-tier")).toBe("meta")
    expect(Number(foot?.getAttribute("y"))).toBe(650)
  })
})

describe("ending-signoff-ending — shared pool", () => {
  it("is registered as a pinOnly ending that paints its own background", () => {
    expect(layoutDef.id).toBe("signoff-ending")
    expect(layoutDef.kind).toBe("archetype")
    expect(layoutDef.pinOnly).toBe(true)
    expect(layoutDef.paintsOwnBackground).toBe(true)
    expect(layoutDef.branding).toBe("none")
    expect(layoutDef.slideTypes).toEqual(["ending"])
    expect(layoutDef.slots.find((s) => s.name === "body")?.accepts).toEqual(["bullets"])
  })

  it("every text run clears its contrast tier against the painted primary field", () => {
    const withList = slide(HEADING, { components: [{ type: "bullets", items: ITEMS }] })
    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, tokens } = renderEnding(themeId, withList)
      const field = tokens.colors.primary
      for (const el of Array.from(root.querySelectorAll("text"))) {
        const size = Number(el.getAttribute("font-size"))
        const fill = el.getAttribute("fill")!
        const opacity = Number(el.getAttribute("fill-opacity") ?? "1")
        const required = el.getAttribute("data-contrast-tier") === "meta" ? 3 : requiredContrastRatio(size)
        const painted = opacity < 1 ? blendOver(fill, field, opacity) : fill
        expect(contrastRatio(painted, field), `${themeId}: ${el.textContent}`).toBeGreaterThanOrEqual(required)
      }
    }
  })

  it("uses tokens, not a baked enterprise hex, when another theme borrows it", () => {
    const { markup, tokens } = renderEnding("tech")
    expect(markup).toContain(tokens.colors.primary)
    expect(markup).not.toContain("#0032A0")
    expect(markup).not.toContain("#2F6FBF")
    expect(markup).not.toContain("#F7F7F4")
  })

  it("emits only export-safe primitives", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      expect(() => assertSubset(renderEnding(themeId).root), themeId).not.toThrow()
    }
  })

  it("renders byte-identically on repeat", () => {
    expect(renderEnding("enterprise").markup).toBe(renderEnding("enterprise").markup)
  })

  it("CJK title has no letter-spacing", () => {
    const { root } = renderEnding("enterprise")
    const heading = Array.from(root.querySelectorAll("text")).find((t) =>
      (t.textContent ?? "").includes("三件事"),
    )!
    expect(heading.getAttribute("letter-spacing")).toBeNull()
  })
})
