---
"@liustack/pptfast": patch
---

Audit and text-fit correctness fixes. A component whose type bypasses `validateIr` (a hand-built or type-cast-but-invalid render input) now throws a named `PptfastError` pointing at `validateIr` instead of a bare `TypeError`. `matrix`'s grid cells now each carry their own audit box, so column overflow is visible to `pptfast audit` in every column, not only the last. Text painted over a gradient-filled `<polygon>` (e.g. a line chart's area fill) is now routed into the same real-pixel-sampling audit path solid shapes already get, instead of silently comparing against whatever color happens to sit underneath. Ellipsis truncation of mixed CJK/Latin text no longer cuts a Latin or digit run in the middle — the whole run now yields to the ellipsis, matching how such runs already wrap as one atomic unit.
