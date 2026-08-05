---
"@liustack/pptfast": minor
---

Add `vermilion`, the 17th built-in theme — a solemn official-report register (工作汇报 / 述职 / 年度总结) and the first theme designed Chinese-first. Vermilion red primary (`#C8102E`) + gold accent (`#D4A017`) on a warm off-white ground, a SimSun masthead heading, and square, restrained `radius: 2` corners.

The red identity lives where the contrast architecture allows it: chapter pages are full-bleed vermilion with white headings picked by `readableOn`, while cover/content/ending stay warm off-white so the shared `text`/`muted` tokens clear the registration-time contrast floor (a red cover would force light text tokens that then fail on the light content pages). The cover still reads red-and-gold through its structural archetypes and the new `vermilion-motif` — flag-like ribbon arcs plus a fan of gold rays, deliberately abstract with no political symbols.

`vermilion` declares its own `layoutTendencies` (chapter `banner-chapter` + `rail-chapter`, ending `rail-ending`) so its official-report structure — the red section divider, the progress rail, the structured contact close — reads distinctly from every other theme. Every other built-in renders byte-identically to before.
