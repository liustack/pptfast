---
"@liustack/pptfast": minor
---

`pptfast asset-brief <target> [--json]` and the SDK function it wraps, `buildAssetBrief(ir)`: an image-generation brief for every `image` component in a deck. Each entry carries the component's real rendered frame (x/y/w/h + aspect ratio, extracted from an actual off-screen render pass — never a hand-copied layout constant, so it can't drift from what the renderer actually draws), its fit/crop mode with a safe-zone note, suggested generation pixels (2× the frame), the resolved theme's palette and mood, and a paste-ready English prompt. An `asset_id` with no usable asset yet still gets a full entry (`missing: true`) — the deck's own generation to-do list — and a component the selected layout never actually draws is reported as `rendered: false` instead of silently dropped.

Purely informational (no exit-code gate, same posture as `pptfast validate`'s placeholder note) and zero renderer changes — the brief's geometry extraction runs against an in-memory IR copy with a dummy asset injected for whichever `asset_id`s the render pass needs, never the caller's own `ir` or the real export path. v1 covers `image` components only; `image_grid`/`image_compare` and `background` asset specs are a natural v2 extension of the same shape.
