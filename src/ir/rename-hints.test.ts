import { describe, expect, it } from "vitest"
import { isSlideLevelPath, renameHintsFor, SLIDE_LEVEL_UNKNOWN_KEY_HINT } from "./rename-hints"

describe("renameHintsFor", () => {
  it("hints blocks -> components at slide level", () => {
    expect(renameHintsFor(["blocks"], "slides.2")).toEqual([' — "blocks" was renamed to "components" in IR v4'])
  })

  it("hints variant -> layout/arrangement at slide level", () => {
    expect(renameHintsFor(["variant"], "slides.0")).toEqual([
      ' — "variant" was split into "layout" and "arrangement" in IR v4',
    ])
  })

  it("hints theme.override -> theme.style scoped to the theme path", () => {
    expect(renameHintsFor(["override"], "theme")).toEqual([' — "theme.override" was renamed to "theme.style" in IR v4'])
  })

  it("does not hint override outside the theme path", () => {
    expect(renameHintsFor(["override"], "slides.0")).toEqual([])
  })

  it("does not hint blocks outside a slide path", () => {
    expect(renameHintsFor(["blocks"], "theme")).toEqual([])
    expect(renameHintsFor(["blocks"], "")).toEqual([])
  })

  it("returns nothing for a key with no known rename", () => {
    expect(renameHintsFor(["items"], "slides.2")).toEqual([])
    expect(renameHintsFor(["colour"], "theme")).toEqual([])
  })

  it("handles multiple offending keys in one issue, hinting only the ones with a match", () => {
    expect(renameHintsFor(["blocks", "items"], "slides.1")).toEqual([' — "blocks" was renamed to "components" in IR v4'])
  })
})

describe("isSlideLevelPath / SLIDE_LEVEL_UNKNOWN_KEY_HINT", () => {
  it("recognizes a bare slide path", () => {
    expect(isSlideLevelPath("slides.2")).toBe(true)
    expect(isSlideLevelPath("slides.0")).toBe(true)
  })

  it("rejects a nested (component-level or deeper) path", () => {
    expect(isSlideLevelPath("slides.2.components.0")).toBe(false)
    expect(isSlideLevelPath("theme")).toBe(false)
    expect(isSlideLevelPath("")).toBe(false)
  })

  it("the generic hint names components[] and pptfast schema", () => {
    expect(SLIDE_LEVEL_UNKNOWN_KEY_HINT).toMatch(/components\[\]/)
    expect(SLIDE_LEVEL_UNKNOWN_KEY_HINT).toMatch(/pptfast schema/)
  })
})
