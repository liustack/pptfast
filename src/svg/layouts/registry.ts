/**
 * Layout registry (W2 task 1, spec §3/§6/§8): an explicit, statically-checked
 * description of what the render chain's 51 standard layouts + 4
 * page-level image takeovers already draw. This is a metadata layer only —
 * it formalizes today's implicit page structure (layout JSX + the
 * FullSlideSvg takeover dispatch) into named `slots`, it does not change any
 * drawing code.
 *
 * **Aggregator, not author (src domain reorg wave 1, task T1d).** Every
 * individual `LayoutDefinition` used to live here as a literal Record entry.
 * Each one now lives beside the layout JSX it describes instead — an
 * `export const layoutDef: LayoutDefinition` at the bottom of the matching
 * `layouts/*.tsx` file, or one of 4 uniquely-named exports at the bottom
 * of `image-pages.tsx` for the takeovers (one file implements all 4, so they
 * can't share the uniform `layoutDef` name the 33 single-layout
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
 * Source of truth for each definition's own content: the layout file it
 * now lives in, `.issues/notes/engineering-history.md`
 * (the W2 pre-flight inventory), plus a direct re-read of the layout file
 * itself — where the inventory's summary and the code disagreed, the code
 * won (see the W2 task report for the one confirmed case: image-annotate).
 *
 * Slot `accepts` convention used throughout every `layoutDef`:
 *  - `[]` (empty array): the slot is *not* fed by an authored component
 *    — it's derived straight from slide-level scalar fields (`slide.heading`,
 *    `slide.subheading`), `ir.meta.*` (organization/date/version/contact/
 *    copyright/confidentiality), or pure computed geometry (chapter-number
 *    watermarks, rail progress dots, decorative motifs inline in the
 *    layout file). There is nothing here for an author to place.
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
// `resolveLayoutId`).
import type { STRATEGY_VALUES } from "@/ir/narrative-values"

// ── layoutDef imports (src domain reorg wave 1, task T1d): 36 layout
// files (one `layoutDef` each) + image-pages.tsx's 4 uniquely-named takeover
// exports — 40 bindings total (content-layout expansion wave grew this
// from 33/37 to 35/39 — image-lead-split + split-band, tasks T1/T2; the
// quote-stage wave grew it once more, 35/39 to 36/40 — quote-stage, T2,
// pptfast's first `pinOnly` member, see {@link LayoutDefinition.pinOnly}).
// Grouped by family, each group in the exact
// order its former literal Record held (order feeds `layoutsForSlideType`'s
// `Object.values` walk below, which feeds `theme.layouts[type]`'s array
// order, which `resolveLayoutId`'s `weightedPickBySeed` samples from
// positionally — see registry.migration-guard.test.ts). Aliased to a
// family-prefixed camelCase name (mirrors each file's own name) since 33
// files all export the same bare `layoutDef`.
import { layoutDef as coverBannerTitle } from "./cover-banner-title"
import { layoutDef as coverPosterCenter } from "./cover-poster-center"
import { layoutDef as coverLeftAnchor } from "./cover-left-anchor"
import { layoutDef as coverConstellation } from "./cover-constellation"
import { layoutDef as coverEditorialMasthead } from "./cover-editorial-masthead"
import { layoutDef as coverToneAdaptiveHeader } from "./cover-tone-adaptive-header"
import { layoutDef as coverFashionMasthead } from "./cover-fashion-masthead"
import { layoutDef as coverSplitDiagonal } from "./cover-split-diagonal"
import { layoutDef as coverColophon } from "./cover-colophon"
import { layoutDef as coverInstitutionalBlock } from "./cover-institutional-block"
import { layoutDef as coverMemoHead } from "./cover-memo-head"
import { layoutDef as coverBoardHead } from "./cover-board-head"
import { layoutDef as coverBillHead } from "./cover-bill-head"
import { layoutDef as coverVerdictIndex } from "./cover-verdict-index"
import { layoutDef as coverBandTitle } from "./cover-band-title"
import { layoutDef as coverHeaderBand } from "./cover-header-band"
import { layoutDef as coverPaperMasthead } from "./cover-paper-masthead"
import { layoutDef as coverHorizonWedge } from "./cover-horizon-wedge"
import { layoutDef as coverCornerWedge } from "./cover-corner-wedge"

import { layoutDef as chapterMastheadChapter } from "./chapter-masthead-chapter"
import { layoutDef as chapterConstellationChapter } from "./chapter-constellation-chapter"
import { layoutDef as chapterRailChapter } from "./chapter-rail-chapter"
import { layoutDef as chapterBannerChapter } from "./chapter-banner-chapter"
import { layoutDef as chapterPosterChapter } from "./chapter-poster-chapter"
import { layoutDef as chapterRomanChapter } from "./chapter-roman-chapter"
import { layoutDef as chapterToneAdaptiveChapter } from "./chapter-tone-adaptive-chapter"
import { layoutDef as chapterFashionChapter } from "./chapter-fashion-chapter"
import { layoutDef as chapterVerseChapter } from "./chapter-verse-chapter"

import { layoutDef as endingMastheadEnding } from "./ending-masthead-ending"
import { layoutDef as endingConstellationEnding } from "./ending-constellation-ending"
import { layoutDef as endingRailEnding } from "./ending-rail-ending"
import { layoutDef as endingBannerEnding } from "./ending-banner-ending"
import { layoutDef as endingPosterEnding } from "./ending-poster-ending"
import { layoutDef as endingToneAdaptiveEnding } from "./ending-tone-adaptive-ending"
import { layoutDef as endingFashionEnding } from "./ending-fashion-ending"

import { layoutDef as contentNarrowColumn } from "./content-narrow-column"
import { layoutDef as contentTwoColumn } from "./content-two-column"
import { layoutDef as contentRailNumbered } from "./content-rail-numbered"
import { layoutDef as contentBannerHeading } from "./content-banner-heading"
import { layoutDef as contentStackedPoster } from "./content-stacked-poster"
import { layoutDef as contentBentoPanel } from "./content-bento-panel"
import { layoutDef as contentToneAdaptiveContent } from "./content-tone-adaptive-content"
import { layoutDef as contentAsymmetricTriptych } from "./content-asymmetric-triptych"
import { layoutDef as contentQuietFrame } from "./content-quiet-frame"
import { layoutDef as contentSplitBand } from "./content-split-band"
import { layoutDef as contentQuoteStage } from "./content-quote-stage"
import { layoutDef as contentStatement } from "./content-statement"
import { layoutDef as contentPullQuote } from "./content-pull-quote"
import { layoutDef as contentStatHero } from "./content-stat-hero"
import { layoutDef as contentOneEvidence } from "./content-one-evidence"
import { layoutDef as contentMonoBleed } from "./content-mono-bleed"

import {
  imageSplitLayoutDef,
  imageTopLayoutDef,
  imageBottomLayoutDef,
  imageAnnotateLayoutDef,
} from "../image-pages"

export type Strategy = (typeof STRATEGY_VALUES)[number]

export type SlideType = "cover" | "chapter" | "content" | "ending"

/** The 16-word slot vocabulary — the union of every distinct visual region
 * observed across all 35 layouts + 4 takeovers (inventory's "建议 slot
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
  // P1 variety wave, task 4 (content-pool expansion): the retired
  // side-highlight's persistent frame panel, plus asymmetric-triptych's
  // three body regions. `panel` is unused after that retirement, kept
  // like `aside` as a first-class slot name.
  | "panel"
  | "lead"
  | "top"
  | "bottom"

/** Body-arrangement enum (the retired `variant` field's 9-value non-image
 * subset — W2 task 3 split the other 4 image values off into first-class
 * takeover layouts — see `TAKEOVER_LAYOUT_DEFS` below). snake_case, matching
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
   *  absent = frame slot, not subject to counting. */
  capacity?: number
  /** for image slots: today's two coexisting conventions (inventory §variant 速查) */
  selection?: "first" | "all"
}

