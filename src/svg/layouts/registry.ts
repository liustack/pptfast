/**
 * Layout registry (W2 task 1, spec §3/§6/§8): an explicit, statically-checked
 * description of what the render chain's 33 archetype components + 4
 * page-level image takeovers already draw. This is a metadata layer only —
 * it formalizes today's implicit page structure (archetype JSX + the
 * FullSlideSvg takeover dispatch) into named `slots`, it does not change any
 * drawing code.
 *
 * **Aggregator, not author (src domain reorg wave 1, task T1d).** Every
 * individual `LayoutDefinition` used to live here as a literal Record entry.
 * Each one now lives beside the archetype JSX it describes instead — an
 * `export const layoutDef: LayoutDefinition` at the bottom of the matching
 * `archetypes/*.tsx` file, or one of 4 uniquely-named exports at the bottom
 * of `image-pages.tsx` for the takeovers (one file implements all 4, so they
 * can't share the uniform `layoutDef` name the 33 single-layout archetype
 * files use) — so "take one layout away whole" is a single-file operation
 * instead of a two-file archaeology dig. This file's own job is now purely
 * computational aggregation: import every `layoutDef`, assemble the five
 * Records below (`{ [def.id]: def }`-style, preserving the exact key order
 * the pre-migration literals held — order is load-bearing, not cosmetic, see
 * `registry.migration-guard.test.ts`'s own header comment), merge them into
 * `LAYOUT_REGISTRY`, and keep every type, query function
 * (`getLayout`/`layoutsForSlideType`), and validation function
 * (`filterByNarrativesOnly`) that reads the result. Never a re-export relay
 * — every line below either constructs a Record or queries/validates one
 * (this wave's aggregator discipline).
 *
 * Source of truth for each definition's own content: the archetype file it
 * now lives in cites `.issues/notes/2026-07-18-w2-archetype-region-inventory.md`
 * (the W2 pre-flight inventory) plus a direct re-read of the archetype file
 * itself — where the inventory's summary and the code disagreed, the code
 * won (see the W2 task report for the one confirmed case: image-annotate).
 *
 * Slot `accepts` convention used throughout every `layoutDef`:
 *  - `[]` (empty array): the slot is *not* fed by an authored component
 *    — it's derived straight from slide-level scalar fields (`slide.heading`,
 *    `slide.subheading`), `ir.meta.*` (organization/date/version/contact/
 *    copyright/confidentiality), or pure computed geometry (chapter-number
 *    watermarks, rail progress dots, decorative motifs inline in the
 *    archetype file). There is nothing here for an author to place.
 *  - `"any"`: the slot renders whatever `Component`s it's handed, unfiltered
 *    (`SvgContent`'s body, bento's grid, stacked-poster's hero/strip).
 *  - a literal component-type list: the slot requires that specific component
 *    type (`image`, `bullets`) — used only by the 4 takeover layouts, which
 *    `Array.find` a specific component type out of `slide.components`.
 */

// Type-only import from the shared leaf tuple module (not `@/narrative`
// itself, which owns the nominal `Strategy` type this mirrors structurally)
// — W4 import-cycle precedent: `src/themes/definitions.ts` imports this
// registry (`getLayout`), so this registry importing `@/narrative` (which
// could plausibly grow a reason to read theme/layout data back some day)
// would risk the same narrative↔consumer cycle W3 already broke once by
// carving `src/ir/narrative-values.ts` (renamed from `scenario-values.ts` in
// the vocabulary-v4 rename, task 1) out as a dependency-free leaf.
// `Strategy` here and `@/narrative`'s own `Strategy` are the exact same
// literal union (derived from the identical tuple) — TypeScript's
// structural typing makes them freely interchangeable at every call site, so
// no cast is ever needed where the two meet (`layout-selection.ts`'s
// `resolveArchetypeId`).
import type { STRATEGY_VALUES } from "@/ir/narrative-values"

