---
"@liustack/pptfast": minor
---

Five seventh-wave themes now lock their cover to the design-board composition, and the cover pool grows by four.

**Covers change on decks that don't pin one.** Registering four new cover layouts changes the denominator the seeded picker samples from, so a deck with a fixed seed can land on a different cover than it did in 0.20. Pin `slide.layout` on a cover to hold it exactly.

`stage` reuses `poster-center` (its type scale already does the giant keynote type). `lecture`, `swiss`, `memo`, and `playbill` each get a new shared cover: `board-head` (chalkboard serif, chalk stroke), `institutional-block` (left giant type, accent signature block), `memo-head` (MEMORANDUM eyebrow, double rules, last-word underline), `bill-head` (bleed display type, thick baseline). Each of those five themes now curates only that one cover. Other page types stay on the full set.

The four new layouts join the shared pool. They read every color through tokens. `playbill`'s date chip stays in the motif, not the layout. `memo`'s edge MEMORANDUM steps off the cover so it does not print twice.
