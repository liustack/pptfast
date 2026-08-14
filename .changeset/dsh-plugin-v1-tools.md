---
"@liustack/pptfast": minor
---

DSH plugin v1: three model-facing tools on top of the v0 skill registration, calling the packaged render core in-process (no subprocess, no npx).

- `pptfast_validate` — deck IR JSON in; slide count + theme out, or a short path-annotated fix list (capped, never a raw zod error tree).
- `pptfast_render` — deck IR JSON (+ optional `theme`/`seed`/`out_dir`) in; a native editable `.pptx` in the session workspace plus one preview SVG per page out. Deterministic: same IR + theme + seed reproduces the same bytes. Best-effort in-session preview: when the resolved model route declares image input, the first page is rasterized (sharp, optional dependency) and attached through the DSH attachment service; everywhere else it degrades to the on-disk SVG paths.
- `pptfast_themes` — the 17 built-in themes, each with a one-line character note distilled from its own definition.

The injected DSH skill preamble now points the model at the tools first (CLI stays the fallback), and the skill teaches the `pptfast serve --no-open` live review loop (background job, report the localhost URL, route `revision-request.json` back through the revision flow, stop the job when done).
