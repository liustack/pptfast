import { describe, expect, it } from "vitest"
import { CANONICAL_STYLE_IDS, THEME_TOKENS } from "./index"
import { STYLE_DEFINITIONS, resolveMaster } from "./styles"

describe("STYLE_DEFINITIONS", () => {
  it("covers all 13 canonical ids with theme tokens and master", () => {
    for (const id of CANONICAL_STYLE_IDS) {
      const def = STYLE_DEFINITIONS[id]
      expect(def.id).toBe(id)
      expect(def.theme).toBe(THEME_TOKENS[id])
      expect(def.master).toBeDefined()
      expect(Array.isArray(def.tags)).toBe(true)
    }
  })

  it("carries the two legacy chrome flags to their owners", () => {
    expect(STYLE_DEFINITIONS.enterprise.master.suppressFooterOnCardContent).toBe(true)
    expect(STYLE_DEFINITIONS.ink.master.suppressFooterRule).toBe(true)
    expect(STYLE_DEFINITIONS.consulting.master).toEqual({})
  })
})

describe("resolveMaster", () => {
  it("returns the style default when no override", () => {
    expect(resolveMaster("ink")).toEqual({ suppressFooterRule: true })
  })
  it("merges IR-level override over the default", () => {
    expect(resolveMaster("ink", { suppressFooterRule: false })).toEqual({ suppressFooterRule: false })
  })
  it("falls back to consulting for unknown ids", () => {
    expect(resolveMaster("nope")).toEqual({})
  })
})
