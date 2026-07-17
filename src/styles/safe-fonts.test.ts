import { describe, it, expect } from "vitest"
import { BUILTIN_STYLE_IDS } from "@/ir"
import { getTheme } from "./index"
import { resolveFontFace, SAFE_FONTS } from "../svg/fonts"

// The export writes a single resolved fontFace per role. This guards that every
// theme resolves heading/body/mono to a font that ships on a stock Windows, so a
// generated deck never opens with a substituted (and reflowed) font.
describe("themes resolve to Windows-safe fonts", () => {
  for (const id of BUILTIN_STYLE_IDS) {
    it(`${id}: heading, body and mono all resolve into the safe set`, () => {
      const t = getTheme(id)
      const heading = resolveFontFace(t.fonts.heading, "heading")
      const body = resolveFontFace(t.fonts.body, "body")
      const mono = resolveFontFace(t.fonts.mono ?? [], "mono")
      expect(SAFE_FONTS.has(heading.toLowerCase()), `${id} heading=${heading}`).toBe(true)
      expect(SAFE_FONTS.has(body.toLowerCase()), `${id} body=${body}`).toBe(true)
      expect(SAFE_FONTS.has(mono.toLowerCase()), `${id} mono=${mono}`).toBe(true)
    })
  }
})
