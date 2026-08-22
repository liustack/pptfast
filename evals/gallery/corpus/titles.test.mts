import { describe, expect, it } from "vitest"
import { COMPONENT_BUILDERS } from "./components"
import { LEXICONS } from "./lexicon"
import { THEME_CONTENT_SLOTS } from "./theme-slots"

describe("gallery corpus titles do not collide across components", () => {
  it("people_cards keeps 客户洞察, matrix does not reuse that title", () => {
    for (const lex of Object.values(LEXICONS)) {
      const people = COMPONENT_BUILDERS.people_cards!(lex)
      const matrix = COMPONENT_BUILDERS.matrix!(lex)
      expect(people.type).toBe("people_cards")
      expect(matrix.type).toBe("matrix")
      if (people.type !== "people_cards" || matrix.type !== "matrix") {
        continue
      }
      expect(people.title, lex.id).toBeTruthy()
      expect(matrix.y_title, lex.id).not.toBe(people.title)
      expect(matrix.x_title, lex.id).not.toBe(people.title)
    }
  })

  it("runway theme table no longer assigns matrix", () => {
    const types = THEME_CONTENT_SLOTS.runway.map((s) => s.type)
    expect(types).not.toContain("matrix")
    expect(new Set(types).size).toBe(7)
  })
})
