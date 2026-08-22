// @vitest-environment jsdom
//
// ink-motif v3 acceptance (theme-redesign wave, 2026-08-18 —
// `.issues/2026-08-18-theme-redesign/ink/decisions.md`). Four of these are
// the wave's own mutation checks, each one written so that undoing the
// corresponding design rule in `motif-ink-motif.tsx` turns it red:
//   1. the colophon rail crossing back over x1220
//   2. the rail overlapping Branding's bottom-right logo box
//   3. the remnant mountain appearing on a content page
//   4. (in `../branding.test.tsx`) the footer meta row printing a second
//      copy of the org/date the rail already carries
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { assertSubset } from "../subset-validate"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { InkMotif } from "./motif-ink-motif"
import type { PptxIR, Slide } from "@/ir"

const slideOf = (type: Slide["type"]): Slide => ({ type, heading: "标题", components: [] }) as Slide
const SLIDE_TYPES = ["cover", "chapter", "content", "ending"] as const

function ir(meta: PptxIR["meta"] = { organization: "云帆科技", date: "2026-08-15" }): PptxIR {
  return {
    version: "4",
    filename: "ink-motif.pptx",
    theme: { id: "ink" },
    meta,
    assets: { images: {} },
    slides: [slideOf("cover")],
  } as unknown as PptxIR
}

const tokens = resolveStyle("ink")
const ctx = buildCtx(tokens, {})

function render(type: Slide["type"], meta?: PptxIR["meta"]) {
  const markup = renderSvgMarkup(
    <svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
      <InkMotif ir={ir(meta)} slide={slideOf(type)} ctx={ctx} />
    </svg>,
  )
  return { markup, root: parseSvgRoot(markup) }
}

/** Branding's bottom-right logo box (`branding.tsx`'s `logoBox`), the
 *  boundary the rail exists to stay clear of. Right edge = 1120 + 96 = 1216. */
const BR_LOGO = { x: 1120, y: 630, w: 96, h: 40 }
const RAIL_X = 1220

