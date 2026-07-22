---
"@liustack/pptfast": minor
---

Variety wave: the deterministic engine now varies real composition, not just paint.

- Page-level `beat` (anchor / dense / breathing) is a live selection signal — declared beats weight the layout pick (composed with strategy weights via max, never compounding), while decks without beats render byte-identically.
- Theme motifs rotate within style-compatible candidate sets per page and seed instead of one fixed sticker per deck, with a decor-visibility guard, and chart palettes shift phase by deck seed.
- Cover/chapter/ending pages take on the narrative strategy's character through soft selection weights, and pyramid/briefing content tendencies now genuinely differ.
- Three new content archetypes (side-highlight, asymmetric-triptych, quiet-frame) grow the thinnest pool from 7 to 10, raising realized layout entropy and cutting repeat rates.
