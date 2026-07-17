import { describe, it, expect } from "vitest"
import { resolveFontFace } from "../svg/fonts"
import { TECH_TOKENS } from "./tech"
import { JOURNAL_TOKENS } from "./journal"
import type { ThemeTokens } from "./tokens"

// Task 1 of the theme redesign landed only the token objects here; Task 5
// registered both in index.ts / BUILTIN_STYLE_IDS. These tests still import the
// token constants directly (rather than going through getTheme()) since
// they're asserting the raw token shape, not the registry wiring — that's
// covered separately by themes/index.test.ts and
// svg/legacy-theme-mapping.test.tsx.
describe("tech tokens", () => {
  it("satisfies the ThemeTokens shape", () => {
    const t: ThemeTokens = TECH_TOKENS
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
  it("satisfies the ThemeTokens shape", () => {
    const t: ThemeTokens = JOURNAL_TOKENS
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
