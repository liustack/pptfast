import { describe, expect, it } from "vitest"
import { CANONICAL_THEME_IDS, THEME_STYLES } from "./index"
import { THEME_DEFINITIONS, resolveBrand } from "./styles"

describe("THEME_DEFINITIONS", () => {
  it("covers all 13 canonical ids with theme tokens and master", () => {
    for (const id of CANONICAL_THEME_IDS) {
      const def = THEME_DEFINITIONS[id]
      expect(def.id).toBe(id)
      expect(def.theme).toBe(THEME_STYLES[id])
      expect(def.master).toBeDefined()
      expect(Array.isArray(def.tags)).toBe(true)
    }
  })

  it("carries the two legacy chrome flags to their owners", () => {
    expect(THEME_DEFINITIONS.enterprise.master.suppressFooterOnCardContent).toBe(true)
    expect(THEME_DEFINITIONS.ink.master.suppressFooterRule).toBe(true)
    expect(THEME_DEFINITIONS.consulting.master).toEqual({})
  })
})

describe("resolveBrand", () => {
  it("returns the style default when no override", () => {
    expect(resolveBrand("ink")).toEqual({ suppressFooterRule: true })
  })
  it("merges IR-level override over the default", () => {
    expect(resolveBrand("ink", { suppressFooterRule: false })).toEqual({ suppressFooterRule: false })
  })
  it("falls back to consulting for unknown ids", () => {
    expect(resolveBrand("nope")).toEqual({})
  })
})
