/**
 * Layout registry (W2 task 1, spec §3/§6/§8): an explicit, statically-checked
 * description of what the render chain's 30 archetype components + 4
 * page-level image takeovers already draw. This is a metadata layer only —
 * it formalizes today's implicit page structure (archetype JSX + the
 * FullSlideSvg takeover dispatch) into named `slots`, it does not change any
 * drawing code. Nothing in the render chain consumes this yet (W2 tasks 2-5
 * wire selection/validation/capacity through it).
 *
 * Source of truth: `.issues/notes/2026-07-18-w2-archetype-region-inventory.md`
 * (the W2 pre-flight inventory) plus a direct re-read of every archetype file
 * cited below — where the inventory's summary and the code disagreed, the
 * code won (see the task report for the one confirmed case: image-annotate).
 *
 * Slot `accepts` convention used throughout this file:
 *  - `[]` (empty array): the slot is *not* fed by an authored block/component
 *    — it's derived straight from slide-level scalar fields (`slide.heading`,
 *    `slide.subheading`), `ir.meta.*` (organization/date/version/contact/
 *    copyright/confidentiality), or pure computed geometry (chapter-number
 *    watermarks, rail progress dots, decorative motifs inline in the
 *    archetype file). There is nothing here for an author to place.
 *  - `"any"`: the slot renders whatever `Block`s it's handed, unfiltered
 *    (`SvgContent`'s body, bento's grid, stacked-poster's hero/strip).
 *  - a literal component-type list: the slot requires that specific block
 *    type (`image`, `bullets`) — used only by the 4 takeover layouts, which
 *    `Array.find` a specific block type out of `slide.blocks`.
 */

export type SlideType = "cover" | "chapter" | "content" | "ending"

/** The 16-word slot vocabulary — the union of every distinct visual region
 * observed across all 30 archetypes + 4 takeovers (inventory's "建议 slot
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
  /** editorial capacity (authoring-time gate material for W3) — absent = uncounted chrome slot */
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
}

/** Chrome slots (label/rule/meta/decor/watermark/rail) are never fed by an
 * authored block — see the file header's `accepts` convention. */
const CHROME: readonly string[] = []

