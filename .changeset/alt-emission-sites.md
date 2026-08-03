---
"@liustack/pptfast": patch
---

`assets.images[].alt` now flows to the exported PPTX `descr` from every remaining `<image>` emission site, closing out the A11Y-01 alt chain: the 4 image-takeover layouts (`image-split`/`image-top`/`image-annotate`/`image-bottom`, previously bypassed the generic `image` component entirely), `image_grid` (each cell's own asset), `image_compare` (each side's own asset), and asset-kind slide backgrounds. An asset with no `alt` still exports byte-for-byte unchanged at every one of these sites. The `image-alt-dropped` package-audit rule is widened to match, now also checking `image_grid`/`image_compare`/background asset bindings, not just `image`-type components.
