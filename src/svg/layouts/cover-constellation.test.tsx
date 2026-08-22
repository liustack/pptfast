// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { ConstellationCover } from "./cover-constellation"
import type { PptxIR, Slide } from "@/ir"
import type { StyleTokens } from "../../themes/tokens"

function tokensWithoutCover(themeId: string): StyleTokens {
  const tokens = resolveStyle(themeId)
  if (!tokens.shape?.cover) return tokens
  const { cover: _omit, ...shape } = tokens.shape
  return { ...tokens, shape }
}

const slide: Slide = {
  type: "cover",
  heading: "数据驱动的增长引擎",
  subheading: "面向 2027 的技术路线图",
  components: [],
} as Slide
const ir = (theme: string): PptxIR =>
  ({
    version: "3",
    filename: "x.pptx",
    theme: { id: theme },
    branding: "full",
    meta: { organization: "测试实验室", date: "2026-07" },
    assets: { images: {} },
    slides: [slide],
  }) as unknown as PptxIR

// A minimal, subheading-less cover — matches the fixture
// templates/tech.test.tsx's Decor describe block used for the motif's own
// structural/logo-clearance checks (a subheading would add an accent bar
// <rect>, which the motif-shape assertions below don't want to see).
const minimalSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide

// Captured once from the (now-retired) legacy `BentoTechCover` — locks the
// byte-identical output the port preserved, without importing templates/.
const COVER_TECH_MARKUP =
  '<text x="96" y="120" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="22" fill="#93A5C0" letter-spacing="4" dominant-baseline="alphabetic">测试实验室</text><rect x="96" y="548" width="84" height="4" fill="#53E0D2"></rect><text x="96" y="596" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="30" fill="#93A5C0" dominant-baseline="alphabetic">面向 2027 的技术路线图</text><text x="96" y="520" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="88" font-weight="700" fill="#EAF1FA" dominant-baseline="alphabetic">数据驱动的增长引擎</text><text x="96" y="660" font-family="Microsoft YaHei, PingFang SC, Helvetica Neue, sans-serif" font-size="20" fill="#93A5C0" dominant-baseline="alphabetic">2026-07</text><polyline points="700,300 800,218 902,296 940,150 1030,110 1004,368 1100,170 1148,430 1180,128" fill="none" stroke="#53E0D2" stroke-width="1" stroke-opacity="0.25"></polyline><circle cx="700" cy="300" r="2" fill="#53E0D2"></circle><circle cx="800" cy="218" r="3" fill="#53E0D2"></circle><circle cx="902" cy="296" r="2.5" fill="#53E0D2"></circle><circle cx="940" cy="150" r="2.5" fill="#53E0D2"></circle><circle cx="1030" cy="110" r="4" fill="#53E0D2"></circle><circle cx="1004" cy="368" r="3.5" fill="#53E0D2"></circle><circle cx="1100" cy="170" r="3" fill="#53E0D2"></circle><circle cx="1148" cy="430" r="2.5" fill="#53E0D2"></circle><circle cx="1180" cy="128" r="5" fill="#53E0D2"></circle><circle cx="1180" cy="128" r="9" fill="none" stroke="#53E0D2" stroke-opacity="0.18" stroke-width="1"></circle><circle cx="1180" cy="128" r="13" fill="none" stroke="#53E0D2" stroke-opacity="0.07" stroke-width="1"></circle><circle cx="1180" cy="128" r="23" fill="none" stroke="#53E0D2" stroke-opacity="0.1" stroke-width="1"></circle><circle cx="1180" cy="128" r="35" fill="none" stroke="#53E0D2" stroke-opacity="0.05" stroke-width="1"></circle>'

// Branding's brand logo bands (branding.tsx logoBox: image at
// width=96 height=40, positioned tl/tr/bl/br) — same constants
// templates/tech.test.tsx used to verify the constellation motif never
// collides with the corner logos.
const TL_LOGO = { x: 64, y: 48, w: 96, h: 40 }
const TR_LOGO = { x: 1120, y: 48, w: 96, h: 40 }
const BL_LOGO = { x: 64, y: 630, w: 96, h: 40 }
const BR_LOGO = { x: 1120, y: 630, w: 96, h: 40 }
const LOGO_BANDS = [TL_LOGO, TR_LOGO, BL_LOGO, BR_LOGO]

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  )
}

