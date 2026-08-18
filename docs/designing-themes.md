---
summary: 'Hard constraints for designing a theme visually (canvas, vector language, tokens, contrast, decoration safe zones) and what a finished design must hand back'
read_when:
  - designing or redesigning a theme, motif, or layout visually (human or design agent)
  - translating an approved visual design into theme/motif/layout code
  - deciding whether a design idea can survive the SVG -> PPTX conversion
---

# Designing themes

This is the contract between a visual design (drawn in any tool, by a
person or a design agent) and what pptfast can actually compile into a
native, editable PowerPoint deck. A design that breaks a hard constraint
is not a design for this product, however good it looks.

The code translation is not the designer's job. Approved artboards come
back to the codebase as theme tokens (`src/themes/tokens.ts`), motifs
(`src/svg/motifs/`), and layouts (`src/svg/layouts/`), and are verified
by re-rendering the full gallery matrix. The designer owns direction;
the codebase owns fidelity.

## Hard constraints

1. **Artboard 1280×720, 1:1.** One artboard is one slide, at final size.
2. **Flat vector language only**: solid fills, simple linear gradients,
   strokes, standard geometric shapes, text. No CSS filters, no stacked
   shadows, no blend modes, no frosted glass, no external images. None
   of these survive conversion to native editable PowerPoint shapes
   (`src/pptx/svg2pptx/` is far stricter than a browser).
3. **A small named palette.** Every color states its role: background /
   panel / body / heading / accent / muted. Body-on-background contrast
   >= 4.5:1, large headings >= 3:1, footer meta >= 3:1. The audit
   enforces these floors mechanically (`docs/contrast-system.md`), and
   since the decor-attribution fix it measures text against the
   decoration it is actually painted on — a design cannot pass by
   letting text sit on a stamp and grading it against the page.
4. **Fonts express intent only** (serif/sans, weight, size rhythm).
   Never depend on a specific commercial font being present.
5. **Decoration keeps out of four content regions**: the heading area,
   the body area, the footer meta strip, and the bottom-right logo box
   (96×40 at x1120 y630). Decoration positions are fixed by design —
   never derived from where the content happens to sit, because seeded
   layout stability promises that editing one page's text moves nothing
   else.
6. **One artboard per page type** — cover / chapter / content / ending —
   and content at two densities: sparse (few blocks, generous
   whitespace) and full (four content blocks, the geometric maximum for
   most content layouts).

## What distinguishes a theme

Structure, not palette. A redesign must differ from the current theme in
at least two of: heading axis (left/center/right), meta placement,
decoration language, whitespace scale. Recoloring the same composition
is the failure mode this document exists to prevent: themes that declare
no structural preference render identically under the same seed.

## Deliverables per theme

- 5-6 artboards: cover, chapter, content ×2 densities, ending, and
  optionally a palette/type-scale sheet
- A short design note: palette role table, type rhythm, decoration
  language with its safe zones, and what changed structurally versus the
  current theme

## Where the current state lives

- Theme palettes and structural leanings: `src/themes/definitions.ts`
- Decoration geometry: `src/svg/motifs/`
- Page compositions: `src/svg/layouts/`
- Rendered current output: `examples/previews/`
- Vocabulary: `docs/concepts.md` (layout, component, motif, narrative)
