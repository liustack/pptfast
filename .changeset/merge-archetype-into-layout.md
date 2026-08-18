---
"@liustack/pptfast": patch
---

Internal rename only: `archetype` and `layout` were two names for the same
thing, and only `layout` is left. Nothing renders differently — every SVG and
every pptx part comes out byte-for-byte identical, and no golden fixture or
snapshot was re-recorded.

The 36 page templates moved from `src/svg/archetypes/` to `src/svg/layouts/`,
so a layout's registry entry and the JSX that draws it now sit in the same
file, in the same directory. Renamed along the way: `resolveArchetypeId` →
`resolveLayoutId`, `{Cover,Chapter,Content,Ending}Archetype{,Id}` →
`…Layout{,Id}`, `{COVER,CHAPTER,CONTENT,ENDING}_ARCHETYPES` → `…_LAYOUTS`,
`MotifArchetype{,Id}` → `Motif{,Id}`, `MOTIF_ARCHETYPES` → `MOTIFS`.

Not one of those names is an exported symbol — the JS internals carry no semver
promise anyway (`docs/internal-api.md`), and the CLI, the IR schema, the deck
project format and the exported SDK surface are all untouched. The one name
that reaches the emitted `.d.ts` is the alias behind `ThemeDefinition["motif"]`
(`MotifArchetypeId` → `MotifId`): it is not importable and its value union is
unchanged, so nothing a consumer can write breaks.

Two spellings of `archetype` deliberately stayed put, because changing either
would change bytes: the `data-archetype` attribute in rendered SVG, and the
`kind: "archetype"` literal in the layout registry. Both are noted in the code
as fossils awaiting their own change.
