import { describe, expect, it } from "vitest"
import { themeDeck } from "./decks"
import { LEXICONS } from "./lexicon"

const emptyAssets = { images: {} }

describe("themeDeck emphasis form coverage", () => {
  const zh = LEXICONS.zh

  it("authors marked cover, content heading, and bullets only for consulting", () => {
    const consulting = themeDeck("consulting", zh, emptyAssets)
    expect(consulting.slides[0]?.heading).toContain("**业务评审**")
    expect(consulting.slides[2]?.heading).toContain("**新签**")
    const bullets = consulting.slides[3]?.components[0]
    expect(bullets?.type).toBe("bullets")
    if (bullets?.type !== "bullets") throw new Error("consulting gallery p04 must lead with bullets")
    expect(bullets.items[0]).toContain("**九成一**")

    const academic = themeDeck("academic", zh, emptyAssets)
    expect(JSON.stringify(academic.slides)).not.toContain("**")
  })

  it.each(["zh", "en", "mixed"] as const)("authors valid marked copy for the %s corpus", (language) => {
    const consulting = themeDeck("consulting", LEXICONS[language], emptyAssets)
    expect(consulting.slides[0]?.heading).toMatch(/\*\*.+\*\*/)
    expect(consulting.slides[2]?.heading).toMatch(/\*\*.+\*\*/)
    const bullets = consulting.slides[3]?.components[0]
    expect(bullets?.type).toBe("bullets")
    if (bullets?.type !== "bullets") throw new Error("consulting gallery p04 must lead with bullets")
    expect(bullets.items[0]).toMatch(/\*\*.+\*\*/)
  })
})
