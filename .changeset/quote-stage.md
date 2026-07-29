---
"@liustack/pptfast": minor
---

A new `pinOnly` layout tier and its first member, `quote-stage`: a thesis/quote page where a single oversized heading is the entire visual, with at most one short attribution component (capacity 1). Pin-only layouts never appear through auto-selection — set `layout: "quote-stage"` explicitly on a content page to use one, the same way an image takeover is opted into today.

Two new `validate` hard errors, scoped strictly to pin-only layouts: `pin_only_over_capacity` fires when a pinned pin-only layout carries more components than its declared capacity (an ordinary layout pinned over capacity still only warns, unchanged), and `pinned_heading_overflow` fires when a pinned layout's heading still truncates at its minimum render size (quote-stage is the only layout that declares this check today). Both point to splitting the content or removing the pin.

Layout registry count: 35 archetypes to 36 (35 auto-selectable + 1 pin-only) + 4 image takeovers.
