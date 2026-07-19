---
summary: 'Ink/contrast machinery (readableOn, accessibleInk, ctx.defaultBg, deck-audit measurement) and the exemption/calibration discipline behind it'
read_when:
  - adding or editing an archetype/component that paints its own background or bakes a text fill
  - a full-matrix-contrast.test.ts failure, or a new colors.muted usage
  - deciding whether a low-contrast finding is a real defect or an adjudicated exception
---

# Contrast system

The densest defect history in this project — most of what's below exists because a first-principles-looking fix turned out wrong against real render geometry. Read before touching text color in render code.

## Ink selection (`src/svg/ink.ts`)

`readableOn(bgHex)` (lines 113-120) picks whichever of near-black/white **actually measures the higher WCAG contrast ratio** against `bgHex` — real dual-ink comparison, not a fixed luminance cutover. Its predecessor used a fixed 0.4-luminance threshold that "leaned toward white on a large block," silently giving the wrong ink to every background with luminance in (~0.19, 0.4] (dark ink's true break-even is ~0.19). That bug drove several theme-curation exclusions, all reverted now that the real comparison is in place (`src/themes/definitions.ts:70-95`).

`accessibleInk(preferredFill, bgHex, fontSizePx)` (134-138) is the call every archetype makes at a flagged text element: keep the preferred color if it already clears the size-appropriate ratio (3:1 large text ≥24px, else 4.5:1 — `requiredContrastRatio` mirrors `deck-audit.ts`'s own constants by design), else fall back to `readableOn`. `accessibleOpacity(inkHex, bgHex, fontSizePx, preferredOpacity)` (167-175) does the same for a dimmed secondary-text tier: keep the requested opacity if the alpha-blended result still clears the ratio, else force full opacity.

**Two self-painted-surface precedents**, both real call sites worth copying: `content-tone-adaptive-content.tsx` calls `accessibleInk(colors.text, "#FFFFFF", …)` — a component drawing its own white card ignores `ctx.defaultBg` entirely and measures against the literal fill it just painted. `kpi.tsx` does the same against `ctx.colors.surface` (`accessibleOpacity(colors.muted, colors.surface, 11, 0.7)`). The rule: if you paint the surface, measure against the color you painted, never the ambient page background.

## `ctx.defaultBg`

`FullSlideSvg.tsx` resolves one scalar default background per slide (`buildCtx`, doc comment at lines 140-159, assignment at 244-268) for archetypes that paint no panel of their own: theme's per-slide-type default (`resolveBackgroundHex`) → overridden by `slide.background` when set (`resolveOverrideBackgroundHex` — a gradient reduces to its midpoint, not the `.from` stop) → for an asset background, the *painted scrim color* (`themeDefaultBg`, the exact value `autoScrimColor` paints at `AUTO_SCRIM_OPACITY = 0.66`), never `colors.surface`. This chain exists to agree with what `deck-audit.ts` actually measures — an ink decision that disagrees with the rendered pixels is exactly the defect class this file's history is full of.

## Audit measurement (`src/svg/audit/deck-audit.ts`)

`findContrastIssues`/`runContrastWalk` (454-709) resolve background from rendered SVG geometry, not theme tokens, via two parallel tables built in one tree walk (bench-driven fix round, defect A — full history in `MIN_BG_REGION_AREA`'s own doc comment):

- **`regions`/`BgRegion`** — page-level candidates only, `__collectBgRegions`'s contract (its own region-*count* test pins this exactly): `<rect>`/`<image>`/`<path>`, gated by both `MIN_BG_REGION_AREA` (8000px², line 218) and `MIN_BG_OPACITY` (0.5, line 228). Untouched by the fix.
- **`paintedShapes`/`PaintedShape`** — text-background *attribution*, floor-free: every opaque-enough (`MIN_BG_OPACITY`-gated) `<rect>`/`<circle>`/`<ellipse>`/`<path>` becomes a candidate regardless of area (`<image>` keeps `regions`' same floor — this renderer only ever paints large, page-covering photos, so an unfloored image candidate has no real case to serve). A `<text>`/`<tspan>` resolves against whichever shape, searched most-recent-first (topmost in paint order), actually *contains* its position: an exact ellipse test (`ellipseShape`, `((px-cx)/rx)²+((py-cy)/ry)²<=1`) for `<circle>`/`<ellipse>` — a corner-anchored text inside a circle's bbox corner but outside the disk itself correctly falls through rather than matching a cruder AABB — and a bounding-box test (`rectShape`/`pathBoundingBox`) for the other three.

The split exists because a badge/chip small enough to correctly *not* count as a page background is still unambiguously the real background of text painted directly on top of it — gating attribution by the page-level floor used to make such text fall through to whatever larger region happened to sit underneath (a card shell, the page background) instead, checked against a color it was never actually rendered on. Resolution is paint-order-safe by construction: a shape only becomes visible to `backgroundAt` once its own element has been visited, so a shape painted *after* a given text in document order is never a candidate for it. Attribution is per-tspan so a multi-tspan meta line doesn't inherit the wrong color. Text below `DECORATIVE_ALPHA` (0.4, line 132) is skipped as intentional decoration. `<g data-decor>` subtrees never become a candidate in either table regardless of size/opacity — decoration layers over the background, never stands in for it.

**Known limitation:** `pathBoundingBox` (332-351) has no SVG path-grammar awareness — it extracts every numeric token from a `<path>`'s `d` attribute and takes the min/max, exact for a straight-line polygon but silently wrong for an arc command (`A rx ry x-axis-rotation large-arc-flag sweep-flag x y`), whose radius/rotation/flag numbers get paired as if they were more coordinates. `insight_panel.tsx`/`roadmap.tsx`'s shared `roundedTopBarPath` accent bar hits this: a real ~6px-tall bar's computed bbox comes back ~1184×1182px, dwarfing the 1280×720 canvas, and wins every `backgroundAt` lookup for everything painted after it. Recorded, not fixed — real arc flattening is a separate, already-tracked backlog item (`.issues/notes/2026-07-18-post-v03-backlog.md`); the attribution fix above doesn't interact with it either way (the bogus bbox already cleared `MIN_BG_REGION_AREA` by ~2 orders of magnitude before that fix, so removing the floor changed nothing about this bug).

## Full-matrix regression net (`full-matrix-contrast.test.ts`)

Sweeps every theme × slide type × curated archetype for the W4 defect class. Two guardrails worth knowing about:

- **`ALLOWLIST`** (142-200): named, adjudicated exceptions only — never silent. Each entry documents *why* — e.g. `fashion-chapter`'s decorative chapter-number watermark (deliberately faint by design; carries a `ratioMin`/`ratioMax` band plus a `TEXT_SHAPE_GUARD` regex so a future regression on the same digit still fails the net instead of silently matching the old exception) or `tech`'s `fashion-masthead` meta line (a single reviewer-adjudicated rounding-distance-under-the-floor borderline, theme+layout-scoped with no shape/ratio guard needed).
- **`MUTED_SURFACE_CLASS`** (543-680) + completeness guard (683-698): every one of the 28 `COMPONENT_TYPES` needs a human-reviewed classification of where its `colors.muted` text renders (`no-muted-fill`/`page-bg`/`flat-surface`/`needs-fixture`/`known-gap`) — `Object.hasOwn` against `COMPONENT_TYPES` fails the test the moment a 29th component ships unclassified. Exists because a first calibration pass probed only two surfaces (page background, bento-panel card) and missed `content-matrix`'s tone-blended cell background entirely — this guard closes the *class* of blind spot, not just that instance.

## Muted calibration discipline

`colors.muted` recalibration is hue/saturation-preserving, minimum-lightness-only — see any `themes/<id>.ts`'s inline comment on its `muted` token (e.g. `src/themes/insight.ts:14`) for the pattern: adjust luminance just far enough to clear 4.5:1 against every real background it renders on, change nothing else about the color.
