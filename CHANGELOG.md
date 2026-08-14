# @liustack/pptfast

## 0.18.0

### Minor Changes

- 7a8e1f4: DSH plugin v1: three model-facing tools on top of the v0 skill registration, calling the packaged render core in-process (no subprocess, no npx).

  - `pptfast_validate` — deck IR JSON in; slide count + theme out, or a short path-annotated fix list (capped, never a raw zod error tree).
  - `pptfast_render` — deck IR JSON (+ optional `theme`/`seed`/`out_dir`) in; a native editable `.pptx` in the session workspace plus one preview SVG per page out. Deterministic: same IR + theme + seed reproduces the same bytes. Best-effort in-session preview: when the resolved model route declares image input, the first page is rasterized (sharp, optional dependency) and attached through the DSH attachment service; everywhere else it degrades to the on-disk SVG paths.
  - `pptfast_themes` — the 17 built-in themes, each with a one-line character note distilled from its own definition.

  The injected DSH skill preamble now points the model at the tools first (CLI stays the fallback), and the skill teaches the `pptfast serve --no-open` live review loop (background job, report the localhost URL, route `revision-request.json` back through the revision flow, stop the job when done).

## 0.17.0

### Minor Changes

- f486be3: Seal the programmatic SDK entry points (breaking, pre-1.0 minor by convention).

  **Breaking:** the `./node`, `./browser`, and `./validate` export subpaths are removed, and the package root is no longer a supported JS API. The self-contained browser bundles (`dist/browser.js`, `dist/validate.js`) are no longer built or shipped. Importing `@liustack/pptfast` from your own code was never announced and had no known consumers; it now carries no semantic-versioning promise (see `docs/internal-api.md`).

  The public support surface is: the `pptfast` CLI, the IR schema (`pptfast schema`), the deck project format, the agent skill (`skills/pptfast/SKILL.md`), and the DSH plugin. If you drove pptfast from JS, shell out to the CLI instead — its JSON-and-exit-code contract is covered by semver.

## 0.16.0

### Minor Changes

- 7073b26: `chart` grows from 5 subtypes to 9: `scatter`, `area`, `donut`, and `gauge` join `bar`/`line`/`pie`/`funnel`/`dumbbell`. This closes the strongest internal enrichment signal from the benchmark archive, where weak models across independent runs kept inventing these exact chart types by name (scatter and bubble each in 3 runs, area/donut/gauge each in 2) because the subtypes did not exist.

  `scatter` plots numeric x-y pairs, and an optional per-point `size` turns it into a bubble chart (one field covering both the scatter and bubble requests). `area` fills a line's region down to the baseline for volume or accumulation emphasis. `donut` is the dedicated ring form of pie, with an optional total printed big in its center (`center_total: true`). `gauge` shows one value's progress toward a target as a filled half-ring with the number centered, over an optional `{ min, max }` range that defaults to 0..100.

  The schema stays purely additive: four new `chart_type` values plus the optional `size`, `center_total`, and `gauge` fields, with per-subtype validation (`scatter` requires a numeric x, `gauge` requires a single value) and selection guidance in `chart_type`'s own `.describe()`. `skills/pptfast/SKILL.md` and `SKILL.zh-CN.md` document the new subtypes and the `gauge` vs `kpi_cards` boundary (a single completion metric versus several independent headline numbers) in both languages. The component union itself is unchanged, still 37 types.

  `scatter` and `area` are cartesian, so they render axis titles, gridlines, and multi-series legends like `bar`/`line`. `gauge` and `donut` are radial: their arcs emit the same annulus wedge idiom the existing donut already uses, so deck-audit attributes a gauge's centered number and a donut's center total to the ring hole (the page background), never the opaque arc fill, verified by a zero-finding 16-theme contrast sweep. Every one of the five original subtypes stays byte-identical in its rendered output (golden-pinned).

- a0d57bc: New component `tag_row` (the 38th): a wrapping row of 2-16 short label pills — a technology stack, a capability or skill set, a keyword set, the certifications a vendor holds. It closes the strongest clean gap in the internal invented-name evidence, where weak models across independent benchmark runs kept reaching for this exact component by name (`tag`/`pill` each in 2 runs, `chips`/`badge` each in 2, plus `chip_row`) and, finding nothing, either buried the labels in `bullets` or burned a whole slide brute-forcing dozens of non-existent type names. It is named after the models' own most-guessed name, the same way `logo_wall` was.

  Each item is a plain short string with a hard 24-character cap (a tag is a label, not a sentence — over the cap, validation points the author at `bullets` for a prose list or `row_cards`/`icon_cards` for items that carry their own description). An optional overall `title`, and an optional `emphasis: "first"` that draws the first tag in the theme accent as the primary one among the rest (the same field and semantics as `image_grid`).

  Rendering reuses existing machinery only: pills flow-wrap using the codebase's exact per-character width model, so a CJK/Latin-mixed label ("基于 Kubernetes Operator") is measured and wrapped correctly, and one uniform font size is picked as the largest that fits the height budget, with a single over-long tag truncated rather than allowed to overflow. A default pill is `colors.surface` with `colors.text` ink; the emphasized pill is `colors.accent` with a readable ink — both text colors clear WCAG 4.5:1 against their own pill on all 16 built-in themes (verified by a zero-finding contrast sweep), so the component renders no low-key `colors.muted` text and needs no contrast exception.

  `skills/pptfast/SKILL.md` and `SKILL.zh-CN.md` document the `tag_row` vs `bullets`/`row_cards`/`icon_cards` boundary (short labels versus described items versus a prose list) in both languages. The change is purely additive — one new component in the union, no change to any existing component's schema or rendered output.

