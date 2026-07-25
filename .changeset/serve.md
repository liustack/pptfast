---
"@liustack/pptfast": minor
---

`pptfast serve <target> [--port 4400] [--no-open]`: a live-reloading browser preview for deck project directories and bare IR files, serving the exact same review page `pptfast preview --html` writes to disk. Source changes (`deck.spec.json`/`pages/`/`assets/`, or the bare IR file itself) push a whole-page reload to the open tab over SSE, with a recoverable error banner in place of a crash on a mid-edit invalid save. The page's annotation panel now submits straight back to the deck directory as `revision-request.json` — the same file the download flow already produces, byte-for-byte — closing the agent↔human revision loop without manual file shuttling.
