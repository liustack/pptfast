---
"@liustack/pptfast": minor
---

Ten remaining themes lock their cover to the face drawn on the design board. Existing cover layouts gain optional knobs. No new cover layout ids.

**Covers change on decks that don't pin one.** Those ten themes now always pick their locked face, and six of them stop rotating motifs. A deck with a fixed seed can land on a different cover, and a different decoration, than it did in 0.20. Pin `slide.layout` on a cover to hold it exactly.

`academic` locks `left-anchor`. `campaign`, `insight`, `luxe`, and `museum` lock `poster-center`. `tech` locks `constellation`. `journal` and `heritage` lock `editorial-masthead`. `ink` locks `colophon`. `terra` locks `tone-adaptive-header`. Motif rotation collapses to the board motif for academic, insight, tech, luxe, journal, and heritage. Chapter and ending stay on the full set.
