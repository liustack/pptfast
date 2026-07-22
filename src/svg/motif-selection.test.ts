// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { PptxIR, Slide } from "@/ir"
import { CANONICAL_THEME_IDS } from "../themes"
import { THEME_DEFINITIONS, registerTheme, __resetRegisteredThemes } from "../themes/definitions"
import { MOTIF_ARCHETYPES } from "./archetypes/index-motif"
import { MOTIF_ANCHOR_WEIGHT, MOTIF_BASE_WEIGHT, MOTIF_CANDIDATES, resolveMotifId } from "./motif-selection"

function makeIR(slides: Slide[], themeId: string, seed?: number): PptxIR {
  return {
    version: "4",
    filename: "test.pptx",
    theme: { id: themeId },
    meta: {},
    assets: { images: {} },
    slides,
    seed,
  } as PptxIR
}

const contentSlide = (id: string): Slide => ({ type: "content", id, heading: id, components: [] }) as Slide

describe("MOTIF_CANDIDATES (P1 variety wave, task 2 — table shape)", () => {
  it("every canonical theme except runway has a non-empty candidate set", () => {
    for (const id of CANONICAL_THEME_IDS) {
      if (id === "runway") {
        expect(MOTIF_CANDIDATES[id], "runway is the settled no-motif theme — must stay absent, not an empty array").toBeUndefined()
        continue
      }
      const candidates = MOTIF_CANDIDATES[id]
      expect(candidates, `theme "${id}" has no candidate set`).toBeDefined()
      expect(candidates!.length, `theme "${id}" candidate set is empty`).toBeGreaterThan(0)
    }
  })

  it("every candidate set's first (anchor) entry is exactly that theme's own THEME_DEFINITIONS motif — identity anchor never displaced", () => {
    for (const id of CANONICAL_THEME_IDS) {
      const candidates = MOTIF_CANDIDATES[id]
      if (!candidates) continue
      expect(candidates[0], `theme "${id}"'s anchor candidate must equal its own THEME_DEFINITIONS motif`).toBe(
        THEME_DEFINITIONS[id].motif,
      )
    }
  })

  it("every candidate id names a real, registered motif archetype", () => {
    for (const id of CANONICAL_THEME_IDS) {
      const candidates = MOTIF_CANDIDATES[id]
      if (!candidates) continue
      for (const motifId of candidates) {
        expect(MOTIF_ARCHETYPES[motifId], `theme "${id}" candidate "${motifId}" is not registered`).toBeTypeOf(
          "function",
        )
      }
    }
  })

  it("no candidate set repeats an id (the plan's 2-3 *distinct* style-compatible motifs)", () => {
    for (const id of CANONICAL_THEME_IDS) {
      const candidates = MOTIF_CANDIDATES[id]
      if (!candidates) continue
      expect(new Set(candidates).size, `theme "${id}" candidate set has a duplicate`).toBe(candidates.length)
    }
  })

  it("every candidate set has 1-3 members (plan's stated candidate-subset size, singleton allowed with a recorded rationale)", () => {
    for (const id of CANONICAL_THEME_IDS) {
      const candidates = MOTIF_CANDIDATES[id]
      if (!candidates) continue
      expect(candidates.length, `theme "${id}" candidate set size out of [1,3]`).toBeGreaterThanOrEqual(1)
      expect(candidates.length).toBeLessThanOrEqual(3)
    }
  })
})

describe("resolveMotifId — byte-inertness for the themes this task must not disturb", () => {
  it("runway (no motif, settled decision) resolves to undefined for every seed", () => {
    for (let seed = 0; seed < 20; seed++) {
      const ir = makeIR([contentSlide("p0")], "runway", seed)
      expect(resolveMotifId(ir, ir.slides[0]!, 0)).toBeUndefined()
    }
  })

  it("a 1-member candidate set (campaign, ink) always resolves to its own anchor regardless of seed or pageKey", () => {
    for (const themeId of ["campaign", "ink"] as const) {
      for (let seed = 0; seed < 20; seed++) {
        const ir = makeIR([contentSlide("p0"), contentSlide("p1"), contentSlide("p2")], themeId, seed)
        for (let i = 0; i < ir.slides.length; i++) {
          expect(resolveMotifId(ir, ir.slides[i]!, i)).toBe(THEME_DEFINITIONS[themeId].motif)
        }
      }
    }
  })

  it("a registered (custom) theme keeps its own single fixed motif untouched — the candidate table only covers the 13 builtins", () => {
    __resetRegisteredThemes()
    registerTheme({
      id: "custom-motif-theme",
      style: THEME_DEFINITIONS.consulting.style,
      brand: {},
      tags: [],
      motif: "poster-motif",
    })
    for (let seed = 0; seed < 20; seed++) {
      const ir = makeIR([contentSlide("p0"), contentSlide("p1")], "custom-motif-theme", seed)
      expect(resolveMotifId(ir, ir.slides[0]!, 0)).toBe("poster-motif")
      expect(resolveMotifId(ir, ir.slides[1]!, 1)).toBe("poster-motif")
    }
    __resetRegisteredThemes()
  })

  it("an unrecognized theme id falls back through getThemeDefinition's own consulting fallback, motif included", () => {
    const ir = makeIR([contentSlide("p0")], "does-not-exist")
    // consulting has a multi-member candidate set, so this just proves no crash
    // and the result is always a member of consulting's own candidate set.
    const result = resolveMotifId(ir, ir.slides[0]!, 0)
    expect(MOTIF_CANDIDATES.consulting).toContain(result)
  })
})

