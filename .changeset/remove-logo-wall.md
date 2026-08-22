---
"@liustack/pptfast": minor
---

Breaking: the `logo_wall` component is removed. `pptfast migrate` rewrites leftover `logo_wall` components to `image_grid` (asset_id copied, label becomes caption, extra items past 4 dropped). Validate on a leftover `logo_wall` points at migrate. 37 typed units.
