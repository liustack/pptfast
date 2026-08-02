---
"@liustack/pptfast": patch
---

Fixed two contrast defects and formalized the policy that catches their class going forward.

Ending-page copyright lines (`banner-ending`/`rail-ending`) now derive their color from the theme's own `colors.muted` through a new `metaInk` helper, replacing two hardcoded cross-theme gray constants that could render unreadable on a theme those constants never accounted for. Copyright text carries a `data-contrast-tier="meta"` marker so the audit checks it against a 3:1 floor instead of full body text's 4.5:1, since meta-information text like a copyright line is real content a reader can look up on demand, not decoration, but is deliberately understated.

`constellation-ending`'s trailing heading period now falls back to the heading's own ink when the accent color it used to render in doesn't clear contrast against the page background, closing a case where the period could render nearly invisible. A new stress-fixture variant exercises a period-ending heading (closing an overflow-coverage blind spot no fixture ever triggered), while the contrast regression itself is locked by a dedicated 16-theme sweep in `deck-audit.test.ts`.

`docs/contrast-system.md` documents the resulting three-tier contrast policy (content text, meta-information text, pure decoration) that governs both fixes and every future low-contrast call.