describe("resolveMotifId — anchor plurality and cross-page variety (multi-candidate themes)", () => {
  const MULTI_CANDIDATE_THEMES = CANONICAL_THEME_IDS.filter((id) => (MOTIF_CANDIDATES[id]?.length ?? 0) > 1)

  it("has at least one multi-candidate theme to exercise (sanity check on the fixture set itself)", () => {
    expect(MULTI_CANDIDATE_THEMES.length).toBeGreaterThan(0)
  })

  it.each(MULTI_CANDIDATE_THEMES)(
    "%s: the anchor motif is picked strictly more often than any single other candidate over a wide pageKey sweep",
    (themeId) => {
      const candidates = MOTIF_CANDIDATES[themeId]!
      const counts = new Map<string, number>()
      const N = 300
      for (let i = 0; i < N; i++) {
        const ir = makeIR([contentSlide(`p${i}`)], themeId, 42)
        const picked = resolveMotifId(ir, ir.slides[0]!, 0)!
        counts.set(picked, (counts.get(picked) ?? 0) + 1)
      }
      const anchorCount = counts.get(candidates[0]) ?? 0
      for (const other of candidates.slice(1)) {
        expect(
          anchorCount,
          `theme "${themeId}": anchor "${candidates[0]}" (${anchorCount}) not strictly ahead of "${other}" (${counts.get(other) ?? 0})`,
        ).toBeGreaterThan(counts.get(other) ?? 0)
      }
      // Every named candidate must actually appear at least once at this
      // sample size — an unreachable candidate would be dead weight.
      for (const c of candidates) {
        expect(counts.get(c) ?? 0, `theme "${themeId}": candidate "${c}" never picked in ${N} draws`).toBeGreaterThan(
          0,
        )
      }
    },
  )

  it.each(MULTI_CANDIDATE_THEMES)(
    "%s: different decor pages in the same deck commonly land on different motifs (not one sticker glued to the whole deck)",
    (themeId) => {
      const slides = Array.from({ length: 8 }, (_, i) => contentSlide(`page-${i}`))
      const ir = makeIR(slides, themeId, 7)
      const picks = new Set(slides.map((s, i) => resolveMotifId(ir, s, i)))
      expect(picks.size, `theme "${themeId}": all 8 pages picked the same motif`).toBeGreaterThan(1)
    },
  )
})

describe("resolveMotifId — determinism and revision stability", () => {
  it("same (ir, slide, index) resolves identically across repeated calls (double-render determinism)", () => {
    const ir = makeIR([contentSlide("p0"), contentSlide("p1")], "consulting", 5)
    for (let i = 0; i < ir.slides.length; i++) {
      const a = resolveMotifId(ir, ir.slides[i]!, i)
      const b = resolveMotifId(ir, ir.slides[i]!, i)
      expect(a).toBe(b)
    }
  })

  it("a page's motif depends only on its own pageKey — an unrelated page existing elsewhere in the deck never perturbs it (pageKey-scoped, no cross-page fold like layout selection)", () => {
    const p0 = contentSlide("stable-id")
    const withoutNeighbor = makeIR([p0], "consulting", 9)
    const withNeighbor = makeIR([contentSlide("new-page"), p0], "consulting", 9)
    expect(resolveMotifId(withoutNeighbor, p0, 0)).toBe(resolveMotifId(withNeighbor, p0, 1))
  })

  it("editing one page's heading (unrelated to motif salt) never changes another page's own motif pick", () => {
    const base = [contentSlide("p0"), contentSlide("p1"), contentSlide("p2")]
    const ir1 = makeIR(base, "heritage", 11)
    const edited = base.map((s, i) => (i === 1 ? { ...s, heading: "a brand-new heading" } : s))
    const ir2 = makeIR(edited, "heritage", 11)
    expect(resolveMotifId(ir1, ir1.slides[0]!, 0)).toBe(resolveMotifId(ir2, ir2.slides[0]!, 0))
    expect(resolveMotifId(ir1, ir1.slides[2]!, 2)).toBe(resolveMotifId(ir2, ir2.slides[2]!, 2))
  })
})

describe("weight constants", () => {
  it("MOTIF_ANCHOR_WEIGHT strictly exceeds MOTIF_BASE_WEIGHT (the plurality requirement)", () => {
    expect(MOTIF_ANCHOR_WEIGHT).toBeGreaterThan(MOTIF_BASE_WEIGHT)
  })
})