// ── layoutDef imports (src domain reorg wave 1, task T1d): 33 archetype
// files (one `layoutDef` each) + image-pages.tsx's 4 uniquely-named takeover
// exports — 37 bindings total. Grouped by family, each group in the exact
// order its former literal Record held (order feeds `layoutsForSlideType`'s
// `Object.values` walk below, which feeds `theme.layouts[type]`'s array
// order, which `resolveArchetypeId`'s `weightedPickBySeed` samples from
// positionally — see registry.migration-guard.test.ts). Aliased to a
// family-prefixed camelCase name (mirrors each file's own name) since 33
// files all export the same bare `layoutDef`.
import { layoutDef as coverBannerTitle } from "../archetypes/cover-banner-title"
import { layoutDef as coverPosterCenter } from "../archetypes/cover-poster-center"
import { layoutDef as coverLeftAnchor } from "../archetypes/cover-left-anchor"
import { layoutDef as coverConstellation } from "../archetypes/cover-constellation"
import { layoutDef as coverEditorialMasthead } from "../archetypes/cover-editorial-masthead"
import { layoutDef as coverToneAdaptiveHeader } from "../archetypes/cover-tone-adaptive-header"
import { layoutDef as coverFashionMasthead } from "../archetypes/cover-fashion-masthead"
import { layoutDef as coverSplitDiagonal } from "../archetypes/cover-split-diagonal"

import { layoutDef as chapterMastheadChapter } from "../archetypes/chapter-masthead-chapter"
import { layoutDef as chapterConstellationChapter } from "../archetypes/chapter-constellation-chapter"
import { layoutDef as chapterRailChapter } from "../archetypes/chapter-rail-chapter"
import { layoutDef as chapterBannerChapter } from "../archetypes/chapter-banner-chapter"
import { layoutDef as chapterPosterChapter } from "../archetypes/chapter-poster-chapter"
import { layoutDef as chapterRomanChapter } from "../archetypes/chapter-roman-chapter"
import { layoutDef as chapterToneAdaptiveChapter } from "../archetypes/chapter-tone-adaptive-chapter"
import { layoutDef as chapterFashionChapter } from "../archetypes/chapter-fashion-chapter"

import { layoutDef as endingMastheadEnding } from "../archetypes/ending-masthead-ending"
import { layoutDef as endingConstellationEnding } from "../archetypes/ending-constellation-ending"
import { layoutDef as endingRailEnding } from "../archetypes/ending-rail-ending"
import { layoutDef as endingBannerEnding } from "../archetypes/ending-banner-ending"
import { layoutDef as endingPosterEnding } from "../archetypes/ending-poster-ending"
import { layoutDef as endingToneAdaptiveEnding } from "../archetypes/ending-tone-adaptive-ending"
import { layoutDef as endingFashionEnding } from "../archetypes/ending-fashion-ending"

import { layoutDef as contentNarrowColumn } from "../archetypes/content-narrow-column"
import { layoutDef as contentTwoColumn } from "../archetypes/content-two-column"
import { layoutDef as contentRailNumbered } from "../archetypes/content-rail-numbered"
import { layoutDef as contentBannerHeading } from "../archetypes/content-banner-heading"
import { layoutDef as contentStackedPoster } from "../archetypes/content-stacked-poster"
import { layoutDef as contentBentoPanel } from "../archetypes/content-bento-panel"
import { layoutDef as contentToneAdaptiveContent } from "../archetypes/content-tone-adaptive-content"
import { layoutDef as contentSideHighlight } from "../archetypes/content-side-highlight"
import { layoutDef as contentAsymmetricTriptych } from "../archetypes/content-asymmetric-triptych"
import { layoutDef as contentQuietFrame } from "../archetypes/content-quiet-frame"

import {
  imageSplitLayoutDef,
  imageTopLayoutDef,
  imageBottomLayoutDef,
  imageAnnotateLayoutDef,
} from "../image-pages"

export type Strategy = (typeof STRATEGY_VALUES)[number]

export type SlideType = "cover" | "chapter" | "content" | "ending"

/** The 16-word slot vocabulary — the union of every distinct visual region
 * observed across all 33 archetypes + 4 takeovers (inventory's "建议 slot
 * 词汇表"). Not every word is used by every entry, and `aside` currently
 * has zero occurrences as a *slot* (it only exists today as a body
 * `arrangement` — see `Arrangement` below) — kept in the vocabulary because
 * the interface contract types it as a first-class slot name for future use. */