describe("ink-motif v3 — the right-edge colophon rail", () => {
  it("draws the rail, the org column, the year/month column and the seal on all four slide types", () => {
    for (const type of SLIDE_TYPES) {
      const { root } = render(type)
      expect(root.querySelectorAll("line"), `${type}: rail rule`).toHaveLength(1)
      expect(root.querySelectorAll("rect"), `${type}: seal + inner frame`).toHaveLength(2)
      const texts = Array.from(root.querySelectorAll("text")).map((t) => t.textContent)
      // 云帆科技 (4) + 二〇二六年八月 (7)
      expect(texts.join(""), `${type}: colophon column`).toBe("云帆科技二〇二六年八月")
    }
  })

  it("mutation guard 1: every declared x coordinate of the rail sits at or right of x1220", () => {
    // The one design rule this whole construction hangs on. Moving any rail
    // element left of 1220 — the pre-v3 seal sat at x1170 — fails here.
    const { root } = render("cover")
    const xs: { what: string; x: number }[] = []
    for (const el of Array.from(root.querySelectorAll("line"))) {
      xs.push({ what: "line x1", x: Number(el.getAttribute("x1")) })
      xs.push({ what: "line x2", x: Number(el.getAttribute("x2")) })
    }
    for (const el of Array.from(root.querySelectorAll("rect"))) {
      xs.push({ what: "rect x", x: Number(el.getAttribute("x")) })
    }
    for (const el of Array.from(root.querySelectorAll("text"))) {
      // A `text-anchor="middle"` glyph extends half its font size either
      // side of its own x, so the left edge is what has to clear the line.
      const size = Number(el.getAttribute("font-size"))
      xs.push({ what: `glyph "${el.textContent}" left edge`, x: Number(el.getAttribute("x")) - size / 2 })
    }
    expect(xs.length).toBeGreaterThan(10)
    for (const { what, x } of xs) expect(x, what).toBeGreaterThanOrEqual(RAIL_X)
  })

  it("mutation guard 2: nothing the rail paints reaches into the bottom-right logo box", () => {
    // The rule above is the design's own line; this is the consequence that
    // actually matters, measured against real ink rather than declared
    // coordinates — the rail's 1.2px stroke straddles x1220, so its real left
    // edge is 1219.4, still 3.4px clear of the logo box's right edge.
    const { root } = render("cover")
    const RULE_HALF_STROKE = 0.6
    const inkLeftEdges: number[] = [RAIL_X - RULE_HALF_STROKE]
    for (const el of Array.from(root.querySelectorAll("rect"))) {
      inkLeftEdges.push(Number(el.getAttribute("x")))
    }
    for (const el of Array.from(root.querySelectorAll("text"))) {
      inkLeftEdges.push(Number(el.getAttribute("x")) - Number(el.getAttribute("font-size")) / 2)
    }
    for (const x of inkLeftEdges) expect(x).toBeGreaterThan(BR_LOGO.x + BR_LOGO.w)
  })

  it("mutation guard 3: the remnant mountain is drawn on cover and chapter only", () => {
    for (const type of SLIDE_TYPES) {
      const paths = render(type).root.querySelectorAll("path")
      const expected = type === "cover" || type === "chapter" ? 1 : 0
      expect(paths, `${type}`).toHaveLength(expected)
    }
    const path = render("cover").root.querySelector("path")!
    // Fixed geometry, never derived from content (the determinism red line):
    // the same d/fill/opacity on every deck.
    expect(path.getAttribute("d")).toBe("M -40 720 Q 140 640 330 690 Q 430 708 500 720 Z")
    expect(path.getAttribute("opacity")).toBe("0.06")
    expect(path.getAttribute("fill")).toBe(tokens.colors.primary)
  })

  it("the column stays clear of the seal — the last glyph's baseline never reaches it", () => {
    // Long org (20 chars) is the case the capacity math exists for.
    const { root } = render("cover", { organization: "云".repeat(20), date: "2026-11-01" })
    const SEAL_TOP = 614
    const baselines = Array.from(root.querySelectorAll("text")).map((t) => Number(t.getAttribute("y")))
    expect(Math.max(...baselines)).toBeLessThan(SEAL_TOP)
  })

  it("a too-long org is truncated with an ellipsis and marked, not silently cut", () => {
    const { root } = render("cover", { organization: "云".repeat(20), date: "2026-08-15" })
    const glyphs = Array.from(root.querySelectorAll("text"))
    const orgGlyphs = glyphs.filter((t) => Number(t.getAttribute("font-size")) === 19)
    expect(orgGlyphs.length).toBeLessThan(20)
    expect(orgGlyphs[orgGlyphs.length - 1].textContent).toBe("…")
    expect(orgGlyphs[orgGlyphs.length - 1].getAttribute("data-truncated")).toBe("1")
    // A short org keeps every character and carries no marker.
    const short = render("cover").root.querySelectorAll('[data-truncated="1"]')
    expect(short).toHaveLength(0)
  })

  it("records the column's real capacity limit: 11 glyphs with a date, and what that excludes", () => {
    // Not a curiosity — the rail is the ONLY place an ink content page shows
    // the organization (`BRANDS.ink.suppressFooterMeta`), so this number is
    // the theme's practical limit on an org name. Written down as a test
    // because it is a known, chosen cost of the wave's own ruling, and the
    // remedy (`theme.brand.suppressFooterMeta: false`) depends on a reader
    // knowing the limit exists. See `themes/definitions.ts`'s `BRANDS.ink`.
    const glyphCount = (org: string, date = "2026-08-15") =>
      Array.from(
        render("cover", { organization: org, date }).root.querySelectorAll("text"),
      ).filter((t) => Number(t.getAttribute("font-size")) === 19).length
    const truncates = (org: string) =>
      render("cover", { organization: org, date: "2026-08-15" }).root.querySelectorAll(
        '[data-truncated="1"]',
      ).length > 0

    expect(glyphCount("云".repeat(11))).toBe(11)
    expect(truncates("云".repeat(11))).toBe(false)
    expect(truncates("云".repeat(12))).toBe(true)
    // Real names on both sides of the line.
    expect(truncates("云帆科技")).toBe(false)
    expect(truncates("北京云帆科技有限公司")).toBe(false)
    expect(truncates("北京云帆科技有限责任公司")).toBe(true)
    // A Latin name of ordinary length does not fit a per-character vertical
    // column — this is the case that makes the limit worth stating out loud.
    expect(truncates("Meridian Analytics")).toBe(true)
    // Without a date the column has the whole rail to itself.
    expect(glyphCount("云".repeat(20), "not a date")).toBe(17)
  })

  it("the year/month renders in Chinese numerals, and an unreadable date renders nothing rather than a guess", () => {
    const glyphsFor = (date: string | undefined) =>
      Array.from(render("cover", { organization: "甲", date }).root.querySelectorAll("text"))
        .map((t) => t.textContent)
        .join("")
    expect(glyphsFor("2026-08-15")).toBe("甲二〇二六年八月")
    expect(glyphsFor("2026-10-01")).toBe("甲二〇二六年十月")
    expect(glyphsFor("2026-11-30")).toBe("甲二〇二六年十一月")
    expect(glyphsFor("2026/1/9")).toBe("甲二〇二六年一月")
    expect(glyphsFor("Q3 FY26")).toBe("甲")
    expect(glyphsFor("2026-13-01")).toBe("甲")
    expect(glyphsFor(undefined)).toBe("甲")
  })

  it("carries no meta at all when the deck declares neither org nor date — just the rule and the seal", () => {
    const { root } = render("cover", {})
    expect(root.querySelectorAll("text")).toHaveLength(0)
    expect(root.querySelectorAll("line")).toHaveLength(1)
    expect(root.querySelectorAll("rect")).toHaveLength(2)
  })

  it("every color comes from a theme token — no baked hex anywhere in the file", () => {
    const { root } = render("cover")
    const { colors } = tokens
    expect(root.querySelector("line")!.getAttribute("stroke")).toBe(colors.border)
    const [seal, inner] = Array.from(root.querySelectorAll("rect"))
    expect(seal.getAttribute("fill")).toBe(colors.accent)
    expect(inner.getAttribute("stroke")).toBe(colors.surface)
    expect(inner.getAttribute("fill")).toBe("none")
    for (const t of Array.from(root.querySelectorAll("text"))) {
      expect(t.getAttribute("fill")).toBe(colors.muted)
      // B-tier: org names and dates, real information deliberately dimmed
      // (`docs/contrast-system.md`).
      expect(t.getAttribute("data-contrast-tier")).toBe("meta")
    }
  })

  it("emits only export-safe primitives (the SVG -> DrawingML subset)", () => {
    for (const type of SLIDE_TYPES) {
      expect(() => assertSubset(render(type).root), type).not.toThrow()
    }
  })

  it("is a pure function of (theme, slide type, deck meta) — repeated renders are byte-identical", () => {
    for (const type of SLIDE_TYPES) {
      expect(render(type).markup).toBe(render(type).markup)
    }
  })
})
