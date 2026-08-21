import { describe, it, expect } from "vitest"
import { resolveFontFace } from "../svg/fonts"
import { TECH_TOKENS } from "./tech"
import { JOURNAL_TOKENS } from "./journal"
import { PULSE_TOKENS } from "./pulse"
import { TERRA_TOKENS } from "./terra"
import { EMBER_TOKENS } from "./ember"
import { VERMILION_TOKENS } from "./vermilion"
import { CRAYON_TOKENS } from "./crayon"
import { ARENA_TOKENS } from "./arena"
import { MUSEUM_TOKENS } from "./museum"
import { STAGE_TOKENS } from "./stage"
import { MEMO_TOKENS } from "./memo"
import { HERITAGE_TOKENS } from "./heritage"
import { THEME_DEFINITIONS } from "./definitions"
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

// sixth-wave themes (2026-08-21, scene audit #27): crayon
// (蜡笔卡纸 — K12 / 兴趣班 / 亲子). Same shape-only assertions as the blocks
// above — registry wiring (CANONICAL_THEME_IDS/THEME_STYLES/BUILTIN_THEME_IDS)
// is covered separately by themes/index.test.ts and svg/legacy-theme-mapping.test.tsx.
describe("crayon tokens", () => {
  it("satisfies the StyleTokens shape", () => {
    const t: StyleTokens = CRAYON_TOKENS
    expect(t.id).toBe("crayon")
  })

  it("heading font resolves to Microsoft YaHei (exact width table, same CJK-safe stack as classroom)", () => {
    expect(resolveFontFace(CRAYON_TOKENS.fonts.heading, "heading")).toBe(
      "Microsoft YaHei",
    )
  })

  it("body font resolves to Microsoft YaHei (exact width table, same CJK-safe stack as classroom)", () => {
    expect(resolveFontFace(CRAYON_TOKENS.fonts.body, "body")).toBe(
      "Microsoft YaHei",
    )
  })

  it("does not set an accentPool (single, restrained crayon-orange accent)", () => {
    expect(CRAYON_TOKENS.colors.accentPool).toBeUndefined()
  })

  it("shape.radius is 12 (roundest built-in — same classroom-affinity register)", () => {
    expect(CRAYON_TOKENS.shape?.radius).toBe(12)
  })

  it("chapter default background is the full-bleed primary crayon blue (white ink via readableOn)", () => {
    expect(CRAYON_TOKENS.defaultBackgrounds.chapter).toEqual({ kind: "color", value: CRAYON_TOKENS.colors.primary })
  })

  it("cover/content/ending default backgrounds stay the cream cardstock", () => {
    for (const slideType of ["cover", "content", "ending"] as const) {
      expect(CRAYON_TOKENS.defaultBackgrounds[slideType]).toEqual({ kind: "color", value: CRAYON_TOKENS.colors.bg })
    }
  })

  it("chartPalette fourth swatch is sunflower yellow, which never carries text", () => {
    expect(CRAYON_TOKENS.colors.chartPalette[3]).toBe("#F5B700")
  })
})

// sixth-wave themes (2026-08-21, scene audit #27): arena (娱乐电竞 ·
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

// museum（博物，2026-08-21）：棕黑厅堂 + 衬线 + 展签铜金。Same shape-only
// assertions as the blocks above — registry wiring is covered separately by
// themes/index.test.ts.
describe("museum tokens", () => {
  it("satisfies the StyleTokens shape", () => {
    const t: StyleTokens = MUSEUM_TOKENS
    expect(t.id).toBe("museum")
  })

  it("heading font resolves to SimSun (CJK serif, journal/heritage/luxe precedent, no tofu on export)", () => {
    expect(resolveFontFace(MUSEUM_TOKENS.fonts.heading, "heading")).toBe("SimSun")
  })

  it("body font resolves to Microsoft YaHei (exact width table)", () => {
    expect(resolveFontFace(MUSEUM_TOKENS.fonts.body, "body")).toBe("Microsoft YaHei")
  })

  it("does not set an accentPool (single, restrained plaque-brass accent)", () => {
    expect(MUSEUM_TOKENS.colors.accentPool).toBeUndefined()
  })

  it("shape.radius is 0 (label-plaque square) and gapScale is 1.3 (airy hall)", () => {
    expect(MUSEUM_TOKENS.shape?.radius).toBe(0)
    expect(MUSEUM_TOKENS.shape?.gapScale).toBe(1.3)
  })

  it("four page types share the umber hall ground (chapter is not a primary bleed)", () => {
    for (const slideType of ["cover", "chapter", "content", "ending"] as const) {
      expect(MUSEUM_TOKENS.defaultBackgrounds[slideType]).toEqual({
        kind: "color",
        value: MUSEUM_TOKENS.colors.bg,
      })
    }
  })

  it("accent is plaque brass, not luxe champagne", () => {
    expect(MUSEUM_TOKENS.colors.accent).toBe("#BE7A28")
    expect(MUSEUM_TOKENS.colors.accent).not.toBe("#C6A15B")
  })
})