export type SlotName =
  | "kicker"
  | "heading"
  | "subheading"
  | "rule"
  | "body"
  | "aside"
  | "image"
  | "caption"
  | "hero"
  | "strip"
  | "grid"
  | "annotation"
  | "watermark"
  | "rail"
  | "meta"
  | "decor"
  // P1 variety wave, task 4 (content-pool expansion): side-highlight's
  // persistent chrome panel, asymmetric-triptych's three body regions.
  | "panel"
  | "lead"
  | "top"
  | "bottom"

/** Body-arrangement enum (the retired `variant` field's 9-value non-image
 * subset — W2 task 3 split the other 4 image values off into first-class
 * takeover layouts — see `TAKEOVER_LAYOUTS` below). snake_case, matching
 * component-type naming convention. */
export type Arrangement =
  | "single"
  | "two_column"
  | "kpi_focus"
  | "image_focus"
  | "code"
  | "quote"
  | "big_number"
  | "assertion_evidence"
  | "aside"

export interface LayoutSlot {
  name: SlotName
  /** component type names this slot accepts, or "any" */
  accepts: readonly string[] | "any"
  /** declarative editorial capacity — how many components this slot holds. W3's
   *  min(pacing editorial budget, layout capacity) gate is the consumer —
   *  absent = chrome slot, not subject to counting. */
  capacity?: number
  /** for image slots: today's two coexisting conventions (inventory §variant 速查) */
  selection?: "first" | "all"
}

export interface LayoutDefinition {
  id: string
  kind: "archetype" | "takeover"
  slideTypes: readonly SlideType[]
  slots: readonly LayoutSlot[]
  /** content archetypes only: which body arrangements this layout honors
   *  (inventory's 4 直接尊重全部 + stacked-poster（W2 任务 3 裁决，条件接管
   *  路径见其注释）共 5 个 → "all"，two-column → ["two_column"]，
   *  bento-panel → ["single"]) */
  arrangements?: readonly Arrangement[] | "all"
  /**
   * Auto-selection strategy allowlist (W4, spec §6 step 4's rare
   * `narratives_only` hard constraint — distinct from the soft ×3/×1
   * `layoutTendencies` weighting in `STRATEGY_DEFINITIONS`, `src/narrative`):
   * when set, `resolveArchetypeId` (`../layout-selection.ts`) drops this
   * layout from the auto-pick pool unless the resolved narrative's
   * `strategy` is a member. An explicit `slide.layout` pin bypasses
   * selection entirely (spec §3: "显式指定不经选型"), so this field never
   * blocks a pin — only auto-pick. `undefined` (every built-in layout today
   * — the mechanism lands ahead of any real consumer) means unrestricted:
   * every strategy is eligible. See {@link filterByNarrativesOnly} for the
   * pure filter this field feeds.
   */
  narrativesOnly?: readonly Strategy[]
}

/**
 * Pure `narrativesOnly` filter (W4, spec §6 step 4's hard constraint): keep a
 * layout when its `narrativesOnly` is unset, drop it when set and `strategy`
 * is not a member. Generic over any `narrativesOnly`-shaped record (not just
 * `LayoutDefinition`) so a unit test can exercise it against synthetic
 * fixtures without touching the real registry.
 */
export function filterByNarrativesOnly<T extends { narrativesOnly?: readonly Strategy[] }>(
  defs: readonly T[],
  strategy: Strategy,
): T[] {
  return defs.filter((def) => def.narrativesOnly === undefined || def.narrativesOnly.includes(strategy))
}

// ─────────────────────────────────────────────────────────────────────────
// Cover archetypes (8) — cover/chapter/ending never read `slide.components`
// (inventory headline finding — see each archetype's own `layoutDef`
// comment for the file-by-file confirmation), so none of them declare a
// `body` slot.
// ─────────────────────────────────────────────────────────────────────────
const COVER_LAYOUTS: Record<string, LayoutDefinition> = {
  [coverBannerTitle.id]: coverBannerTitle,
  [coverPosterCenter.id]: coverPosterCenter,
  [coverLeftAnchor.id]: coverLeftAnchor,
  [coverConstellation.id]: coverConstellation,
  [coverEditorialMasthead.id]: coverEditorialMasthead,
  [coverToneAdaptiveHeader.id]: coverToneAdaptiveHeader,
  [coverFashionMasthead.id]: coverFashionMasthead,
  [coverSplitDiagonal.id]: coverSplitDiagonal,
}

