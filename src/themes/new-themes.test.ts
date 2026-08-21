import { describe, it, expect } from "vitest"
import { resolveFontFace } from "../svg/fonts"
import { contrastRatio } from "../svg/ink"
import { TECH_TOKENS } from "./tech"
import { JOURNAL_TOKENS } from "./journal"
import { LUXE_TOKENS } from "./luxe"
import { PULSE_TOKENS } from "./pulse"
import { TERRA_TOKENS } from "./terra"
import { EMBER_TOKENS } from "./ember"
import { VERMILION_TOKENS } from "./vermilion"
import { CRAYON_TOKENS } from "./crayon"
import { ARENA_TOKENS } from "./arena"
import { MUSEUM_TOKENS } from "./museum"
import { STAGE_TOKENS } from "./stage"
import { LECTURE_TOKENS } from "./lecture"
import { CANONICAL_THEME_IDS, THEME_STYLES } from "./index"
import { SWISS_TOKENS } from "./swiss"
import { MEMO_TOKENS } from "./memo"
import { HERITAGE_TOKENS } from "./heritage"
import { THEME_DEFINITIONS } from "./definitions"
import { PLAYBILL_TOKENS } from "./playbill"
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

// stage（黑场 v2b，2026-08-21）：冷玄黑 + sans + 哑银，无 motif。Same
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

  it("does not set an accentPool (single, restrained dull-silver accent)", () => {
    expect(STAGE_TOKENS.colors.accentPool).toBeUndefined()
  })

  it("shape.radius is 0, gapScale is 1.3, typeScale is 1.5", () => {
    expect(STAGE_TOKENS.shape?.radius).toBe(0)
    expect(STAGE_TOKENS.shape?.gapScale).toBe(1.3)
    expect(STAGE_TOKENS.shape?.typeScale).toBe(1.5)
  })

  it("four page types share the cold xuan-black ground (chapter is not a primary bleed)", () => {
    for (const slideType of ["cover", "chapter", "content", "ending"] as const) {
      expect(STAGE_TOKENS.defaultBackgrounds[slideType]).toEqual({
        kind: "color",
        value: STAGE_TOKENS.colors.bg,
      })
    }
  })

  it("retires v1 ice-blue and stays a metal-gray monotone", () => {
    const dumped = JSON.stringify(STAGE_TOKENS.colors)
    expect(dumped).not.toContain("6BB7E8")
    expect(dumped).not.toContain("141C22")
    expect(STAGE_TOKENS.colors.accent).toBe("#C4BFB6")
    expect(STAGE_TOKENS.colors.bg).toBe("#0F0F12")
    expect(STAGE_TOKENS.colors.text).toBe("#F3EFE7")
    expect(STAGE_TOKENS.colors.muted).toBe("#B0A694")
    expect(STAGE_TOKENS.colors.border).toBe("#4A463F")
    expect(STAGE_TOKENS.colors.chartPalette).toEqual(["#C4BFB6", "#B8A888", "#6F6A61", "#8A96A2"])
    for (const hex of STAGE_TOKENS.colors.chartPalette) {
      expect(hslSat(hex), hex).toBeLessThan(0.3)
    }
  })

  it("clears the contrast floors the audit actually enforces", () => {
    const { colors } = STAGE_TOKENS
    expect(contrastRatio(colors.text, colors.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(colors.muted, colors.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(colors.accent, colors.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(colors.danger!, colors.surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(colors.success!, colors.surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(colors.warning!, colors.surface)).toBeGreaterThanOrEqual(3)
    for (const hex of colors.chartPalette) {
      expect(contrastRatio(hex, colors.bg), hex).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(hex, colors.surface), hex).toBeGreaterThanOrEqual(3)
    }
  })

  it("splits from luxe on ground distance, heading face, and accent family", () => {
    const stageBg = hexRgb(STAGE_TOKENS.colors.bg)
    const luxeBg = hexRgb(LUXE_TOKENS.colors.bg)
    expect(STAGE_TOKENS.colors.bg).not.toBe(LUXE_TOKENS.colors.bg)
    expect(rgbDist(stageBg, luxeBg)).toBeGreaterThan(10)
    expect(stageBg[2]).toBeGreaterThanOrEqual(stageBg[0])
    expect(luxeBg[0]).toBeGreaterThan(luxeBg[2])

    expect(resolveFontFace(STAGE_TOKENS.fonts.heading, "heading")).toBe("Microsoft YaHei")
    expect(resolveFontFace(LUXE_TOKENS.fonts.heading, "heading")).toBe("SimSun")

    expect(STAGE_TOKENS.colors.accent).not.toBe(LUXE_TOKENS.colors.accent)
    expect(hslSat(STAGE_TOKENS.colors.accent)).toBeLessThan(0.2)
    expect(hslSat(LUXE_TOKENS.colors.accent)).toBeGreaterThan(0.4)
  })
})

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbDist(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function hslSat(hex: string): number {
  const [r0, g0, b0] = hexRgb(hex)
  const r = r0 / 255
  const g = g0 / 255
  const b = b0 / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return 0
  return l > 0.5 ? d / (2 - max - min) : d / (max + min)
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

function hueSatL(hex: string): { hue: number; sat: number; l: number } {
  const [r0, g0, b0] = hexToRgb(hex)
  const r = r0 / 255
  const g = g0 / 255
  const b = b0 / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { hue: 0, sat: 0, l }
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let hue: number
  if (max === r) hue = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) hue = (b - r) / d + 2
  else hue = (r - g) / d + 4
  return { hue: hue * 60, sat, l }
}

/** CIE76 ΔE, same Lab path as `chart-palette-taboo.test.ts`. */
function deltaE(a: string, b: string): number {
  const toLab = (hex: string) => {
    const lin = hexToRgb(hex).map((c) => {
      const s = c / 255
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }) as [number, number, number]
    const [r, g, bl] = lin
    const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * bl) / 0.95047
    const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * bl
    const Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * bl) / 1.08883
    const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116)
    const fx = f(X)
    const fy = f(Y)
    const fz = f(Z)
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)] as const
  }
  const x = toLab(a)
  const y = toLab(b)
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}
// swiss（冷白制度，2026-08-21 wave7）：冷白纸 + 硬黑即正文即色块 + 瑞士红成边。
// Same shape-only assertions as the blocks above. Registry wiring is covered
// separately by themes/index.test.ts.
describe("swiss tokens", () => {
  it("satisfies the StyleTokens shape", () => {
    const t: StyleTokens = SWISS_TOKENS
    expect(t.id).toBe("swiss")
  })

  it("heading font resolves to Microsoft YaHei (exact width table, Archivo 900 sans landing)", () => {
    expect(resolveFontFace(SWISS_TOKENS.fonts.heading, "heading")).toBe("Microsoft YaHei")
  })

  it("body font resolves to Microsoft YaHei (exact width table)", () => {
    expect(resolveFontFace(SWISS_TOKENS.fonts.body, "body")).toBe("Microsoft YaHei")
  })

  it("does not set an accentPool (single, restrained Swiss-red accent)", () => {
    expect(SWISS_TOKENS.colors.accentPool).toBeUndefined()
  })

  it("shape.radius is 0 (institutional square) and gapScale is 1 (tight, same as tech)", () => {
    expect(SWISS_TOKENS.shape?.radius).toBe(0)
    expect(SWISS_TOKENS.shape?.gapScale).toBe(1)
  })

  it("cover/content/ending stay on the cold-white paper, chapter is the hard-black bleed", () => {
    expect(SWISS_TOKENS.defaultBackgrounds.cover).toEqual({ kind: "color", value: SWISS_TOKENS.colors.bg })
    expect(SWISS_TOKENS.defaultBackgrounds.content).toEqual({ kind: "color", value: SWISS_TOKENS.colors.bg })
    expect(SWISS_TOKENS.defaultBackgrounds.ending).toEqual({ kind: "color", value: SWISS_TOKENS.colors.bg })
    expect(SWISS_TOKENS.defaultBackgrounds.chapter).toEqual({ kind: "color", value: SWISS_TOKENS.colors.primary })
  })

  it("primary is the hard black that is both body ink and the color block", () => {
    expect(SWISS_TOKENS.colors.primary).toBe("#101010")
    expect(SWISS_TOKENS.colors.text).toBe("#101010")
  })

  it("accent is Swiss-red as an edge, not vermilion's face red or memo's line red", () => {
    expect(SWISS_TOKENS.colors.accent).toBe("#D7282F")
    expect(SWISS_TOKENS.colors.accent).not.toBe("#B02318")
    expect(SWISS_TOKENS.colors.accent).not.toBe("#A63A2B")
  })

  it("chartPalette is red / black / mid-gray / cool blue-gray, no orange", () => {
    expect(SWISS_TOKENS.colors.chartPalette).toEqual(["#D7282F", "#101010", "#5F5F5C", "#4A7A8A"])
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

// playbill（荧光嗓门，2026-08-21 第七波）：荧光黄整版 + 硬黑特粗字。Same
// shape-only assertions as the blocks above — registry wiring is covered
// separately by themes/index.test.ts.
describe("playbill tokens", () => {
  it("satisfies the StyleTokens shape", () => {
    const t: StyleTokens = PLAYBILL_TOKENS
    expect(t.id).toBe("playbill")
  })

  it("heading font resolves to Microsoft YaHei (exact width table, extra-bold sans)", () => {
    expect(resolveFontFace(PLAYBILL_TOKENS.fonts.heading, "heading")).toBe("Microsoft YaHei")
  })

  it("body font resolves to Microsoft YaHei (exact width table)", () => {
    expect(resolveFontFace(PLAYBILL_TOKENS.fonts.body, "body")).toBe("Microsoft YaHei")
  })

  it("does not set an accentPool (single, restrained kraft-ochre accent)", () => {
    expect(PLAYBILL_TOKENS.colors.accentPool).toBeUndefined()
  })

  it("shape.radius is 0 (ticket-stock square) and gapScale is 1 (medium)", () => {
    expect(PLAYBILL_TOKENS.shape?.radius).toBe(0)
    expect(PLAYBILL_TOKENS.shape?.gapScale).toBe(1)
  })

  it("typeScale is 1.3 — poster-grade display type (wired at merge once the mechanism landed)", () => {
    expect(PLAYBILL_TOKENS.shape?.typeScale).toBe(1.3)
  })

  it("four page types share the fluorescent yellow ground (the page is the decoration)", () => {
    for (const slideType of ["cover", "chapter", "content", "ending"] as const) {
      expect(PLAYBILL_TOKENS.defaultBackgrounds[slideType]).toEqual({
        kind: "color",
        value: PLAYBILL_TOKENS.colors.bg,
      })
    }
  })

  it("bg is the warehouse's only fluorescent yellow, distinct from crayon's chart sunflower", () => {
    expect(PLAYBILL_TOKENS.colors.bg).toBe("#F4DD1B")
    expect(PLAYBILL_TOKENS.colors.chartPalette).not.toContain("#F5B700")
    expect(PLAYBILL_TOKENS.colors.chartPalette).not.toContain("#F4DD1B")
  })

  it("primary and text are the same hard black, and black-on-yellow clears 12:1", () => {
    expect(PLAYBILL_TOKENS.colors.primary).toBe("#131313")
    expect(PLAYBILL_TOKENS.colors.text).toBe("#131313")
    expect(contrastRatio(PLAYBILL_TOKENS.colors.primary, PLAYBILL_TOKENS.colors.bg)).toBeGreaterThanOrEqual(12)
  })

  it("accent is kraft ochre, not the hard black and not crayon's sunflower", () => {
    expect(PLAYBILL_TOKENS.colors.accent).toBe("#8B6914")
    expect(PLAYBILL_TOKENS.colors.accent).not.toBe(PLAYBILL_TOKENS.colors.primary)
    expect(PLAYBILL_TOKENS.colors.accent).not.toBe("#F5B700")
  })

  it("semantic trio is derived from the yellow-paper register and clears the surface floors", () => {
    const { danger, warning, success, surface } = PLAYBILL_TOKENS.colors
    expect(danger).toBe("#8C1810")
    expect(warning).toBe("#7A5A18")
    expect(success).toBe("#3D5A32")
    expect(contrastRatio(danger!, surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(success!, surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(warning!, surface)).toBeGreaterThanOrEqual(3)
  })
})

// separately by themes/index.test.ts.
describe("lecture tokens", () => {
  it("satisfies the StyleTokens shape", () => {
    const t: StyleTokens = LECTURE_TOKENS
    expect(t.id).toBe("lecture")
  })

  it("heading font resolves to SimSun (CJK serif, journal/heritage/luxe/museum precedent, no tofu on export)", () => {
    expect(resolveFontFace(LECTURE_TOKENS.fonts.heading, "heading")).toBe("SimSun")
  })

  it("body font resolves to Microsoft YaHei (exact width table)", () => {
    expect(resolveFontFace(LECTURE_TOKENS.fonts.body, "body")).toBe("Microsoft YaHei")
  })

  it("does not set an accentPool (single, restrained chalk-yellow accent)", () => {
    expect(LECTURE_TOKENS.colors.accentPool).toBeUndefined()
  })

  it("shape.radius is 0 (chalkboard square) and gapScale is 0.9 (tight)", () => {
    expect(LECTURE_TOKENS.shape?.radius).toBe(0)
    expect(LECTURE_TOKENS.shape?.gapScale).toBe(0.9)
  })

  it("four page types share the green-board ground (chapter is not a primary bleed)", () => {
    for (const slideType of ["cover", "chapter", "content", "ending"] as const) {
      expect(LECTURE_TOKENS.defaultBackgrounds[slideType]).toEqual({
        kind: "color",
        value: LECTURE_TOKENS.colors.bg,
      })
    }
  })

  it("accent is chalk yellow, not luxe champagne / museum brass", () => {
    expect(LECTURE_TOKENS.colors.accent).toBe("#E9C46A")
    expect(LECTURE_TOKENS.colors.accent).not.toBe("#C6A15B")
    expect(LECTURE_TOKENS.colors.accent).not.toBe("#BE7A28")
    const lecture = hueSatL("#E9C46A")
    const luxe = hueSatL("#C6A15B")
    const museum = hueSatL("#BE7A28")
    expect(lecture.l).toBeGreaterThan(luxe.l)
    expect(lecture.l).toBeGreaterThan(museum.l)
    expect(deltaE("#E9C46A", "#C6A15B")).toBeGreaterThan(14)
    expect(deltaE("#E9C46A", "#BE7A28")).toBeGreaterThan(25)
  })

  it("body tokens clear the contrast floors on the green board", () => {
    const { bg, surface, text, muted, accent } = LECTURE_TOKENS.colors
    expect(contrastRatio(text, bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(muted, bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(muted, surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(accent, bg)).toBeGreaterThanOrEqual(3)
  })

  it("semantic three clear the floors on surface (danger/success ≥4.5, warning ≥3)", () => {
    const { surface, danger, warning, success } = LECTURE_TOKENS.colors
    expect(danger).toBeDefined()
    expect(warning).toBeDefined()
    expect(success).toBeDefined()
    expect(contrastRatio(danger!, surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(success!, surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(warning!, surface)).toBeGreaterThanOrEqual(3)
  })

  it("chart four-swatch set is chalk-white / chalk-yellow / grey-blue / terracotta, each ≥3:1 on bg", () => {
    expect(LECTURE_TOKENS.colors.chartPalette).toEqual(["#EFF3EC", "#E9C46A", "#8A9EAA", "#C47A68"])
    for (const hex of LECTURE_TOKENS.colors.chartPalette) {
      expect(contrastRatio(hex, LECTURE_TOKENS.colors.bg), hex).toBeGreaterThanOrEqual(3)
    }
  })

  it("is the only dark green ground in the roster (thumbnail independence vs the nearest dark five)", () => {
    const lectureBg = LECTURE_TOKENS.colors.bg
    expect(lectureBg).toBe("#1C2823")
    const self = hueSatL(lectureBg)
    expect(self.hue).toBeGreaterThan(140)
    expect(self.hue).toBeLessThan(170)
    expect(self.l).toBeLessThan(0.2)

    const darkNeighbors = {
      stage: "#141C22",
      museum: "#211A12",
      insight: "#0F1216",
      luxe: "#0B0908",
      tech: "#0A0F1E",
      arena: "#120B22",
    } as const
    for (const [id, hex] of Object.entries(darkNeighbors)) {
      expect(deltaE(lectureBg, hex), `${id} ${hex} sits on lecture's green board`).toBeGreaterThan(9)
    }

    const otherDarkGreen = CANONICAL_THEME_IDS.filter((id) => {
      if (id === "lecture") return false
      const hsl = hueSatL(THEME_STYLES[id].colors.bg)
      return hsl.hue >= 90 && hsl.hue <= 170 && hsl.l < 0.3
    })
    expect(otherDarkGreen).toEqual([])
  })
})

