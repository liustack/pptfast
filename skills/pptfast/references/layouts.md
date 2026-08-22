# Layouts and pins

Read this when pinning a `layout`, including climax, quote, and evidence sparse pages.

### Pin-only layouts

These layouts never appear through auto-selection. Set `layout` explicitly every time you want one. `validate` hard-errors if a pin-only content layout carries more components than its declared capacity (an ordinary layout pinned over capacity only warns).

`quote-stage` is a thesis page on a content slide: one short, powerful heading is the entire visual, with at most one short attribution component (a source, a name, a one-line follow-up). Zero components is legitimate — a pure quote needs no attribution. This one still draws the theme's brand footer and motif.

`statement` is a whole-page verse or epigram on a content slide. At most one component, rendered as a small source line (quote / paragraph / citation), never as a card. Optional kicker from the preceding chapter. Brand footer and logo stay off. The theme motif still paints. The face is theme-specific (a boarded theme is not the generic italic 500 lines).

`pull-quote` is a quotation page on a content slide: heading, source line, optional muted paragraph. Source comes from a quote component's `attribution` when present, otherwise `subheading`. Brand footer and logo stay off. The theme motif still paints.

`verse-chapter` is a centered verse as a chapter open (`type: "chapter"`). Tracking chapter-index kicker, 2-line heading, optional italic subheading. No watermark numeral, no body, no footnote — the usual chapter boundary still applies. Logo stays off. The theme motif still paints.

### Sparse-page contract

A deck is for speaking. Extra words that will not fit on the slide go in `slide.notes`. If the file must stand alone as a document, recommend a PDF rather than packing the canvas.

This is not a new `pacing` value. The enum stays `dense` / `balanced` / `spacious`. The contract is pin-only layouts, `notes`, and deck `branding`.

Climax, quote, and evidence pages pin a sparse pin-only layout when the theme offers it. Name it: `statement`, `pull-quote`, `verse-chapter`, `stat-hero`, `one-evidence`, `mono-bleed`. Do not leave those pages to auto-selection. A page that truly is one sentence still gets this pin even when pacing is `dense`. crayon, classroom, enterprise, pulse, runway, and ember do not offer these layouts. If `validate` warns that the pin is not a sparse page this theme offers, drop the pin and write a regular content page.

When the interview or request chose `spacious`: tighten the on-slide budget. Heading is the visual. At most one body component on a pinned sparse page (a source line, a single number, a single chart or table). Zero bullets on those pages. Split instead of stacking.

When `balanced` or `dense`: write to the pacing budget. Still pin a sparse layout when a page is one sentence, one number, one quote, or one piece of evidence.

The spoken script goes in `slide.notes`. `render` exports it as native PowerPoint speaker notes (View → Notes, Presenter View). Never draw the script onto the canvas.

Branding omit/full lives in `references/branding.md`.