// ─────────────────────────────────────────────────────────────────────────
// Chapter archetypes (8) — every one carries a chapter-number `watermark`
// (translucent or opaque numeral; inventory's "watermark numerals" example),
// paired with `heading`. No body slot (chapter never reads components).
// ─────────────────────────────────────────────────────────────────────────
const CHAPTER_LAYOUTS: Record<string, LayoutDefinition> = {
  [chapterMastheadChapter.id]: chapterMastheadChapter,
  [chapterConstellationChapter.id]: chapterConstellationChapter,
  [chapterRailChapter.id]: chapterRailChapter,
  [chapterBannerChapter.id]: chapterBannerChapter,
  [chapterPosterChapter.id]: chapterPosterChapter,
  [chapterRomanChapter.id]: chapterRomanChapter,
  [chapterToneAdaptiveChapter.id]: chapterToneAdaptiveChapter,
  [chapterFashionChapter.id]: chapterFashionChapter,
}

// ─────────────────────────────────────────────────────────────────────────
// Ending archetypes (7) — heading + meta (contact/copyright/org) is the
// universal pair; no body slot (ending never reads components).
// ─────────────────────────────────────────────────────────────────────────
const ENDING_LAYOUTS: Record<string, LayoutDefinition> = {
  [endingMastheadEnding.id]: endingMastheadEnding,
  [endingConstellationEnding.id]: endingConstellationEnding,
  [endingRailEnding.id]: endingRailEnding,
  [endingBannerEnding.id]: endingBannerEnding,
  [endingPosterEnding.id]: endingPosterEnding,
  [endingToneAdaptiveEnding.id]: endingToneAdaptiveEnding,
  [endingFashionEnding.id]: endingFashionEnding,
}

// ─────────────────────────────────────────────────────────────────────────
// Content archetypes (10, P1 variety wave task 4: 7 -> 10 — content was the
// pool's thinnest page type, the C-investigation's own finding, dr/
// c-diversity.md) — the only family that reads `slide.components`, so
// every entry carries a `body` slot plus its own header chrome, and declares
// `arrangements` (inventory decision #2: archetypes that don't obey the
// author's arrangement still truthfully declare which arrangement(s) they
// honor, behavior unchanged).
//
// `body` slot `capacity` (W2 task 5 — filling the placeholder task 1 left
// here): declarative authoring-time metadata only, same convention as the
// `hero`/`strip`/`grid`/`annotation` slots below — consumed since W3 by the
// validate-layer `min(pacing editorial budget, layout capacity)` quality
// gate (ir-quality.ts via layout-selection.ts). Numbers are the
// geometry-honest per-layout component count, sourced from the pre-W3
// CAPACITY table's derivations (not invented fresh):
//   - single-stack layouts — narrow-column/rail-numbered/banner-heading/
//     tone-adaptive-content, plus stacked-poster's degrade path (this file's
//     own comment on that entry already establishes it behaves like the
//     other four "all" archetypes once it falls back to SvgContent): 4,
//     mirroring the former `CAPACITY.maxBlocksPerSlide` (deleted in W3 — the editorial side now lives in PACING_BUDGETS) — audit/capacity.ts's flat,
//     theme-independent default (`floor(minRectH / perBlock)`, the shared
//     derivation for every linear-stack theme).
//   - two-column: 4 too — the arrangement splits components into 2 narrower
//     columns (`(rect.w - COLUMN_GAP) / 2`, layout.ts) but shares the same
//     content-height budget as the single-stack layouts, not a taller one,
//     so two columns doesn't earn a higher total than one.
//   - bento-panel: 6, matching this same archetype's own `grid` slot
//     capacity below — not the flat default. `layoutBento`'s hard 6-cell
//     ceiling (bento-layout.ts: "the bento grid only ever has 6 cells") and
//     the former theme-keyed `CAPACITY.maxBlocksPerSlideOverrides.tech = 6`
//     (deleted in W3 — this archetype-keyed entry is its home now) both land on the
//     same number for the same non-linear grid geometry independently.
//     `body` is bento-panel's *degraded* single-stack rendering of the exact
//     same component sequence the grid would otherwise hold (see that
//     entry's own comment), so it shares the grid's number rather than a
//     lesser invented one.
//     Final semantics (W4, recorded once the full-set rollout made
//     bento-panel reachable from every theme, not just tech): this capacity-6
//     ceiling never actually binds the `min(pacing editorial budget, layout
//     capacity)` density gate. `PACING_BUDGETS`'s loosest pacing
//     (`dense`) tops out at 5 components/slide — still under 6 — so every
//     pacing's own editorial budget wins the `min()` for this archetype
//     (5/4/3 for dense/balanced/spacious, never 6). The number above is
//     bento-panel's true geometric ceiling and stays for documentation and
//     for any future pacing tier looser than 5, but no deck can reach it
//     through today's gate.
//   - side-highlight/asymmetric-triptych/quiet-frame (task 4's three new
//     archetypes): 4, the same flat single-stack default every archetype
//     but bento-panel already carries — none of the three's own body
//     column/region ever exceeds the pool's existing narrowest single-stack
//     width (880px, `narrow-column`'s `COLUMN_W`), so no new per-archetype
//     number is warranted (each file's own composition-sketch header
//     derives this explicitly, not just asserts it).
//
// This essay is what every content archetype's own body-slot capacity
// comment means by "see registry.ts's CONTENT_LAYOUTS header for the
// derivation" (src domain reorg wave 1, task T1d — reworded from the
// pre-migration "see file header derivation" once each entry moved into its
// own archetype file). It stays here, comparative across all 10, rather
// than traveling with any one entry.
// ─────────────────────────────────────────────────────────────────────────
const CONTENT_LAYOUTS: Record<string, LayoutDefinition> = {
  [contentNarrowColumn.id]: contentNarrowColumn,
  [contentTwoColumn.id]: contentTwoColumn,
  [contentRailNumbered.id]: contentRailNumbered,
  [contentBannerHeading.id]: contentBannerHeading,
  [contentStackedPoster.id]: contentStackedPoster,
  [contentBentoPanel.id]: contentBentoPanel,
  [contentToneAdaptiveContent.id]: contentToneAdaptiveContent,
  [contentSideHighlight.id]: contentSideHighlight,
  [contentAsymmetricTriptych.id]: contentAsymmetricTriptych,
  [contentQuietFrame.id]: contentQuietFrame,
}

