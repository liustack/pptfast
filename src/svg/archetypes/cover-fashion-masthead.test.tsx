// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { buildCtx } from "../FullSlideSvg"
import { resolveStyle } from "../../themes"
import { measureTextUnits } from "../../lib/svg-text-layout"
import { FashionMastheadCover } from "./cover-fashion-masthead"
import type { PptxIR, Slide } from "@/ir"

// Red-first regression for the user-reported cover-overflow defect
// (bold-metrics fix, 2026-07-24). Root cause (full writeup: this task's
// root-cause.md, scratchpad, not shipped in this repo): consulting theme's
// cover picks `cover-fashion-masthead.tsx`, whose heading renders
// `fontWeight="900"` -- OOXML export collapses that to a real Georgia Bold
// glyph outline (`isBold()`, fonts.ts) -- but `fitHeadingLines` sized the
// heading against `measureTextUnits`'s Regular-only calibration. The
// second line, "Components Demo", measured 8.39 units (1166.21px at the
// computed fontSize=139) under the old unweighted estimator -- comfortably
// inside the 1168px budget -- while Georgia Bold's real hmtx-table width is
// 1366.79px (+17.2%), overflowing visibly with no wrap/ellipsis to catch it
// (`wrap="none"` on export).
//
// Exact reproduction of `scripts/e2e.mts`'s `structuresDeck`: `theme: { id:
// "consulting" }`, cover slide `heading: "Structure Components Demo"`.

function coverSlide(heading: string): Slide {
  return { type: "cover", heading, components: [] } as Slide
}

function coverIr(heading: string): PptxIR {
  return {
    version: "3",
    filename: "x.pptx",
    theme: { id: "consulting" },
    meta: { organization: "pptfast", date: "2026-07" },
    assets: { images: {} },
    slides: [coverSlide(heading)],
  } as unknown as PptxIR
}

