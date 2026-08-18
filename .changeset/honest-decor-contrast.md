---
"@liustack/pptfast": patch
---

`pptfast audit` now attributes text to the decoration it is actually
painted on. Text sitting on a solid decor shape (a seal, a corner square)
used to be graded against the page background, reporting a passing ratio
for unreadable text; backgrounds are now sampled across the run's own ink
box, and exact-outline decor shapes register as candidates while
crayon-stroke paths stay excluded. Across the full theme matrix this
surfaces 5 real collisions and removes no findings.
