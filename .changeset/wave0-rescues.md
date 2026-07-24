---
"@liustack/pptfast": patch
---

Icon names now also accept `alert-circle` and `alert-triangle` — the older lucide-react spellings some AI agents still write from pre-training habit — resolving to the same icons as their current names (`circle-alert`/`triangle-alert`). The top-level `narrative` field also now accepts an `{id: "<preset>"}` object shape (e.g. `narrative: {id: "training"}`) as an alternate way to write a bare preset-name string, matching the `theme: {id: "..."}` shape already used elsewhere in the schema; validate/render prints a rewrite note when this rescue fires, the same way field-name synonym rescues already do. The exported `resolveNarrative` SDK function itself also tolerates the `{id}` shape now, silently — a direct SDK caller bypassing validate gets the rescue without a note. A narrative object that mixes `id` with an axis field (`strategy`/`pacing`/`audience`) is unchanged — still a hard validation error, since that combination is genuinely ambiguous.

The published `package.json` now declares `"sideEffects": false`, letting consumer bundlers tree-shake unused modules aggressively — verified safe: the package has no bare side-effect imports and platform installation is always an explicit function call.
