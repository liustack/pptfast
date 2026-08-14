---
"@liustack/pptfast": patch
---

Three `pptfast_render` fixes from the DSH plugin v1 acceptance review:

- The tool no longer declares itself concurrency safe. Parallel calls sharing an `ir.filename` wrote the same `.pptx` and preview directory, so at least one reported result pointed at a file it did not produce. DSH now serializes render calls. `pptfast_validate` and `pptfast_themes` write nothing and stay parallel-safe.
- An existing `.pptx` extension on `ir.filename` is stripped (case insensitively) before the output extension is appended. The documented `"filename": "hello.pptx"` now writes `hello.pptx` instead of `hello.pptx.pptx`, and the preview directory stem follows suit.
- The deck's preview directory is cleared before each render, so re-rendering a shorter deck at the same path no longer leaves stale SVG pages from the previous round. "One preview SVG per page" is literally true again.
