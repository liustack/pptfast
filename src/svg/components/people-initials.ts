/**
 * Deterministic initials-badge derivation (people_cards wave, `.issues/
 * 2026-08-05-component-waves/plan-people-cards.md`, 控制器裁定 2 —
 * BINDING). A pure function of `name` alone, no locale/config/seed input,
 * so the same name always earns the same badge letters regardless of
 * theme or render order — list position decides badge *color*
 * (people-cards.tsx's own chartPalette rotation), never the letters.
 *
 * Rules (裁定 2, verbatim):
 * - Latin name, 2+ words: first letter of the first two words ("Sarah
 *   Chen" → "SC"). A 3rd+ word (a middle name, a suffix) never
 *   contributes — only the first two words ever do.
 * - Latin name, 1 word: its own first two letters ("Cher" → "CH").
 * - CJK name: only the first character (surname), never two — "王小明" →
 *   "王", not "王小". This is the ruling's explicit WeChat/DingTalk
 *   precedent: a single CJK character reads as a more natural avatar
 *   initial than two characters forced together.
 * - Mixed script: the *first character's own script* decides which rule
 *   applies — a name starting with a CJK character always takes the
 *   surname-only rule; everything else (Latin, digits, emoji, punctuation)
 *   takes the Latin word-split rule.
 *
 * Deliberately no honorific/title stripping: "Dr. Amara Osei" is authored
 * as one plain `name` string (裁定 1's minimal schema surface has no
 * separate title field), so the word-split rule treats "Dr." as this
 * name's first word like any other, contributing its own first letter to
 * the badge ("DA", not "AO"). `people-initials.test.ts`'s own pathological
 * table pins this intentionally, rather than leaving it an accidental
 * quirk someone "fixes" later without fresh evidence that titles need
 * their own handling.
 */

// CJK Unified Ideographs (the block real Chinese/Japanese/Korean-Han names
// are written with) + Extension A (rarer surname characters). Deliberately
// narrower than svg-text-layout.ts's own `WIDE_CHAR_RE` — that regex also
// matches fullwidth punctuation/forms for *text-width measurement*, a
// different job; this one classifies a character's *script* for the
// initials rule above, so it stays scoped to actual ideographs.
const CJK_IDEOGRAPH_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/

/**
 * First Unicode code point of `s`, handling astral-plane code points
 * (emoji, rarer CJK extension characters) as one grapheme via the
 * iterator protocol — not the first UTF-16 code unit `s[0]` would give,
 * which can be a lone surrogate half of a surrogate pair. Empty string
 * input returns `""`.
 */
function firstCodePoint(s: string): string {
  const step = s[Symbol.iterator]().next()
  return step.done ? "" : step.value
}

/**
 * Derive a 1-2 character initials badge from a person's full `name` — see
 * this file's own header comment for the binding rule set. Returns `""`
 * for an empty/whitespace-only name (the schema requires a non-empty
 * `name`, so no real caller hits this; a defensive floor, not a real
 * case).
 */
export function deriveInitials(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) return ""
  const first = firstCodePoint(trimmed)
  if (CJK_IDEOGRAPH_RE.test(first)) return first
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length <= 1) {
    return [...(words[0] ?? "")].slice(0, 2).join("").toUpperCase()
  }
  const firstLetter = firstCodePoint(words[0])
  const secondLetter = firstCodePoint(words[1])
  return (firstLetter + secondLetter).toUpperCase()
}
