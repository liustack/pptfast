---
"@liustack/pptfast": patch
---

The `playbill` theme no longer draws its top-right black ticket chip. On the
design board that patch carried a date, a motif may not carry content, and the
empty block that landed instead was decoration for its own sake. `playbill`
joins `runway`, `museum`, and `stage` as a theme with no motif at all. Its
heavy register now rests on the full-bleed yellow field and the 1.3 type scale.

Content pages also sit closer to the heading above them. The air a settled
block may take above itself is capped at one designed block gap instead of two,
and `banner-heading` uses that same beat between its banner and its body. A
single-table page that used to leave about 94px of blank between the banner and
the first table row now leaves about 60px. The 38% golden share is unchanged,
and so is the rule that leftover height sinks below the block rather than above.
