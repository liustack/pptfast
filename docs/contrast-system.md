---
summary: 'Ink/contrast machinery (readableOn, accessibleInk, ctx.defaultBg, deck-audit measurement) and the exemption/calibration discipline behind it'
read_when:
  - adding or editing an archetype/component that paints its own background or bakes a text fill
  - a full-matrix-contrast.test.ts failure, or a new colors.muted usage
  - deciding whether a low-contrast finding is a real defect or an adjudicated exception
  - adding to or debugging the optional --pixels pixel-contrast audit
---

# Contrast system

The densest defect history in this project — most of what's below exists because a first-principles-looking fix turned out wrong against real render geometry. Read before touching text color in render code.

## The three-tier contrast policy

Every piece of text this renderer paints falls into exactly one of three tiers. The policy exists because "dim it a bit" used to be a per-archetype, per-reviewer judgment call with no shared floor. The contrast-policy wave (`.issues/2026-07-28-contrast-policy/plan.md`) formalized it after two real violations shipped under that ad-hoc discipline (a copyright line at 2.93:1, a period-ending heading at 1.57:1), neither caught by any gate.

| Tier | What it covers | Floor | Why |
|---|---|---|---|
| **A, content** | Body copy, headings, labels, chart values: anything a reader is expected to read as the page's actual content | 4.5:1 (3:1 for large text, ≥24px) | WCAG 2.1 SC 1.4.3, unchanged. This project's existing baseline (`requiredContrastRatio`, below) |
| **B, meta-information** | Copyright lines, page numbers, organization names, dates: real information, deliberately understated | **3:1, hard, at every size** | See below |
| **C, pure decoration** | Ghost-digit watermarks, motif lines, ambient background elements | No ratio floor, but every instance must live in `full-matrix-contrast.test.ts`'s ratio-banded `ALLOWLIST` | See below |

