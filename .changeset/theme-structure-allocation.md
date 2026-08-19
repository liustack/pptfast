---
"@liustack/pptfast": minor
---

Every theme now says which cover it wants. Ten themes gain or extend a cover
preference, and `bloom` is declared as a palette variant of `classroom`.

**Covers change on decks that don't pin one — read this with the ink note.**
0.21 moves the cover slot for two reasons that land together. The ink redesign
added a ninth cover layout to the shared pool, which changes the denominator
the seeded picker samples from, so a fixed seed can land somewhere new even
though no existing layout changed. This change is the one that gives the move a
reason: themes that previously expressed no cover preference now express one,
so the picker leans where the theme's own design points. Measured on a fixed
deck across 17 themes × 40 seeds, **351 of 680 cover picks move**, all of them
on the ten themes listed below. **No page other than the cover moves for
any theme**, and no content is dropped, reflowed or truncated by either pass.
Pin `slide.layout` on a cover to hold it exactly.

The ten whose covers move: `enterprise` and `campaign` toward the diagonal
split, `classroom` and `bloom` toward the quiet adaptive header, `luxe` toward
the full-bleed masthead, `heritage` toward the double-ruled editorial masthead,
`terra` toward a left anchor, `ember` toward the diagonal split, `insight`
toward the editorial masthead and `vermilion` toward the tone-adaptive header.
`consulting`, `academic`, `ink`, `tech`, `runway`, `journal` and `pulse` pick
exactly what they picked before. Four checked-in example previews were
re-recorded and every one shows only a different cover layout.

**`bloom` is now declared as a recolor of `classroom`.** The two share one
structure and differ in palette and decoration, which was already true of the
rendered output and is now written down: they point at the same layout
preferences, so the same deck under either theme picks the same layouts and
differs in color. `bloom` keeps its id, its palette and its own motif, and the
id is never going away. The theme list is still 17 ids; the count that changed
is the number of distinct structures behind them, which is 16.

Because the theme, narrative and beat preferences combine by taking the
strongest rather than by multiplying, a theme that names only covers the active
narrative already favors adds nothing at all. `insight` and `vermilion` shipped
that way in this branch's first pass and are corrected here: `insight` now also
leans toward the double-ruled editorial masthead, `vermilion` toward the
tone-adaptive header, and both are visible to a deck that names no narrative.
A test now holds every theme to it, so a future preference that would flatten to
nothing fails at build time instead of shipping silently.