// stage（黑场，2026-08-21）：青灰黑 + sans + 冰蓝聚光，无 motif。Same
// shape-only assertions as the blocks above — registry wiring is covered
// separately by themes/index.test.ts.
describe("stage tokens", () => {
  it("satisfies the StyleTokens shape", () => {
    const t: StyleTokens = STAGE_TOKENS
    expect(t.id).toBe("stage")
  })

  it("heading font resolves to Microsoft YaHei (exact width table, keynote sans)", () => {
    expect(resolveFontFace(STAGE_TOKENS.fonts.heading, "heading")).toBe("Microsoft YaHei")
  })

  it("body font resolves to Microsoft YaHei (exact width table)", () => {
    expect(resolveFontFace(STAGE_TOKENS.fonts.body, "body")).toBe("Microsoft YaHei")
  })

  it("does not set an accentPool (single, restrained ice-spotlight accent)", () => {
    expect(STAGE_TOKENS.colors.accentPool).toBeUndefined()
  })

  it("shape.radius is 0 (keynote square) and gapScale is 1.3 (airy black field)", () => {
    expect(STAGE_TOKENS.shape?.radius).toBe(0)
    expect(STAGE_TOKENS.shape?.gapScale).toBe(1.3)
  })

  it("four page types share the cool-black ground (chapter is not a primary bleed)", () => {
    for (const slideType of ["cover", "chapter", "content", "ending"] as const) {
      expect(STAGE_TOKENS.defaultBackgrounds[slideType]).toEqual({
        kind: "color",
        value: STAGE_TOKENS.colors.bg,
      })
    }
  })

  it("accent is ice spotlight, not luxe champagne / museum brass / insight amber", () => {
    expect(STAGE_TOKENS.colors.accent).toBe("#6BB7E8")
    expect(STAGE_TOKENS.colors.accent).not.toBe("#C6A15B")
    expect(STAGE_TOKENS.colors.accent).not.toBe("#BE7A28")
    expect(STAGE_TOKENS.colors.accent).not.toBe("#F0A63C")
  })

  it("ground is cool charcoal, not luxe true-black", () => {
    expect(STAGE_TOKENS.colors.bg).toBe("#141C22")
    expect(STAGE_TOKENS.colors.bg).not.toBe("#0B0908")
  })
})

