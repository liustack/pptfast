---
"@liustack/pptfast": patch
---

Headings no longer overflow in PowerPoint. The width estimator gains exact per-character advance models for the exported faces (Georgia and Microsoft YaHei, both weights, extracted from real font metrics) with a conservative fallback for unmeasured faces — bold headings were previously estimated with regular-weight assumptions and could clip at the slide edge. Nine structure components additionally now pass their heading weight through the fitter.
