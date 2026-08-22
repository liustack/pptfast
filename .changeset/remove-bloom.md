---
"@liustack/pptfast": minor
---

Breaking: the bloom theme id is removed. `pptfast migrate` rewrites IR `theme.id` and spec `theme` `"bloom"` to `"classroom"`. Validate on a leftover bloom id points at migrate. 24 built-in themes, 24 ids.
