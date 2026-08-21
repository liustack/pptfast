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
   panel / body / heading / accent / muted, plus the three semantic roles
   — alert (`danger`), caution (`warning`), good result (`success`).
   Body-on-background contrast >= 4.5:1, large headings >= 3:1, footer
   meta >= 3:1. The audit enforces these floors mechanically
   (`docs/contrast-system.md`), and since the decor-attribution fix it
   measures text against the decoration it is actually painted on — a
   design cannot pass by letting text sit on a stamp and grading it
   against the page. The semantic three are the theme's own colors, not a
   universal red/amber/green: a design that leaves them out inherits a
   generic red that will not belong to it. `danger` and `success` must
   clear 4.5:1 on the theme's `surface` (they render as the kpi delta
   arrow's text); `warning` only has to clear 3:1, since it is painted as
   a rule and an icon.
4. **Fonts express intent only** (serif/sans, weight, size rhythm).
   Never depend on a specific commercial font being present.
5. **Decoration keeps out of five content regions**: the heading area,
   the body area, the footer meta strip (content pages under explicit
   `chrome: "full"`), the bottom-right logo box (96×40 at x1120 y630,
   on cover and chapter pages, and on content pages under `"full"` or
   `"minimal"`), and the full-width band at y620-664. That fifth band
   is where the cover meta line, chart-source footnotes, and the logo
   box actually live. Solid thick strokes or fills that can
   cut through text stay out of it. Hairlines (≤1.5px) and decoration
   faded to background level are exempt, provided body ink over the
   decoration-on-background composite still clears 4.5:1 (measure with
   this repo's `contrastRatio`). Terra's contours, insight's full-width
   baseline area line, and heritage's foot rule already live there and
   pass. Heritage's gold diamond does not meet either exemption — it is
   a 10×10 solid at the rule's midpoint that predates this rule and
   stands as a grandfathered pinpoint exception, not a precedent for
   new solid pieces. Crayon crossed this band twice on
   2026-08-21, once through cover meta and once through a chart
   footnote. Decoration positions are fixed by design, never derived
   from where the content happens to sit, because seeded layout
   stability promises that editing one page's text moves nothing else.
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

## The generalization bar

Three rules govern how this vocabulary grows, in priority order when
they conflict (stability first):

1. **The model-facing surface is sacred.** Components, slide types and
   the narrative vocabulary are what a small model has to write
   reliably — that is why the IR exists. A new component enters only
   when existing ones genuinely cannot express the content; prefer
   making existing components more adaptive over minting new types.
   Layouts, motifs and tokens are invisible to the model (selection is
   compile-side), so they may grow freely.
2. **The theme roster is finite.** Sixteen structural identities cover
   the scenario space; a gap is filled by stretching an existing theme
   (tokens, tendencies, motif), not by adding a seventeenth.
3. **New render-side pieces must generalize.** A layout or motif joins
   the shared pool, reads every color through the token pipeline, and
   states which scenarios and themes it serves. A piece that serves a
   single theme needs its own adjudication, not a quiet exception.
