---
"@liustack/pptfast": minor
---

Every theme now says which cover it wants. Nine themes gain or extend a cover
preference, and `bloom` is declared as a palette variant of `classroom`.

**Covers change on decks that don't pin one, for the second time in this
release — read this with the ink note.** 0.21 reshuffles the cover slot twice
and both land together. The first pass came with the ink redesign: a ninth
cover layout joined the shared pool, which changes the denominator the seeded
picker samples from, so a fixed seed can land somewhere new even though no
existing layout changed. This second pass is the one that gives the change a
reason: the themes that previously expressed no cover preference now express
one, so the picker leans where the theme's own design points. Measured on a
fixed deck across 17 themes × 40 seeds, **281 of 680 cover picks move**, all of
them on the eight themes listed below. **No page other than the cover moves for
any theme**, and no content is dropped, reflowed or truncated by either pass.
Pin `slide.layout` on a cover to hold it exactly.

The eight whose covers move: `enterprise` and `campaign` toward the diagonal
split, `classroom` and `bloom` toward the quiet adaptive header, `luxe` toward
the full-bleed masthead, `heritage` toward the double-ruled editorial masthead,
`terra` toward a left anchor, `ember` toward the diagonal split. `consulting`,
`academic`, `insight`, `ink`, `tech`, `runway`, `journal`, `pulse` and
`vermilion` pick exactly what they picked before. Two checked-in example
previews were re-recorded and both show only a different cover layout.

**`bloom` is now declared as a recolor of `classroom`.** The two share one
structure and differ in palette and decoration, which was already true of the
rendered output and is now written down: they point at the same layout
preferences, so the same deck under either theme picks the same layouts and
differs in color. `bloom` keeps its id, its palette and its own motif, and the
id is never going away. The theme list is still 17 ids; the count that changed
is the number of distinct structures behind them, which is 16.

Two themes' preferences are deliberately inert under the default narrative:
`insight` and `vermilion` were assigned covers that the default `briefing`
narrative already favors, so a deck that names no narrative sees no change from
either. They do pull under the other four narratives.
