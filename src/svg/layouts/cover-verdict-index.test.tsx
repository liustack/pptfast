// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx, resolveBackgroundHex } from "../full-slide-svg"
import { resolveStyle, CANONICAL_THEME_IDS } from "../../themes"
import { contrastRatio, requiredContrastRatio } from "../ink"
import { VerdictIndexCover, layoutDef } from "./cover-verdict-index"
import type { StyleTokens } from "../../themes/tokens"
import type { PptxIR, Slide } from "@/ir"

const HEADING = "工作区订阅增长优质，下半年应加倍投入交付侧"
const SUBHEADING = "云觅科技 2026 年第二季度业务评审 · 三个论据支撑，附敏感性分析"
const ITEMS = ["续约率 96%，增长来自存量客户加购", "交付排期已到 11 月，产能是唯一瓶颈", "竞对交付口碑走弱，窗口期约两个季度"]

function slide(heading = HEADING, extras: Partial<Slide> = {}): Slide {
  return { type: "cover", heading, subheading: SUBHEADING, components: [], ...extras } as Slide
}

function ir(themeId: string, meta: PptxIR["meta"] = {}, s: Slide = slide()): PptxIR {
  return {
    version: "4",
    filename: "verdict-index.pptx",
    theme: { id: themeId },
    meta,
    assets: { images: {} },
    slides: [s],
  } as unknown as PptxIR
}

const FULL_META: PptxIR["meta"] = {
  organization: "云觅科技 · 战略与运营部",
  authors: [{ name: "陈砚清", role: "首席技术官" }],
  version: "v1.0",
}

function renderCover(
  themeId: string,
  s: Slide = slide(),
  meta: PptxIR["meta"] = FULL_META,
  tokens: StyleTokens = resolveStyle(themeId),
) {
  const ctx = buildCtx(
    tokens,
    {},
    undefined,
    resolveBackgroundHex(tokens.defaultBackgrounds.cover, tokens.colors.surface),
  )
  const markup = renderSvgMarkup(
    <svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
      <VerdictIndexCover ir={ir(themeId, meta, s)} slide={s} index={0} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup), tokens }
}

function withoutVerdictKnobs(themeId: string): StyleTokens {
  const tokens = resolveStyle(themeId)
  return { ...tokens, shape: { ...tokens.shape, cover: undefined } }
}

describe("cover-verdict-index — board geometry", () => {
  it("omitted knobs keep the restore-wave-1 coordinates", () => {
    const { root, tokens } = renderCover("consulting", slide(), FULL_META, withoutVerdictKnobs("consulting"))
    const headings = Array.from(root.querySelectorAll("text")).filter((t) => t.getAttribute("font-weight") === "700" && t.getAttribute("x") === "96")
    expect(headings[0]?.getAttribute("y")).toBe("316")
    expect(Number(headings[0]?.getAttribute("font-size"))).toBeGreaterThanOrEqual(50)
    expect(headings.map((t) => t.textContent).join("")).toContain("工作区订阅")
    const fills = new Set(Array.from(root.querySelectorAll("[fill]")).map((el) => el.getAttribute("fill")))
    expect(fills.has(tokens.colors.primary) || [...fills].some((f) => f === tokens.colors.text || f === tokens.colors.muted)).toBe(true)
    expect(root.innerHTML).not.toMatch(/#F5C518/i)
  })

  it("consulting knobs move the cluster onto the wave8 board", () => {
    const { root } = renderCover("consulting")
    const kicker = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("云觅科技"))
    expect(kicker?.getAttribute("y")).toBe("150")
    const headings = Array.from(root.querySelectorAll("text")).filter((t) => t.getAttribute("font-weight") === "700" && t.getAttribute("x") === "96")
    expect(headings[0]?.getAttribute("y")).toBe("304")
    expect(Number(headings[0]?.getAttribute("font-size"))).toBe(60)
    const foot = Array.from(root.querySelectorAll("text")).find((t) => (t.textContent ?? "").includes("陈砚清"))
    expect(foot?.getAttribute("y")).toBe("676")
    const rule = Array.from(root.querySelectorAll("line")).find((l) => l.getAttribute("y1") === "640")
    expect(rule).toBeTruthy()
    expect(rule?.getAttribute("x1")).toBe("96")
    expect(rule?.getAttribute("x2")).toBe("1184")
  })

  it("does not invent numbered columns when components are empty", () => {
    const { root } = renderCover("consulting")
    const texts = Array.from(root.querySelectorAll("text")).map((t) => t.textContent)
    expect(texts).not.toContain("01")
    expect(texts).not.toContain("02")
    expect(texts).not.toContain("03")
  })

  it("draws no punch-hole / ruler / gold-rule motif pieces", () => {
    const { root } = renderCover("consulting")
    expect(root.querySelectorAll("circle")).toHaveLength(0)
    expect(root.querySelectorAll("polygon")).toHaveLength(0)
  })
})

