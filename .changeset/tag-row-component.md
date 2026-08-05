---
"@liustack/pptfast": minor
---

New component `tag_row` (the 38th): a wrapping row of 2-16 short label pills — a technology stack, a capability or skill set, a keyword set, the certifications a vendor holds. It closes the strongest clean gap in the internal invented-name evidence, where weak models across independent benchmark runs kept reaching for this exact component by name (`tag`/`pill` each in 2 runs, `chips`/`badge` each in 2, plus `chip_row`) and, finding nothing, either buried the labels in `bullets` or burned a whole slide brute-forcing dozens of non-existent type names. It is named after the models' own most-guessed name, the same way `logo_wall` was.

Each item is a plain short string with a hard 24-character cap (a tag is a label, not a sentence — over the cap, validation points the author at `bullets` for a prose list or `row_cards`/`icon_cards` for items that carry their own description). An optional overall `title`, and an optional `emphasis: "first"` that draws the first tag in the theme accent as the primary one among the rest (the same field and semantics as `image_grid`).

Rendering reuses existing machinery only: pills flow-wrap using the codebase's exact per-character width model, so a CJK/Latin-mixed label ("基于 Kubernetes Operator") is measured and wrapped correctly, and one uniform font size is picked as the largest that fits the height budget, with a single over-long tag truncated rather than allowed to overflow. A default pill is `colors.surface` with `colors.text` ink; the emphasized pill is `colors.accent` with a readable ink — both text colors clear WCAG 4.5:1 against their own pill on all 16 built-in themes (verified by a zero-finding contrast sweep), so the component renders no low-key `colors.muted` text and needs no contrast exception.

`skills/pptfast/SKILL.md` and `SKILL.zh-CN.md` document the `tag_row` vs `bullets`/`row_cards`/`icon_cards` boundary (short labels versus described items versus a prose list) in both languages. The change is purely additive — one new component in the union, no change to any existing component's schema or rendered output.
