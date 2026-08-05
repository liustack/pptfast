import { describe, expect, it } from "vitest"
import { deriveInitials } from "./people-initials"

// people_cards wave (`.issues/2026-08-05-component-waves/
// plan-people-cards.md`, 控制器裁定 2 — BINDING): pathological table for
// the pure initials-derivation function, independent of any component
// rendering. Every case here is a direct transcription of 裁定 2's rule
// set, not a re-derivation — a change to any of these expected values is a
// ruling change, not a bug fix.
describe("deriveInitials", () => {
  describe("Latin names, 2+ words — first letter of the first two words", () => {
    it.each([
      ["Sarah Chen", "SC"],
      ["Liam Foster", "LF"],
      ["Tomás Rivera", "TR"],
      ["Ren Watanabe", "RW"],
    ])("%s → %s", (name, expected) => {
      expect(deriveInitials(name)).toBe(expected)
    })

    it("only the first two words contribute — a 3rd+ word (middle name/suffix) is ignored", () => {
      expect(deriveInitials("Ren Estelle Watanabe")).toBe("RE")
      expect(deriveInitials("Marcus James Webb Jr")).toBe("MJ")
    })

    it("collapses repeated internal whitespace before splitting into words", () => {
      expect(deriveInitials("  Liam    Foster  ")).toBe("LF")
    })
  })

  describe("Latin names, single word — its own first two letters", () => {
    it.each([
      ["Cher", "CH"],
      ["Madonna", "MA"],
    ])("%s → %s", (name, expected) => {
      expect(deriveInitials(name)).toBe(expected)
    })

    it("a single-letter name returns just that one letter (nothing to pad with)", () => {
      expect(deriveInitials("X")).toBe("X")
    })
  })

  describe("CJK names — surname only (first character), never two", () => {
    it.each([
      ["王小明", "王"],
      ["李雷", "李"],
      ["欧阳娜娜", "欧"], // compound surname: still only the first character, per 裁定 2
    ])("%s → %s", (name, expected) => {
      expect(deriveInitials(name)).toBe(expected)
    })

    it("a single-character CJK name returns that one character", () => {
      expect(deriveInitials("王")).toBe("王")
    })
  })

  describe("mixed script — the first character's own script decides the rule", () => {
    it("a name starting with a CJK character takes the surname-only rule, ignoring trailing Latin", () => {
      expect(deriveInitials("李Bruce")).toBe("李")
    })

    it("a name starting with a Latin character takes the word-split rule, even with trailing CJK in the same token", () => {
      // No internal space -> one "word" under the Latin rule -> first two
      // *characters* of that token, which happen to be plain Latin here.
      expect(deriveInitials("Bruce李")).toBe("BR")
    })
  })

  // 裁定 2's own named pathological cases: a titled name (no honorific
  // stripping — 裁定 1 has no separate title field) and an emoji-prefixed
  // name. Both document *intentional*, current behavior — not a defect to
  // silently "fix" without fresh evidence a title/emoji needs special
  // handling.
  describe("pathological: titled name (no honorific stripping)", () => {
    it("treats a leading honorific as this name's own first word", () => {
      // p12 probe evidence's real speaker name, verbatim.
      expect(deriveInitials("Dr. Amara Osei")).toBe("DA")
    })

    it("same for other common honorifics — the word-split rule doesn't special-case any of them", () => {
      expect(deriveInitials("Prof. Jane Doe")).toBe("PJ")
      expect(deriveInitials("Mr. John Smith")).toBe("MJ")
    })
  })

  describe("pathological: emoji-prefixed name", () => {
    it("treats a leading emoji as its own first word (an astral-plane code point, not a surrogate half)", () => {
      expect(deriveInitials("\u{1F600} Alex Kim")).toBe("\u{1F600}A")
    })
  })

  describe("edge cases", () => {
    it("returns an empty string for an empty/whitespace-only name (defensive floor — schema requires non-empty name)", () => {
      expect(deriveInitials("")).toBe("")
      expect(deriveInitials("   ")).toBe("")
    })

    it("is a pure function — repeat calls on the same input return the same output", () => {
      expect(deriveInitials("Sarah Chen")).toBe(deriveInitials("Sarah Chen"))
    })
  })
})
