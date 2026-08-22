import { describe, expect, it } from "vitest"
import { themeDeck } from "./decks"
import { LEXICONS } from "./lexicon"

const emptyAssets = { images: {} }

describe("themeDeck corpus thicken (gallery r2 D10/D11/D12/D21)", () => {
  const zh = LEXICONS.zh

  it("stage p03 is a two-column timeline plus a companion paragraph", () => {
    const deck = themeDeck("stage", zh, emptyAssets)
    const page = deck.slides[2]!
    expect(page.layout).toBe("two-column")
    expect(page.components.map((c) => c.type)).toEqual(["timeline", "paragraph"])
  })

  it("swiss p03 is a two-column pie plus bullets", () => {
    const deck = themeDeck("swiss", zh, emptyAssets)
    const page = deck.slides[2]!
    expect(page.layout).toBe("two-column")
    expect(page.components[0]?.type).toBe("chart")
    expect(page.components[1]?.type).toBe("bullets")
  })

  it("arena p05 / pulse p06 / runway p08 / heritage p06 carry a companion paragraph", () => {
    const arena = themeDeck("arena", zh, emptyAssets).slides[4]!
    expect(arena.components.map((c) => c.type)).toEqual(["tag_row", "paragraph"])

    const pulse = themeDeck("pulse", zh, emptyAssets).slides[5]!
    expect(pulse.components.map((c) => c.type)).toEqual(["verdict_banner", "paragraph"])

    const runway = themeDeck("runway", zh, emptyAssets).slides[7]!
    expect(runway.components.map((c) => c.type)).toEqual(["callout", "paragraph"])

    const heritage = themeDeck("heritage", zh, emptyAssets).slides[5]!
    expect(heritage.components.map((c) => c.type)).toEqual(["tag_row", "paragraph"])
  })
})