**Why B is not "incidental text" (WCAG's own carve-out for decoration/logos):** a copyright line carries real content, attribution and legal notice, and a reader can and does read it on demand (verifying who owns a deck, whose logo this is). WCAG's incidental-text exemption is for text nobody is expected to read at all. That is not this. At the same time, a copyright line is short, low-priority, and conventionally rendered quiet, so holding it to the full 4.5:1 body floor would force it to compete visually with actual content. 3:1 (the same numeric floor WCAG already grants *large* text) is the honest middle: legible on demand, still visually subordinate. Treating B as a distinct tier, not "A, but we'll allow a violation" and not "C, so anything goes," is what makes the floor enforceable instead of aspirational.

**Mechanism:** `metaInk(preferredFill, bgHex)` (`src/svg/ink.ts`, below) is B tier's ink-selection counterpart to `accessibleInk`. It keeps the theme's preferred color when it already clears 3:1, otherwise nudges it toward `readableOn`'s neutral ink in small steps rather than jumping straight to full strength. A B-tier text element also carries `data-contrast-tier="meta"` in the rendered SVG. `deck-audit.ts`'s contrast walk reads that attribute and holds the element to 3:1 instead of the default size-driven 4.5:1/3:1 split, a minimal extension of the existing data-audit-attribute family (the same idiom `DECORATIVE_ALPHA`-gated skipping already established: audit behavior varies by attribute, not just by measured geometry). `full-matrix-contrast.test.ts` picks this up automatically since it runs the same `auditDeck` path, no separate test wiring needed.

This tier split **superseded** an earlier per-file adjudication. `ending-banner-ending.tsx`/`ending-rail-ending.tsx` used to each hardcode a private orphan constant (`COPYRIGHT_FAINT`) as a "pin the exact hex, forever, cross-theme" exception, on the theory that a policy-free codebase had no better option than sealing each instance individually. Once a real policy exists, a fixed cross-theme gray is itself the defect: it has no way to stay legible on a background the token system doesn't know about (a dark theme can render a hardcoded light-mode gray unreadable). Both files now derive their copyright-line ink from `metaInk(colors.muted, bg)` instead. See each file's own header comment for the full overturned-verdict history.

C tier (pure decoration) is unchanged in mechanism: it is the existing `ALLOWLIST`/`ratioMin`/`ratioMax` discipline the "Full-matrix regression net" section below already documents, just named explicitly now. The policy's only new requirement on C is that *every* decorative low-contrast instance actually lives in that allowlist (drift is a defect the net catches, not a silent pass), nothing here changes how an entry is written.

## Ink selection (`src/svg/ink.ts`)

`readableOn(bgHex)` (lines 113-120) picks whichever of near-black/white **actually measures the higher WCAG contrast ratio** against `bgHex` — real dual-ink comparison, not a fixed luminance cutover. Its predecessor used a fixed 0.4-luminance threshold that "leaned toward white on a large block," silently giving the wrong ink to every background with luminance in (~0.19, 0.4] (dark ink's true break-even is ~0.19). That bug drove several theme-curation exclusions, all reverted now that the real comparison is in place (`src/themes/definitions.ts:121-146`).

`accessibleInk(preferredFill, bgHex, fontSizePx)` (134-138) is the call every archetype makes at a flagged text element: keep the preferred color if it already clears the size-appropriate ratio (3:1 large text ≥24px, else 4.5:1 — `requiredContrastRatio` mirrors `deck-audit.ts`'s own constants by design), else fall back to `readableOn`. `accessibleOpacity(inkHex, bgHex, fontSizePx, preferredOpacity)` (167-175) does the same for a dimmed secondary-text tier: keep the requested opacity if the alpha-blended result still clears the ratio, else force full opacity.

`metaInk(preferredFill, bgHex)` (220-228) is B tier's own ink pick (see "The three-tier contrast policy" above), the same "keep the preferred color if it already passes" shape as `accessibleInk`, but against a fixed 3:1 floor (`META_CONTRAST_RATIO`, never size-relieved: a meta line's floor doesn't change just because it happens to render large) and a gentler fallback. Instead of `accessibleInk`'s single jump to `readableOn`'s full-strength neutral ink, it walks `preferredFill` toward that neutral ink in `META_INK_STEPS` (20) discrete blend steps and returns the first one that clears 3:1, the smallest nudge that works, since a meta line is deliberately the faintest legible tier on the page and jumping straight to full-strength ink would read as a different tier entirely. Termination is guaranteed: `readableOn(bgHex)` (the walk's own `alpha = 1` end) always measures >= ~4.398:1 against any real background (the dark/light break-even luminance is ~0.1888, see `readableOn`'s own doc comment), comfortably above the 3:1 floor, so the loop always finds a passing step by the last one at the latest. A text element rendered with `metaInk` also needs `data-contrast-tier="meta"` set on its own element so `deck-audit.ts` measures it against the same 3:1 floor instead of the default. See `ending-banner-ending.tsx`/`ending-rail-ending.tsx`'s copyright-line call sites for the paired pattern (ink pick plus attribute, always together).

**Two self-painted-surface precedents**, both real call sites worth copying: `content-tone-adaptive-content.tsx` calls `accessibleInk(colors.text, "#FFFFFF", …)` — a component drawing its own white card ignores `ctx.defaultBg` entirely and measures against the literal fill it just painted. `kpi.tsx` does the same against `ctx.colors.surface` (`accessibleOpacity(colors.muted, colors.surface, 11, 0.7)`). The rule: if you paint the surface, measure against the color you painted, never the ambient page background.

## `ctx.defaultBg`

`full-slide-svg.tsx` resolves one scalar default background per slide (`buildCtx`, doc comment at lines 140-159, assignment at 244-268) for archetypes that paint no panel of their own: theme's per-slide-type default (`resolveBackgroundHex`) → overridden by `slide.background` when set (`resolveOverrideBackgroundHex` — a gradient reduces to its midpoint, not the `.from` stop) → for an asset background, the *painted scrim color* (`themeDefaultBg`, the exact value `autoScrimColor` paints at `AUTO_SCRIM_OPACITY = 0.66`), never `colors.surface`. This chain exists to agree with what `deck-audit.ts` actually measures — an ink decision that disagrees with the rendered pixels is exactly the defect class this file's history is full of.

## Audit measurement (`src/svg/audit/deck-audit.ts`)

**Tier-aware floor:** every run's required ratio comes from `requiredRatioFor(tier, renderedFontSize)`, the existing size-driven A-tier split (3:1 large ≥24px / 4.5:1 body) unless the run carries `data-contrast-tier="meta"` (`META_CONTRAST_TIER`, search by name), in which case it's a hard 3:1 regardless of size. The marker is read the same "own attribute wins, else inherit from the nearest ancestor" way `fill`/`font-size` already are, so a `<tspan>` continuing a marked `<text>` run inherits the tier without repeating the attribute. This is the audit-side half of the three-tier policy above. A render-side `metaInk` call with no matching `data-contrast-tier="meta"` attribute (or vice versa) is a bug, not a style choice: the two must always ship together at a call site, same as `ending-banner-ending.tsx`/`ending-rail-ending.tsx`'s copyright-line pattern.

`findContrastIssues`/`runContrastWalk` (search `deck-audit.ts` by name) resolve background from rendered SVG geometry, not theme tokens, via two parallel tables built in one tree walk (bench-driven fix round, defect A — full history in `MIN_BG_REGION_AREA`'s own doc comment):

- **`regions`/`BgRegion`** — page-level candidates only, `__collectBgRegions`'s contract (its own region-*count* test pins this exactly): `<rect>`/`<image>`/`<path>`, gated by both `MIN_BG_REGION_AREA` (8000px²) and `MIN_BG_OPACITY` (0.5). Untouched by the fix.
- **`paintedShapes`/`PaintedShape`** — text-background *attribution*, floor-free: every opaque-enough (`MIN_BG_OPACITY`-gated) `<rect>`/`<circle>`/`<ellipse>`/`<path>` becomes a candidate regardless of area (`<image>` keeps `regions`' same floor — this renderer only ever paints large, page-covering photos, so an unfloored image candidate has no real case to serve). A `<text>`/`<tspan>` resolves against whichever shape, searched most-recent-first (topmost in paint order), actually *contains* its position: an exact ellipse test (`ellipseShape`, `((px-cx)/rx)²+((py-cy)/ry)²<=1`) for `<circle>`/`<ellipse>` — a corner-anchored text inside a circle's bbox corner but outside the disk itself correctly falls through rather than matching a cruder AABB — a bounding-box test (`rectShape`/`pathBoundingBox`) for `<rect>`/`<image>`, and for `<path>` an exact sector test (`sectorShape`) *when* `d` is recognized as `renderDonut`/`renderPie`'s own wedge idiom (`parseWedgePath`, see the closed limitation below), else the same `rectShape`/`pathBoundingBox` fallback.

The split exists because a badge/chip small enough to correctly *not* count as a page background is still unambiguously the real background of text painted directly on top of it — gating attribution by the page-level floor used to make such text fall through to whatever larger region happened to sit underneath (a card shell, the page background) instead, checked against a color it was never actually rendered on. Resolution is paint-order-safe by construction: a shape only becomes visible to `backgroundAt` once its own element has been visited, so a shape painted *after* a given text in document order is never a candidate for it. Attribution is per-tspan so a multi-tspan meta line doesn't inherit the wrong color. Text below `DECORATIVE_ALPHA` (0.4, line 132) is skipped as intentional decoration. `<g data-decor>` subtrees never become a candidate in either table regardless of size/opacity — decoration layers over the background, never stands in for it.

**Resolved (`fix/arc-bbox`):** `pathBoundingBox` is now SVG path-grammar-aware — it walks a `<path>`'s `d` attribute command-by-command (`M`/`L`/`H`/`V`/`C`/`S`/`Q`/`T`/`A`/`Z`, absolute and relative) instead of extracting every numeric token and taking the min/max. Line commands are exact by construction; `C`/`S`/`Q`/`T` curves use exact derivative-root extrema; an `A`/`a` arc uses the standard endpoint→center parameterization (SVG 1.1 appendix F.6.4/F.6.5) plus the ellipse's own axis-extremal angles, so its `rx`/`ry`/`x-axis-rotation`/flag operands are read as grammar, never mistaken for more coordinates. A malformed `d` the grammar walk can't parse falls back to the old blind token min/max rather than throwing. `insight-panel.tsx`/`roadmap.tsx`'s shared `roundedTopBarPath` accent bar — the concrete case that used to inflate a real ~6px-tall bar to a ~1184×1182px bbox dwarfing the 1280×720 canvas — now measures tight to the bar's own extent. Fixing the misattribution also *exposed* a real, previously-masked defect: both components' `colors.accent`-filled title/period text used to resolve against the bar's own bogus phantom region (same fill color as the bar itself, so every theme scored a trivial ratio=1 "pass"); fixed via `accessibleInk` (this file's own §"Ink selection" precedent — see `deck-audit.test.ts`'s "arc-bbox reclassification ink fixes" for the red→green pin). Historical detail of the original defect stays in `.issues/notes/engineering-history.md`'s "本轮新发现 (a)" record.

**Resolved (`fix/donut-annulus-attribution`):** the residual gap the arc-bbox wave left open — `rectShape`'s own containment test stayed an axis-aligned-box check, never the path's true outline, so a donut/pie wedge's *exact* bbox (already tight since `fix/arc-bbox`) could still legitimately span across the ring's own hole or a pie slice's own un-swept "bite," misattributing the donut's center total-label (or any text sitting in that gap) to a wedge's fill instead of whatever's really behind it. Closed the same way `ellipseShape` already closes the equivalent gap for a circle: `parseWedgePath` recognizes a `<path>`'s `d` as `renderDonut`'s or `renderPie`'s own wedge idiom (`chart-svg.tsx`) — two fixed, tokenizer-matched token shapes, reusing `tokenizePathD`'s own glued-flag-safe grammar walk rather than a raw-string regex — and extracts a `Sector { cx, cy, ri, ro, startA, span }`. A pie's center is written directly into `d` (the `M` point), so no trig is needed to recover it, `ri = 0` (no hole). A donut's center is never written to `d` directly, only two arc endpoints per angle, so it's solved from the one linear relationship those endpoints satisfy (`center = (ro·inner − ri·outer) / (ro − ri)`, exact and non-degenerate since `DONUT_HOLE_RATIO < 1` always keeps `ro ≠ ri`), cross-checked against the opposite endpoint pair before being trusted. `sectorShape` then tests radius-band membership (`ri ≤ dist ≤ ro`) *and* angular range together, instead of `rectShape`'s box-only test. A reclassification sweep (13 themes × balanced/skewed-weight donut and pie fixtures, mirroring the arc-bbox wave's own unshipped probe) found 88 pre-fix misattributions, every one resolving to a `chartPalette` wedge color rather than any real page/card background, and 0 post-fix — full elimination in that probe, not the arc-grammar fix's partial halving, because the two defects were never the same mechanism (arc-parameter misreading vs. AABB-vs-real-outline approximation). A positive control (text genuinely on a wedge's own band) still resolves to the wedge both before and after — this is a precision upgrade, not a new exclusion. Recognition is narrow by design: any `d` that isn't one of `renderDonut`/`renderPie`'s own two exact token shapes — including every other `<path>` this codebase or a caller might render — keeps the unchanged `rectShape`/`pathBoundingBox` AABB fallback. That general-path limitation is unresolved and not a goal here: "document the tool limitation, don't chase it" still applies to an arbitrary path's true outline, same precedent this file's history is already full of — only the donut/pie idiom, a closed and parseable family, is special-cased.

**Hardening (same branch, post-review):** token *shape* alone is falsifiable — a review pass found a hand-authored `d` unrelated to either renderer can satisfy the same 15/23-token grammar with numbers that don't actually describe a circle, silently deriving a *wrong* sector instead of correctly falling back, which could flip a real `findContrastIssues` verdict (a genuine finding disappearing) rather than just missing the precision upgrade. `parseWedgePath` now round-trips every point it reads (`x1,y1`/`x2,y2` for a pie, all four outer/inner points for a donut) against its own claimed radius from the resolved center, and checks the large-arc-flag against the span its own endpoints imply — a genuine wedge always round-trips exactly (the points *are* `cx + r·cos(θ), cy + r·sin(θ)` by construction), so this only ever rejects a near-miss, never a real wedge. Reject-only by construction: it can turn a wrongly-accepted sector back into the correct AABB fallback, never the reverse, so it cannot regress a deck that already round-tripped cleanly (the 13-theme sweep above re-run unchanged: 0 findings). One case surfaced during this hardening that no geometric check can (or should) resolve: `motif-rail-motif.tsx`'s `ARC_PATH_BL` decoration is built from the identical "center point, two points on a shared circle" idiom, because it genuinely *is* a quarter-circle sector, not a coincidental near-miss — rejecting it would also reject a real wedge that happens to land on clean numbers. Its own safety net is orthogonal to recognition: `RailMotif` only ever renders it inside `<g data-decor>` at `opacity="0.06"`, two already-tested, independent exclusions that gate the whole attribution push regardless of what `parseWedgePath` returns — pinned directly in `deck-audit.test.ts` against `ARC_PATH_BL`'s own real geometry, not a stand-in.

## Overlap detection boundary (`findOverlapIssues`, same file)

`findOverlapIssues` pairwise-compares `collectLeafBoxes`' output — one box
per leaf `data-audit-box`, which only ever carries `x,y,w` (never a height,
by the existing protocol's own design). Height is reconstructed per box from
whatever geometry is drawn inside it — a background/icon `<rect>`'s own real
extent when there is one, or, for a text-only box with no such rect,
`TEXT_DESCENT_RATIO` applied to each `<text>`'s baseline. Width starts from
that declared `w` too, but (borrow-wave Task 4, inventory-first) is no
longer a hard ceiling: each `<text>` leaf also widens its box's `x`/`w` to
the union of the declared span and its own estimated ink extent —
`measureTextUnits`, or `measureMonoTextUnits` when `isMonoFontFamily`
reliably reads the mono role off the rendered `font-family` — anchored by
that element's own `text-anchor`, the same choice `svg-audit.ts`'s sibling
h-overflow check already makes. Either way, this is still
**container-declared-geometry precision, not glyph-ink precision** — the
same "measured vs. real" distinction this file's ink/contrast sections keep
surfacing, here applied to position instead of color: widening a box from an
*estimate* narrows the gap to real rendered ink, it does not close it.

That makes the detector structurally blind to two collision classes, both a
direct consequence of comparing declared/estimated boxes instead of
genuinely rendered ink, not of insufficient calibration:

- A padded declared box can overlap a neighbor while the real glyphs inside
  stay far apart — a possible false positive. In practice this needs no
  chasing: `layoutContentFit` shrinks gaps or drops components rather than
  ever letting two placed components' boxes collide, so a real, IR-driven
  positive fixture isn't reachable through this renderer's normal layout
  path at all (this function's own doc comment records that directly).
  Unaffected by Task 4's width estimate — widening a box only ever grows it,
  never shrinks it, so this half behaves exactly as before (pinned unchanged
  by `deck-audit.test.ts`'s Case A synthetic test).
- Text that would render wider than its declared box can overflow into a
  neighboring box the detector still reports as clear — a false negative.
  Task 4 **narrows** this, it does not close it. Two gaps remain, both
  recorded rather than chased:
  - The added width is still an *estimate*, not a real glyph-metrics
    measurement, so it carries the same per-exported-font calibration gap
    this file already tracks from the color side: `render.ts`'s deliberate
    `opts.wrap = false` choice lets a width-estimate miss surface as visible
    horizontal overflow instead of silent re-wrapping, and a font
    substitution PowerPoint makes at open time that the estimate didn't
    anticipate can still under-shoot this detector's now-wider box, the same
    way it could always under-shoot the renderer's own `fitSvgLine` call.
    That is the estimator/layout shared-blindness structural gap (borrow-
    wave Task 3 review's Important-1 finding) — extending `collectLeafBoxes`
    narrows the amount of *unwidened* text this detector misses, it does not
    make estimate-vs-real-glyph drift go away.
  - Worth separating from that kerning gap, which is permanent and
    weight-independent: this branch's bold-metrics fix (2026-07-24) made the
    renderer bold-aware first (`measureTextUnits` gained a
    `{ bold, fontFamily }` parameter, `isBold()`'s threshold mirroring
    `svg2pptx/text.ts`'s own OOXML `b="1"` decision), which for one window
    left both auditors still assuming Regular weight against real bold
    render geometry — a structural under-widening on bold text specifically,
    not kerning-scale rounding noise. That gap is now closed, not just
    narrowed: `svg-audit.ts`'s h-overflow check and `collectLeafBoxes`'s
    overlap widening (the twin consumer this fix restored parity on) both
    read the element's real `font-weight` via `isBold()` before measuring.
  - The estimate only ever reaches text inside a live `data-audit-box`
    scope. Task 4's grep inventory (task-4-report.md, borrow-wave
    scratchpad, not shipped in this repo) found the codebase's largest
    concentration of unprotected, user-content-level `<text>` sits *outside*
    that scope entirely, by the same construction that already excludes
    decoration/motif layers from this walk: `brand-chrome.tsx`'s footer
    (org/date/version), 18 cover/chapter/ending archetypes' own org label,
    `image-pages.tsx`'s raw org/date lines, and three archetypes' raw
    `slide.footnote` all render as page-level chrome — siblings of, never
    nested inside, any `data-audit-box`. None of that surface is touched by
    this fix. Being inside a tracked box is also arrangement-dependent, not
    a component-type property: `big_number`/`assertion_evidence` render
    their supporting components through a bare `renderComponent(...)` with
    no `data-audit-box` wrapper at all, so the very same component this fix
    covers under a boxed arrangement goes uncovered there (only the
    page-overflow check still sees it). Two confirmed, shipping instances
    the inventory found *inside* a tracked box: `matrix.tsx`'s `x_title`
    (rendered with zero width fit before this task) and `chart.tsx`'s
    `axes.x_title`/`axes.y_title` (rendered inside `svg-content.tsx`'s own
    `data-audit-box` wrapper, same as any other normally-placed component) —
    the concrete cases this fix protects today for text that actually
    renders inside a live tracked box.

Recorded here as a known, narrowed-but-not-closed boundary, not a settled
one — same discipline as this section's donut/pie AABB gap above.

## Full-matrix regression net (`full-matrix-contrast.test.ts`)

Sweeps every theme × slide type × curated archetype for the W4 defect class. Two guardrails worth knowing about:

- **`ALLOWLIST`** (`full-matrix-contrast.test.ts`, search by name): named, adjudicated exceptions only — never silent. Each entry documents *why* — e.g. `fashion-chapter`'s decorative chapter-number watermark (deliberately faint by design; carries a `ratioMin`/`ratioMax` band plus a `TEXT_SHAPE_GUARD` regex so a future regression on the same digit still fails the net instead of silently matching the old exception) or `tech`'s `fashion-masthead` meta line (a single reviewer-adjudicated rounding-distance-under-the-floor borderline, theme+layout-scoped with no shape/ratio guard needed). Since the contrast-policy wave (task T3, tier-annotation ruling), each entry also carries an explicit tier annotation. `fashion-chapter`'s watermark is C tier (pure decoration, exempt from any ratio floor by policy, on the condition that it's recorded here, which it is). `fashion-masthead`'s meta line is B tier and, re-measured against the 3:1 B floor instead of the 4.5:1 body line it was originally written against, comfortably clears it (not a policy violation: it stays allowlisted only because nothing routes it through `metaInk`/`data-contrast-tier="meta"` yet, so `deck-audit` still measures it at the unmarked default).
- **`MUTED_SURFACE_CLASS`** + its completeness guard (same file, search by name — line numbers drift with every test insertion, so this doc cites symbols only): every `COMPONENT_TYPES` entry needs a human-reviewed classification of where its `colors.muted` text renders (`no-muted-fill`/`page-bg`/`flat-surface`/`needs-fixture`/`known-gap`) — `Object.hasOwn` against `COMPONENT_TYPES` fails the test the moment a 33rd component ships unclassified. Exists because a first calibration pass probed only two surfaces (page background, bento-panel card) and missed `content-matrix`'s tone-blended cell background entirely — this guard closes the *class* of blind spot, not just that instance.

## Muted calibration discipline

`colors.muted` recalibration is hue/saturation-preserving, minimum-lightness-only — see any `themes/<id>.ts`'s inline comment on its `muted` token (e.g. `src/themes/insight.ts:14`) for the pattern: adjust luminance just far enough to clear 4.5:1 against every real background it renders on, change nothing else about the color.

## The optional pixel layer (`--pixels`, audit-v2 phase B)

`findContrastIssues`'s `PaintedShape` walk (above) resolves a text's background from rendered SVG geometry — but a bare or too-faintly-scrimmed `<image>` gives it nothing to resolve: the walk correctly returns `null` rather than guess, and the text is skipped. `image-pages.tsx`'s `ImageCoverPage` (the cover/chapter takeover for an asset background) is the one real archetype this happens on — its `DarkScrim` is three stacked `fill-opacity` bands (0.3/0.28/0.3), each individually below `MIN_BG_OPACITY` (0.5), so none of them ever become a `PaintedShape` and every heading/caption on that page resolves to "unknown, skip".

`auditDeck(ir, { pixels: true })` (`src/svg/audit/pixel-audit.ts`) closes that one gap, and only that one — it does not re-check anything the SVG walk already resolved. Flow (spec §4.3):

1. `__collectImageBackedTextRuns` (`deck-audit.ts`) — the same background-resolution walk above, just reading its `background === null` runs instead of discarding them. A page with none skips every step below entirely.
2. `stripTextNodes` (`pixel-audit.ts`) — a plain string removal of every `<text>` element, not a DOM round-trip (SVG has no reflow, so removing an element can't move anything else, and a round-trip risks a serializer producing markup that doesn't byte-match a real browser's).
3. `rasterizeSvg(stripped, 1280, 720)` — the platform seam's own primitive (`src/platform/registry.ts`): Sharp in Node (`installNodePlatform()`, spec §11.9's pre-authorized default — see the escape clause below), native `Image`/`OffscreenCanvas`/`<canvas>` in a browser (`src/platform/browser.ts`, spec §11.8, zero new dependency). Missing capability is an explicit `auditDeck` rejection, never a silent clean report — the same "未检查≠通过" contract extended to a platform's own capability (spec §11.7).
4. A dense, deterministic 5px-stride grid is sampled across each run's estimated box (font-metric left/right/baseline, the same estimate `svg-audit.ts`'s overflow walker uses — not a real glyph bbox), each sample point itself a small 3×3-pixel window average rather than one raw pixel, tracking the least-favorable (lowest) contrast ratio found overall — spec's own "worst-case band". Replaced a fixed 5×3-point grid (deep-acceptance review, post-v0.4): that grid's own "15 points is enough" justification was falsified by a hand-verified repro — a real sub-1.5:1 patch 35px from the nearest sample column (columns were 70px apart at `ImageCoverPage`'s real org-line scale) produced zero findings, yet the identical patch was caught the moment it happened to land on a column. The 5px stride (half of a 10px "glyph-scale" minimum patch size) guarantees any contiguous bad patch that size or larger is always fully covered by at least one sample window regardless of alignment — see `pixel-audit.ts`'s `worstCaseSample` for the covering proof — while the 3×3 window average keeps a lone noisy pixel (rasterizer antialiasing, photo grain) from flipping a genuinely-safe patch into a false finding. Cost stays negligible: ~2-5ms per audited page measured against a worst-case-ish two-run scenario (a full-width heading-scale run plus the org line, both image-backed simultaneously — headings don't actually reach this blind spot today, only the short org/date line does), well under the Sharp rasterization call it rides alongside.
5. Only a ratio below **1.5:1** becomes a finding (`code: "low-contrast"`, `detail.source: "pixels"` distinguishes it from an SVG-resolved one) — deliberately far below either real WCAG floor (3:1 large text, 4.5:1 body) to control false positives, since pixel sampling carries antialiasing/rasterizer noise the SVG-only walk never has to deal with. A real, non-extreme `ImageCoverPage` case (org-line text, single 0.3-opacity scrim layer) tops out around ~1.8-1.9 even against a pure-white photo — clearing 1.5 by design, not a gap: v1 favors under-flagging a borderline pairing over false-positiving on one that would read fine.

Remote (`http(s):`) image references never reach a rasterizer at all — `findRemoteAssetRef` (`registry.ts`) scans the markup and rejects before either platform implementation runs, shared by both: spec §3.1/§7 promise the default audit chain never makes a network request, and a browser `<img>` load of a remote asset in this restricted context silently drops rather than reliably tainting the canvas, which would otherwise sample a blank region as if it were the real background — exactly the "checked nothing, reported clean" failure this whole wave rules out.

**Sharp escape-clause verdict (spec §11.9):** the pre-authorized trigger to swap Sharp for `@resvg/resvg-js` is "a real render out of this repo's own SVG subset comes back visibly wrong" — `src/platform/node-rasterize.test.ts`'s probe suite renders gradient bands, a rounded arc path built with `insight-panel.tsx`/`roadmap.tsx`'s own `roundedTopBarPath` grammar, an embedded PNG bitmap, and `DarkScrim`-shaped stacked transparency, each against independently-computed expected colors. Sharp passed every case cleanly (solid fills and gradient bands are pixel-exact, three-layer transparency compositing lands within 1/255 of hand-computed sequential blending). The clause does not trigger. Sharp stays.

**Determinism footnote (spec §11.10):** the pixel layer does *not* extend the main audit's cross-run byte-stability promise (same IR → byte-identical JSON) to a cross-*platform* one — Sharp/librsvg and a browser's own canvas implementation antialias differently, so the same deck can sample a different worst-case pixel (and therefore a different ratio) on Node versus in a browser. Same platform, same input still produces a stable result. The 1.5:1 gate sits far enough below both real WCAG floors that this noise is not expected to flip a verdict in practice.