export interface LayoutDefinition {
  id: string
  /**
   * The standard tier vs. the 4 page-level image takeovers.
   *
   * `"archetype"` is the standard tier's fossilized spelling. The two words
   * merged into one vocabulary — a layout is the registry entry plus the JSX
   * that draws it — but this literal is serialized into
   * `__fixtures__/pre-migration-layout-registry.json`, which
   * `registry.migration-guard.test.ts` deep-equals against the live registry,
   * so renaming it to `"standard"` means re-recording a golden fixture. That
   * belongs in its own change, not in a rename.
   */
  kind: "archetype" | "takeover"
  slideTypes: readonly SlideType[]
  slots: readonly LayoutSlot[]
  /** content layouts only: which body arrangements this layout honors
   *  (inventory's 4 直接尊重全部 + stacked-poster（W2 任务 3 裁决，条件接管
   *  路径见其注释）共 5 个 → "all"，two-column → ["two_column"]，
   *  bento-panel → ["single"]) */
  arrangements?: readonly Arrangement[] | "all"
  /**
   * Auto-selection strategy allowlist (W4, spec §6 step 4's rare
   * `narratives_only` hard constraint — distinct from the soft ×3/×1
   * `layoutTendencies` weighting in `STRATEGY_DEFINITIONS`, `src/narrative`):
   * when set, `resolveLayoutId` (`../layout-selection.ts`) drops this
   * layout from the auto-pick pool unless the resolved narrative's
   * `strategy` is a member. An explicit `slide.layout` pin bypasses
   * selection entirely (spec §3: "显式指定不经选型"), so this field never
   * blocks a pin — only auto-pick. `undefined` (every built-in layout today
   * — the mechanism lands ahead of any real consumer) means unrestricted:
   * every strategy is eligible. See {@link filterByNarrativesOnly} for the
   * pure filter this field feeds.
   */
  narrativesOnly?: readonly Strategy[]
  /**
   * The pin-only tier (quote-stage wave, task T1 —
   * `.issues/2026-07-28-quote-stage/plan.md`'s 裁定 1): marks a layout as
   * reachable **only** through an explicit `slide.layout` pin, never through
   * automatic selection. This is for genuinely low-capacity, content-blind-
   * selection-hostile layouts (the motivating case: `quote-stage`, a
   * single-heading "金句" page whose capacity-1 body would starve or
   * silently drop content if a normal auto-pick pool ever sampled it for an
   * ordinary multi-component slide) — the architecture ruling that "auto-
   * selection stays content-blind" holds exactly *because* such layouts opt
   * out of sampling entirely, rather than selection growing content-aware
   * logic to route around them.
   *
   * Enforced at exactly two candidate-pool construction points — never at
   * the pin path itself, which is the whole point of the tier ("pin-only"
   * means *only* that road reaches it):
   * - `../themes/definitions.ts`'s `fullLayoutSet` (every built-in
   *   theme's default pool, since it defaults to the full registered-
   *   layout set)
   * - `../layout-selection.ts`'s `resolveLayoutId` candidate-pool
   *   construction (defensive: `registerTheme` legally allows a custom
   *   theme to list a pinOnly id in its own curated `layouts` set — that
   *   registration-time check validates existence/kind/slideTypes, not
   *   this flag — so sampling itself must re-exclude it here too)
   *
   * `resolveLayoutId`'s `requestedLayout` short-circuit and
   * `checkLayoutApplicability` (`../../validate-core.ts`) both stay
   * unmodified by this flag: an explicit pin bypasses selection
   * unconditionally regardless of `pinOnly`, and applicability only ever
   * checks registry existence + `slideTypes`, never this tier.
   *
   * `undefined` (every built-in layout as of this task — the mechanism
   * lands ahead of its first real consumer, `quote-stage`, T2's job) means
   * ordinarily auto-selectable, same "no real member yet, byte-identical
   * selection" posture `narrativesOnly` launched with (W4 design decision
   * 5). See {@link excludePinOnly} for the pure filter this field feeds.
   */
  pinOnly?: boolean
  /**
   * This layout opens by painting its own full-bleed colour field over the
   * whole canvas, so the theme background underneath it is never seen —
   * `FullSlideSvg` (`../full-slide-svg.tsx`) skips `Background` entirely for
   * such a layout.
   *
   * Not an optimisation. Two full-bleed rects of different colours stacked on
   * the same canvas edge leave a visible defect: a browser clips every shape
   * to the SVG viewport, and that clip is antialiased whenever the mounted
   * slide's box does not land on whole device pixels (it almost never does).
   * The lower rect therefore survives in the boundary column at roughly a
   * fifth of its strength, and a cream page under a near-black field reads as
   * a pale one-to-two pixel line down the page edge — reported against
   * `ink`'s cover in the 2026-08-20 review. Painting only the field the
   * reader actually sees removes the colour that was leaking. See
   * `../../lib/slide-edge.ts` for the other half of the same defect, on the
   * frame side of the SVG.
   *
   * `undefined` (every layout but the three `fashion-*` members and
   * `mono-bleed`) means the ordinary arrangement: `Background` paints, the
   * layout draws on top of it.
   */
  paintsOwnBackground?: boolean
  /**
   * Heading-overflow hard-error parameters (quote-stage wave, T2 fix round —
   * `.issues/2026-07-28-quote-stage/task-2-report.md`'s fix-report addendum):
   * when set, `ir-quality.ts`'s `checkSlide` runs `fitHeadingLines(slide
   * .heading, headingFit)` for a slide pinned onto this layout and hard-
   * errors (`pinned_heading_overflow` — renamed from
   * `quote_stage_heading_overflow` in task T3 once the check itself went
   * metadata-driven, so the code no longer names quote-stage specifically)
   * if even `minPt` still truncates it. Shape mirrors `fitHeadingLines`'s
   * own options (minus `fontFamily`,
   * which the layout supplies from its render `ctx` and the validate-side
   * check deliberately omits — see `ir-quality.ts`'s call site comment for
   * why a theme-agnostic fallback width table is the right posture there).
   *
   * Replaces the pre-fix design where `ir-quality.ts` hardcoded
   * `slide.layout === "quote-stage"` plus its own hand-mirrored copy of this
   * layout's four fit constants (a shadow-copy with no sync guard,
   * flagged by whole-branch review) — this field makes the layout's own
   * `layoutDef` (`content-quote-stage.tsx`) the single source for both the
   * layout's own render-time fit call *and* validate's hard-error check,
   * the same "declarative metadata `ir-quality.ts` reads generically" shape
   * `pinOnly` above and `slots[].capacity` already established (see
   * `pin_only_over_capacity`'s own check, same file, for the precedent this
   * mirrors). `undefined` (every layout except `quote-stage` as of this
   * field's introduction) means no heading-overflow hard error for that
   * layout — `long_heading`'s warn stays the only signal, unchanged.
   */
  headingFit?: {
    maxWidth: number
    fontSize: number
    maxLines?: number
    minPt?: number
    /** Passed through to `fitHeadingLines`. Default there is `true` (heading
     *  as bold). Editorial-verse layouts set `false` so validate's overflow
     *  check uses the same width model the render path does (weight 400–500). */
    bold?: boolean
    lineHeightRatio?: number
  }
  /**
   * Branding posture this layout declares (editorial-verse wave).
   *
   * `"none"`: `FullSlideSvg` skips `Branding` entirely (footer rule,
   * footer meta, logo — page numbers were already removed globally). The
   * theme motif still paints. `slide.decor`, when the author sets it
   * explicitly, still draws. The fifth-band decoration safe-zone in
   * `docs/designing-themes.md` does not apply: the whole 1280×720 canvas
   * is the layout's, there is no reserved footer strip to keep clear of.
   *
   * `undefined` (every layout except the branding-free pinOnly members
   * `statement` / `pull-quote` / `verse-chapter` / `stat-hero` /
   * `one-evidence` / `mono-bleed`) means ordinary branding:
   * `Branding` and the theme motif paint as they do today. `"default"`
   * is accepted as an explicit spelling of that same ordinary path.
   *
   * This is a layout-level declaration, not a slide-level IR field. A
   * page gets it only by pinning this layout (`pinOnly` members of the
   * editorial-verse set all set `"none"`). Existing decks that never pin
   * those ids are byte-identical.
   */
  branding?: "default" | "none"
}

