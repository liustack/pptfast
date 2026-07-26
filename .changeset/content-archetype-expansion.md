---
"@liustack/pptfast": minor
---

Two new content archetypes: `image-lead-split` (an unconditional 60/40 visual/text column split — the pool's first genuinely unequal, co-equal-column composition) and `split-band` (a full-bleed horizontal header band over an ordinary body band — the pool's first horizontal split; every other content archetype divides the page into vertical columns or not at all). Both reuse existing letterbox-scaling, contrast, and audit machinery rather than introducing new mechanisms.

The content archetype pool grows from 10 to 12. Both new archetypes are wired into auto-selection's existing beat and strategy weighting: `split-band`'s full-bleed header is an `anchor`-beat member (the same "banner rect is the heading" register as `banner-heading`), and `image-lead-split`'s narrow text column paired with a co-equal visual column is a `breathing`-beat member (the same "spacious by construction" trait `narrow-column` already has). Neither joins any narrative strategy's own layout tendencies — both are deliberately strategy-neutral, the same treatment `tone-adaptive-content` gets, since their defining traits (asset availability, chrome/visual weight) aren't tied to one argument style over another.

Practical impact: a deck's automatic layout selection reads from the theme's whole content pool with weighted sampling, so growing that pool from 10 to 12 members changes the realized pick distribution for existing decks that don't pin an explicit `layout` — the same kind of shift each previous content-pool growth wave has shipped as a minor bump. Decks that pin `layout` explicitly are unaffected.
