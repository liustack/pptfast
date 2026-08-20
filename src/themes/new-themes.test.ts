import { describe, it, expect } from "vitest"
import { resolveFontFace } from "../svg/fonts"
import { TECH_TOKENS } from "./tech"
import { JOURNAL_TOKENS } from "./journal"
import { PULSE_TOKENS } from "./pulse"
import { TERRA_TOKENS } from "./terra"
import { EMBER_TOKENS } from "./ember"
import { VERMILION_TOKENS } from "./vermilion"
import { ARENA_TOKENS } from "./arena"
import type { StyleTokens } from "./tokens"

// Task 1 of the theme redesign landed only the token objects here; Task 5
// registered both in index.ts / BUILTIN_THEME_IDS. These tests still import the
// token constants directly (rather than going through resolveStyle()) since
// they're asserting the raw token shape, not the registry wiring — that's
// covered separately by themes/index.test.ts and
// svg/legacy-theme-mapping.test.tsx.
describe("tech tokens", () => {
  it("satisfies the StyleTokens shape", () => {
    const t: StyleTokens = TECH_TOKENS
    expect(t.id).toBe("tech")
  })

  it("heading font resolves to Microsoft YaHei (no CJK tofu on export)", () => {
    expect(resolveFontFace(TECH_TOKENS.fonts.heading, "heading")).toBe(
      "Microsoft YaHei",
    )
  })

  it("no longer carries an accentPool (Task 1: single, restrained electric-cyan accent)", () => {
    expect(TECH_TOKENS.colors.accentPool).toBeUndefined()
  })
})

describe("journal (ex-magazine) tokens", () => {
  it("satisfies the StyleTokens shape", () => {
    const t: StyleTokens = JOURNAL_TOKENS
    expect(t.id).toBe("journal")
  })

  it("heading font resolves to SimSun (the ikb tofu lesson: single exported face, CJK serif must be SimSun)", () => {
    expect(resolveFontFace(JOURNAL_TOKENS.fonts.heading, "heading")).toBe(
      "SimSun",
    )
  })

  it("does not set an accentPool (single, restrained accent color)", () => {
    expect(JOURNAL_TOKENS.colors.accentPool).toBeUndefined()
  })
})

// themes-16 wave, task T1 (2026-07-28): pulse is the 14th built-in theme
// (healthcare/life-science). Same shape-only assertions as the two blocks
// above — registry wiring (CANONICAL_THEME_IDS/THEME_STYLES/BUILTIN_THEME_IDS)
// is covered separately by themes/index.test.ts and svg/legacy-theme-mapping.test.tsx.
describe("pulse tokens", () => {
  it("satisfies the StyleTokens shape", () => {
    const t: StyleTokens = PULSE_TOKENS
    expect(t.id).toBe("pulse")
  })

  it("heading font resolves to Microsoft YaHei (exact width table, clean sans stack)", () => {
    expect(resolveFontFace(PULSE_TOKENS.fonts.heading, "heading")).toBe(
      "Microsoft YaHei",
    )
  })

  it("does not set an accentPool (single, restrained accent color)", () => {
    expect(PULSE_TOKENS.colors.accentPool).toBeUndefined()
  })

  it("shape.radius is 8 (rounded, approachable — clinic/health report register)", () => {
    expect(PULSE_TOKENS.shape?.radius).toBe(8)
  })
})

// themes-16 wave, task T2 (2026-07-28): terra is the 15th built-in theme
// (sustainability/ESG). Same shape-only assertions as the blocks above —
// registry wiring (CANONICAL_THEME_IDS/THEME_STYLES/BUILTIN_THEME_IDS) is
// covered separately by themes/index.test.ts and svg/legacy-theme-mapping.test.tsx.
describe("terra tokens", () => {
  it("satisfies the StyleTokens shape", () => {
    const t: StyleTokens = TERRA_TOKENS
    expect(t.id).toBe("terra")
  })

  // Warm-group reskin (2026-08-19): the board's own cross-check line reads
  // "heritage 衬线、其余 sans" — terra moved off Georgia's serif register onto
  // the sans stack. Microsoft YaHei is the other of the only two faces with an
  // exact width table, so the metric guarantee Georgia was picked for is kept.
  it("heading font resolves to Microsoft YaHei (exact width table, sans stack per the warm-group board)", () => {
    expect(resolveFontFace(TERRA_TOKENS.fonts.heading, "heading")).toBe(
      "Microsoft YaHei",
    )
  })

  it("does not set an accentPool (single, restrained terracotta accent)", () => {
    expect(TERRA_TOKENS.colors.accentPool).toBeUndefined()
  })

  it("shape.radius is 4 (plain, unadorned — ESG/sustainability report register)", () => {
    expect(TERRA_TOKENS.shape?.radius).toBe(4)
  })
})

