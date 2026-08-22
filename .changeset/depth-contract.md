---
"@liustack/pptfast": minor
---

Rendered slides now enforce a three-layer depth contract. Every SVG paints
background, midground decoration, and foreground content in marked `bg`, `mid`,
and `fg` groups. The renderer owns this order, so layouts and motifs no longer
need to coordinate their paint position manually.

Midground paint is capped through the existing decoration contrast budget and
a theme-aware saturation ceiling. Decorative leaves that intersect foreground
content are omitted at the shared layer boundary. Ghost indices are moved until
their complete glyph boxes sit inside the slide.

Gallery L1 now reports malformed depth order, midground paint at or above the
shared 3:1 ceiling, midground text bleeding off canvas, and isolated small
stroked decoration. Four planted fixtures hold those checks.

Serialized SVG changes on every slide because the three depth groups are part
of the output contract. Decorative pixels can also change when the new budget,
collision retreat, or glyph containment rules apply.
