# Density and beat

Read this when pacing budgets, `beat`, capacity, or slide `decor` are in play.

### Capacity

A slide is a fixed-size canvas. Draft to fit on the first pass: few components per slide, short assertive headings, bullet items within about two lines. Component and bullets budgets scale with the deck's `pacing` axis (tightest for `spacious`, loosest for `dense`) — `validate` reports the exact numbers that applied, not a flat constant. These are warnings, not hard errors — worth fixing for a tighter deck, but they never block `render`. Body text size scales the other way: `spacious` renders the largest body font (32px vs. `balanced`'s 24px and `dense`'s 20px) even though it allows the fewest components, so a `spacious` slide needs fewer and shorter items, not just tighter ones. A bullet item that is long regardless of pacing — long enough to still overflow after shrinking to the render floor — *is* a hard `validate` error, for every bullet style (`default`/`plain`/`divided`/`numbered`/`checklist` alike — it would otherwise lose real text to an ellipsis). Treat "keep bullet items short" as a real constraint regardless of style. When in doubt, split into two slides — writing to fit beats fix-up loops.

Eight component types own the whole slide instead of sharing it: `swot`, `bmc`, `waterfall`, `gantt`, `pest`, `five_forces`, `heatmap`, `sankey`. Each must be its slide's only component — `validate` hard-errors on a slide that mixes one in with `bullets` or anything else, it never silently drops the sibling.

### Beat

A content page's optional `beat` (`anchor`, `dense`, or `breathing`) is more than a `spec validate` rhythm check now — it also nudges which layout `render` auto-picks for that page: `anchor` leans toward a single bold-statement layout, `dense` leans toward a high-density layout with more visible items, `breathing` leans toward the most spacious single-column layout. It is a soft weight, not a pin — an explicit `layout` still overrides it entirely, and an unset `beat` has zero effect. Declare it deliberately, one value per page based on that page's actual role in the argument (the "big reveal" page is `anchor`, a data-heavy comparison page is `dense`, a breather page between two dense sections is `breathing`), not as a rubber stamp on every page — `spec validate`'s own beat-rotation gate already flags a streak of identical declared beats for strategies that expect variation, and stamping the same value everywhere also just cancels out the layout variety this field exists to add.

### Decor

Set slide `decor` only when the user explicitly asks for decorative flourish. Default is none — themes already carry their own motifs.