describe("ConstellationCover", () => {
  it("tech tokens 下与旧 BentoTechCover 输出逐字节一致（档位一）", () => {
    const ctx = buildCtx(tokensWithoutCover("tech"), {})
    const next = renderSvgMarkup(<ConstellationCover ir={ir("tech")} slide={slide} index={0} ctx={ctx} />)
    expect(next).toBe(COVER_TECH_MARKUP)
  })

  it("consulting tokens 下用 consulting 的色（证明 token 化成立，无 baked hex）", () => {
    const ctx = buildCtx(resolveStyle("consulting"), {})
    const out = renderSvgMarkup(<ConstellationCover ir={ir("consulting")} slide={slide} index={0} ctx={ctx} />)
    expect(out).toContain("#F5C518") // consulting accent
    expect(out).not.toContain("#53E0D2") // tech accent 不得残留
  })

  it("renders markup that passes assertSubset (no forbidden elements)", () => {
    const ctx = buildCtx(tokensWithoutCover("tech"), {})
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg">
        <ConstellationCover ir={ir("tech")} slide={slide} index={0} ctx={ctx} />
      </svg>,
    )
    expect(markup).not.toContain("foreignObject")
    const root = parseSvgRoot(markup)
    expect(() => assertSubset(root)).not.toThrow()
  })

  it("signature motif is a 9-node constellation (varying radii) with a glow on the largest node — no 2x2 corner badge", () => {
    const ctx = buildCtx(tokensWithoutCover("tech"), {})
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        <ConstellationCover ir={ir("tech")} slide={minimalSlide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    expect(root.querySelectorAll("polyline")).toHaveLength(1)

    // 9 solid dots (fill=accent) + 4 glow rings (fill=none, stroke=accent)
    // around the largest node only — no corner-badge rects at all.
    expect(root.querySelectorAll("rect")).toHaveLength(0)
    const allCircles = Array.from(root.querySelectorAll("circle"))
    expect(allCircles).toHaveLength(13)
    const dots = allCircles.filter((c) => c.getAttribute("fill") === ctx.colors.accent)
    const rings = allCircles.filter((c) => c.getAttribute("fill") === "none")
    expect(dots).toHaveLength(9)
    expect(rings).toHaveLength(4)
    // Varying radii in point order (940,150)-(1030,110)-(1100,170)-(1180,128).
    expect(dots.map((c) => Number(c.getAttribute("r")))).toEqual([2, 3, 2.5, 2.5, 4, 3.5, 3, 2.5, 5])
    // Glow rings: r+4/r+8/r+18/r+30 off the largest node's own r=5 — the
    // same "base radius +4/+8" formula the bento KPI card's glow uses (dot
    // r=3 -> 7/11), one shared glow language.
    expect(rings.map((c) => Number(c.getAttribute("r"))).sort((a, b) => a - b)).toEqual([9, 13, 23, 35])
    for (const ring of rings) {
      expect(ring.getAttribute("stroke")).toBe(ctx.colors.accent)
    }
    const heroDot = dots.find((d) => d.getAttribute("r") === "5")!
    for (const ring of rings) {
      expect(ring.getAttribute("cx")).toBe(heroDot.getAttribute("cx"))
      expect(ring.getAttribute("cy")).toBe(heroDot.getAttribute("cy"))
    }
  })

  it("the motif (including its largest node's glow) sits clear of all four Branding logo bands", () => {
    const ctx = buildCtx(tokensWithoutCover("tech"), {})
    const markup = renderSvgMarkup(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        <ConstellationCover ir={ir("tech")} slide={minimalSlide} index={0} ctx={ctx} />
      </svg>,
    )
    const root = parseSvgRoot(markup)
    const circles = Array.from(root.querySelectorAll("circle"))
    expect(circles).toHaveLength(13)
    for (const c of circles) {
      const r = Number(c.getAttribute("r"))
      const box = {
        x: Number(c.getAttribute("cx")) - r,
        y: Number(c.getAttribute("cy")) - r,
        w: r * 2,
        h: r * 2,
      }
      for (const band of LOGO_BANDS) {
        expect(rectsOverlap(box, band)).toBe(false)
      }
    }
  })
})

function renderConstellation(
  themeId: string,
  cover?: NonNullable<StyleTokens["shape"]>["cover"],
  s: Slide = slide,
) {
  const tokens = resolveStyle(themeId)
  const shaped: StyleTokens = { ...tokens, shape: { ...tokens.shape, cover: { ...tokens.shape?.cover, ...cover } } }
  const ctx = buildCtx(shaped, {})
  const markup = renderSvgMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <ConstellationCover ir={ir(themeId)} slide={s} index={0} ctx={ctx} />
    </svg>,
  )
  return { root: parseSvgRoot(markup), tokens, markup }
}

describe("ConstellationCover — cover knobs (board-cover-restore wave 2)", () => {
  it("default keeps last line on y520 and the 84×4 bar plus 9-point", () => {
    const { root } = renderConstellation("consulting")
    const title = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "数据驱动的增长引擎")!
    expect(title.getAttribute("y")).toBe("520")
    const rule = Array.from(root.querySelectorAll("rect")).find(
      (r) => r.getAttribute("width") === "84" && r.getAttribute("height") === "4",
    )
    expect(rule).toBeTruthy()
    const dots = Array.from(root.querySelectorAll("circle")).filter((c) => c.getAttribute("fill") !== "none")
    expect(dots).toHaveLength(9)
  })

  it("tech knobs: last line not 520, no 84×4 bar, four-dot chain present, 9-point still present", () => {
    const { root } = renderConstellation("tech", { titleBottomAnchor: false, ruleStyle: "star-chain" })
    const title = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === "数据驱动的增长引擎")!
    expect(title.getAttribute("y")).not.toBe("520")
    expect(Number(title.getAttribute("y"))).toBeGreaterThanOrEqual(340)
    expect(Number(title.getAttribute("y"))).toBeLessThanOrEqual(380)
    const bar = Array.from(root.querySelectorAll("rect")).find(
      (r) => r.getAttribute("width") === "84" && r.getAttribute("height") === "4",
    )
    expect(bar).toBeUndefined()
    const polylines = Array.from(root.querySelectorAll("polyline"))
    expect(polylines.some((p) => (p.getAttribute("points") ?? "").startsWith("700,300"))).toBe(true)
    const chain = polylines.find((p) => (p.getAttribute("points") ?? "").startsWith("96,"))
    expect(chain).toBeTruthy()
    const chainDots = Array.from(root.querySelectorAll("circle")).filter((c) => {
      const cx = Number(c.getAttribute("cx"))
      return cx >= 96 && cx <= 200 && c.getAttribute("fill") !== "none"
    })
    expect(chainDots).toHaveLength(4)
    const nine = Array.from(root.querySelectorAll("circle")).filter((c) => Number(c.getAttribute("cx")) >= 700)
    expect(nine.length).toBeGreaterThanOrEqual(9)
  })
})
