import { describe, expect, it } from "vitest"
import { layoutPage, themeDeck } from "./decks"
import { LEXICONS } from "./lexicon"

const emptyAssets = { images: {} }

describe("enterprise icon_cards slot", () => {
  it("pins two-column and keeps three cards so body text stays on the 12px floor", () => {
    const page = themeDeck("enterprise", LEXICONS.zh, emptyAssets).slides[4]!
    expect(page.layout).toBe("two-column")
    expect(page.components[0]?.type).toBe("icon_cards")
    if (page.components[0]?.type !== "icon_cards") throw new Error("expected icon_cards")
    expect(page.components[0].items).toHaveLength(3)
  })
})

describe("stat-cover corpus heading", () => {
  it("authors a KPI, not the deck title, on the insight theme cover and the layout table", () => {
    for (const lex of [LEXICONS.zh, LEXICONS.en, LEXICONS.mixed]) {
      const kpi = `${lex.metrics[1]!.value}${lex.metrics[1]!.unit ?? ""}`
      expect(themeDeck("insight", lex, emptyAssets).slides[0]!.heading).toBe(kpi)
      expect(layoutPage("stat-cover", lex, emptyAssets).slides[0]!.heading).toBe(kpi)
      expect(layoutPage("left-anchor", lex, emptyAssets).slides[0]!.heading).toBe(lex.deckTitle)
    }
  })
})