describe("cover-fashion-masthead — bold-metrics fix red-first (user-reported cover-overflow defect)", () => {
  const ctx = buildCtx(resolveStyle("consulting"), {})

  it("sanity: consulting's heading face resolves to Georgia (the defect's own trigger face)", () => {
    expect(ctx.fonts.heading.split(",")[0].trim()).toBe("Georgia")
  })

  it("estimator fact: at the OLD (pre-fix) fontSize=139, Georgia-bold-corrected \"Components Demo\" now EXCEEDS the 1168px budget", () => {
    // This is the exact quantity root-cause.md's own math table cites
    // (measureTextUnits estimate 1166.21px vs Georgia Bold real 1366.79px)
    // -- reproduced here through this fix's `bold: true, fontFamily`
    // estimator, not the data pack's raw fontTools numbers, so this
    // assertion is anchored to the code under test, not to a fact about the
    // real font that this code may or may not actually incorporate.
    const boldUnits = measureTextUnits("Components Demo", { bold: true, fontFamily: ctx.fonts.heading })
    const oldFontSize = 139
    expect(boldUnits * oldFontSize).toBeGreaterThan(1168)
  })

  it("forces fitHeadingLines to shrink: the rendered heading fontSize comes out smaller than the pre-fix 139", () => {
    const out = renderSvgMarkup(
      <FashionMastheadCover ir={coverIr("Structure Components Demo")} slide={coverSlide("Structure Components Demo")} index={0} ctx={ctx} />,
    )
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${out}</svg>`)
    const headingLines = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-weight") === "900",
    )
    expect(headingLines.length).toBeGreaterThan(0)
    const fontSize = Number(headingLines[0].getAttribute("font-size"))
    expect(fontSize).toBeLessThan(139)
  })

  it("every rendered heading line's bold-math width fits its declared 1168px budget (the actual fix, not just a smaller number)", () => {
    const out = renderSvgMarkup(
      <FashionMastheadCover ir={coverIr("Structure Components Demo")} slide={coverSlide("Structure Components Demo")} index={0} ctx={ctx} />,
    )
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${out}</svg>`)
    const headingLines = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-weight") === "900",
    )
    expect(headingLines.length).toBeGreaterThan(0)
    for (const line of headingLines) {
      const fontSize = Number(line.getAttribute("font-size"))
      const text = line.textContent ?? ""
      const boldWidth = measureTextUnits(text, { bold: true, fontFamily: ctx.fonts.heading }) * fontSize
      expect(boldWidth).toBeLessThanOrEqual(1168 + 1) // +1: float rounding slack, same convention as heading-fit.test.ts
    }
    // "Components Demo" specifically must survive as a real line, not be
    // wrapped away or truncated into something unrecognizable -- the fix is
    // a smaller/wrapped font, not silently dropped content.
    expect(headingLines.map((l) => l.textContent).join("")).toContain("Components Demo")
  })

  it("does not regress the non-overflowing first line (\"Structure\") into an unnecessarily tiny size", () => {
    // Guards against a pathological fix that shrinks everything to the
    // floor regardless of need -- "Structure" alone was already well inside
    // budget pre-fix (root-cause.md: 686.72px real bold vs 1168px, -3.9%
    // safe), so the fix's overall fontSize (driven by the longest line) is
    // expected to still land comfortably above minPt=72.
    const out = renderSvgMarkup(
      <FashionMastheadCover ir={coverIr("Structure Components Demo")} slide={coverSlide("Structure Components Demo")} index={0} ctx={ctx} />,
    )
    const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${out}</svg>`)
    const headingLines = Array.from(root.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-weight") === "900",
    )
    const fontSize = Number(headingLines[0]?.getAttribute("font-size"))
    expect(fontSize).toBeGreaterThan(100) // comically-shrunk guard, not a tight pin
  })

  describe("cross-face spot checks (face-aware seam, not the cross-face envelope)", () => {
    // Same archetype, same reported heading text, under the other 12
    // themes' heading faces -- proves the fix is face-aware (per-theme
    // correction) rather than one blanket conservative number applied
    // everywhere regardless of which face actually renders.
    const cases: Array<[theme: string, expectFace: string]> = [
      ["academic", "Georgia"],
      ["insight", "Georgia"],
      ["campaign", "Microsoft YaHei"],
      ["bloom", "SimSun"],
      ["ink", "KaiTi"],
    ]

    for (const [theme, expectFace] of cases) {
      it(`${theme} (${expectFace}): renders with every line's bold-math width inside the 1168px budget`, () => {
        const tctx = buildCtx(resolveStyle(theme), {})
        expect(tctx.fonts.heading.split(",")[0].trim()).toBe(expectFace)
        const out = renderSvgMarkup(
          <FashionMastheadCover
            ir={coverIr("Structure Components Demo")}
            slide={coverSlide("Structure Components Demo")}
            index={0}
            ctx={tctx}
          />,
        )
        const root = parseSvgRoot(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${out}</svg>`)
        const headingLines = Array.from(root.querySelectorAll("text")).filter(
          (t) => t.getAttribute("font-weight") === "900",
        )
        expect(headingLines.length).toBeGreaterThan(0)
        for (const line of headingLines) {
          const fontSize = Number(line.getAttribute("font-size"))
          const text = line.textContent ?? ""
          const boldWidth = measureTextUnits(text, { bold: true, fontFamily: tctx.fonts.heading }) * fontSize
          expect(boldWidth).toBeLessThanOrEqual(1168 + 1)
        }
      })
    }

    it("YaHei (campaign) is not needlessly over-shrunk relative to the conservative cross-face envelope (face-awareness has real visual payoff)", () => {
      // If the fix fell back to the envelope (MAX across Georgia/YaHei/
      // SimSun-KaiTi) for every face instead of a real per-face lookup,
      // YaHei's `upper` class would be corrected by Georgia's 1.1242
      // instead of its own measured 1.0317 -- a real, avoidable extra
      // shrink for 6 of 13 themes. This asserts the face-aware fontSize is
      // strictly >= what the envelope-only alternative would have produced.
      const campaignCtx = buildCtx(resolveStyle("campaign"), {})
      const faceAware = measureTextUnits("Components Demo", { bold: true, fontFamily: campaignCtx.fonts.heading })
      const envelopeOnly = measureTextUnits("Components Demo", { bold: true, fontFamily: undefined })
      expect(faceAware).toBeLessThan(envelopeOnly)
    })
  })
})
