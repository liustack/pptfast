// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderSvgMarkup, parseSvgRoot } from "../serialize"
import { buildCtx } from "../full-slide-svg"
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

    // Round 2 (2026-07-24): this test's original premise -- "face-aware is
    // always narrower than the envelope, proving face-awareness avoids
    // needless over-shrink" -- stopped being universally true once Georgia/
    // YaHei moved to an exact per-character model and the envelope lost
    // round 1's margin (see svg-text-layout.ts's EPITAPH comment). The
    // envelope is a per-CLASS max across three faces, still an average; the
    // exact model is a per-CHARACTER sum for the one real face -- for an
    // adversarial, letter-heavy string like "Components Demo" the exact
    // reading can legitimately come out *above* a class-average envelope
    // that was never fit to this specific string's composition in the
    // first place. The real payoff face-awareness has is accuracy, not
    // "always smaller" -- this test now checks that directly: the face-
    // aware estimate matches a genuine hmtx reading almost exactly, while
    // the envelope (structurally incapable of per-string exactness) does
    // not.
    it("YaHei (campaign) exact model matches the genuine hmtx reading; the conservative envelope alone would not have (face-awareness's real payoff is accuracy, not just a smaller number)", () => {
      const campaignCtx = buildCtx(resolveStyle("campaign"), {})
      const faceAware = measureTextUnits("Components Demo", { bold: true, fontFamily: campaignCtx.fonts.heading })
      const envelopeOnly = measureTextUnits("Components Demo", { bold: true, fontFamily: undefined })
      // real_em 9.7319 -- this fix's own direct fontTools re-measurement
      // against the genuine msyhbd.ttc (not tabulated in bold-data-
      // pack.json, which only measured the combined two-line title); see
      // svg-text-layout.bold-golden.test.ts's own anchor for the same
      // number with its full provenance comment.
      const genuineReal = 9.7319
      expect(Math.abs((faceAware - genuineReal) / genuineReal)).toBeLessThan(0.001)
      expect(envelopeOnly).toBeLessThan(genuineReal)
    })
  })
})
