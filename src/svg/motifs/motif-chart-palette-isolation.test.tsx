// @vitest-environment jsdom
//
// Review fix round (P1 variety wave, task 2 — Major finding): buildCtx used
// to rotate `ctx.colors.chartPalette` itself, which is the exact token
// campaign-motif/classroom-motif/bloom-motif destructure by fixed position
// for their own decorative fills (`ctx.colors.chartPalette` — see each
// file's own header comment: "颜色取 ctx.colors.chartPalette"). Chart
// palette rotation therefore silently leaked into decor color choice —
// campaign (a settled 1-member candidate set that MUST render
// byte-identically across every seed, per `motif-selection.ts`'s own
// byte-inertness contract) differed across seeds purely because a page
// happening to also carry a different implicit chart-palette offset
// repainted its crayon strokes in a different order. The existing
// byte-inertness coverage (`motif-selection.test.ts`, `full-slide-svg.test.tsx`)
// only ever varied pageKey at a fixed seed, or varied seed only through the
// pure `resolveMotifId` selection function (which never touched color) — so
// this leak was invisible to every pre-fix test. This file isolates the
// exact seam the fix moved the rotation away from: does a motif's own
// rendered markup change when *only* `chartPaletteOffset` changes, holding
// `ir`/`slide`/`tokens` fixed? Post-fix, the answer must always be no.
import { describe, expect, it } from "vitest"
import type { PptxIR, Slide } from "@/ir"
import { buildCtx } from "../full-slide-svg"
import { resolveStyle } from "../../themes"
import { renderSvgMarkup } from "../serialize"
import { CampaignMotif } from "./motif-campaign-motif"
import { ClassroomMotif } from "./motif-classroom-motif"
import { BloomMotif } from "./motif-bloom-motif"

function ir(themeId: string): PptxIR {
  return {
    version: "4",
    filename: "x.pptx",
    theme: { id: themeId },
    meta: {},
    assets: { images: {} },
    slides: [],
  } as unknown as PptxIR
}

const coverSlide: Slide = { type: "cover", heading: "封面", components: [] } as Slide
const endingSlide: Slide = { type: "ending", components: [] } as Slide

describe("decorative chartPalette-reading motifs are isolated from chart-palette rotation", () => {
  it.each([
    ["campaign", CampaignMotif, coverSlide] as const,
    ["classroom", ClassroomMotif, coverSlide] as const,
    ["bloom", BloomMotif, endingSlide] as const,
  ])("%s: renders byte-identical markup regardless of chartPaletteOffset", (themeId, Motif, slide) => {
    const tokens = resolveStyle(themeId)
    const theIr = ir(themeId)
    const markups = new Set(
      Array.from({ length: tokens.colors.chartPalette.length }, (_, offset) => {
        const ctx = buildCtx(tokens, {}, undefined, undefined, undefined, offset)
        return renderSvgMarkup(<Motif ir={theIr} slide={slide} ctx={ctx} />)
      }),
    )
    expect(markups.size, `${themeId}-motif's markup varied with chartPaletteOffset alone`).toBe(1)
  })
})
