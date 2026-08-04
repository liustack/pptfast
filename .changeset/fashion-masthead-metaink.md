---
"@liustack/pptfast": patch
---

`fashion-masthead` (the runway cover archetype)'s org/date meta line now derives its ink through `metaInk` and carries `data-contrast-tier="meta"`, closing a leftover from the contrast-policy wave. It guarantees the B-tier 3:1 contrast floor against the primary block it actually paints on every theme — including `insight`, where the previous fixed-opacity dimming measured 2.886:1, a real miss no existing test caught. 15 of 16 themes render byte-identical output; `insight`'s meta line ink changes from `#621f28` to `#591d26`. The now-redundant `tech`/`fashion-masthead` contrast-audit allowlist entry is removed.
