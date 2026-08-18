---
"@liustack/pptfast": patch
---

`pptfast audit` no longer reports the organization name on a `split-diagonal`
cover as low-contrast. The name is meta-information, the same tier as a
copyright line or a page number, so its floor is 3:1 rather than the 4.5:1
body floor it was being held to. On the `insight` theme the difference decided
the verdict: the adaptive dark ink over `#E63946` measures 4.41:1, which was
reported as a finding and is not one. Sixteen of seventeen themes cleared both
floors and were never affected.

The rendered color is unchanged on every theme — the fill opacity is now folded
into the fill itself, which composites to the same pixels and lets the auditor
read the color the page actually paints.
