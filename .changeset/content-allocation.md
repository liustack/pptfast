---
"@liustack/pptfast": minor
---

Every theme now says which chapter, content, and ending layouts it wants, not just which cover.

**Pages without an explicit `slide.layout` will change on non-cover slides.** The cover slot does not move. On a fixed seven-page deck across 24 structural identities and 40 seeds, 4278 of 6720 picks move, all of them off the cover. Pin `slide.layout` on a page to hold it exactly.

A default-narrative deck at seed=1 now resolves 23 distinct layout sequences instead of 11. The one remaining collision is `enterprise` with `classroom` (same sequence, different palettes). Across 40 seeds every identity is distinct.

`playbill` still ships the full layout set. Its content preference names three poster-like layouts so short event decks lean that way without closing the pool.

`tech`'s chapter preference and `pulse`'s ending preference were previously invisible under the default narrative (they named only layouts that narrative already favored). Both now name a second layout the default narrative does not already favor.