- c63b90a: Add `vermilion`, the 17th built-in theme — a solemn official-report register (工作汇报 / 述职 / 年度总结) and the first theme designed Chinese-first. Vermilion red primary (`#C8102E`) + gold accent (`#D4A017`) on a warm off-white ground, a SimSun masthead heading, and square, restrained `radius: 2` corners.

  The red identity lives where the contrast architecture allows it: chapter pages are full-bleed vermilion with white headings picked by `readableOn`, while cover/content/ending stay warm off-white so the shared `text`/`muted` tokens clear the registration-time contrast floor (a red cover would force light text tokens that then fail on the light content pages). The cover still reads red-and-gold through its structural archetypes and the new `vermilion-motif` — flag-like ribbon arcs plus a fan of gold rays, deliberately abstract with no political symbols.

  `vermilion` declares its own `layoutTendencies` (chapter `banner-chapter` + `rail-chapter`, ending `rail-ending`) so its official-report structure — the red section divider, the progress rail, the structured contact close — reads distinctly from every other theme. Every other built-in renders byte-identically to before.

## 0.15.0

### Minor Changes

- b6364c9: Brand extraction: `pptfast brand extract <file.thmx|.potx|.pptx> -o my-brand.theme.json` extracts brand colors and fonts from a user's own Office template into a pptfast theme file — entirely locally, the file never leaves the machine. The new `--theme-file <path>` flag loads such a file on `render`/`validate`/`audit`/`preview`/`serve`, and a deck project's `theme.json` auto-loads on every command with zero flags. Loading goes through `registerTheme`, so its contrast floor refuses an unreadable palette with the failing token, ratio, and background named; a custom theme can never shadow a builtin id. SDK: `extractBrandTheme`, `parseBrandThemeFile`, `registerBrandThemeFile`, `BrandThemeFileSchema` (all browser-safe).
- 440ded2: New `logo_wall` component (the IR's component union grows from 36 to 37): lays 4-12 organization/brand logos out on an even wall — a sponsor wall, a client roster, a press/"as seen in" media wall, a partner strip. Closes a real gap the probe evidence gate confirmed twice, on two orthogonal render defects. Forced onto `image_grid`, a set of logos breaks two ways at once: its equal-width cells cover-crop, so a wide wordmark loses its own text ("Northbridge Robotics" → "NORTHBR"), and it paints no backing behind a real asset, so a transparent single-ink logo — how press kits actually ship them — lets the slide background show straight through, and a white-ink logo on a light theme vanishes into an empty box. One model even burned its whole agentic round budget brute-forcing 450+ non-existent component names (`logo_wall`, `press_wall`, `media_wall`…) without ever finding one that renders. `logo_wall` draws every logo contain-fit (never cropped) on its own auto-generated neutral backing panel — a mid-neutral derived from the theme via the same `mixHex(surface, readableOn(bg), …)` token blend `device_mockup`'s chrome already uses — so both a near-black and a near-white logo stay legible on the same wall on any of the 16 themes. Each item is a required `asset_id` plus an optional `label` (the organization's name, doubling as the logo's accessibility text when the asset carries no alt, and as the visible fallback if the asset is missing — never drawn on top of a present logo); an optional overall `title`. No grayscale/recolor option (retinting someone's logo is a trademark risk), no per-logo link, no size/weight tiers — every logo gets equal weight. 4 is a hard floor (for 1-3 logos use `image` or `image_grid`) and 12 a hard ceiling (past 12 each logo shrinks below a legible size — split across multiple `logo_wall` slides).

## 0.14.0

### Minor Changes

- e74334b: New `cycle` component (the IR's component union grows from 34 to 35): lays 3-8 stages out on a closed ring with arc-arrow connectors, for a process that has no endpoint — it loops back to its own start (PDCA, a product lifecycle, a flywheel, a seasonal cycle). Closes a gap the probe evidence gate confirmed twice: forced to draw a closed loop, `flowchart` either paints the closing back-edge as a long stray line/arc crossing the whole diagram (dagre routes it like any other edge, with no notion that this one is special), or the model gives up on structure entirely and falls back to `steps` plus a sentence doing the structural work in prose instead of the picture ("this cycle continues, re-design loops back to design"). `cycle`'s geometry is a pure function of the stage count — equal angular steps around a ring, a single SVG arc (`path` `A` command) connecting each pair of adjacent stages, the closing edge (last stage back to the first) drawn by the exact same code as every other edge, not a special case. Fields: `items` (3-8 entries, each a required `label` and an optional `description`), an optional overall `title`. No `direction` field (stages always run clockwise) and no center-text slot — the schema stays deliberately minimal pending real evidence either is needed. `skills/pptfast/SKILL.md`/`SKILL.zh-CN.md` document the `flowchart` vs. `cycle` selection test (does the process reach an endpoint, or does it loop back to its own start) in both languages.
- b64e8ff: New `device_mockup` component (the IR's component union grows from 33 to 34): frames an existing image asset inside a themed device chrome — a browser window (top bar with traffic-light dots, an optional address-bar `url` text) or a phone (notch + home indicator) — instead of the bare bordered rect `image` renders. Closes a real gap the probe evidence gate confirmed twice: a model asked to show "real, running software" on a slide could only paste a plain screenshot and try to talk its way around the gap in the notes/heading text ("it's not a mockup", "the actual in-app dashboard") — no component let it actually render one. The screen area reuses `image`'s own asset-resolution, cover-crop, missing-asset placeholder, and alt-text wiring verbatim; only the frame is new. `url` only applies to `device: "browser"` (a phone has no address bar) — setting it on a `phone` mockup is a hard schema error, not a silently-ignored field. Chrome colors are entirely theme-tokenized (no author-facing style options): the address-bar text renders at the same B-tier meta-information contrast floor (3:1, not the usual 4.5:1) a copyright line or page number already uses, since it's real but deliberately understated information, not page content.
- 610b844: New `people_cards` component (the IR's component union grows from 35 to 36): lays 2-12 people out on an equal-weight card grid, each card a deterministic initials badge (derived from `name`, no photo asset needed) plus name and optional `role`/`org`. Closes a gap the probe evidence gate confirmed twice: a narrow first case (a 5-exec team intro where `row_cards`/`icon_cards` held every text field but had no identity-anchor axis at all), and a harder, machine-checkable second case — a 9-speaker conference lineup that blows straight through both siblings' schema-level `.max(6)`; the only single-shot model call that returned valid IR split the roster into two unlabeled "(1/2)"/"(2/2)" pages with no semantic grouping behind the split. `people_cards` closes both: a dedicated initials-badge identity axis, and 12-person headroom that holds the full 9-speaker lineup on one page with margin. The badge's initials derive from a pure, independently-tested function (`deriveInitials`, `src/svg/components/people-initials.ts`): a Latin name takes the first letter of its first two words, a single Latin word takes its own first two letters, a CJK name takes only its first character (surname, never two). Badge fill color rotates through the theme's `chartPalette` by each person's own list index — deterministic, not seed-derived — with badge ink resolved via `readableOn` against each badge's own fill. `skills/pptfast/SKILL.md`/`SKILL.zh-CN.md` document the `people_cards` vs. `row_cards`/`icon_cards` selection test (is the content fundamentally about people) in both languages.

### Patch Changes

- 104cb63: Fix a rendering defect in the `assertion_evidence` arrangement (`AssertionEvidence`, used by `narrow-column`/`quiet-frame`/`bento-panel` and any other content archetype that passes `slide.arrangement` through): when the enlarged "evidence" component's own measured height exceeded the space its budget left after reserving room for the supporting components below it, the evidence component rendered at full height anyway while the supporting stack still started where the (too-small) original budget placed it — the two visibly overlapped. Reachable with any `EVIDENCE_TYPES` member that carries a fixed or capped natural height (`device_mockup`/`image`'s shared 340px height cap, or a `chart` with axis-title/legend bands on top of its fixed plot height) alongside a support component tall enough to squeeze the remaining budget below that cap.

  Fix: the support stack now gets a hard, arithmetic-derived floor (enough room for at least one item plus its own "+N more" drop-pill, both fully inside the box), and any deficit needed to protect that floor comes out of the evidence side instead — evidence is scaled uniformly to fit its own budget, reusing the same measure→scale→center technique `content-image-lead-split.tsx`'s `renderVisualComponent` and `content-stacked-poster.tsx`'s `renderPosterSlot` already use for this exact "component might be taller than its box" problem (none of `image.tsx`/`chart.tsx`/`device-mockup.tsx` read `box.h` on their own). Every other case (evidence already fits its original budget) is untouched — same computation, byte-identical output.

- 4c9a472: `fashion-masthead` (the runway cover archetype)'s org/date meta line now derives its ink through `metaInk` and carries `data-contrast-tier="meta"`, closing a leftover from the contrast-policy wave. It guarantees the B-tier 3:1 contrast floor against the primary block it actually paints on every theme — including `insight`, where the previous fixed-opacity dimming measured 2.886:1, a real miss no existing test caught. 15 of 16 themes render byte-identical output; `insight`'s meta line ink changes from `#621f28` to `#591d26`. The now-redundant `tech`/`fashion-masthead` contrast-audit allowlist entry is removed.

## 0.13.0

### Minor Changes

- d011fa0: `assets.images[].alt` now flows all the way to the exported PPTX: an `image` component whose asset has `alt` text exports it as the shape's standard accessibility description (`p:cNvPr@descr`, what PowerPoint's "Edit Alt Text" reads and writes). An asset with no `alt` exports byte-for-byte unchanged. The package audit gains a matching hard-gate rule (`image-alt-dropped`) that fails the export if an IR alt somehow doesn't make it into the package, and `pptfast asset-brief` items now carry `alt` alongside their other per-asset fields when the source asset has one.

  Scoped to the `image` component this round — `image_grid`/`image_compare` and background asset specs already carry `alt` through the same resolved-asset map but don't yet emit it, a natural follow-up of the same shape.

- dbdf8ad: A new `pinOnly` layout tier and its first member, `quote-stage`: a thesis/quote page where a single oversized heading is the entire visual, with at most one short attribution component (capacity 1). Pin-only layouts never appear through auto-selection — set `layout: "quote-stage"` explicitly on a content page to use one, the same way an image takeover is opted into today.

  Two new `validate` hard errors, scoped strictly to pin-only layouts: `pin_only_over_capacity` fires when a pinned pin-only layout carries more components than its declared capacity (an ordinary layout pinned over capacity still only warns, unchanged), and `pinned_heading_overflow` fires when a pinned layout's heading still truncates at its minimum render size (quote-stage is the only layout that declares this check today). Both point to splitting the content or removing the pin.

  Layout registry count: 35 archetypes to 36 (35 auto-selectable + 1 pin-only) + 4 image takeovers.

### Patch Changes

- 8adeea7: `assets.images[].alt` now flows to the exported PPTX `descr` from every remaining `<image>` emission site, closing out the A11Y-01 alt chain: the 4 image-takeover layouts (`image-split`/`image-top`/`image-annotate`/`image-bottom`, previously bypassed the generic `image` component entirely), `image_grid` (each cell's own asset), `image_compare` (each side's own asset), and asset-kind slide backgrounds. An asset with no `alt` still exports byte-for-byte unchanged at every one of these sites. The `image-alt-dropped` package-audit rule is widened to match, now also checking `image_grid`/`image_compare`/background asset bindings, not just `image`-type components.
- 0184d72: Documented a capability boundary that the "editable PPTX" claim was leaving implicit: shapes and text runs (including the ones a `chart` or `data_table` component draws) are real, restylable, retypable PowerPoint objects, but pptfast does not produce a native PowerPoint chart part or `<a:tbl>` table object, so a chart's or table's underlying numbers are not editable inside PowerPoint the way a native chart/table would be. README.md/README.zh-CN.md now state this plainly next to the editability claim, and `skills/pptfast/SKILL.md`/`SKILL.zh-CN.md` gained a matching rule so the skill never tells a user otherwise. No code or rendered output changed.
- 4b96f23: Fixed two contrast defects and formalized the policy that catches their class going forward.

  Ending-page copyright lines (`banner-ending`/`rail-ending`) now derive their color from the theme's own `colors.muted` through a new `metaInk` helper, replacing two hardcoded cross-theme gray constants that could render unreadable on a theme those constants never accounted for. Copyright text carries a `data-contrast-tier="meta"` marker so the audit checks it against a 3:1 floor instead of full body text's 4.5:1, since meta-information text like a copyright line is real content a reader can look up on demand, not decoration, but is deliberately understated.

  `constellation-ending`'s trailing heading period now falls back to the heading's own ink when the accent color it used to render in doesn't clear contrast against the page background, closing a case where the period could render nearly invisible. A new stress-fixture variant exercises a period-ending heading (closing an overflow-coverage blind spot no fixture ever triggered), while the contrast regression itself is locked by a dedicated 16-theme sweep in `deck-audit.test.ts`.

  `docs/contrast-system.md` documents the resulting three-tier contrast policy (content text, meta-information text, pure decoration) that governs both fixes and every future low-contrast call.

- 7dae8f9: Rebalanced consulting's and journal's structural-personality declarations (`layoutTendencies`), fulfilling a known limitation the theme-structure wave's own changelog flagged: under the default `briefing` narrative strategy, consulting's cover/ending and journal's chapter/ending each named an id `briefing` already favors, so those axes carried no real weight beyond an undeclared theme and the theme's character showed on only 1 of its 3 identity page types.

  Both themes keep their native id on every axis (still the historically-accurate register for the other four strategies) and gain a second, honest id on each dead axis: consulting adds `left-anchor` to cover and `rail-ending`/`tone-adaptive-ending` to ending; journal adds `roman-chapter`/`tone-adaptive-chapter` to chapter and `poster-ending` to ending. Under `briefing`, all three of each theme's identity axes now carry real selection weight.

  This shifts which archetype a fixed seed's auto-pick lands on for decks that don't pin every cover/chapter/ending `layout` explicitly (the intended effect — pinned layouts and the other 14 built-in themes are unaffected, byte-for-byte).

## 0.12.0

### Minor Changes

- cf29423: `pptfast asset-brief <target> [--json]` and the SDK function it wraps, `buildAssetBrief(ir)`: an image-generation brief for every `image` component in a deck. Each entry carries the component's real rendered frame (x/y/w/h + aspect ratio, extracted from an actual off-screen render pass — never a hand-copied layout constant, so it can't drift from what the renderer actually draws), its fit/crop mode with a safe-zone note, suggested generation pixels (2× the frame), the resolved theme's palette and mood, and a paste-ready English prompt. An `asset_id` with no usable asset yet still gets a full entry (`missing: true`) — the deck's own generation to-do list — and a component the selected layout never actually draws is reported as `rendered: false` instead of silently dropped.

  Purely informational (no exit-code gate, same posture as `pptfast validate`'s placeholder note) and zero renderer changes — the brief's geometry extraction runs against an in-memory IR copy with a dummy asset injected for whichever `asset_id`s the render pass needs, never the caller's own `ir` or the real export path. v1 covers `image` components only; `image_grid`/`image_compare` and `background` asset specs are a natural v2 extension of the same shape.

- 60fe193: Two new content archetypes: `image-lead-split` (an unconditional 60/40 visual/text column split — the pool's first genuinely unequal, co-equal-column composition) and `split-band` (a full-bleed horizontal header band over an ordinary body band — the pool's first horizontal split; every other content archetype divides the page into vertical columns or not at all). Both reuse existing letterbox-scaling, contrast, and audit machinery rather than introducing new mechanisms.

  The content archetype pool grows from 10 to 12. Both new archetypes are wired into auto-selection's existing beat and strategy weighting: `split-band`'s full-bleed header is an `anchor`-beat member (the same "banner rect is the heading" register as `banner-heading`), and `image-lead-split`'s narrow text column paired with a co-equal visual column is a `breathing`-beat member (the same "spacious by construction" trait `narrow-column` already has). Neither joins any narrative strategy's own layout tendencies — both are deliberately strategy-neutral, the same treatment `tone-adaptive-content` gets, since their defining traits (asset availability, chrome/visual weight) aren't tied to one argument style over another.

  Practical impact: a deck's automatic layout selection reads from the theme's whole content pool with weighted sampling, so growing that pool from 10 to 12 members changes the realized pick distribution for existing decks that don't pin an explicit `layout` — the same kind of shift each previous content-pool growth wave has shipped as a minor bump. Decks that pin `layout` explicitly are unaffected.

- 79a8f90: `ThemeDefinition` gains an optional `layoutTendencies` field: a per-page-type soft weight (`{ cover?, chapter?, content?, ending?: string[] }`) naming the archetype ids a theme's author wants auto-selection to lean toward, composed with the existing narrative-strategy and beat weights via `max` (agreement corroborates a pick, it never compounds into a monoculture). It is a soft steer within a theme's own `layouts` set, never a second whitelist — a tendency can only reweight an id already curated into that set for the same page type.

  Six of the thirteen built-in themes (`consulting`, `insight`, `academic`, `tech`, `runway`, `journal`) now declare tendencies on their cover/chapter/ending pages, each toward the archetype family that is that theme's own native visual register (e.g. `consulting` toward its banner-assertion layouts, `journal` toward its masthead family). Practically, this means the same deck rendered under two different themes can now differ in _which layouts get picked_, not only in color and type — a fixed IR and seed rendered across all 13 themes previously produced one identical per-page layout sequence; it now produces seven distinct sequences.

  Known limitation this release ships with: because the composition takes the _maximum_ of the strategy, beat, and theme weights rather than stacking them, a theme tendency naming an archetype the active narrative strategy already favors adds no extra pull for that page. Under the default narrative, `consulting` and `journal` each have only one of their three declared identity-page tendencies free of that overlap, so their structural character currently reads through a single page rather than all three. The other four declared themes are unaffected, and every theme's character reads fully under narratives whose own preferences don't overlap. A later pass will rebalance those two declarations toward archetypes the strategies don't already favor.

  Fully backward compatible: the field is optional, and any theme that doesn't declare it — the other 7 built-ins, every custom theme registered via `registerTheme` before this release, and any deck whose pages pin `layout` explicitly — renders and selects exactly as it did before, byte-for-byte.

- 540ed62: Three new built-in themes, filling the highest-frequency deck scenarios the prior 13 didn't cover: `pulse` (clean, trustworthy, vital — mint-white and deep teal, for healthcare and life-science decks), `terra` (grounded, rooted, long-term — sand and olive, for sustainability/ESG decks), and `ember` (bright, ascending, ready to pitch — warm white and fire orange, for startup pitch decks). Each ships its own motif (a heartbeat line for `pulse`, contour lines and seed points for `terra`, rising spark particles for `ember`) and declares `layoutTendencies` on its identity pages, so a fixed deck rendered under any of the three picks a layout sequence distinct from every other built-in theme, not just a different color set.

  Built-in theme count: 13 to 16.

### Patch Changes

- 0170509: Two correctness fixes surfaced as byproducts of the probe evidence-gate analysis. `architecture` gained an optional `direction: "top_down" | "bottom_up"` field (default `top_down`, byte-compatible with today's rendering) — a bottom-up-authored narrative (e.g. a maturity ladder written low-to-high) can now be set to `direction: "bottom_up"` to paint right-side up instead of requiring the array to be hand-reversed. `comparison` now hard-errors at validate time when a row has more `cells` than declared `columns` — that shape previously parsed successfully but silently dropped the extra cell(s) at render, which lost real content; a row with fewer cells than columns is unchanged (still renders an empty cell).
- ebdea9d: Audit and text-fit correctness fixes. A component whose type bypasses `validateIr` (a hand-built or type-cast-but-invalid render input) now throws a named `PptfastError` pointing at `validateIr` instead of a bare `TypeError`. `matrix`'s grid cells now each carry their own audit box, so column overflow is visible to `pptfast audit` in every column, not only the last. Text painted over a gradient-filled `<polygon>` (e.g. a line chart's area fill) is now routed into the same real-pixel-sampling audit path solid shapes already get, instead of silently comparing against whatever color happens to sit underneath. Ellipsis truncation of mixed CJK/Latin text no longer cuts a Latin or digit run in the middle — the whole run now yields to the ellipsis, matching how such runs already wrap as one atomic unit.

## 0.11.0

> Includes everything staged for the unpublished 0.10.0 (its tag was retired before release — 0.11.0 is the first release carrying these changes).

### Minor Changes

- b23e931: `pptfast serve <target> [--port 4400] [--no-open]`: a live-reloading browser preview for deck project directories and bare IR files, serving the exact same review page `pptfast preview --html` writes to disk. Source changes (`deck.spec.json`/`pages/`/`assets/`, or the bare IR file itself) push a whole-page reload to the open tab over SSE, with a recoverable error banner in place of a crash on a mid-edit invalid save. The page's annotation panel now submits straight back to the deck directory as `revision-request.json` — the same file the download flow already produces, byte-for-byte — closing the agent↔human revision loop without manual file shuttling.

- 85a91d3: Multi-series charts now genuinely compare instead of silently dropping data: a vertical or horizontal `bar` chart with 2+ series renders each series as its own grouped bar per category instead of only ever drawing the first series, and a multi-series `line` chart now shares one value domain and one category axis across every series instead of each series scaling independently. A `bar` or `line` chart with 2+ series also gets an automatic legend (series name + color swatch) below the plot, truncating an overly long series name (`data-truncated`) and collapsing overflow entries into a trailing "+N more" marker (`data-dropped`) once too many series to list. A category (`x` value) repeated within one series now surfaces as an editorial quality warning instead of silently colliding with itself. Negative and mixed-sign values in a multi-series chart now anchor correctly at the shared zero baseline instead of producing invalid (negative) bar geometry. Single-series positive bar/line charts render byte-identically to before, and pie/donut/funnel/dumbbell are unaffected.

  New `data_table` component (the IR's component union grows from 32 to 33): a native, editable row/column table (2-8 columns, 1-12 rows, optional `highlight`/`total` row emphasis, and a footnote `source` line) for exact figures the audience reads row-by-row, rendered as real shapes — never a rasterized image. A row's `cells` may omit a declared column's key (renders an empty cell, plus an editorial quality warning naming the row and the missing key), but a key not declared in any `columns` entry is a hard schema error, since that signals a structural misunderstanding rather than incomplete data.

  Also fixes a `row_cards` bug where the "+N more" truncation marker could render past the component's own bottom edge when a card list was truncated to fit a tight box height — the marker's position now matches the budget that decided how many cards fit, with no extra unbudgeted gap.

### Patch Changes

- 9a50c75: Icon names now also accept `alert-circle` and `alert-triangle` — the older lucide-react spellings some AI agents still write from pre-training habit — resolving to the same icons as their current names (`circle-alert`/`triangle-alert`). The top-level `narrative` field also now accepts an `{id: "<preset>"}` object shape (e.g. `narrative: {id: "training"}`) as an alternate way to write a bare preset-name string, matching the `theme: {id: "..."}` shape already used elsewhere in the schema; validate/render prints a rewrite note when this rescue fires, the same way field-name synonym rescues already do. The exported `resolveNarrative` SDK function itself also tolerates the `{id}` shape now, silently — a direct SDK caller bypassing validate gets the rescue without a note. A narrative object that mixes `id` with an axis field (`strategy`/`pacing`/`audience`) is unchanged — still a hard validation error, since that combination is genuinely ambiguous.

  The published `package.json` now declares `"sideEffects": false`, letting consumer bundlers tree-shake unused modules aggressively — verified safe: the package has no bare side-effect imports and platform installation is always an explicit function call.

## 0.9.0

### Minor Changes

- cd2f321: registerTheme now validates that colors.text and colors.muted clear a 3.0:1 contrast floor (WCAG's large-text threshold) against the resolved default background for cover, content, and ending slides, throwing PptfastError with the offending token, slide type, measured ratio, and threshold when they don't (chapter is intentionally exempt — every chapter archetype already selects contrast-adaptive ink rather than painting these tokens raw); it also now emits a console.warn, never a throw, when a theme's resolved heading or body font falls back to the text-width estimator's conservative class-average model instead of an exact per-character table, so overflow-prone font choices are visible at registration time rather than only in rendered output. The field-alias rescue mechanism now supports more than one item-array per component type, letting sankey's `nodes` array rescue name/title synonyms for its label field (55 total synonym pairs, up from 53) alongside its existing links source/target rescue. Also fixed: matrix's bold card titles now measure their true bold width when fitting to the card, closing the one structure component the 0.8.0 bold-metrics fix round's sweep missed.

### Patch Changes

- 8c62a0b: Chart export and text-wrap correctness fixes.

  - A dumbbell row whose `from`/`to` values were nearly (but not bit-exactly) equal at large magnitude could throw during export — the connector's sub-pixel delta rounded to zero EMU and tripped the package-integrity gate for the whole deck, not just that row. The zero-length floor now triggers whenever both axes round to zero EMU, not only on bit-exact equality. Dumbbell's value labels (`from.y`/`to.y`) also now shrink/truncate to fit their box instead of rendering unbounded.
  - A heading that fuses an English/digit run directly onto CJK text with no space (a common bilingual idiom) could have that run split mid-character once the line ran out of room, with no visible truncation marker. Wrapping now treats such a run as one atomic unit — CJK's own line-breaking convention — and prefers a smaller, split-free font over a mid-run cut whenever one exists within the heading's own size floor.
  - Text painted over a gradient-filled shape was previously checked against whatever solid color happened to sit underneath in the contrast audit, instead of the gradient it was actually rendered on. It now routes through the same real-pixel-sample fallback a background photo already gets.

## 0.8.0

### Minor Changes

- f0fb885: Structure components wave 2: four new full-body components join `swot`/`bmc`/`waterfall`/`gantt` — `pest` (a political/economic/social/technological macro-environment scan), `five_forces` (Porter's Five Forces hub-and-spoke competitive analysis), `heatmap` (a value-driven color grid with a theme-derived sequential ramp and per-cell accessible ink), and `sankey` (a layered, quantity-proportional flow diagram exported as native editable vectors — zero `<p:pic>`, every band a real `<a:custGeom>`, a direct differentiation point against the rasterized-image treatment this chart type gets elsewhere). `COMPONENT_TYPES` grows from 28 to 32, `FULL_BODY_TYPES` from 4 to 8.

  - Two review-round fixes shipped with the components themselves: `heatmap`'s value-ramp dead zone (a narrow relative-luminance band where neither black nor white ink clears 4.5:1) is now pinned as an audit-visible regression rather than silently degrading, and `sankey`'s label-over-band contrast is measured against the real rendered alpha composite (with an opaque backing chip as a guaranteed fallback when no single ink clears every overlapping band), its node/band stacking order keyed to node id rather than authored array position, and its non-conserved-hub gap explicitly disclosed and covered.
  - Field-alias rescue (`COMPONENT_FIELD_ALIASES`/`COMPONENT_ITEM_FIELD_ALIASES`) and pyramid-strategy narrative-tendency membership — both deferred when the four components first landed — now cover all four, the same treatment `swot`/`bmc`/`waterfall`/`gantt` got (53 total synonym pairs, up from 40).
  - SKILL.md's component-selection table, README/README.zh-CN's full-body paragraph, and every stale "28 components" reference across docs and internal doc comments are updated to 32.
  - The browser-bundle bare-import scanner (`pnpm e2e`'s build-verification leg) is now syntax-aware instead of doing a raw text match, closing a false-positive class a `sankey` validate-error path collided with during development.
  - Full 13-theme contrast-matrix coverage, pathological-input export coverage through the real `generatePptx` + package-audit hard gate for all four, and a zero-findings e2e leg exercising all eight full-body components on one deck.

### Patch Changes

- 2afecab: Headings no longer overflow in PowerPoint. The width estimator gains exact per-character advance models for the exported faces (Georgia and Microsoft YaHei, both weights, extracted from real font metrics) with a conservative fallback for unmeasured faces — bold headings were previously estimated with regular-weight assumptions and could clip at the slide edge. Nine structure components additionally now pass their heading weight through the fitter.
- 1a9dffa: Validation now emits non-blocking editorial warnings when comparison, citation, or architecture content exceeds its editorial budget, alongside the existing hard geometric limits. Export hardening: the timestamp normalizer is enforced as the final patch in the export chain, and a determinism-seal violation now surfaces loudly instead of being swallowed by media dedupe's error handling.

## 0.7.0

### Minor Changes

- 0420c3c: P0 hardening wave: depth-axis robustness, input-trust surface, error-message quality, and export-byte-determinism hardening across the validate/render/export chain, plus a SKILL.md fix targeting the largest share of residual weak-model failures.

  - **Depth axis** (unbounded array fields, not deck breadth): `bullets`/`comparison`/`citation`/`architecture`/`timeline` text-stacking components now cap their vertical item stack to the component's own box height instead of overflowing the 1280×720 canvas — extreme item counts land gracefully with `data-dropped`/`data-truncated` markers instead of producing a non-integer EMU value that crashed package-audit. A horizontal-axis sweep also found and fixed a reachable negative-width crash in `kpi_cards` at high item counts. `bullets_overflow` now escalates from warning to hard error at item counts far past the pacing budget (previously only geometry-crash-adjacent extremes were caught, and only indirectly). `formatViolations` now groups and truncates package-audit's violation list (first 20 per rule + a total count) instead of dumping every line — a single pathological input used to produce a 2.5MB error string.
  - **Input trust surface**: `validateIr` now byte-sniffs image assets (PNG/JPEG/WebP/GIF magic bytes) instead of trusting the file extension alone, rejecting zero-byte, corrupted, or extension-mismatched assets as an error before they can silently reach the exported package (this covers both local file assets and fetched http(s) assets). A dangling `asset_id` — one that doesn't resolve against `assets.images` — now warns and names the missing key, closing what was previously a fully silent misconfiguration (a gray placeholder box with no error or warning anywhere in the chain). `auditDeck` now guards against raw, unvalidated IR input with a `PptfastError` pointing at `validateIr` instead of an opaque downstream crash, on both Node and browser platforms.
  - **Error-message quality**: icon and component-`type` enum validation errors now suggest the closest valid value ("did you mean 'circle-check'?") instead of dumping the full enum wall — a single typo could previously produce an error message over 24,000 characters long. The `scenario`→`narrative` v3-rename hint generalizes to the rest of the v2/v3 migration map (starting with `blocks`→`components`), and an "Unrecognized key" error now adds a general pointer toward where a misplaced field likely belongs (e.g. `components` under `slides[].components[]`).
  - **Whole-file export determinism**: every zip entry written across the export chain — pptxgenjs's own initial write plus every JSZip patch stage (gradient fills, `a:ea` CJK font slots, slide transitions, element animations, media dedupe) — now carries a fixed timestamp, and `docProps/core.xml`'s `<dcterms:created>`/`<dcterms:modified>` are pinned to the same fixed instant. Rendering the same IR twice, even across a real multi-second gap, now produces a byte-identical `.pptx` (verified via whole-file SHA256), replacing jszip's prior default of stamping every entry with the real wall-clock instant it was written — content was always deterministic, but the packaged bytes were not.
  - **`skills/pptfast/SKILL.md`**: the `cover`/`chapter`/`ending` boundary-page rule ("these page types never render `components` or `footnote`") moved from a mid-Phase-3 aside to Phase 1, with a concrete wrong/corrected page-JSON example — a benchmark rescoring pass found this single misunderstanding behind 60% of residual weak-model validate failures.

- 86d8dec: Variety wave: the deterministic engine now varies real composition, not just paint.

  - Page-level `beat` (anchor / dense / breathing) is a live selection signal — declared beats weight the layout pick (composed with strategy weights via max, never compounding), while decks without beats render byte-identically.
  - Theme motifs rotate within style-compatible candidate sets per page and seed instead of one fixed sticker per deck, with a decor-visibility guard, and chart palettes shift phase by deck seed.
  - Cover/chapter/ending pages take on the narrative strategy's character through soft selection weights, and pyramid/briefing content tendencies now genuinely differ.
  - Three new content archetypes (side-highlight, asymmetric-triptych, quiet-frame) grow the thinnest pool from 7 to 10, raising realized layout entropy and cutting repeat rates.

- 339136b: Browser distribution wave, task 1: `@liustack/pptfast` now ships two additional, fully self-contained ESM entries alongside the existing bundler-oriented default — closing the gap between "the SDK's dependency closure is browser-safe" (always true) and "the published package actually loads in a browser" (not true until now, per a real-Chrome investigation that found a bare `<script type="module">` failing at the very first `import`).

  - **`@liustack/pptfast/browser`** — the full engine (`validateIr`/`generatePptx`/`auditDeck`, including the `{ pixels: true }` OffscreenCanvas path), every dependency inlined (react + react-dom/server + zod + jszip + dagre + pptxgenjs, ~1.7 MB raw / ~455 KB gzip). Loads with a bare `<script type="module">`, no bundler, no import map. Verified against a real Chrome tab: identical console behavior to the Node CLI and byte-identical `.pptx` output.
  - **`@liustack/pptfast/validate`** — `validateIr` and its own supporting exports only (`formatIssues`/`formatWarnings`/`irJsonSchema`/`styleJsonSchema`/`listThemes`/the IR and style zod schemas), with the render/export chain (`react`, `react-dom/server`, `pptxgenjs`, `jszip`, `dagre`) excluded from the bundle by construction, not just unused at runtime (~730 KB raw / ~155 KB gzip). For an "embed a validator" page that checks pasted/edited IR JSON and has no reason to carry a renderer.
  - The default `"."`/`"./node"` entries are unchanged — `dependencies` stay external there, the correct default for a bundler consumer.
  - A new build-verification pass (wired into `pnpm e2e`) parses both new bundles post-build and asserts zero bare import/require specifiers, generous size-budget smoke bounds, and tree separation between the two entries — the regression guard for the exact failure class the investigation found.
  - README/README.zh-CN gain a Browser section (quickstart for both new subpaths, the bundler path, and honest caveats: assets must be `data:` URIs or CORS-readable `http(s)` URLs, `--pixels`-equivalent auditing needs `OffscreenCanvas`). `docs/architecture.md`'s platform-seam section gets the distribution story.

## 0.6.0

### Minor Changes

- 4604367: Chart `axes` field now renders. `x_title`/`y_title` draw as fitted axis titles on bar (both directions) and line charts, with space reserved only when present. `show_grid` toggles the existing bar/line gridlines and adds an opt-in vertical grid for horizontal bars. Non-cartesian chart types (pie, funnel, dumbbell) report a non-blocking validate warning instead of silently ignoring the field.

## 0.5.0

### Minor Changes

- Audit chain, CJK font identity, and text-fit hardening.

  - Package-integrity hard gate on every export (9 OOXML invariants, no opt-out) plus an optional pixel-contrast audit (`pptfast audit --pixels`, Node via sharp and browser via OffscreenCanvas) with an explicit `checks` field — an unchecked pass can never read as a pass.
  - East-asian typeface slots (`a:ea`) declared on every text run, so CJK glyphs under Georgia/Consolas render in a controlled font instead of PowerPoint's silent per-glyph substitution.
  - `validate` moves to dual-threshold severity: editorial budgets warn without blocking, geometric content-loss ceilings block. Long bullet items that render fine no longer fail generation.
  - Exact mono width model for code blocks (measured Consolas metrics), universal bullet wrap budgets across all styles, matrix axis-title fitting, and a heading truncation signal the audit can see.
  - Chart robustness: zero/negative data values, mixed-sign dumbbell domains, and extreme magnitudes all export cleanly. Donut/pie center labels attribute contrast against the real sector geometry, not a bounding box.

## 0.4.0 (2026-07-20)

Narrative vocabulary v4 — `narrative`/`strategy`/`pacing`/`beat`, `deck.spec.json`, IR v4 with a `migrate` command for v3 projects. Benchmark-driven fixes: deterministic exports, audit attribution overhaul, CJK copy cleanup, boundary-page hard gates, truncation visibility markers.

## 0.3.0 (2026-07-19)

Keynote-style flat rendering, weighted deterministic layout selection with seed-stable revisions, 13 themes with a real-contrast ink system, deck-project workflow (spec + pages, assemble/disassemble), deterministic audit, speaker notes, preview overlay with annotation export, 28 components including SWOT/BMC/waterfall/gantt.

## 0.1.0 (2026-07-17)

Initial release — semantic IR to native editable PPTX via an SVG dialect compiler.