// memo（打字机决定，2026-08-21）：便笺纸 + 宋体 + 印章红成线。Same
// shape-only assertions as the blocks above — registry wiring is covered
// separately by themes/index.test.ts.
describe("memo tokens", () => {
  it("satisfies the StyleTokens shape", () => {
    const t: StyleTokens = MEMO_TOKENS
    expect(t.id).toBe("memo")
  })

  it("heading font resolves to SimSun (CJK serif, journal/heritage/museum precedent, no tofu on export)", () => {
    expect(resolveFontFace(MEMO_TOKENS.fonts.heading, "heading")).toBe("SimSun")
  })

  it("body font resolves to Microsoft YaHei (exact width table)", () => {
    expect(resolveFontFace(MEMO_TOKENS.fonts.body, "body")).toBe("Microsoft YaHei")
  })

  it("mono font resolves to Courier New (typewriter Latin, SAFE_FONTS stand-in for the board's Courier Prime)", () => {
    expect(resolveFontFace(MEMO_TOKENS.fonts.mono ?? [], "mono")).toBe("Courier New")
  })

  it("does not set an accentPool (single, restrained stamp-red accent)", () => {
    expect(MEMO_TOKENS.colors.accentPool).toBeUndefined()
  })

  it("shape.radius is 2 (restrained report) and gapScale is 0.9 (tight, one notch under consulting)", () => {
    expect(MEMO_TOKENS.shape?.radius).toBe(2)
    expect(MEMO_TOKENS.shape?.gapScale).toBe(0.9)
  })

  it("four page types share the memo-paper ground (chapter is not a primary bleed)", () => {
    for (const slideType of ["cover", "chapter", "content", "ending"] as const) {
      expect(MEMO_TOKENS.defaultBackgrounds[slideType]).toEqual({
        kind: "color",
        value: MEMO_TOKENS.colors.bg,
      })
    }
  })

  it("accent is stamp red for lines and type, never the fill red vermilion uses", () => {
    expect(MEMO_TOKENS.colors.accent).toBe("#A63A2B")
    expect(MEMO_TOKENS.colors.primary).toBe(MEMO_TOKENS.colors.text)
    expect(MEMO_TOKENS.colors.primary).not.toBe(MEMO_TOKENS.colors.accent)
    expect(MEMO_TOKENS.colors.accent).not.toBe(VERMILION_TOKENS.colors.primary)
  })

  it("does not bind chrome on the theme — pairing with chrome:full is a docs note, not an engine lock", () => {
    expect(THEME_DEFINITIONS.memo.brand).toEqual({})
  })
})

describe("memo vs heritage vs vermilion (warm-paper / red-family split)", () => {
  it("three papers stay distinct", () => {
    expect(MEMO_TOKENS.colors.bg).toBe("#F6F1E7")
    expect(HERITAGE_TOKENS.colors.bg).toBe("#F4EDE2")
    expect(VERMILION_TOKENS.colors.bg).toBe("#F6EFE3")
    expect(new Set([MEMO_TOKENS.colors.bg, HERITAGE_TOKENS.colors.bg, VERMILION_TOKENS.colors.bg]).size).toBe(3)
  })

  it("heading: memo and heritage are SimSun serif, vermilion is YaHei sans (red banner carrying white type)", () => {
    expect(resolveFontFace(MEMO_TOKENS.fonts.heading, "heading")).toBe("SimSun")
    expect(resolveFontFace(HERITAGE_TOKENS.fonts.heading, "heading")).toBe("SimSun")
    expect(resolveFontFace(VERMILION_TOKENS.fonts.heading, "heading")).toBe("Microsoft YaHei")
  })

  it("only memo carries a typewriter mono stack headed by Courier New", () => {
    expect(resolveFontFace(MEMO_TOKENS.fonts.mono ?? [], "mono")).toBe("Courier New")
    expect(HERITAGE_TOKENS.fonts.mono).toBeUndefined()
    expect(VERMILION_TOKENS.fonts.mono).toBeUndefined()
  })

  it("vermilion chapter is a primary-red bleed, memo and heritage stay on paper", () => {
    expect(VERMILION_TOKENS.defaultBackgrounds.chapter).toEqual({
      kind: "color",
      value: VERMILION_TOKENS.colors.primary,
    })
    expect(MEMO_TOKENS.defaultBackgrounds.chapter).toEqual({
      kind: "color",
      value: MEMO_TOKENS.colors.bg,
    })
    expect(HERITAGE_TOKENS.defaultBackgrounds.chapter).toEqual({
      kind: "color",
      value: HERITAGE_TOKENS.colors.bg,
    })
  })

  it("red three-family: vermilion fill red, memo line red, neither shares the other's hex", () => {
    expect(VERMILION_TOKENS.colors.primary).toBe("#B02318")
    expect(MEMO_TOKENS.colors.accent).toBe("#A63A2B")
    expect(MEMO_TOKENS.colors.accent).not.toBe(VERMILION_TOKENS.colors.primary)
    expect(MEMO_TOKENS.colors.primary).not.toBe(VERMILION_TOKENS.colors.primary)
    expect(HERITAGE_TOKENS.colors.accent).toBe("#B8742C")
  })
})
