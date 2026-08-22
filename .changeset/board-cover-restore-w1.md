---
"@liustack/pptfast": minor
---

The cover pool grows by six, and nine themes lock their cover to the face drawn on the design board.

**Covers change on decks that don't pin one.** Registering six new cover layouts changes the denominator the seeded picker samples from, and those nine themes now always pick their locked face. A deck with a fixed seed can land on a different cover than it did in 0.20. Pin `slide.layout` on a cover to hold it exactly.

The six new shared covers are `verdict-index` (verdict heading, optional accent block, up to three numbered arguments), `band-title` (full-width band carrying the reversed title), `header-band` (tone band for meta only, title on paper), `paper-masthead` (giant type on paper, year stacked one glyph per line), `horizon-wedge` (full-width bottom ramp), and `corner-wedge` (lower-right triangular wedge). They read every color through tokens.

`consulting` locks `verdict-index`. `classroom`, `enterprise`, and `vermilion` lock `band-title`. `crayon` locks `header-band`. `runway` locks `paper-masthead`. `pulse` locks `horizon-wedge`. `arena` and `ember` lock `corner-wedge`. Other page types stay on the full set.
