---
"@liustack/pptfast": patch
---

Validation now emits non-blocking editorial warnings when comparison, citation, or architecture content exceeds its editorial budget, alongside the existing hard geometric limits. Export hardening: the timestamp normalizer is enforced as the final patch in the export chain, and a determinism-seal violation now surfaces loudly instead of being swallowed by media dedupe's error handling.
