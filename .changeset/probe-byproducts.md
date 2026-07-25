---
"@liustack/pptfast": patch
---

Two correctness fixes surfaced as byproducts of the probe evidence-gate analysis. `architecture` gained an optional `direction: "top_down" | "bottom_up"` field (default `top_down`, byte-compatible with today's rendering) — a bottom-up-authored narrative (e.g. a maturity ladder written low-to-high) can now be set to `direction: "bottom_up"` to paint right-side up instead of requiring the array to be hand-reversed. `comparison` now hard-errors at validate time when a row has more `cells` than declared `columns` — that shape previously parsed successfully but silently dropped the extra cell(s) at render, which lost real content; a row with fewer cells than columns is unchanged (still renders an empty cell).
