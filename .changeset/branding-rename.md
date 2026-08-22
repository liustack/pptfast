---
"@liustack/pptfast": minor
---

Breaking rename: the deck and spec field `chrome` is now `branding`. Values are unchanged (`full` / `cover-only` / `minimal`). Layout-declared `branding: "none"` replaces `chrome: "none"`. `pptfast migrate` rewrites the old field on v4 IR and on deck specs. Both fields at once is a hard error. `validateIr` and `validateSpec` still accept `chrome` as an alias when `branding` is absent.
