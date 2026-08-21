// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, requiredContrastRatio } from "../ink"
import { HorizonWedgeCover, layoutDef } from "./cover-horizon-wedge"
import type { PptxIR, Slide } from "@/ir"

const HEADING = "岭原智能 2026 年第二季度业务评审"
const SUBHEADING = "设备预测性维护业务的增长质量与下半年投入方向"

function slide(heading = HEADING): Slide {
  return { type: "cover", heading, subheading: SUBHEADING, components: [] } as Slide
}

function ir(themeId: string, meta: PptxIR["meta"] = {}): PptxIR {
  return {
    version: "4",
    filename: "horizon-wedge.pptx",
    theme: { id: themeId },
    meta,
    assets: { images: {} },
    slides: [slide()],
  } as unknown as PptxIR
}

const FULL_META: PptxIR["meta"] = {
  organization: "岭原智能 · 战略与运营部",
  authors: [{ name: "陈砚清", role: "首席技术官" }],
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
      <HorizonWedgeCover ir={ir(themeId, meta)} slide={s} index={0} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens }
}

describe("cover-horizon-wedge — board geometry", () => {
  it("wedge path matches the board, polyline sits on the wedge, title sits above the left ramp", () => {
    const { root, tokens } = renderCover("pulse")
    const wedge = root.querySelector("path")!
    expect(wedge.getAttribute("d")?.replace(/\s+/g, "")).toBe("M0,720L0,600L1280,440L1280,720Z")
    expect(wedge.getAttribute("fill")).toBe(tokens.colors.primary)
    const poly = root.querySelector("polyline")!
    expect(poly.getAttribute("points")).toBe("120,668 400,632 520,618 552,586 584,650 616,610 1160,542")
    expect(poly.getAttribute("stroke-width")).toBe("1.5")
    const headings = Array.from(root.querySelectorAll("text")).filter((t) => t.getAttribute("font-weight") === "700")
    expect(headings[0]?.getAttribute("x")).toBe("96")
    expect(Number(headings[0]?.getAttribute("y"))).toBeLessThan(600)
    expect(root.querySelectorAll("circle")).toHaveLength(0)
  })
})

describe("cover-horizon-wedge — shared pool", () => {
  it("is registered for cover only, as an archetype", () => {
    expect(layoutDef.id).toBe("horizon-wedge")
    expect(layoutDef.kind).toBe("archetype")
    expect(layoutDef.slideTypes).toEqual(["cover"])
  })

  it("every text run clears its contrast tier against the field it sits on", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      const { root, tokens } = renderCover(themeId)
      const pageBg = resolveBackgroundHex(tokens.defaultBackgrounds.cover, tokens.colors.surface)
      for (const el of Array.from(root.querySelectorAll("text"))) {
        const onWedge = el.getAttribute("text-anchor") === "end" && el.getAttribute("y") === "700"
        const surface = onWedge ? tokens.colors.primary : pageBg
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
    expect(renderCover("pulse").markup).toBe(renderCover("pulse").markup)
  })

  it("CJK title has no letter-spacing", () => {
    const { root } = renderCover("pulse")
    for (const t of Array.from(root.querySelectorAll("text")).filter((el) => el.getAttribute("font-weight") === "700")) {
      expect(t.getAttribute("letter-spacing")).toBeNull()
    }
  })
})