// themes-16 wave, task T3 (2026-07-28): ember is the 16th, wave-closing
// built-in theme (startup pitch/warm energy). Same shape-only assertions as
// the blocks above — registry wiring (CANONICAL_THEME_IDS/THEME_STYLES/
// BUILTIN_THEME_IDS) is covered separately by themes/index.test.ts and
// svg/legacy-theme-mapping.test.tsx.
describe("ember tokens", () => {
  it("satisfies the StyleTokens shape", () => {
    const t: StyleTokens = EMBER_TOKENS
    expect(t.id).toBe("ember")
  })

  it("heading font resolves to Microsoft YaHei (exact width table, modern sans stack)", () => {
    expect(resolveFontFace(EMBER_TOKENS.fonts.heading, "heading")).toBe(
      "Microsoft YaHei",
    )
  })

  it("does not set an accentPool (single, restrained flame-yellow accent)", () => {
    expect(EMBER_TOKENS.colors.accentPool).toBeUndefined()
  })

  it("shape.radius is 10 (friendly, rounded — startup-pitch register)", () => {
    expect(EMBER_TOKENS.shape?.radius).toBe(10)
  })
})

// gov-theme wave (2026-08-06): vermilion is the 17th built-in theme (庄重公务
// 汇报——工作汇报/述职/年度总结), the first designed Chinese-register-first.
// Same shape-only assertions as the blocks above — registry wiring
// (CANONICAL_THEME_IDS/THEME_STYLES/BUILTIN_THEME_IDS) is covered separately by
// themes/index.test.ts and svg/legacy-theme-mapping.test.tsx.
describe("vermilion tokens", () => {
  it("satisfies the StyleTokens shape", () => {
    const t: StyleTokens = VERMILION_TOKENS
    expect(t.id).toBe("vermilion")
  })

  // Warm-group reskin (2026-08-19): the board's own cross-check line reads
  // "heritage 衬线、其余 sans" — vermilion moved off SimSun's serif masthead
  // onto the sans stack, which also gives it an exact width table for the
  // first time (it leaves `definitions.test.ts`'s nonExactHeadingBuiltins).
  it("heading font resolves to Microsoft YaHei (exact width table, sans stack per the warm-group board)", () => {
    expect(resolveFontFace(VERMILION_TOKENS.fonts.heading, "heading")).toBe(
      "Microsoft YaHei",
    )
  })

  it("body font resolves to Microsoft YaHei (exact width table, disciplined mixed CJK/Latin sans)", () => {
    expect(resolveFontFace(VERMILION_TOKENS.fonts.body, "body")).toBe(
      "Microsoft YaHei",
    )
  })

  it("does not set an accentPool (single, restrained gold accent)", () => {
    expect(VERMILION_TOKENS.colors.accentPool).toBeUndefined()
  })

  it("shape.radius is 2 (庄重利落, square/restrained — official-report register)", () => {
    expect(VERMILION_TOKENS.shape?.radius).toBe(2)
  })

  it("chapter default background is the full-bleed primary vermilion (the signature 红底白字 section divider, white ink via readableOn)", () => {
    // Read off the token rather than pinned to a literal: what this test is
    // about is "chapter is the full-bleed primary", which has to survive a
    // repalette (the warm-group reskin moved primary #C8102E → #B02318).
    expect(VERMILION_TOKENS.defaultBackgrounds.chapter).toEqual({ kind: "color", value: VERMILION_TOKENS.colors.primary })
  })

  it("cover/content/ending default backgrounds stay the warm off-white (a red cover would fail the text/muted contrast floor — see the token file header)", () => {
    for (const slideType of ["cover", "content", "ending"] as const) {
      expect(VERMILION_TOKENS.defaultBackgrounds[slideType]).toEqual({ kind: "color", value: VERMILION_TOKENS.colors.bg })
    }
  })
})

// arena wave (2026-08-21): arena is the 18th built-in theme (娱乐电竞 ·
// 竞技场紫黑). Same shape-only assertions as the blocks above — registry
// wiring (CANONICAL_THEME_IDS/THEME_STYLES/BUILTIN_THEME_IDS) is covered
// separately by themes/index.test.ts.
describe("arena tokens", () => {
  it("satisfies the StyleTokens shape", () => {
    const t: StyleTokens = ARENA_TOKENS
    expect(t.id).toBe("arena")
  })

  it("heading font resolves to Microsoft YaHei (exact width table, CJK-safe sans)", () => {
    expect(resolveFontFace(ARENA_TOKENS.fonts.heading, "heading")).toBe(
      "Microsoft YaHei",
    )
  })

  it("does not set an accentPool (single, restrained electric-green accent)", () => {
    expect(ARENA_TOKENS.colors.accentPool).toBeUndefined()
  })
})