// ─────────────────────────────────────────────────────────────────────────
// Image takeover layouts (4) — `slide.layout` ids for the page-level
// `image-split`/`image-top`/`image-bottom`/`image-annotate` takeovers
// (full-slide-svg.tsx's splitTakeover branch, keyed off `getLayout(slide.
// layout)?.kind === "takeover"` since W2 task 3 — originally 4 snake_case
// `slide.variant` values): bespoke full-page compositions that intercept
// *before* any archetype runs, implemented by src/svg/image-pages.tsx.
// `slideTypes` is written as `["content"]`, and task 3's applicability gate
// (api.ts `checkLayoutApplicability`) now enforces it as a validate hard
// error — before that gate existed, these ids were schema-legal on any
// slide type and a cover/chapter slide setting one got silently hijacked
// at render (the confirmed bug the inventory flagged; this registry entry
// used to just state the intended applicability without enforcing it).
// ─────────────────────────────────────────────────────────────────────────
const TAKEOVER_LAYOUTS: Record<string, LayoutDefinition> = {
  [imageSplitLayoutDef.id]: imageSplitLayoutDef,
  [imageTopLayoutDef.id]: imageTopLayoutDef,
  [imageBottomLayoutDef.id]: imageBottomLayoutDef,
  [imageAnnotateLayoutDef.id]: imageAnnotateLayoutDef,
}

/** All 33 archetype layouts + 4 takeover layouts, keyed by id. */
export const LAYOUT_REGISTRY: Record<string, LayoutDefinition> = {
  ...COVER_LAYOUTS,
  ...CHAPTER_LAYOUTS,
  ...ENDING_LAYOUTS,
  ...CONTENT_LAYOUTS,
  ...TAKEOVER_LAYOUTS,
}

/** Look up a single layout definition by id (archetype or takeover). */
export function getLayout(id: string): LayoutDefinition | undefined {
  return LAYOUT_REGISTRY[id]
}

/** Every layout definition (archetype or takeover) applicable to a slide type. */
export function layoutsForSlideType(t: SlideType): readonly LayoutDefinition[] {
  return Object.values(LAYOUT_REGISTRY).filter((layout) => layout.slideTypes.includes(t))
}
