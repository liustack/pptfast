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
   `branding: "full"`), the bottom-right logo box (96×40 at x1120 y630,
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
7. **A page paints at most three decoration pieces.** A piece is one
   named visual unit, not every SVG leaf. Repeating marks that read as
   one field or chain count as one piece (a confetti field, a row of
   binding holes, a spark trail, a node chain with its tracks). A paired
   rule (double line, inner and outer frame) is one piece. A mark plus
   its satellite (a foot rule with a midpoint diamond, a chip and the
   date on it) is one piece. Distinct families on the same page count
   separately. Motif text that labels a piece is not a piece. Motifs wrap
   each piece in `<g data-decor-piece>`. An unwrapped painted leaf also
   counts, so a new mark that is not wrapped fails the budget. Tech's
   cover used to paint a node chain with branch tracks, orbit arcs, and a
   row of sparse stars. The stars and the branches were the lesser
   families and were cut.
8. **Decoration is always background.** On a content page the motif must
   recede so the copy wins at a glance. Composited motif ink (fill or
   stroke, after opacity) against the page ground stays below 3:1, the
   large-text and meta floor. Body copy at 4.5:1 then sits clearly in
   front. Cover, chapter, and ending may keep the designed strength.
   They are the theme's face. Tune the fade per motif from tokens, never
   a baked hex (`leafRecessOpacity` in `src/svg/motifs/decor-budget.ts`).
   Hairlines already under the ceiling stay as they are.
9. **At most one slanted tile per page.** A slanted tile is a chip-sized
   filled rect or four-point polygon whose tilt from the axis is between
   1° and 20° (a playbill date chip, a unit chip). 45° diamonds are not
   tiles. Confetti scraps under 40px on the long edge are not tiles.
   Playbill's motif paints the date chip on cover and ending only, so a
   content face that already carries a unit chip (stat-hero) does not get
   a second one.

## What distinguishes a theme

A theme's identity is the whole of its layouts, components, decoration,
and palette together — palette alone is one quarter of it (user ruling,
2026-08-22, `.issues/2026-08-22-anti-generalization-ruling/`). A redesign
must differ from the current theme in at least two of: heading axis
(left/center/right), meta placement, decoration language, whitespace
scale. Recoloring the same composition is the failure mode this document
exists to prevent: themes that declare no structural preference render
identically under the same seed.

The product runs two tracks from here, each owning its own object set —
the layouts, components, and decoration used across cover, chapter,
ending, and content pages. **Brand-generic objects** belong to the
brand-restoration track: it keeps growing that set and keeps sharpening
how faithfully a client's visual identity is reproduced. **Theme-locked
objects** belong to the built-in theme track: cover, chapter, and ending
lock to their board-designed layouts, content pages follow the
allocation table, each theme must fully cover its declared scenario, and
existing themes are revisited (and new ones added) over time.

Token levers on `style.shape` change rhythm without forking a layout:
`radius` (corners), `gapScale` (block spacing), and `typeScale` (heading
and display size on cover, chapter, ending, and pin-only speech pages,
applied before heading-fit shrinks to the box. Body, meta, kicker,
footnote, and content-page titles that share the page with a body stack
stay put. Omit `typeScale` and every layout renders exactly as it does
today).

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
2. **Cover, chapter, and ending are the theme's face.** The roster is
   24 theme ids. When a Claude Design board exists for that page type, the
   theme's `layouts` set for that type narrows to the board construction
   (one layout, or the pair the board names). That set is a lock. Soft
   weights cannot keep a cover identical. A theme whose board has not
   yet drawn chapter or ending keeps today's set on those types until
   the next design pass locks them. Content pages pick from the
   auto-selectable set, weighted by the allocation table, and a theme
   may narrow that set (lecture and luxe drop the top-title / top-image
   layouts).
3. **The shared pool still exists.** A new layout or motif still joins
   the pool, still reads every color through tokens, and still states
   which scenarios it serves. It is not a private file for one theme.
   Joining the pool does not mean every theme auto-picks it. A theme
   with a board lock on that page type will not draw a neighbor from
   the pool. Reuse an existing layout (tokens like typeScale / radius /
   gapScale) when the board's composition already lives in the pool. A
   composition the pool cannot draw becomes a new shared layout, then
   the originating theme locks to it.
