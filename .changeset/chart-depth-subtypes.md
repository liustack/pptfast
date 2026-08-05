---
"@liustack/pptfast": minor
---

`chart` grows from 5 subtypes to 9: `scatter`, `area`, `donut`, and `gauge` join `bar`/`line`/`pie`/`funnel`/`dumbbell`. This closes the strongest internal enrichment signal from the benchmark archive, where weak models across independent runs kept inventing these exact chart types by name (scatter and bubble each in 3 runs, area/donut/gauge each in 2) because the subtypes did not exist.

`scatter` plots numeric x-y pairs, and an optional per-point `size` turns it into a bubble chart (one field covering both the scatter and bubble requests). `area` fills a line's region down to the baseline for volume or accumulation emphasis. `donut` is the dedicated ring form of pie, with an optional total printed big in its center (`center_total: true`). `gauge` shows one value's progress toward a target as a filled half-ring with the number centered, over an optional `{ min, max }` range that defaults to 0..100.

The schema stays purely additive: four new `chart_type` values plus the optional `size`, `center_total`, and `gauge` fields, with per-subtype validation (`scatter` requires a numeric x, `gauge` requires a single value) and selection guidance in `chart_type`'s own `.describe()`. `skills/pptfast/SKILL.md` and `SKILL.zh-CN.md` document the new subtypes and the `gauge` vs `kpi_cards` boundary (a single completion metric versus several independent headline numbers) in both languages. The component union itself is unchanged, still 37 types.

`scatter` and `area` are cartesian, so they render axis titles, gridlines, and multi-series legends like `bar`/`line`. `gauge` and `donut` are radial: their arcs emit the same annulus wedge idiom the existing donut already uses, so deck-audit attributes a gauge's centered number and a donut's center total to the ring hole (the page background), never the opaque arc fill, verified by a zero-finding 16-theme contrast sweep. Every one of the five original subtypes stays byte-identical in its rendered output (golden-pinned).
