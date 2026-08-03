---
"@liustack/pptfast": minor
---

`assets.images[].alt` now flows all the way to the exported PPTX: an `image` component whose asset has `alt` text exports it as the shape's standard accessibility description (`p:cNvPr@descr`, what PowerPoint's "Edit Alt Text" reads and writes). An asset with no `alt` exports byte-for-byte unchanged. The package audit gains a matching hard-gate rule (`image-alt-dropped`) that fails the export if an IR alt somehow doesn't make it into the package, and `pptfast asset-brief` items now carry `alt` alongside their other per-asset fields when the source asset has one.

Scoped to the `image` component this round — `image_grid`/`image_compare` and background asset specs already carry `alt` through the same resolved-asset map but don't yet emit it, a natural follow-up of the same shape.
