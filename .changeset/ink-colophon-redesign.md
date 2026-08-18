---
"@liustack/pptfast": minor
---

The ink theme is redesigned around a right-edge colophon, and every theme's
cover pool grows by one.

**Covers change on decks that don't pin one — read this first.** Registering a
ninth cover layout changes the denominator the seeded picker samples from
(`weightedPickBySeed` chooses by `hash % totalWeight`), so a deck with a fixed
seed can land on a different cover than it did in 0.20. Measured across all 17
themes × 40 seeds: **505 of 640 cover picks move**. Nothing outside the cover
slot moves for any theme except ink, which changed on purpose. This is not
specific to the new layout — any future addition to the cover pool does the
same thing, and the nine themes that still declare no cover preference will be
re-drawn again when they get one. Pin `slide.layout` on a cover to hold it
exactly. Three consequences of this ship in the repo itself: the v3→v4
equivalence goldens and the checked-in example previews were re-recorded, and
in both cases the only difference is which cover layout was selected — no
slide other than the cover changed, no content was dropped or truncated, and
the audit findings are identical on both sides.

**ink**: lighter paper and a warmer, blacker ink (`bg` `#F5F0E6` → `#F7F2E7`,
`primary` `#2B2B2B` → `#1F1C18`, plus `surface`/`border`/`chartPalette` and a
wider whitespace scale). Its decoration is now two marks instead of five: a
vertical colophon down the right edge — the organization set one character per
line, the year and month below it in Chinese numerals, a vermilion seal at the
foot — and a single faint ridge in the bottom-left corner of covers and chapter
pages. The full-width frame rules, the layered distant mountains, and the old
seal that collided with the bottom-right logo box are gone; that collision (a
date measured at 1.07:1 against the seal) is fixed by the move.

Because the colophon carries the organization and the date, ink's content pages
no longer repeat them in the footer. Two costs come with that, both deliberate:
the confidentiality label and version number live only in that footer row, so
they no longer appear on ink content pages; and the colophon column holds 11
characters (17 when the deck sets no date), so a longer organization name is
truncated and reported by `pptfast audit` as `content-truncated`. That limit
excludes ordinary names — `Meridian Analytics`, `北京云帆科技有限责任公司` —
because a per-character vertical column is a short-CJK-signature idiom. Set
`theme.brand.suppressFooterMeta: false` in the IR to take the footer row back.

**New cover layout, `colophon`**, available to every theme: a left-axis heading
flagged by a narrow accent block, a wide-tracked organization line, a
subheading, and a byline in the bottom-left corner, with the right 100px of the
page kept clear for a side rail.

**New theme brand flag**, `suppressFooterMeta`: skips the footer's
organization/confidentiality/version/date row on content slides, for themes
whose decoration already carries that information. Independent of the existing
`suppressFooterRule`; unset on every other theme, whose output is unchanged.