/**
 * True when the named layout declares `branding: "none"`. `undefined` id or
 * a layout that omits the field (the ordinary path) returns false.
 */
export function layoutOmitsBranding(id: string | undefined): boolean {
  return id !== undefined && getLayout(id)?.branding === "none"
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

/**
 * Pure `pinOnly` filter (quote-stage wave, task T1 — see
 * {@link LayoutDefinition.pinOnly}'s own doc comment for the full tier
 * semantics): drop every layout whose `pinOnly` is `true`, keep the rest.
 * Generic over any `pinOnly`-shaped record, same synthetic-fixture-testable
 * shape {@link filterByNarrativesOnly} already established. Two real call
 * sites: `../themes/definitions.ts`'s `fullLayoutSet` and
 * `../layout-selection.ts`'s `resolveLayoutId` candidate-pool
 * construction — see the field doc comment for why both are needed.
 */
export function excludePinOnly<T extends { pinOnly?: boolean }>(defs: readonly T[]): T[] {
  return defs.filter((def) => !def.pinOnly)
}

// ─────────────────────────────────────────────────────────────────────────
// Cover layouts (13, board-cover-fidelity wave 2026-08-22: 9 -> 13 —
// institutional-block / memo-head / board-head / bill-head, four board
// constructions that were not in the pool. Appended after colophon, same
// position discipline every earlier pool growth used) — cover/chapter/ending
// never read `slide.components`
// (inventory headline finding — see each layout's own `layoutDef`
// comment for the file-by-file confirmation), so none of them declare a
// `body` slot.
// ─────────────────────────────────────────────────────────────────────────
const COVER_LAYOUT_DEFS: Record<string, LayoutDefinition> = {
  [coverBannerTitle.id]: coverBannerTitle,
  [coverPosterCenter.id]: coverPosterCenter,
  [coverLeftAnchor.id]: coverLeftAnchor,
  [coverConstellation.id]: coverConstellation,
  [coverEditorialMasthead.id]: coverEditorialMasthead,
  [coverToneAdaptiveHeader.id]: coverToneAdaptiveHeader,
  [coverFashionMasthead.id]: coverFashionMasthead,
  [coverSplitDiagonal.id]: coverSplitDiagonal,
  // Theme-redesign wave (2026-08-18, cover pool 8 -> 9): appended at the end
  // of the cover group, same position discipline every earlier pool growth
  // used (image-lead-split / split-band / quote-stage each landed last in
  // their own family) — key insertion order is what `weightedPickBySeed`
  // samples positionally, so a new member goes on the end rather than in the
  // middle of the existing ones.
  [coverColophon.id]: coverColophon,
  // Board-cover-fidelity wave (2026-08-22, cover pool 9 -> 13): appended at
  // the end of the cover group. Key insertion order is what
  // `weightedPickBySeed` samples positionally, so new members go on the end
  // rather than in the middle of the existing ones.
  [coverInstitutionalBlock.id]: coverInstitutionalBlock,
  [coverMemoHead.id]: coverMemoHead,
  [coverBoardHead.id]: coverBoardHead,
  [coverBillHead.id]: coverBillHead,
  // Board-cover-restore wave 1 (2026-08-22, cover pool 13 -> 19): appended
  // at the end of the cover group. Key insertion order is what
  // `weightedPickBySeed` samples positionally, so new members go on the end
  // rather than in the middle of the existing ones.
  [coverVerdictIndex.id]: coverVerdictIndex,
  [coverBandTitle.id]: coverBandTitle,
  [coverHeaderBand.id]: coverHeaderBand,
  [coverPaperMasthead.id]: coverPaperMasthead,
  [coverHorizonWedge.id]: coverHorizonWedge,
  [coverCornerWedge.id]: coverCornerWedge,
}

// ─────────────────────────────────────────────────────────────────────────
// Chapter layouts (8) — every one carries a chapter-number `watermark`
// (translucent or opaque numeral; inventory's "watermark numerals" example),
// paired with `heading`. No body slot (chapter never reads components).
// ─────────────────────────────────────────────────────────────────────────
const CHAPTER_LAYOUT_DEFS: Record<string, LayoutDefinition> = {
  [chapterMastheadChapter.id]: chapterMastheadChapter,
  [chapterConstellationChapter.id]: chapterConstellationChapter,
  [chapterRailChapter.id]: chapterRailChapter,
  [chapterBannerChapter.id]: chapterBannerChapter,
  [chapterPosterChapter.id]: chapterPosterChapter,
  [chapterRomanChapter.id]: chapterRomanChapter,
  [chapterToneAdaptiveChapter.id]: chapterToneAdaptiveChapter,
  [chapterFashionChapter.id]: chapterFashionChapter,
  [chapterVerseChapter.id]: chapterVerseChapter,
}

// ─────────────────────────────────────────────────────────────────────────
// Ending layouts (7) — heading + meta (contact/copyright/org) is the
// universal pair; no body slot (ending never reads components).
// ─────────────────────────────────────────────────────────────────────────
const ENDING_LAYOUT_DEFS: Record<string, LayoutDefinition> = {
  [endingMastheadEnding.id]: endingMastheadEnding,
  [endingConstellationEnding.id]: endingConstellationEnding,
  [endingRailEnding.id]: endingRailEnding,
  [endingBannerEnding.id]: endingBannerEnding,
  [endingPosterEnding.id]: endingPosterEnding,
  [endingToneAdaptiveEnding.id]: endingToneAdaptiveEnding,
  [endingFashionEnding.id]: endingFashionEnding,
}

// ─────────────────────────────────────────────────────────────────────────
// Content layouts (13, quote-stage wave task T2: 12 -> 13 — quote-stage,
// pptfast's first `pinOnly` member (see {@link LayoutDefinition.pinOnly}):
// reachable only through an explicit `slide.layout` pin, never auto-picked,
// so it doesn't grow any theme's curated pool — "12 auto-selectable + 1
// pin-only", not a flat +1 (see that file's own composition-sketch header);
// content-layout expansion wave task T2 grew the auto-selectable count
// 11 -> 12 just before it — split-band, the pool's first *horizontal* split
// (a full-bleed header band over an ordinary body band) — see that file's
// own composition-sketch header for the capacity measurement that chose its
// ratio; task T1 grew this same family 10 -> 11 just before it —
// image-lead-split, the first layout whose column split is genuinely
// unequal — see that file's own composition-sketch header; P1 variety wave
// task 4 grew this same family 7 -> 10 before it, content having been the
// pool's thinnest page type, the C-investigation's own finding, dr/
// c-diversity.md) — the only family that reads `slide.components`, so
// every entry carries a `body` slot plus its own heading band, and declares
// `arrangements` (inventory decision #2: layouts that don't obey the
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
//     tone-adaptive-content, plus stacked-poster's degrade path
//     (content-stacked-poster.tsx's own comment on its layoutDef already
//     establishes it behaves like the
//     other four "all" layouts once it falls back to SvgContent): 4,
//     mirroring the former `CAPACITY.maxBlocksPerSlide` (deleted in W3 — the editorial side now lives in PACING_BUDGETS) — audit/capacity.ts's flat,
//     theme-independent default (`floor(minRectH / perBlock)`, the shared
//     derivation for every linear-stack theme).
//   - two-column: 4 too — the arrangement splits components into 2 narrower
//     columns (`(rect.w - COLUMN_GAP) / 2`, layout.ts) but shares the same
//     content-height budget as the single-stack layouts, not a taller one,
//     so two columns doesn't earn a higher total than one.
//   - bento-panel: 6, matching this same layout's own `grid` slot
//     capacity below — not the flat default. `layoutBento`'s hard 6-cell
//     ceiling (bento-layout.ts: "the bento grid only ever has 6 cells") and
//     the former theme-keyed `CAPACITY.maxBlocksPerSlideOverrides.tech = 6`
//     (deleted in W3 — this layout-keyed entry is its home now) both land on the
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
//     pacing's own editorial budget wins the `min()` for this layout
//     (5/4/3 for dense/balanced/spacious, never 6). The number above is
//     bento-panel's true geometric ceiling and stays for documentation and
//     for any future pacing tier looser than 5, but no deck can reach it
//     through today's gate.
//   - asymmetric-triptych/quiet-frame (task 4's remaining layouts after
//     side-highlight retired): 4, the same flat single-stack default every
//     layout but bento-panel already carries — neither body's region exceeds
//     the pool's existing narrowest single-stack width (880px,
//     `narrow-column`'s `COLUMN_W`), so no new per-layout number is
//     warranted (each file's own composition-sketch header derives this
//     explicitly, not just asserts it).
//   - image-lead-split (task T1): body 4 too, and visual 1 — its 435px text
//     column is narrower than every other layout's own single-stack
//     column, but still wider than the pool's already-audited narrowest
//     single-stack region (asymmetric-triptych's 424px `top`/`bottom`
//     panels), so this doesn't warrant a new number either, nor tightening
//     any `audit/capacity.ts` floor — the file's own header derives this.
//   - split-band (task T2): body 4 too — its 400px (380px with a footnote)
//     body height is *shorter* than every other layout's own body
//     region (the pool's previous floor was width, not height; this is the
//     first layout whose heading band eats vertical rather than
//     horizontal budget), which is exactly why this task's own capacity
//     measurement (see the file's own composition-sketch header) tested
//     candidate ratios against realistic per-tier content *before* fixing
//     the geometry, instead of assuming the pool's flat 4 would still be
//     safe at a new, shorter height. It held at zero `data-dropped` for
//     ordinary content at every pacing tier, so 4 stays the declared
//     number — no `audit/capacity.ts` floor needs tightening either, by
//     the same "re-verified, not assumed" standard image-lead-split's own
//     entry above already established for a *width* floor.
//   - quote-stage (quote-stage wave, task T2): body 1 — not a flat-default
//     single-stack number like every entry above. This is the pool's first
//     `pinOnly` member (see {@link LayoutDefinition.pinOnly}): the body
//     slot is a small attribution/footnote *annotation* position below an
//     oversized heading, not a "承重" content region — 1 is a deliberate,
//     narrow authoring contract (at most one short attribution component),
//     not a geometric ceiling derived from column width like the other
//     entries' 4/6. Enforced two ways: `ir-quality.ts`'s `density` warn
//     (min(pacing budget, this capacity) — same generic gate every entry
//     here already feeds) *and*, because this is a pinned-only layout, a
//     dedicated hard *error* (`pin_only_over_capacity`, quote-stage wave
//     T2's own 裁定 2) — an explicit pin already declares author intent, so
//     silently dropping content past capacity 1 would be real content loss,
//     not an editorial nudge.
//
// This essay is what every content layout's own body-slot capacity
// comment means by "see registry.ts's CONTENT_LAYOUT_DEFS header for the
// derivation" (src domain reorg wave 1, task T1d — reworded from the
// pre-migration "see file header derivation" once each entry moved into its
// own layout file). It stays here, comparative across all 13, rather
// than traveling with any one entry.
// ─────────────────────────────────────────────────────────────────────────
const CONTENT_LAYOUT_DEFS: Record<string, LayoutDefinition> = {
  [contentNarrowColumn.id]: contentNarrowColumn,
  [contentTwoColumn.id]: contentTwoColumn,
  [contentRailNumbered.id]: contentRailNumbered,
  [contentBannerHeading.id]: contentBannerHeading,
  [contentStackedPoster.id]: contentStackedPoster,
  [contentBentoPanel.id]: contentBentoPanel,
  [contentToneAdaptiveContent.id]: contentToneAdaptiveContent,
  [contentAsymmetricTriptych.id]: contentAsymmetricTriptych,
  [contentQuietFrame.id]: contentQuietFrame,
  [contentSplitBand.id]: contentSplitBand,
  [contentQuoteStage.id]: contentQuoteStage,
  [contentStatement.id]: contentStatement,
  [contentPullQuote.id]: contentPullQuote,
  [contentStatHero.id]: contentStatHero,
  [contentOneEvidence.id]: contentOneEvidence,
  [contentMonoBleed.id]: contentMonoBleed,
}

// ─────────────────────────────────────────────────────────────────────────
// Image takeover layouts (4) — `slide.layout` ids for the page-level
// `image-split`/`image-top`/`image-bottom`/`image-annotate` takeovers
// (full-slide-svg.tsx's splitTakeover branch, keyed off `getLayout(slide.
// layout)?.kind === "takeover"` since W2 task 3 — originally 4 snake_case
// `slide.variant` values): bespoke full-page compositions that intercept
// *before* any layout runs, implemented by src/svg/image-pages.tsx.
// `slideTypes` is written as `["content"]`, and task 3's applicability gate
// (api.ts `checkLayoutApplicability`) now enforces it as a validate hard
// error — before that gate existed, these ids were schema-legal on any
// slide type and a cover/chapter slide setting one got silently hijacked
// at render (the confirmed bug the inventory flagged; this registry entry
// used to just state the intended applicability without enforcing it).
// ─────────────────────────────────────────────────────────────────────────
const TAKEOVER_LAYOUT_DEFS: Record<string, LayoutDefinition> = {
  [imageSplitLayoutDef.id]: imageSplitLayoutDef,
  [imageTopLayoutDef.id]: imageTopLayoutDef,
  [imageBottomLayoutDef.id]: imageBottomLayoutDef,
  [imageAnnotateLayoutDef.id]: imageAnnotateLayoutDef,
}

/** All 51 standard layouts + 4 takeover layouts, keyed by id (`kind`
 *  still spells the standard tier `"archetype"` — a wire-format fossil, see
 *  {@link LayoutDefinition.kind}). */
export const LAYOUT_REGISTRY: Record<string, LayoutDefinition> = {
  ...COVER_LAYOUT_DEFS,
  ...CHAPTER_LAYOUT_DEFS,
  ...ENDING_LAYOUT_DEFS,
  ...CONTENT_LAYOUT_DEFS,
  ...TAKEOVER_LAYOUT_DEFS,
}

/** Look up a single layout definition by id (layout or takeover). */
export function getLayout(id: string): LayoutDefinition | undefined {
  return LAYOUT_REGISTRY[id]
}

/** Every layout definition (layout or takeover) applicable to a slide type. */
export function layoutsForSlideType(t: SlideType): readonly LayoutDefinition[] {
  return Object.values(LAYOUT_REGISTRY).filter((layout) => layout.slideTypes.includes(t))
}
