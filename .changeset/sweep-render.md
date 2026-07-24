---
"@liustack/pptfast": patch
---

Chart export and text-wrap correctness fixes.

- A dumbbell row whose `from`/`to` values were nearly (but not bit-exactly) equal at large magnitude could throw during export — the connector's sub-pixel delta rounded to zero EMU and tripped the package-integrity gate for the whole deck, not just that row. The zero-length floor now triggers whenever both axes round to zero EMU, not only on bit-exact equality. Dumbbell's value labels (`from.y`/`to.y`) also now shrink/truncate to fit their box instead of rendering unbounded.
- A heading that fuses an English/digit run directly onto CJK text with no space (a common bilingual idiom) could have that run split mid-character once the line ran out of room, with no visible truncation marker. Wrapping now treats such a run as one atomic unit — CJK's own line-breaking convention — and prefers a smaller, split-free font over a mid-run cut whenever one exists within the heading's own size floor.
- Text painted over a gradient-filled shape was previously checked against whatever solid color happened to sit underneath in the contrast audit, instead of the gradient it was actually rendered on. It now routes through the same real-pixel-sample fallback a background photo already gets.