describe("cover-verdict-index — emphasis and bullets", () => {
  it("with **emphasis** draws an accent rect, without it does not", () => {
    const marked = slide("下半年应加倍投入**交付侧**")
    const { root, tokens } = renderCover("consulting", marked)
    const rects = Array.from(root.querySelectorAll("rect"))
    expect(rects.length).toBeGreaterThan(0)
    expect(rects[0]?.getAttribute("fill")).toBe(tokens.colors.accent)

    const plain = renderCover("consulting", slide(HEADING))
    expect(Array.from(plain.root.querySelectorAll("rect"))).toHaveLength(0)
  })

  it("with 3 bullet items draws 01/02/03 at the default columns", () => {
    const withBullets = slide(HEADING, { components: [{ type: "bullets", items: ITEMS }] })
    const { root } = renderCover("consulting", withBullets, FULL_META, withoutVerdictKnobs("consulting"))
    const texts = Array.from(root.querySelectorAll("text"))
    expect(texts.some((t) => t.textContent === "01" && t.getAttribute("x") === "96" && t.getAttribute("y") === "556")).toBe(true)
    expect(texts.some((t) => t.textContent === "02" && t.getAttribute("x") === "470")).toBe(true)
    expect(texts.some((t) => t.textContent === "03" && t.getAttribute("x") === "844")).toBe(true)
    expect(root.querySelectorAll("line").length).toBeGreaterThanOrEqual(2)
  })

  it("consulting knobs drop the column rules and sit the numbers on the wave8 row", () => {
    const withBullets = slide(HEADING, { components: [{ type: "bullets", items: ITEMS }] })
    const { root } = renderCover("consulting", withBullets)
    const texts = Array.from(root.querySelectorAll("text"))
    expect(texts.some((t) => t.textContent === "01" && t.getAttribute("x") === "96" && t.getAttribute("y") === "560")).toBe(true)
    expect(texts.some((t) => t.textContent === "02" && t.getAttribute("x") === "470" && t.getAttribute("y") === "560")).toBe(true)
    const bodies = texts.filter((t) => ITEMS.some((item) => (t.textContent ?? "").includes(item.slice(0, 4))))
    expect(bodies.some((t) => t.getAttribute("y") === "592")).toBe(true)
    const vertical = Array.from(root.querySelectorAll("line")).filter((l) => l.getAttribute("x1") === l.getAttribute("x2"))
    expect(vertical).toHaveLength(0)
  })

  it("with components: [] draws no numbered columns", () => {
    const { root } = renderCover("consulting", slide(HEADING, { components: [] }), FULL_META, withoutVerdictKnobs("consulting"))
    expect(Array.from(root.querySelectorAll("text")).map((t) => t.textContent)).not.toContain("01")
    expect(root.querySelectorAll("line")).toHaveLength(0)
  })
})

describe("cover-verdict-index — shared pool", () => {
  it("is registered for cover only, as an archetype", () => {
    expect(layoutDef.id).toBe("verdict-index")
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
        expect(contrastRatio(el.getAttribute("fill")!, bg), `${themeId}: ${el.textContent}`).toBeGreaterThanOrEqual(required)
      }
    }
  })

  it("emits only export-safe primitives", () => {
    for (const themeId of CANONICAL_THEME_IDS) {
      expect(() => assertSubset(renderCover(themeId).root), themeId).not.toThrow()
    }
  })

  it("renders byte-identically on repeat", () => {
    expect(renderCover("consulting").markup).toBe(renderCover("consulting").markup)
  })

  it("CJK title has no letter-spacing", () => {
    const { root } = renderCover("consulting")
    for (const t of Array.from(root.querySelectorAll("text")).filter((el) => el.getAttribute("font-weight") === "700" && (el.textContent ?? "").includes("预测"))) {
      expect(t.getAttribute("letter-spacing")).toBeNull()
    }
  })
})