// ─────────────────────────────────────────────────────────────────────────
// Cover archetypes (8) — cover/chapter/ending never read `slide.blocks`
// (inventory headline finding, confirmed file-by-file below), so none of
// them declare a `body` slot.
// ─────────────────────────────────────────────────────────────────────────
const COVER_LAYOUTS: Record<string, LayoutDefinition> = {
  "banner-title": {
    // cover-banner-title.tsx: org dot-kicker, conf badge, heading, accent
    // bar, italic subheading, meta divider + author/date/version row.
    id: "banner-title",
    kind: "archetype",
    slideTypes: ["cover"],
    slots: [
      { name: "kicker", accepts: CHROME },
      { name: "meta", accepts: CHROME },
      { name: "heading", accepts: CHROME },
      { name: "rule", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
    ],
  },
  "poster-center": {
    // cover-poster-center.tsx: fully centered "poster" — no kicker (org is
    // folded into the single bottom meta line, not a standalone label).
    id: "poster-center",
    kind: "archetype",
    slideTypes: ["cover"],
    slots: [
      { name: "heading", accepts: CHROME },
      { name: "rule", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "meta", accepts: CHROME },
    ],
  },
  "left-anchor": {
    // cover-left-anchor.tsx: 40%-width primary color block carries the
    // heading (white, product-logic exempt); right panel has org kicker,
    // conf badge, subheading, meta divider + author/date/version. The
    // corner triangle is a private decorative swatch (TRIANGLE_DEEP) → decor.
    id: "left-anchor",
    kind: "archetype",
    slideTypes: ["cover"],
    slots: [
      { name: "kicker", accepts: CHROME },
      { name: "decor", accepts: CHROME },
      { name: "heading", accepts: CHROME },
      { name: "meta", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "rule", accepts: CHROME },
    ],
  },
  constellation: {
    // cover-constellation.tsx: top-left org kicker, bottom-anchored hero
    // heading, accent rule + subheading, conf/date meta row, and the
    // signature 9-point constellation motif (inline in this file, not the
    // separate Motif system) → decor.
    id: "constellation",
    kind: "archetype",
    slideTypes: ["cover"],
    slots: [
      { name: "kicker", accepts: CHROME },
      { name: "rule", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "heading", accepts: CHROME },
      { name: "meta", accepts: CHROME },
      { name: "decor", accepts: CHROME },
    ],
  },
  "editorial-masthead": {
    // cover-editorial-masthead.tsx: centered masthead heading + short
    // underline + italic subheading + single merged org/date/conf meta line.
    // No standalone kicker.
    id: "editorial-masthead",
    kind: "archetype",
    slideTypes: ["cover"],
    slots: [
      { name: "heading", accepts: CHROME },
      { name: "rule", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "meta", accepts: CHROME },
    ],
  },
  "tone-adaptive-header": {
    // cover-tone-adaptive-header.tsx: org kicker, conf badge, heading,
    // subheading; no-bg mode adds a divider + author/date/version meta row,
    // bg mode collapses meta to one white overlay line (same slot names).
    id: "tone-adaptive-header",
    kind: "archetype",
    slideTypes: ["cover"],
    slots: [
      { name: "kicker", accepts: CHROME },
      { name: "meta", accepts: CHROME },
      { name: "heading", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "rule", accepts: CHROME },
    ],
  },
  "fashion-masthead": {
    // cover-fashion-masthead.tsx: full-bleed primary block, org kicker, thin
    // rule above the masthead heading, accent color band, subheading, meta.
    id: "fashion-masthead",
    kind: "archetype",
    slideTypes: ["cover"],
    slots: [
      { name: "kicker", accepts: CHROME },
      { name: "rule", accepts: CHROME },
      { name: "heading", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "meta", accepts: CHROME },
    ],
  },
  "split-diagonal": {
    // cover-split-diagonal.tsx: diagonal-cut primary block carries an org
    // kicker + decorative accent dot (decor); heading/rule/subheading/meta
    // sit in the right clear zone.
    id: "split-diagonal",
    kind: "archetype",
    slideTypes: ["cover"],
    slots: [
      { name: "kicker", accepts: CHROME },
      { name: "decor", accepts: CHROME },
      { name: "heading", accepts: CHROME },
      { name: "rule", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "meta", accepts: CHROME },
    ],
  },
}

// ─────────────────────────────────────────────────────────────────────────
// Chapter archetypes (8) — every one carries a chapter-number `watermark`
// (translucent or opaque numeral; inventory's "watermark numerals" example),
// paired with `heading`. No body slot (chapter never reads blocks).
// ─────────────────────────────────────────────────────────────────────────
const CHAPTER_LAYOUTS: Record<string, LayoutDefinition> = {
  "masthead-chapter": {
    // chapter-masthead-chapter.tsx: top/bottom hairlines bracket a
    // left-aligned heading + italic subheading; bottom-right translucent
    // chapter-number watermark.
    id: "masthead-chapter",
    kind: "archetype",
    slideTypes: ["chapter"],
    slots: [
      { name: "rule", accepts: CHROME },
      { name: "watermark", accepts: CHROME },
      { name: "heading", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
    ],
  },
  "constellation-chapter": {
    // chapter-constellation-chapter.tsx: left opaque accent chapter number
    // (watermark), right-aligned heading + subheading, bottom hairline.
    id: "constellation-chapter",
    kind: "archetype",
    slideTypes: ["chapter"],
    slots: [
      { name: "watermark", accepts: CHROME },
      { name: "heading", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "rule", accepts: CHROME },
    ],
  },
  "rail-chapter": {
    // chapter-rail-chapter.tsx: giant translucent watermark numeral, centered
    // heading + italic subheading over the theme's primary color block, and
    // a horizontal chapter-progress dot row + track → rail.
    id: "rail-chapter",
    kind: "archetype",
    slideTypes: ["chapter"],
    slots: [
      { name: "watermark", accepts: CHROME },
      { name: "heading", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "rail", accepts: CHROME },
    ],
  },
  "banner-chapter": {
    // chapter-banner-chapter.tsx: translucent watermark numeral, centered
    // white heading/subheading over the primary color block, short
    // decorative accent hairline.
    id: "banner-chapter",
    kind: "archetype",
    slideTypes: ["chapter"],
    slots: [
      { name: "watermark", accepts: CHROME },
      { name: "heading", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "rule", accepts: CHROME },
    ],
  },
  "poster-chapter": {
    // chapter-poster-chapter.tsx: top-right org kicker, top/bottom hairlines,
    // large opaque chapter-number watermark, heading. No subheading render.
    id: "poster-chapter",
    kind: "archetype",
    slideTypes: ["chapter"],
    slots: [
      { name: "kicker", accepts: CHROME },
      { name: "rule", accepts: CHROME },
      { name: "watermark", accepts: CHROME },
      { name: "heading", accepts: CHROME },
    ],
  },
  "roman-chapter": {
    // chapter-roman-chapter.tsx: top-right org kicker, giant roman-numeral
    // watermark, heading + italic subheading with its own short rule, and a
    // seed/chapter-rotated arc ornament (eclipse/grooves/chord) → decor.
    id: "roman-chapter",
    kind: "archetype",
    slideTypes: ["chapter"],
    slots: [
      { name: "kicker", accepts: CHROME },
      { name: "watermark", accepts: CHROME },
      { name: "heading", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "rule", accepts: CHROME },
      { name: "decor", accepts: CHROME },
    ],
  },
  "tone-adaptive-chapter": {
    // chapter-tone-adaptive-chapter.tsx: translucent watermark numeral +
    // centered heading only — no kicker, no subheading render at all.
    id: "tone-adaptive-chapter",
    kind: "archetype",
    slideTypes: ["chapter"],
    slots: [
      { name: "watermark", accepts: CHROME },
      { name: "heading", accepts: CHROME },
    ],
  },
  "fashion-chapter": {
    // chapter-fashion-chapter.tsx: full-bleed accent block, "CHAPTER NN"
    // kicker + org kicker (bottom), giant numeral watermark, heading, bottom
    // rule. No subheading render.
    id: "fashion-chapter",
    kind: "archetype",
    slideTypes: ["chapter"],
    slots: [
      { name: "kicker", accepts: CHROME },
      { name: "watermark", accepts: CHROME },
      { name: "heading", accepts: CHROME },
      { name: "rule", accepts: CHROME },
    ],
  },
}

// ─────────────────────────────────────────────────────────────────────────
// Ending archetypes (7) — heading + meta (contact/copyright/org) is the
// universal pair; no body slot (ending never reads blocks).
// ─────────────────────────────────────────────────────────────────────────
const ENDING_LAYOUTS: Record<string, LayoutDefinition> = {
  "masthead-ending": {
    // ending-masthead-ending.tsx: centered heading (falls back to "致谢") +
    // italic subheading + single org/contact/date meta line.
    id: "masthead-ending",
    kind: "archetype",
    slideTypes: ["ending"],
    slots: [
      { name: "heading", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "meta", accepts: CHROME },
    ],
  },
  "constellation-ending": {
    // ending-constellation-ending.tsx: centered "谢谢。" heading (accent
    // trailing period), subheading, signature accent rule bar, stacked
    // org/contact/date meta lines.
    id: "constellation-ending",
    kind: "archetype",
    slideTypes: ["ending"],
    slots: [
      { name: "heading", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "rule", accepts: CHROME },
      { name: "meta", accepts: CHROME },
    ],
  },
  "rail-ending": {
    // ending-rail-ending.tsx: corner color-block accents (decor, echoing
    // Cover's rect motif), org kicker, heading ("谢谢"), subheading, hairline
    // + "联系" contact section + copyright line (all meta).
    id: "rail-ending",
    kind: "archetype",
    slideTypes: ["ending"],
    slots: [
      { name: "decor", accepts: CHROME },
      { name: "kicker", accepts: CHROME },
      { name: "heading", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "rule", accepts: CHROME },
      { name: "meta", accepts: CHROME },
    ],
  },
  "banner-ending": {
    // ending-banner-ending.tsx: org kicker, italic heading ("Thank you."),
    // Chinese subheading, divider, "联系" contact section + copyright (meta).
    id: "banner-ending",
    kind: "archetype",
    slideTypes: ["ending"],
    slots: [
      { name: "kicker", accepts: CHROME },
      { name: "heading", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "rule", accepts: CHROME },
      { name: "meta", accepts: CHROME },
    ],
  },
  "poster-ending": {
    // ending-poster-ending.tsx: centered italic heading, accent rule,
    // subheading, divider, single combined org/contact/copyright meta line.
    // No standalone kicker.
    id: "poster-ending",
    kind: "archetype",
    slideTypes: ["ending"],
    slots: [
      { name: "heading", accepts: CHROME },
      { name: "rule", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "meta", accepts: CHROME },
    ],
  },
  "tone-adaptive-ending": {
    // ending-tone-adaptive-ending.tsx: org kicker, heading ("谢谢"), divider,
    // "联系" contact section + copyright (meta). No subheading render.
    id: "tone-adaptive-ending",
    kind: "archetype",
    slideTypes: ["ending"],
    slots: [
      { name: "kicker", accepts: CHROME },
      { name: "heading", accepts: CHROME },
      { name: "rule", accepts: CHROME },
      { name: "meta", accepts: CHROME },
    ],
  },
  "fashion-ending": {
    // ending-fashion-ending.tsx: full-bleed primary block, org kicker (top),
    // giant heading ("谢谢"), accent band rule, subheading, org/date meta line.
    id: "fashion-ending",
    kind: "archetype",
    slideTypes: ["ending"],
    slots: [
      { name: "kicker", accepts: CHROME },
      { name: "heading", accepts: CHROME },
      { name: "rule", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "meta", accepts: CHROME },
    ],
  },
}

// ─────────────────────────────────────────────────────────────────────────
// Content archetypes (7) — the only family that reads `slide.blocks`, so
// every entry carries a `body` slot (capacity intentionally left for W3/
// task 5) plus its own header chrome, and declares `arrangements` (inventory
// decision #2: archetypes that don't obey the author's arrangement still
// truthfully declare which arrangement(s) they honor, behavior unchanged).
// ─────────────────────────────────────────────────────────────────────────
const CONTENT_LAYOUTS: Record<string, LayoutDefinition> = {
  "narrow-column": {
    // content-narrow-column.tsx: top hairline, italic kicker, heading,
    // subheading, narrow SvgContent body (arrangement passed through
    // unchanged), large muted page-number watermark in the right gutter,
    // italic footnote
    // (meta).
    id: "narrow-column",
    kind: "archetype",
    slideTypes: ["content"],
    slots: [
      { name: "rule", accepts: CHROME },
      { name: "kicker", accepts: CHROME },
      { name: "heading", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "body", accepts: "any" },
      { name: "watermark", accepts: CHROME },
      { name: "meta", accepts: CHROME },
    ],
    arrangements: "all",
  },
  "two-column": {
    // content-two-column.tsx: kicker, heading, subheading, accent bar +
    // hairline rule, SvgContent body — hardcodes arrangement="two_column"
    // (content-two-column.tsx:102) regardless of slide.arrangement. No
    // footnote/meta render at all.
    id: "two-column",
    kind: "archetype",
    slideTypes: ["content"],
    slots: [
      { name: "kicker", accepts: CHROME },
      { name: "heading", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "rule", accepts: CHROME },
      { name: "body", accepts: "any" },
    ],
    arrangements: ["two_column"],
  },
  "rail-numbered": {
    // content-rail-numbered.tsx: fixed left progress track + node (rail),
    // "{chapter}.{n}" number badge replacing the usual kicker, heading,
    // subheading, SvgContent body (arrangement passed through), italic footnote
    // (meta).
    id: "rail-numbered",
    kind: "archetype",
    slideTypes: ["content"],
    slots: [
      { name: "rail", accepts: CHROME },
      { name: "kicker", accepts: CHROME },
      { name: "heading", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "body", accepts: "any" },
      { name: "meta", accepts: CHROME },
    ],
    arrangements: "all",
  },
  "banner-heading": {
    // content-banner-heading.tsx: section-name kicker, heading set inside a
    // filled "assertion banner" (the banner rect *is* the heading treatment
    // — no separate rule), subheading, SvgContent body (arrangement passed
    // through), italic footnote (meta).
    id: "banner-heading",
    kind: "archetype",
    slideTypes: ["content"],
    slots: [
      { name: "kicker", accepts: CHROME },
      { name: "heading", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "body", accepts: "any" },
      { name: "meta", accepts: CHROME },
    ],
    arrangements: "all",
  },
  "stacked-poster": {
    // content-stacked-poster.tsx: centered kicker + accent rule, heading,
    // subheading, and a `body` slot — the *degrade* path (>=3 blocks, 0
    // blocks, or an overflowing hero/strip candidate) passes
    // `slide.arrangement` straight through to SvgContent unchanged, so this
    // archetype honors every arrangement exactly like the four plain "all"
    // archetypes below (W2 task 3 adjudication: the inventory's original
    // "single" was a conservative placeholder pending this call, not a
    // literal claim that only "single" ever reaches SvgContent — see the
    // registry test's dedicated degrade-path-with-two_column assertion).
    // Exactly 1-2 fitting blocks instead take the bespoke poster path,
    // which bypasses arrangement entirely: block[0] always renders in a
    // dedicated `hero` slot (capacity 1), and block[1] — only when there are
    // exactly 2 — renders in a `strip` caption slot below a divider
    // (capacity 1). Footnote (meta) renders on both paths.
    id: "stacked-poster",
    kind: "archetype",
    slideTypes: ["content"],
    slots: [
      { name: "kicker", accepts: CHROME },
      { name: "rule", accepts: CHROME },
      { name: "heading", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "body", accepts: "any" },
      { name: "hero", accepts: "any", capacity: 1 },
      { name: "strip", accepts: "any", capacity: 1 },
      { name: "meta", accepts: CHROME },
    ],
    arrangements: "all",
  },
  "bento-panel": {
    // content-bento-panel.tsx: kicker, heading, subheading, and a `body`
    // slot that alternates between a plain single-block/degraded stack and
    // a dedicated `grid` slot — up to 6 bento cells (bento-layout.ts:193-194,
    // "the bento grid only ever has 6 cells"), hero-weight-ordered. All
    // three internal SvgContent calls hardcode arrangement="single"
    // (inventory: "bento-panel 三处调用全部硬编码 variant=single" — the
    // inventory's own finding predates the W2 task 3 field rename). Italic
    // footnote (meta).
    id: "bento-panel",
    kind: "archetype",
    slideTypes: ["content"],
    slots: [
      { name: "kicker", accepts: CHROME },
      { name: "heading", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "body", accepts: "any" },
      { name: "grid", accepts: "any", capacity: 6 },
      { name: "meta", accepts: CHROME },
    ],
    arrangements: ["single"],
  },
  "tone-adaptive-content": {
    // content-tone-adaptive-content.tsx: kicker, heading, subheading, accent
    // bar + hairline rule, SvgContent body (arrangement passed through
    // unchanged in both branches), meta (footer meta row inside the white
    // card when a bg image is present, or an italic footnote when not —
    // same slot, two renderings).
    id: "tone-adaptive-content",
    kind: "archetype",
    slideTypes: ["content"],
    slots: [
      { name: "kicker", accepts: CHROME },
      { name: "heading", accepts: CHROME },
      { name: "subheading", accepts: CHROME },
      { name: "rule", accepts: CHROME },
      { name: "body", accepts: "any" },
      { name: "meta", accepts: CHROME },
    ],
    arrangements: "all",
  },
}

// ─────────────────────────────────────────────────────────────────────────
// Image takeover layouts (4) — `slide.layout` ids for the page-level
// `image-split`/`image-top`/`image-bottom`/`image-annotate` takeovers
// (FullSlideSvg.tsx's splitTakeover branch, keyed off `getLayout(slide.
// layout)?.kind === "takeover"` since W2 task 3 — originally 4 snake_case
// `slide.variant` values): bespoke full-page compositions that intercept
// *before* any archetype runs, implemented by src/svg/ImagePages.tsx.
// `slideTypes` is written as `["content"]`, and task 3's applicability gate
// (api.ts `checkLayoutApplicability`) now enforces it as a validate hard
// error — before that gate existed, these ids were schema-legal on any
// slide type and a cover/chapter slide setting one got silently hijacked
// at render (the confirmed bug the inventory flagged; this registry entry
// used to just state the intended applicability without enforcing it).
// ─────────────────────────────────────────────────────────────────────────
const TAKEOVER_LAYOUTS: Record<string, LayoutDefinition> = {
  "image-split": {
    // ImagePages.tsx ImageSplitPage: full-height bleed image in a fixed
    // column (first image block; optional caption overlay), kicker + heading
    // + rule + subheading in the text column, then the remaining blocks as
    // body — hardcoded arrangement "single" (layoutContentFit("single", ...),
    // ImagePages.tsx:209-214), not exposed via `arrangements` (takeover
    // kind, not archetype).
    id: "image-split",
    kind: "takeover",
    slideTypes: ["content"],
    slots: [
      { name: "image", accepts: ["image"], selection: "first" },
      { name: "caption", accepts: [] },
      { name: "body", accepts: "any" },
    ],
  },
  "image-top": {
    // ImagePages.tsx ImageTopPage: full-width top-band bleed image (first
    // image block, no caption render), heading band, remaining blocks split
    // into up to 3 columns as body — each column hardcoded "single"
    // (ImagePages.tsx:360).
    id: "image-top",
    kind: "takeover",
    slideTypes: ["content"],
    slots: [
      { name: "image", accepts: ["image"], selection: "first" },
      { name: "body", accepts: "any" },
    ],
  },
  "image-bottom": {
    // ImagePages.tsx ImageBottomPage: centered heading/rule/subheading,
    // remaining blocks as body (hardcoded "single", ImagePages.tsx:682-687),
    // then a full-width bottom-band bleed image (first image block) with an
    // optional caption overlay.
    id: "image-bottom",
    kind: "takeover",
    slideTypes: ["content"],
    slots: [
      { name: "body", accepts: "any" },
      { name: "image", accepts: ["image"], selection: "first" },
      { name: "caption", accepts: [] },
    ],
  },
  "image-annotate": {
    // ImagePages.tsx ImageAnnotatePage: centered heading + subheading,
    // framed center image (first image block) with optional caption, and up
    // to 4 corner annotations sourced from the *first bullets block's* items
    // (bulletsBlock.items.slice(0, 4), ImagePages.tsx:479-482). Deliberate
    // deviation from the brief's base "image + body" takeover shape: unlike
    // the other 3 takeovers, this renderer never builds a `rest` of
    // leftover blocks — nothing besides the found image + bullets block is
    // read, so declaring a `body` slot here would claim capacity the code
    // does not actually offer. `annotation` is the real substitute for body
    // in this one takeover.
    id: "image-annotate",
    kind: "takeover",
    slideTypes: ["content"],
    slots: [
      { name: "image", accepts: ["image"], selection: "first" },
      { name: "annotation", accepts: ["bullets"], capacity: 4 },
      { name: "caption", accepts: [] },
    ],
  },
}

/** All 30 archetype layouts + 4 takeover layouts, keyed by id. */
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
