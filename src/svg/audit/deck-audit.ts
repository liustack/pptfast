import type { PptxIR } from "@/ir"
import { renderSlideSvg } from "../../api"
import { PptfastError } from "../../errors"
import { measureMonoTextUnits, measureTextUnits } from "../../lib/svg-text-layout"
import { getPlatform } from "../../platform/registry"
import { isBold, isMonoFontFamily } from "../fonts"
import { auditSvgMarkup, parseNums, parseTransform, type OverflowIssue } from "./svg-audit"

/**
 * `pptfast audit` finding shape (v0.3 W6, spec §7 workflow ④). `page` is
 * 1-based (matches `ValidationIssue.page` in `api.ts`); `slideId` is set
 * whenever the offending slide has a stable `id` (assemble-stamped or
 * author-supplied), same "page + optional id" convention `formatIssues`
 * already uses for validate errors.
 */
export interface AuditFinding {
  page: number
  slideId?: string
  code:
    | "overflow"
    | "out-of-bounds"
    | "low-contrast"
    | "overlap"
    | "content-truncated"
    | "content-dropped"
  message: string
  detail?: Record<string, unknown>
}

/**
 * Which check families actually ran (audit-v2 phase B, spec §4.2/§11.6) —
 * the one piece of the spec's original metrics design that survives into
 * this wave (§11.6: metrics itself deferred, "唯一现值是 checks 结构"). This
 * is the wave's own spirit made literal: a field can only ever be
 * `"completed"` once its check family genuinely ran over every audited
 * page, never a default that silently reads as "passed". `svg` has no
 * `"not-requested"` state — the deterministic SVG audit always runs, so it
 * is always `"completed"`. `pixels` starts `"not-requested"` and only ever
 * becomes `"completed"`; there is deliberately no `"failed"` value — a
 * failed pixel audit throws (spec §11.7's "契约层"), it never reports
 * itself as a completed check that happens to carry no findings.
 */
export interface AuditChecks {
  svg: "completed"
  pixels: "not-requested" | "completed"
}

export interface AuditReport {
  findings: AuditFinding[]
  pagesAudited: number
  pagesSkipped: number
  checks: AuditChecks
}

/** `auditDeck`'s second parameter (audit-v2 phase B) — see that function's
 *  own doc comment for the overload contract this shape backs. */
export interface AuditDeckOptions {
  pixels?: boolean
}

// ────────────────────────────────────────────────────────────────────────
// Shared parse helper — same DOMParser seam `svg-audit.ts` uses (platform
// registry, `?? globalThis.DOMParser` fallback for jsdom-environment tests
// that never call `installNodePlatform()`), so this module carries the exact
// same "zero Node dependency at import time, Node users opt in" closure
// discipline (`src/index.ts` never imports `linkedom` — only `platform/node.ts`
// does, and only when a Node caller explicitly installs it).
// ────────────────────────────────────────────────────────────────────────

function parseSvg(markup: string): Element {
  const Parser = getPlatform().domParser ?? globalThis.DOMParser
  if (!Parser) {
    throw new Error(
      'DOMParser unavailable — in Node, call installNodePlatform() from "@liustack/pptfast/node" first (the pptfast CLI does this automatically)',
    )
  }
  const doc = new Parser().parseFromString(markup, "image/svg+xml")
  const err = doc.querySelector("parsererror")
  if (err) throw new Error(`failed to parse slide svg: ${err.textContent ?? ""}`)
  return doc.documentElement
}

// ────────────────────────────────────────────────────────────────────────
// Overflow / out-of-bounds — thin adapter over svg-audit.ts's existing
// walker. `h-overflow`/`v-overflow` (text spilling past its own box/rect,
// still on-page) map to "overflow"; `page-overflow` (past the 1280×720
// canvas) maps to "out-of-bounds" — the two AuditFinding codes this check
// family produces.
// ────────────────────────────────────────────────────────────────────────

function overflowMessage(issue: OverflowIssue): string {
  const label = issue.text || "(empty text)"
  if (issue.kind === "page-overflow") {
    return `text "${label}" falls outside the 1280×720 page (${issue.detail}) — shorten the content, split the slide, or mark the element data-bleed if this is intentional bleed printing`
  }
  const region = issue.kind === "h-overflow" ? "its column" : "the content area"
  return `text "${label}" overflows ${region} (${issue.detail}) — shorten the content or split the slide`
}

function overflowFindings(markup: string, page: number, slideId: string | undefined): AuditFinding[] {
  return auditSvgMarkup(markup).map((issue) => ({
    page,
    ...(slideId !== undefined ? { slideId } : {}),
    code: issue.kind === "page-overflow" ? "out-of-bounds" : "overflow",
    message: overflowMessage(issue),
    detail: { kind: issue.kind, text: issue.text, detail: issue.detail },
  }))
}

// ────────────────────────────────────────────────────────────────────────
// Low-contrast — WCAG 2.1 SC 1.4.3 relative-luminance contrast ratio,
// text fill (as actually rendered, i.e. blended through inherited
// `opacity`/`fill-opacity`) vs. the slide's effective background.
// ────────────────────────────────────────────────────────────────────────

/**
 * WCAG 2.1 SC 1.4.3 minimum contrast ratio for normal-size text.
 */
const CONTRAST_RATIO_BODY = 4.5

/**
 * WCAG 2.1 SC 1.4.3 minimum contrast ratio for "large" text. The spec's own
 * criterion for "large" is a *dual* one — >=18pt (24px) regular weight OR
 * >=14pt (~18.66px) bold — but this renderer doesn't reliably expose
 * font-weight on every text element (most components never set
 * `font-weight` at all, relying on the font family's own regular cut), so
 * per the plan this implementation uses a single font-size cutoff
 * (`LARGE_TEXT_MIN_PX`) with no bold/regular split.
 */
const CONTRAST_RATIO_LARGE = 3

/**
 * font-size (px, post-transform-scale) at/above which text qualifies for the
 * relaxed `CONTRAST_RATIO_LARGE` threshold instead of `CONTRAST_RATIO_BODY`.
 * WCAG's own "large text" cutoff is 18pt; at the CSS/SVG px-per-pt ratio
 * (96/72) that's 18 * 96/72 = 24px.
 */
const LARGE_TEXT_MIN_PX = 24

/** SVG's own initial value for `fill` when nothing up the ancestor chain has
 * set one (SVG2 §11.3 "Fill Properties" — initial value `black`). */
const DEFAULT_FILL = "#000000"

/** SVG's own initial `font-size`. Mirrors svg-audit.ts's inline `?? 16`
 * default so the two auditors agree on an untagged text's size. */
const DEFAULT_FONT_SIZE = 16

/**
 * Below this combined (`opacity` × `fill-opacity`, inherited down the
 * ancestor chain) alpha, text is treated as decorative rather than content
 * meant to be read, and excluded from the contrast check entirely — WCAG
 * 1.4.3 targets legible content text, and flagging intentional near-invisible
 * decoration would be false-positive noise on every deck that uses it.
 *
 * Empirical basis (found while investigating this task, not guessed):
 * `slide-decor.tsx`'s `big_number`/`quote_marks` watermark decorations render
 * at 0.08-0.24 `fill-opacity` by design (a giant page-number/quote-mark meant
 * to be barely visible), while every *readable* de-emphasized text found
 * across the theme set (fashion cover/chapter/ending meta lines, kpi delta
 * labels, row-card captions) sits at 0.6-0.92. 0.4 sits in the gap between
 * the two clusters. `chapter-rail-chapter.tsx`'s inactive rail number (0.35,
 * a dimmed nav-style indicator rather than body content) falls on the
 * exempt side — a defensible call for the same "not content meant to convey
 * information on its own" reasoning, documented here rather than silently.
 */
const DECORATIVE_ALPHA = 0.4

/**
 * A text run's ink box, as fractions of its rendered font size above and
 * below the baseline — the band `backgroundsUnderRun` grids over. The
 * descent mirrors `TEXT_DESCENT_RATIO` further down this file (which
 * `findOverlapIssues` and `svg-audit.ts`'s v-overflow check already share),
 * and the pair together mirrors `pixel-audit.ts`'s own
 * `SAMPLE_ASCENT_RATIO`/`SAMPLE_DESCENT_RATIO` — the raster auditor grids
 * exactly this same estimated box, so the two auditors agree on where a
 * run's ink actually is. No real font metrics exist at audit time (this
 * renderer never embeds or queries a font file), so both numbers are the
 * usual declared-size-relative approximation, not measurements.
 */
const TEXT_INK_ASCENT_RATIO = 0.75
const TEXT_INK_DESCENT_RATIO = 0.25

/**
 * Sample spacing for `backgroundsUnderRun`, as a fraction of the run's own
 * rendered font size — so the grid gets denser exactly where the text is
 * smaller, and the guarantee it buys reads the same at every scale. The
 * guarantee: samples sit on both edges of the ink box and no more than one
 * stride apart, so any patch at least this wide *and* this tall, lying
 * inside the box, must contain one. Below that size a patch may or may not
 * be hit depending on where it falls — an honest limit, not a claim that
 * smaller patches don't matter. Half an em is roughly one character, which
 * is the scale at which "this text is sitting on that colour" starts being
 * something a reader would say.
 *
 * `pixel-audit.ts` states the same idea in absolute pixels
 * (`MIN_GUARANTEED_PATCH_PX`/`SAMPLE_STRIDE_PX`, "glyph scale") because it
 * grids a rasterized page where a run's font size is no longer available;
 * here it is, so the run's own size is the more direct anchor. Deliberately
 * not shared as one constant between the two: they are stride rules for two
 * different domains, and forcing them into one would make each read as a
 * consequence of the other rather than of its own argument.
 */
const BG_SAMPLE_STRIDE_EM = 0.5

/**
 * `data-contrast-tier="meta"` — a render-side marker (own protocol, same
 * family as `data-decor`/`data-audit-box` above and `full-matrix-
 * contrast.test.ts`'s `ALLOWLIST`: "audit reads a marker to pick which rule
 * applies" is this codebase's existing shape for a tiered check, not a new
 * contract) for the contrast-policy wave's **B tier**
 * (`docs/contrast-system.md`'s three-tier policy: content text stays at the
 * unmarked default A-tier ratio — `CONTRAST_RATIO_BODY`/`CONTRAST_RATIO_LARGE`
 * by size — while meta-information text — copyright lines, page numbers,
 * org names, dates: real information, deliberately de-emphasized, not
 * `DECORATIVE_ALPHA`'s "not meant to be read at all" — only ever needs
 * `CONTRAST_RATIO_LARGE` (3:1), *regardless of its rendered font size*).
 *
 * Emitted directly on the `<text>` element by a render-side call site (e.g.
 * `ending-banner-ending.tsx`/`ending-rail-ending.tsx`'s copyright line, the
 * two sites that motivated this policy) — read here the same "own attribute
 * wins, else inherit from the nearest ancestor" way `fill`/`font-size`
 * already are, so a `<tspan>` continuing a marked `<text>` run without
 * repeating the attribute still inherits the tier. Unlike `data-decor`, this
 * is *not* a subtree-sticky exclusion (a `<g data-contrast-tier="meta">`
 * wrapper is not a supported call shape today — every current emitter marks
 * the `<text>` element itself) — kept as a plain inherit rather than
 * `data-decor`'s "sticky once entered" accumulation so a future nested
 * unmarked A-tier `<text>` inside some larger marked wrapper wouldn't
 * silently inherit the relaxed floor by construction; nothing in this
 * codebase currently nests text that way, so the distinction is dormant, not
 * exercised — documented so it stays a deliberate choice rather than an
 * accident if that changes.
 *
 * Any other value (or the attribute's absence) leaves the existing
 * size-driven A-tier requirement untouched — this is additive, not a
 * replacement: `full-matrix-contrast.test.ts`'s regression net and
 * `auditDeck`'s callers get this for free, no separate wiring, because both
 * already consume `findContrastIssues`'s same `issues`/`imageBackedRuns`
 * output this marker feeds into.
 */
const META_CONTRAST_TIER = "meta"

/** The contrast ratio a run must clear — `META_CONTRAST_TIER`'s hard 3:1
 * floor when `tier` marks it as meta-information text, else the existing
 * size-driven A-tier split (`CONTRAST_RATIO_LARGE`/`CONTRAST_RATIO_BODY`).
 * Shared by both the resolved-background (`issues`) and image-backed
 * (`imageBackedRuns`) branches below so the two tables never disagree on
 * what a tagged run needs. */
function requiredRatioFor(tier: string | null, renderedFontSize: number): number {
  if (tier === META_CONTRAST_TIER) return CONTRAST_RATIO_LARGE
  return renderedFontSize >= LARGE_TEXT_MIN_PX ? CONTRAST_RATIO_LARGE : CONTRAST_RATIO_BODY
}

function parseHexColor(hex: string): [number, number, number] {
  let h = hex.replace("#", "")
  if (h.length === 3 || h.length === 4) {
    h = h
      .slice(0, 3)
      .split("")
      .map((c) => c + c)
      .join("")
  } else {
    h = h.slice(0, 6)
  }
  const n = parseInt(h.padEnd(6, "0"), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function srgbToLinear(c: number): number {
  const cs = c / 255
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4)
}

/** WCAG 2.1 relative luminance of an sRGB colour. */
function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

/**
 * WCAG 2.1 SC 1.4.3 contrast ratio between two opaque hex colours. Exported
 * (audit-v2 phase B) so `pixel-audit.ts` reuses this exact math against a
 * *sampled* background pixel instead of a second implementation drifting
 * from this one — the pixel audit's whole premise is "same WCAG formula,
 * different (and more reliable) source for the background colour".
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(parseHexColor(hexA))
  const lb = relativeLuminance(parseHexColor(hexB))
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Alpha-blend `fg` over `bg` (both opaque hex) — the "over" compositing a
 * translucent fill actually renders as, so a dimmed (`fill-opacity`/
 * `opacity` < 1) text's *effective* on-page colour, not its raw `fill`
 * attribute, is what gets compared against the background. Exported
 * (audit-v2 phase B) — see {@link contrastRatio}'s own doc comment;
 * `pixel-audit.ts` blends a run's ink over a *sampled* pixel with this same
 * function rather than a second copy.
 */
export function blendOver(fg: string, bg: string, alpha: number): string {
  const [fr, fgc, fb] = parseHexColor(fg)
  const [br, bgc, bb] = parseHexColor(bg)
  const mix = (f: number, b: number) => Math.round(f * alpha + b * (1 - alpha))
  const toHex = (v: number) => v.toString(16).padStart(2, "0")
  return `#${toHex(mix(fr, br))}${toHex(mix(fgc, bgc))}${toHex(mix(fb, bb))}`
}

/**
 * Minimum absolute-page area (px²) a `<rect>`/`<image>` must cover to count
 * as a *page-level* background region — `regions`/`BgRegion`/
 * `__collectBgRegions`'s own contract below, e.g. "how many real background
 * layers does this campaign cover paint" (see that test's own doc comment).
 *
 * Calibrated against real geometry found while investigating the original
 * (W6) version of this task: the smallest legitimate background this
 * renderer paints is a content page's `colors.primary` assertion banner
 * (`content-banner-heading.tsx`, 1088×88 = 95,744px²) or a kpi card shell
 * (`kpi.tsx`, ~262×120 = 31,440px²) or one gradient band (`background.tsx`,
 * 24 bands over 1280×720 ≈ 1280×31 = 39,680px² for a `tb` gradient); the
 * largest decorative accent found is `icon-cards.tsx`'s corner bar
 * (32×3 = 96px²) and the largest badge/dot circle is `steps.tsx`'s numbered
 * badge (r=19 → ~1,134px²). 8,000px² sits comfortably in the gap between the
 * two clusters.
 *
 * **Bench-driven fix round (defect A):** this constant used to *also* gate
 * which shapes a `<text>` could resolve its background against — wrong,
 * root-caused as the single most-hit false-positive class in the benchmark.
 * A page-level candidate filter and "what did this text actually get
 * painted on top of" are different questions with different answers: a
 * `rail-numbered` "1.1" badge (64×32 = 2,048px²) or a `steps` numbered badge
 * circle (r=14, ~616px²) sit well below this floor — correctly, they are not
 * *page* backgrounds — but each is unambiguously the real, sole background
 * of the digit painted directly on top of it. Gating attribution by this
 * same area floor made `findContrastIssues` fall through to whatever larger
 * region happened to sit underneath (the page background, a card shell),
 * checking the digit's ink against a color it was never actually rendered
 * on. `paintedShapes`/`PaintedShape` below is the fix: a *separate*,
 * floor-free walk of every rect/circle/ellipse/path/polygon (image excluded,
 * see its own branch's comment), used only for text-background attribution — this
 * constant keeps its original, narrower job of filtering `regions` for
 * `__collectBgRegions`'s own page-level callers/tests, unchanged.
 */
const MIN_BG_REGION_AREA = 8000

/**
 * A translucent overlay/scrim below this opacity doesn't visually dominate
 * enough to trust its own raw colour as a stand-in for "the background text
 * sits on" — the unknown layer beneath it (a photo) would still show through
 * too much. `background.tsx`'s own auto-scrim (`AUTO_SCRIM_OPACITY = 0.66`)
 * and a typical author-authored `overlay.opacity` both clear this easily; a
 * faint decorative tint does not.
 */
const MIN_BG_OPACITY = 0.5

/**
 * A page-level background candidate — `regions`' own element shape, filtered
 * by `MIN_BG_REGION_AREA`/`MIN_BG_OPACITY` (rect/image/path/polygon only; see
 * that constant's own doc comment for why circle/ellipse never join this
 * particular table — `polygon` joins it on the same footing as `path`,
 * sweep2 T4). Kept exactly as it was before the bench-driven fix
 * round for `__collectBgRegions`'s existing page-level contract (its own
 * dedicated regression test pins an exact region *count* against a real
 * render) — text-background attribution no longer reads this table at all;
 * see `PaintedShape` below.
 */
export interface BgRegion {
  x: number
  y: number
  w: number
  h: number
  /** `null` = a real `<image>` (photo) — pixel colours genuinely unknown. */
  fill: string | null
}

/**
 * A single painted-fill candidate for text-background *attribution*
 * (bench-driven fix round, defect A; polygon added sweep2 T4) — every
 * opaque-enough rect/circle/ellipse/path/polygon this walk sees, with **no**
 * `MIN_BG_REGION_AREA` floor,
 * each carrying its own exact containment test rather than a shared AABB.
 * `contains` is the whole point of the shape split below: a badge circle's
 * *bounding box* is not the badge circle, and a corner-anchored `<text>`
 * that happens to sit in one of a circle's bbox corners (outside the circle
 * itself) must not attribute to it just because a cruder rectangular test
 * would have said yes.
 */
interface PaintedShape {
  fill: string | null
  contains(px: number, py: number): boolean
}

/** Axis-aligned rect containment — shared by `<rect>`/`<image>`/`<path>`/
 * `<polygon>` (the last two via `pathBoundingBox`/`polygonBoundingBox`'s own
 * bbox, see each function's doc comment). For `<path>`/`<polygon>`/`<image>`
 * this is the shape's *bounding box*, never its outline, even where the bbox
 * itself is now tight/exact (line and arc geometry) rather than an
 * over-approximation. For `<rect>` the box **is** the outline — except at a
 * rounded corner, which `rx`/`ry` cut back exactly (see below), so a `<rect>`
 * always gets its real painted outline rather than an outer approximation of
 * it.
 *
 * `rx`/`ry` default to `0` (square corners) so every bbox caller is
 * byte-identical to the pre-`fix/decor-contrast-attribution` behavior. When
 * set, a point in one of the four corner quadrants is tested against that
 * corner's quarter-ellipse instead of the box — the same normalized-distance
 * form `ellipseShape` uses. Radii are clamped to half the side, as the SVG
 * spec itself clamps them; a degenerate radius collapses that corner back to
 * a square one. This matters because the decor-attribution gate below
 * ("`decorShapeIsExact`") admits a shape only when the containment test
 * registered for it is the painted outline, and a rounded rect whose corners
 * were tested as square would not have been. */
function rectShape(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string | null,
  rx = 0,
  ry = 0,
): PaintedShape {
  const crx = Math.min(Math.max(rx, 0), w / 2)
  const cry = Math.min(Math.max(ry, 0), h / 2)
  return {
    fill,
    contains: (px, py) => {
      if (px < x || px > x + w || py < y || py > y + h) return false
      if (crx <= 0 || cry <= 0) return true
      // Distance past the inner (un-rounded) cross, per axis — zero
      // everywhere but the four corner quadrants, which is exactly where a
      // rounded rect is not its own box.
      const ox = Math.max(x + crx - px, px - (x + w - crx), 0)
      const oy = Math.max(y + cry - py, py - (y + h - cry), 0)
      if (ox === 0 || oy === 0) return true
      const nx = ox / crx
      const ny = oy / cry
      return nx * nx + ny * ny <= 1
    },
  }
}

/** Exact ellipse containment (`circle` is the `rx === ry` case, computed
 * once by the caller from a scaled `r`) — the normalized-distance form
 * `((px-cx)/rx)² + ((py-cy)/ry)² <= 1`, not the shape's own AABB. A
 * degenerate (zero-radius) ellipse contains nothing rather than dividing by
 * zero. */
function ellipseShape(cx: number, cy: number, rx: number, ry: number, fill: string | null): PaintedShape {
  return {
    fill,
    contains: (px, py) => {
      if (rx <= 0 || ry <= 0) return false
      const nx = (px - cx) / rx
      const ny = (py - cy) / ry
      return nx * nx + ny * ny <= 1
    },
  }
}

/**
 * A donut-annulus or pie sector, recognized from a `<path>`'s own `d`
 * string (fix/donut-annulus-attribution — closes `docs/contrast-system.md`'s
 * own "Residual, distinct limitation" paragraph). Extends `ellipseShape`'s
 * "exact outline, not the AABB" precedent to `renderDonut`/`renderPie`'s own
 * wedge idiom (`chart-svg.tsx`): a wide-angle wedge's exact bbox (already
 * tight since the arc-bbox wave) can still legitimately span the ring's
 * transparent hole or a pie slice's own un-swept "bite", which is exactly
 * where `rectShape`'s AABB containment test used to misattribute the
 * donut's own center total-label. `ri` is `0` for a pie slice (a disk
 * sector, no hole).
 */
export interface Sector {
  cx: number
  cy: number
  ri: number
  ro: number
  /** Start angle (radians, `Math.atan2` convention). */
  startA: number
  /** Angular span swept from `startA` in the increasing-angle direction,
   * always in `(0, 2π]` — never negative, never wrapped past a full turn. */
  span: number
}

/** Exact donut-annulus/pie-sector containment — `dist` within `[ri, ro]`
 * (radius band) *and* the point's own angle within `[startA, startA+span]`
 * (mod 2π). A `span` at/above a full turn (a single 100%-share donut/pie
 * category) skips the angular test entirely — every angle is "inside" a
 * full circle, and computing a meaningful `startA`/`endA` split for one
 * would be a distinction without a difference. Small epsilon on both tests
 * for the same reason `pathBoundingBoxByGrammar`'s arc math already needs
 * one: these figures round-trip through `atan2`/`hypot` on floats
 * recovered from the `d` string's own text, not the renderer's original
 * unrounded values. */
function sectorShape(sector: Sector, fill: string | null): PaintedShape {
  const { cx, cy, ri, ro, startA, span } = sector
  const EPS = 1e-6
  return {
    fill,
    contains: (px, py) => {
      const dx = px - cx
      const dy = py - cy
      const dist = Math.hypot(dx, dy)
      if (dist < ri - EPS || dist > ro + EPS) return false
      if (span >= 2 * Math.PI - EPS) return true
      let delta = (Math.atan2(dy, dx) - startA) % (2 * Math.PI)
      if (delta < -EPS) delta += 2 * Math.PI
      return delta >= -EPS && delta <= span + EPS
    },
  }
}

/** A single (x, y) sample fed into `pathBoundingBoxByGrammar`'s running
 * min/max accumulator — never rendered or exposed, just the shared shape
 * `arcExtents`/the cubic/quadratic extrema helpers hand back. */
interface PathPoint {
  x: number
  y: number
}

/**
 * Endpoint -> center parameterization for one SVG `A`/`a` arc command, per
 * the W3C SVG 1.1 implementation notes appendix F.6.5 — generalized for a
 * nonzero x-axis-rotation. (This renderer's own arcs, `roundedTopBarPath`'s
 * corner rounding, never carry one — `svg2pptx/path.ts`'s sibling
 * conversion leans on that fact and assumes rotation 0 — but this function
 * is a measuring instrument auditing arbitrary-ish `d` strings, not the
 * renderer itself, so it does the full spec math instead of inheriting that
 * shortcut.) Returns `null` for a degenerate arc (zero radius, or start ===
 * end) — the caller treats that as a plain line to the endpoint, same as a
 * real SVG renderer would.
 */
function arcToCenter(
  x1: number,
  y1: number,
  rx0: number,
  ry0: number,
  rotDeg: number,
  largeArc: number,
  sweep: number,
  x2: number,
  y2: number,
): { cx: number; cy: number; rx: number; ry: number; phi: number; theta1: number; dTheta: number } | null {
  if (x1 === x2 && y1 === y2) return null
  let rx = Math.abs(rx0)
  let ry = Math.abs(ry0)
  if (rx === 0 || ry === 0) return null
  const phi = ((rotDeg % 360) * Math.PI) / 180
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const dx2 = (x1 - x2) / 2
  const dy2 = (y1 - y2) / 2
  const x1p = cosPhi * dx2 + sinPhi * dy2
  const y1p = -sinPhi * dx2 + cosPhi * dy2
  // Scale up radii if they're too small to span the chord (F.6.6.2).
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) {
    const s = Math.sqrt(lambda)
    rx *= s
    ry *= s
  }
  const sign = largeArc !== sweep ? 1 : -1
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  const co = den === 0 ? 0 : sign * Math.sqrt(Math.max(0, num / den))
  const cxp = (co * rx * y1p) / ry
  const cyp = (co * -ry * x1p) / rx
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2
  const angleBetween = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy
    const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy))
    let a = Math.acos(Math.min(1, Math.max(-1, len === 0 ? 1 : dot / len)))
    if (ux * vy - uy * vx < 0) a = -a
    return a
  }
  const ux = (x1p - cxp) / rx
  const uy = (y1p - cyp) / ry
  const vx = (-x1p - cxp) / rx
  const vy = (-y1p - cyp) / ry
  const theta1 = angleBetween(1, 0, ux, uy)
  let dTheta = angleBetween(ux, uy, vx, vy)
  if (sweep === 0 && dTheta > 0) dTheta -= 2 * Math.PI
  if (sweep === 1 && dTheta < 0) dTheta += 2 * Math.PI
  return { cx, cy, rx, ry, phi, theta1, dTheta }
}

/** True when angle `theta` (radians) lies on the swept arc running from
 * `theta1` to `theta1 + dTheta` (either direction, `dTheta`'s sign says
 * which) — decides whether one of the ellipse's axis-extremal angles
 * (`arcExtents` below) actually falls on the drawn segment, not just
 * somewhere on the ellipse's untouched remainder. */
function angleOnSweep(theta: number, theta1: number, dTheta: number): boolean {
  let delta = (theta - theta1) % (2 * Math.PI)
  if (dTheta >= 0) {
    if (delta < 0) delta += 2 * Math.PI
    return delta <= dTheta
  }
  if (delta > 0) delta -= 2 * Math.PI
  return delta >= dTheta
}

/**
 * Tight extent points for one `A`/`a` arc segment: both endpoints plus
 * whichever of the ellipse's (at most 4) axis-extremal points actually lie
 * on the swept portion (`angleOnSweep`) — the standard endpoint ->
 * center -> extremal-angle approach most `svg-path-bbox`-style
 * implementations converge on (SVG 1.1 appendix F.6.4's parameterization,
 * `x(θ)=cx+rx·cosθ·cosφ−ry·sinθ·sinφ`, `y(θ)=cy+rx·cosθ·sinφ+ry·sinθ·cosφ`,
 * differentiated and set to 0 for each axis). Endpoints are always included
 * — a short sweep can miss every extremal angle entirely (`roundedTopBarPath`'s
 * own quarter-circle corners are exactly that case). Falls back to just the
 * endpoint for a degenerate arc (see `arcToCenter`).
 */
function arcExtents(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  rotDeg: number,
  largeArc: number,
  sweep: number,
  x2: number,
  y2: number,
): PathPoint[] {
  const c = arcToCenter(x1, y1, rx, ry, rotDeg, largeArc, sweep, x2, y2)
  if (!c) return [{ x: x2, y: y2 }]
  const { cx, cy, rx: arx, ry: ary, phi, theta1, dTheta } = c
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const pointAt = (theta: number): PathPoint => ({
    x: cx + arx * Math.cos(theta) * cosPhi - ary * Math.sin(theta) * sinPhi,
    y: cy + arx * Math.cos(theta) * sinPhi + ary * Math.sin(theta) * cosPhi,
  })
  const thetaX = Math.atan2(-ary * sinPhi, arx * cosPhi)
  const thetaY = Math.atan2(ary * cosPhi, arx * sinPhi)
  const pts: PathPoint[] = [
    { x: x1, y: y1 },
    { x: x2, y: y2 },
  ]
  for (const theta of [thetaX, thetaX + Math.PI, thetaY, thetaY + Math.PI]) {
    if (angleOnSweep(theta, theta1, dTheta)) pts.push(pointAt(theta))
  }
  return pts
}

/** Roots (in `(0, 1)`) of the derivative of a single cubic-Bezier axis
 * component `p0..p3` — at most 2, from the quadratic `B'(t)=0`. Shared by
 * `C` and `S` (an `S` command is just a `C` whose first control point is a
 * reflection, resolved by the caller before this runs). */
function cubicExtremaT(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3
  const b = 2 * (p0 - 2 * p1 + p2)
  const c = p1 - p0
  const roots: number[] = []
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) > 1e-9) roots.push(-c / b)
  } else {
    const disc = b * b - 4 * a * c
    if (disc >= 0) {
      const sq = Math.sqrt(disc)
      roots.push((-b + sq) / (2 * a), (-b - sq) / (2 * a))
    }
  }
  return roots.filter((t) => t > 0 && t < 1)
}

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3
}

/** Root (in `(0, 1)`) of the derivative of a single quadratic-Bezier axis
 * component — at most 1, `B'(t)` is linear. Shared by `Q` and `T` (same
 * reflection relationship as `C`/`S`, one degree lower). */
function quadExtremaT(p0: number, p1: number, p2: number): number[] {
  const denom = p0 - 2 * p1 + p2
  if (Math.abs(denom) < 1e-9) return []
  const t = (p0 - p1) / denom
  return t > 0 && t < 1 ? [t] : []
}

function quadAt(p0: number, p1: number, p2: number, t: number): number {
  const mt = 1 - t
  return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2
}

/** Tokenize a `d` string into command letters and numeric operands.
 * Positionally aware for `A`/`a`: the SVG grammar (`arc-argument ::= number
 * comma-wsp? number comma-wsp? number comma-wsp flag comma-wsp? flag
 * comma-wsp? coordinate-pair`) defines `large-arc-flag`/`sweep-flag` as a
 * single `"0"` or `"1"` character each, which real authoring tools (and
 * this codebase's own icon catalog, `src/icons/catalog.ts` — generated straight
 * from lucide's upstream `d` strings, see that file's header) routinely
 * glue to each other and to the following coordinate with no separator
 * (`"a1 1 0 001 1"` = rx 1 ry 1 rot 0 large-arc-flag 0 sweep-flag 0 x 1
 * y 1, not one number `001`). A naive greedy-number regex — what this
 * function used to be, and what `svg2pptx/path.ts`'s own sibling tokenizer
 * still is, kept as a separate copy rather than a shared import since
 * `src/svg/audit` doesn't otherwise depend on `src/pptx` and this file's
 * layering stays one-directional (IR/SVG -> PPTX, never the reverse) —
 * swallows the glued digits as a single multi-digit number and silently
 * desyncs every operand after it, which previously produced a wrong,
 * non-null bbox for 16 real paths in `src/icons/catalog.ts` (not a hypothetical:
 * confirmed via `pnpm vitest` against the shipped catalog while building
 * this fix). This walks `d` char-by-char instead of one big `match()`,
 * tracking the active command and its argument position (mod 7, an arc's
 * own repeated-group width) so the 4th/5th argument of every `A`/`a` group
 * is read as exactly one flag character, whatever is glued on either side
 * of it — the same technique every real SVG path parser uses. */
function tokenizePathD(d: string): string[] {
  const tokens: string[] = []
  const len = d.length
  let i = 0
  let cmd = ""
  // Position within the current command's argument list, mod 7 (an arc's
  // own repeated-group width) — only consulted for A/a, harmless noise for
  // every other command since none of them ever compares it to 3/4.
  let argIndex = 0
  const isSep = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === ","
  const skipSep = () => {
    while (i < len && isSep(d[i])) i++
  }
  const numberRe = /-?\d*\.?\d+(?:e[-+]?\d+)?/iy
  while (i < len) {
    skipSep()
    if (i >= len) break
    const ch = d[i]
    if (/[a-zA-Z]/.test(ch)) {
      tokens.push(ch)
      cmd = ch
      argIndex = 0
      i++
      continue
    }
    const isArc = cmd === "A" || cmd === "a"
    if (isArc && (argIndex === 3 || argIndex === 4) && (ch === "0" || ch === "1")) {
      tokens.push(ch)
      i++
      argIndex++
      continue
    }
    numberRe.lastIndex = i
    const m = numberRe.exec(d)
    if (!m || m.index !== i || m[0] === "") {
      // Not a flag, not a number — malformed input. Push the single
      // character through so the grammar walker's own `num()` guard
      // throws and `pathBoundingBox` falls back to the safe token
      // min/max, the same "honest, never-crash" contract as before.
      tokens.push(ch)
      i++
      continue
    }
    tokens.push(m[0])
    i = numberRe.lastIndex
    argIndex++
    if (isArc && argIndex === 7) argIndex = 0
  }
  return tokens
}

/**
 * Grammar-aware path bounding box: walks `d` command-by-command (`M`/`L`/
 * `H`/`V`/`C`/`S`/`Q`/`T`/`A`/`Z`, both absolute and relative case) instead
 * of blindly pairing every numeric token as a coordinate — so an arc's own
 * `rx`/`ry`/`x-axis-rotation`/flag numbers never get mistaken for more
 * `(x, y)` points (see `pathBoundingBox`'s own doc comment for the defect
 * this fixes). Line commands are exact by construction (an endpoint the
 * line actually visits). Curve commands (`C`/`S`/`Q`/`T`) use the exact
 * derivative-root extrema (`cubicExtremaT`/`quadExtremaT`) — a Bezier's
 * control points can lie outside the curve itself, so endpoints alone would
 * under-cover. Arcs use `arcExtents` (endpoint -> center parameterization,
 * SVG 1.1 appendix F.6.4/F.6.5).
 *
 * Returns `null` — never throws — the moment the walk hits anything it
 * can't make sense of (an unrecognized command letter, a command that runs
 * out of operands mid-grammar, `d` not starting with `M`/`m`): the caller
 * (`pathBoundingBox`) falls back to the old blind token min/max for that
 * case, safer to over-approximate on genuinely malformed input than to
 * guess wrong about what a broken `d` string was trying to draw.
 */
function pathBoundingBoxByGrammar(d: string): { x: number; y: number; w: number; h: number } | null {
  const tokens = tokenizePathD(d)
  if (tokens.length === 0) return null
  let i = 0
  let cmd = ""
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  // Reflection state for S/T's implicit control point — cleared the moment
  // a non-C/S (or non-Q/T) command runs, per spec: the reflection only
  // applies immediately after the matching curve family.
  let lastCubicCtrl: PathPoint | null = null
  let lastQuadCtrl: PathPoint | null = null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const see = (x: number, y: number) => {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const num = (): number => {
    const t = tokens[i++]
    if (t === undefined || /[a-zA-Z]/.test(t)) throw new Error("malformed")
    const n = Number(t)
    if (!Number.isFinite(n)) throw new Error("malformed")
    return n
  }
  try {
    while (i < tokens.length) {
      if (/[a-zA-Z]/.test(tokens[i])) {
        cmd = tokens[i++]
      } else if (cmd === "M") {
        // Implicit extra coordinate pairs after M/m are lineto, not more
        // moveto, per spec — the one case a repeated command letter isn't
        // just "keep using the last one".
        cmd = "L"
      } else if (cmd === "m") {
        cmd = "l"
      } else if (cmd === "") {
        throw new Error("malformed") // a numeric token before any command
      }
      const rel = cmd === cmd.toLowerCase()
      const upper = cmd.toUpperCase()
      if (upper !== "C" && upper !== "S") lastCubicCtrl = null
      if (upper !== "Q" && upper !== "T") lastQuadCtrl = null
      switch (upper) {
        case "M": {
          const x = num()
          const y = num()
          cx = rel ? cx + x : x
          cy = rel ? cy + y : y
          sx = cx
          sy = cy
          see(cx, cy)
          break
        }
        case "L": {
          const x = num()
          const y = num()
          cx = rel ? cx + x : x
          cy = rel ? cy + y : y
          see(cx, cy)
          break
        }
        case "H": {
          const x = num()
          cx = rel ? cx + x : x
          see(cx, cy)
          break
        }
        case "V": {
          const y = num()
          cy = rel ? cy + y : y
          see(cx, cy)
          break
        }
        case "Z": {
          cx = sx
          cy = sy
          break
        }
        case "C": {
          const x1 = num()
          const y1 = num()
          const x2 = num()
          const y2 = num()
          const x = num()
          const y = num()
          const ax1: number = rel ? cx + x1 : x1
          const ay1: number = rel ? cy + y1 : y1
          const ax2: number = rel ? cx + x2 : x2
          const ay2: number = rel ? cy + y2 : y2
          const ex = rel ? cx + x : x
          const ey = rel ? cy + y : y
          see(ex, ey)
          for (const t of cubicExtremaT(cx, ax1, ax2, ex)) see(cubicAt(cx, ax1, ax2, ex, t), cubicAt(cy, ay1, ay2, ey, t))
          for (const t of cubicExtremaT(cy, ay1, ay2, ey)) see(cubicAt(cx, ax1, ax2, ex, t), cubicAt(cy, ay1, ay2, ey, t))
          lastCubicCtrl = { x: ax2, y: ay2 }
          cx = ex
          cy = ey
          break
        }
        case "S": {
          const x2 = num()
          const y2 = num()
          const x = num()
          const y = num()
          const ax2: number = rel ? cx + x2 : x2
          const ay2: number = rel ? cy + y2 : y2
          const ex = rel ? cx + x : x
          const ey = rel ? cy + y : y
          const ax1: number = lastCubicCtrl ? 2 * cx - lastCubicCtrl.x : cx
          const ay1: number = lastCubicCtrl ? 2 * cy - lastCubicCtrl.y : cy
          see(ex, ey)
          for (const t of cubicExtremaT(cx, ax1, ax2, ex)) see(cubicAt(cx, ax1, ax2, ex, t), cubicAt(cy, ay1, ay2, ey, t))
          for (const t of cubicExtremaT(cy, ay1, ay2, ey)) see(cubicAt(cx, ax1, ax2, ex, t), cubicAt(cy, ay1, ay2, ey, t))
          lastCubicCtrl = { x: ax2, y: ay2 }
          cx = ex
          cy = ey
          break
        }
        case "Q": {
          const x1 = num()
          const y1 = num()
          const x = num()
          const y = num()
          const ax1: number = rel ? cx + x1 : x1
          const ay1: number = rel ? cy + y1 : y1
          const ex = rel ? cx + x : x
          const ey = rel ? cy + y : y
          see(ex, ey)
          for (const t of quadExtremaT(cx, ax1, ex)) see(quadAt(cx, ax1, ex, t), quadAt(cy, ay1, ey, t))
          for (const t of quadExtremaT(cy, ay1, ey)) see(quadAt(cx, ax1, ex, t), quadAt(cy, ay1, ey, t))
          lastQuadCtrl = { x: ax1, y: ay1 }
          cx = ex
          cy = ey
          break
        }
        case "T": {
          const x = num()
          const y = num()
          const ax1: number = lastQuadCtrl ? 2 * cx - lastQuadCtrl.x : cx
          const ay1: number = lastQuadCtrl ? 2 * cy - lastQuadCtrl.y : cy
          const ex = rel ? cx + x : x
          const ey = rel ? cy + y : y
          see(ex, ey)
          for (const t of quadExtremaT(cx, ax1, ex)) see(quadAt(cx, ax1, ex, t), quadAt(cy, ay1, ey, t))
          for (const t of quadExtremaT(cy, ay1, ey)) see(quadAt(cx, ax1, ex, t), quadAt(cy, ay1, ey, t))
          lastQuadCtrl = { x: ax1, y: ay1 }
          cx = ex
          cy = ey
          break
        }
        case "A": {
          const rx = num()
          const ry = num()
          const rot = num()
          const largeArc = num()
          const sweep = num()
          const x = num()
          const y = num()
          const ex = rel ? cx + x : x
          const ey = rel ? cy + y : y
          for (const p of arcExtents(cx, cy, rx, ry, rot, largeArc, sweep, ex, ey)) see(p.x, p.y)
          cx = ex
          cy = ey
          break
        }
        default:
          throw new Error("malformed")
      }
    }
  } catch {
    return null
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** The pre-fix behavior, kept only as `pathBoundingBox`'s fallback for `d`
 * strings `pathBoundingBoxByGrammar` can't parse: extract every numeric
 * token from `d` and take the min/max, with no notion of which numbers are
 * coordinates versus an arc's radius/rotation/flags. A safe
 * over-approximation for the malformed-input case it's now scoped to —
 * never an under-approximation, never a crash. */
function pathBoundingBoxByTokenMinMax(d: string): { x: number; y: number; w: number; h: number } | null {
  const nums = d.match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi)
  if (!nums || nums.length < 2) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = Number(nums[i])
    const y = Number(nums[i + 1])
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/**
 * A `<polygon>`'s bounding box, for `PaintedShape`/`BgRegion` purposes —
 * simple min/max over the coordinate pairs in its `points` attribute.
 * Unlike `pathBoundingBox`'s curve/arc extrema math, a polygon's vertices
 * *are* its extremes by construction — no interior curve can bulge past a
 * straight-edged outline's own corners, so no grammar walk is needed. Same
 * "never throws, an over-approximating AABB stands in for the exact
 * outline" contract as `pathBoundingBox` (a concave polygon's bbox covers
 * area outside the shape too — see that function's own doc comment for why
 * that's an accepted limitation here). Malformed/degenerate `points`
 * (fewer than 3 coordinate pairs, a non-numeric token) returns `null`,
 * mirroring `pathBoundingBox`'s own "never crash, caller skips
 * registration" contract for the equivalent case.
 */
/** `points` 属性解析成顶点表：与 {@link polygonBoundingBox} 同一分词规则。 */
function polygonPoints(pointsAttr: string): [number, number][] | null {
  const nums = pointsAttr
    .trim()
    .split(/[\s,]+/)
    .filter((tok) => tok !== "")
    .map(Number)
  if (nums.length < 6 || nums.length % 2 !== 0 || nums.some((n) => !Number.isFinite(n))) return null
  const pts: [number, number][] = []
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i]!, nums[i + 1]!])
  return pts
}

/**
 * `<polygon>` 的精确轮廓（fix/audit-polygon-attribution）：直边多边形的
 * painted outline 就是它自己的边，even-odd 射线法即精确包含判定——不像
 * `<path>` 要解曲线。这让 motif 里烘焙顶点的斜贴片（playbill 日期贴）能
 * 作为压字归因候选，而不是把字判给页面底色。
 */
function polygonShape(pts: readonly [number, number][], fill: string | null): PaintedShape {
  return {
    fill,
    contains: (px, py) => {
      let inside = false
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]!
        const [xj, yj] = pts[j]!
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
      }
      return inside
    },
  }
}

function polygonBoundingBox(pointsAttr: string): { x: number; y: number; w: number; h: number } | null {
  const nums = pointsAttr
    .trim()
    .split(/[\s,]+/)
    .filter((tok) => tok !== "")
    .map(Number)
  if (nums.length < 6 || nums.some((n) => !Number.isFinite(n))) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i]!
    const y = nums[i + 1]!
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/**
 * A `<path>`'s bounding box, for `PaintedShape`/`BgRegion` purposes —
 * grammar-aware (`pathBoundingBoxByGrammar`): walks `d` command-by-command
 * so an arc's own `rx`/`ry`/`x-axis-rotation`/flag numbers never get
 * mistaken for more `(x, y)` coordinates, the defect that used to inflate
 * `insight-panel.tsx`/`roadmap.tsx`'s shared `roundedTopBarPath` accent bar
 * (a real ~6px-tall bar) to a ~1184×1182px bbox dwarfing the 1280×720
 * canvas — confirmed via a real render before this fix, re-pinned by
 * `deck-audit.test.ts`'s own characterization test. Line commands are
 * exact by construction; curves (`C`/`S`/`Q`/`T`) and arcs (`A`/`a`) use
 * exact extrema (derivative roots for curves, endpoint -> center
 * parameterization for arcs — see `pathBoundingBoxByGrammar`'s own doc
 * comment). Still not a true path-*outline* bbox in the "is this pixel
 * actually inside the filled shape" sense (a concave polygon's bbox covers
 * area outside the shape) — `rectShape`'s own doc comment already covers
 * why that's fine here: every caller tests containment against this
 * function's bbox, never the path's exact outline, and the one large
 * opaque non-decor `<path>` background this renderer draws
 * (`cover-split-diagonal.tsx`'s straight-edged colour panel) has vertices
 * that *are* its extremes, so the bbox is exact there regardless.
 *
 * Falls back to `pathBoundingBoxByTokenMinMax` (the pre-fix behavior) only
 * for a `d` string the grammar walk can't parse — genuinely malformed
 * input, not any path this renderer itself emits — see that function's own
 * doc comment. `motif-campaign-motif.tsx`'s crayon-stroke decor paths stay
 * out of scope for a different, unrelated reason: `findContrastIssues`'s
 * `data-decor` exclusion skips every motif/decor subtree before this
 * function is ever called on it, so whatever bbox either path here would
 * produce for one never reaches a background region.
 */
function pathBoundingBox(d: string): { x: number; y: number; w: number; h: number } | null {
  return pathBoundingBoxByGrammar(d) ?? pathBoundingBoxByTokenMinMax(d)
}

/**
 * Test-only: `pathBoundingBox` exposed so its arc/curve math can be
 * asserted directly against hand-crafted `d` strings (including a real
 * `roundedTopBarPath` render's exact output — see `deck-audit.test.ts`'s
 * characterization test for the pre-fix defect this pins as fixed), the
 * same `__`-prefixed "test-only, not part of any public barrel" convention
 * `__collectBgRegions` above already establishes.
 */
export function __pathBoundingBox(d: string): { x: number; y: number; w: number; h: number } | null {
  return pathBoundingBox(d)
}

/**
 * Recognizes a `<path>`'s `d` as `renderPie`'s or `renderDonut`'s own wedge
 * idiom (`chart-svg.tsx`) and extracts the `Sector` its containment test
 * needs — a closed, parseable family (like `ellipseShape`'s disk), *not* a
 * general path-outline engine: `docs/contrast-system.md`'s "document the
 * tool limitation, don't chase it" precedent for arbitrary paths stays
 * exactly as it was, this only recognizes the renderer's own two fixed
 * token shapes. Any `d` that doesn't match one of them — including a
 * malformed one `tokenizePathD` can't fully tokenize — returns `null`, and
 * the caller keeps the existing `rectShape`/`pathBoundingBox` fallback
 * unchanged. Reuses `tokenizePathD` (positionally aware for an arc's
 * glued flag characters, see that function's own doc comment) rather than
 * a raw-string regex, so a coordinate that happens to render in
 * exponential notation (`Math.cos`/`Math.sin` of a half-turn angle can
 * yield e.g. `6.123233995736766e-17`) still tokenizes correctly.
 *
 * Pie idiom (`M cx cy L x1 y1 A r r 0 large 1 x2 y2 Z`, 15 tokens): the
 * center is the `M` point itself, written directly — no trig needed to
 * recover it. `x1,y1`/`x2,y2` are exact points on the circle at the
 * sector's start/end angle, read back via `atan2` for the angular span.
 * `ri` is always `0` — a pie slice has no hole.
 *
 * Donut idiom (`M ox1 oy1 A r r 0 large 1 ox2 oy2 L ix1 iy1 A ri ri 0 large
 * 0 ix2 iy2 Z`, 23 tokens): unlike the pie, the center is never written to
 * `d` directly, only two arc endpoints per angle (outer radius `r`, inner
 * radius `ri`). `ox1,oy1` (outer point, start angle) and `ix2,iy2` (inner
 * point, same start angle — the point `Z` closes back to `ox1,oy1`
 * through) both lie on the same ray from the center, so the center solves
 * from the one linear relationship `outer = center + r·dir`,
 * `inner = center + ri·dir` (same `dir`) satisfy:
 * `center = (r·inner − ri·outer) / (r − ri)` — exact, never degenerate
 * here since `DONUT_HOLE_RATIO < 1` keeps `r ≠ ri` for any positive outer
 * radius. Cross-checked against the *other* pair (`ix1,iy1`/`ox2,oy2`, end
 * angle) before trusting the recovered center — a mismatch means this
 * wasn't really `renderDonut`'s own idiom (or the token match was a false
 * positive on some unrelated 23-token path), so it falls back to the bbox
 * rather than trust a possibly-wrong center.
 *
 * A zero-share category (`d.y === 0`, unfiltered by `renderDonut`/
 * `renderPie` — a real, reachable shape, not hypothetical) and a 100%-share
 * category are both geometrically degenerate the same way: `startA === endA`
 * either 0 or a full turn apart, so their start/end points coincide and
 * `atan2` alone can't tell "no sweep at all" from "swept a full circle"
 * apart — both round-trip to the same coordinates. The renderer's own
 * `large-arc-flag` (`endA - startA > π ? 1 : 0`) is exactly the missing bit:
 * `0` means no sweep happened (`span = 0`, a real but visually invisible
 * sliver — correctly contains nothing), `1` means a full turn did (a single
 * 100%-share category, `span = 2π` — correctly contains the whole ring/disk).
 *
 * **Geometric round-trip, not just token shape (post-review hardening):**
 * matching the token *shape* alone is falsifiable — a hand-authored `d`
 * (an unrelated icon, say) can satisfy the same 15/23-token grammar with
 * numbers that don't actually describe a circle, e.g. an `L`/`A` endpoint
 * nowhere near the claimed radius from the claimed center. Silently
 * accepting that would parse a *wrong* sector and could flip a real
 * `findContrastIssues` verdict rather than just missing a precision
 * upgrade. So every point this function reads off the path (`x1,y1`/
 * `x2,y2` for a pie, all four outer/inner points for a donut) is checked
 * against its own claimed radius from the resolved center within
 * `RADIUS_ROUNDTRIP_EPS` — a genuine `renderDonut`/`renderPie` wedge always
 * round-trips exactly (the points *are* `cx + r·cos(θ), cy + r·sin(θ)` by
 * construction), so this only ever *rejects* a token-shape near-miss, never
 * a real one. The large-arc-flag is checked the same way: a genuine wedge's
 * flag always agrees with whether its own (non-degenerate) span exceeds π
 * (`renderPie`/`renderDonut`'s own `endA - startA > Math.PI ? 1 : 0`), so a
 * flag that disagrees with the span its own endpoints imply is rejected
 * too, independent of the radius check (it catches a different failure
 * mode — same-circle points with a mismatched sweep/magnitude flag).
 * Reject-only: this hardening never makes a previously-rejected `d` newly
 * accepted, so it never turns a correct AABB attribution into a wrong
 * sector one — only ever the other direction.
 */
function parseWedgePath(d: string): Sector | null {
  const tokens = tokenizePathD(d)
  const num = (i: number): number | null => {
    const t = tokens[i]
    if (t === undefined) return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }
  const isFlag = (i: number) => tokens[i] === "0" || tokens[i] === "1"
  const DEGENERATE_EPS = 1e-6
  // Absolute pixel tolerance for "does this point actually lie on its
  // claimed circle" / "is the recovered center actually where the outer
  // and inner arc endpoints agree it is" — loose enough to absorb float
  // round-off from `atan2`/`hypot`/the donut center's linear solve
  // (empirically ~1e-10 on real renderDonut/renderPie output, see
  // deck-audit.test.ts's real-render round-trip pin), tight enough that no
  // adversarial or coincidental non-wedge `d` clears it by accident.
  const RADIUS_ROUNDTRIP_EPS = 1e-3
  // `null` return means "reject the whole parse" (inconsistent flag or a
  // genuinely zero/negative span with a `large=1` flag, which can't happen
  // for a real wedge) — distinct from a valid `0`/`2π` degenerate span.
  const resolveSpan = (startA: number, endA: number, large: string): number | null => {
    let raw = (endA - startA) % (2 * Math.PI)
    if (raw < 0) raw += 2 * Math.PI
    // See this function's own doc comment — near-zero is the ambiguous
    // boundary between a zero-sweep and a full-turn wedge, resolved by the
    // large-arc-flag the path itself already carries rather than guessed.
    if (raw < DEGENERATE_EPS) return large === "1" ? 2 * Math.PI : 0
    // Non-degenerate: the flag must agree with the span its own endpoints
    // imply — `renderPie`/`renderDonut`'s own `endA - startA > π ? 1 : 0`.
    const expectedLarge = raw > Math.PI ? "1" : "0"
    if (large !== expectedLarge) return null
    return raw
  }
  const onCircle = (px: number, py: number, cx: number, cy: number, r: number): boolean =>
    Math.abs(Math.hypot(px - cx, py - cy) - r) <= RADIUS_ROUNDTRIP_EPS

  if (
    tokens.length === 15 &&
    tokens[0] === "M" &&
    tokens[3] === "L" &&
    tokens[6] === "A" &&
    tokens[9] === "0" && // x-axis-rotation, always 0 in this renderer's own arcs
    isFlag(10) &&
    tokens[11] === "1" && // sweep-flag, always positive in this renderer
    tokens[14] === "Z"
  ) {
    const cx = num(1)
    const cy = num(2)
    const x1 = num(4)
    const y1 = num(5)
    const r = num(7)
    const rCheck = num(8)
    const x2 = num(12)
    const y2 = num(13)
    if (cx === null || cy === null || x1 === null || y1 === null || r === null || rCheck === null || x2 === null || y2 === null) {
      return null
    }
    if (r <= 0 || Math.abs(r - rCheck) > 1e-6) return null
    if (!onCircle(x1, y1, cx, cy, r) || !onCircle(x2, y2, cx, cy, r)) return null
    const startA = Math.atan2(y1 - cy, x1 - cx)
    const endA = Math.atan2(y2 - cy, x2 - cx)
    const wedgeSpan = resolveSpan(startA, endA, tokens[10]!)
    if (wedgeSpan === null) return null
    return { cx, cy, ri: 0, ro: r, startA, span: wedgeSpan }
  }

  if (
    tokens.length === 23 &&
    tokens[0] === "M" &&
    tokens[3] === "A" &&
    tokens[6] === "0" &&
    isFlag(7) &&
    tokens[8] === "1" &&
    tokens[11] === "L" &&
    tokens[14] === "A" &&
    tokens[17] === "0" &&
    isFlag(18) &&
    tokens[19] === "0" &&
    tokens[22] === "Z"
  ) {
    const ox1 = num(1)
    const oy1 = num(2)
    const r = num(4)
    const rCheck = num(5)
    const ox2 = num(9)
    const oy2 = num(10)
    const ix1 = num(12)
    const iy1 = num(13)
    const ri = num(15)
    const riCheck = num(16)
    const ix2 = num(20)
    const iy2 = num(21)
    if (
      ox1 === null || oy1 === null || r === null || rCheck === null || ox2 === null || oy2 === null ||
      ix1 === null || iy1 === null || ri === null || riCheck === null || ix2 === null || iy2 === null
    ) {
      return null
    }
    if (r <= 0 || ri < 0 || Math.abs(r - rCheck) > 1e-6 || Math.abs(ri - riCheck) > 1e-6) return null
    const denom = r - ri
    if (Math.abs(denom) < 1e-6) return null
    const cx = (r * ix2 - ri * ox1) / denom
    const cy = (r * iy2 - ri * oy1) / denom
    // Geometric round-trip: all four points this branch reads must actually
    // sit on their own claimed circle around the *recovered* center — the
    // linear solve above can produce a center for any four points fed to
    // it, on-circle or not, so this is an independent, non-tautological
    // check (see this function's own doc comment).
    if (
      !onCircle(ox1, oy1, cx, cy, r) ||
      !onCircle(ox2, oy2, cx, cy, r) ||
      !onCircle(ix1, iy1, cx, cy, ri) ||
      !onCircle(ix2, iy2, cx, cy, ri)
    ) {
      return null
    }
    const startA = Math.atan2(oy1 - cy, ox1 - cx)
    const endA = Math.atan2(oy2 - cy, ox2 - cx)
    // Cross-check: (ix1, iy1) is the inner arc's point at endA — it should
    // land on the same ray as (ox2, oy2) through the recovered center.
    const checkA = Math.atan2(iy1 - cy, ix1 - cx)
    const angleDiff = Math.abs(((checkA - endA + Math.PI) % (2 * Math.PI)) - Math.PI)
    if (angleDiff > 1e-3) return null
    const wedgeSpan = resolveSpan(startA, endA, tokens[7]!)
    if (wedgeSpan === null) return null
    return { cx, cy, ri, ro: r, startA, span: wedgeSpan }
  }

  return null
}

/** Test-only: `parseWedgePath` exposed so its recognition/round-trip math
 * can be asserted directly against hand-crafted and real-rendered `d`
 * strings, the same `__`-prefixed convention `__pathBoundingBox` already
 * establishes. */
export function __parseWedgePath(d: string): Sector | null {
  return parseWedgePath(d)
}

export interface ContrastIssue {
  text: string
  fill: string
  background: string
  ratio: number
  required: number
  fontSize: number
}

/**
 * A text run whose effective SVG background could *not* be resolved to a
 * single paint color (`backgroundAt` returned `null`) — the pixel-audit
 * blind spot spec §4.3 exists to fill (audit-v2 phase B): in practice this
 * is a run painted directly over a bare/faintly-scrimmed `<image>` (a real
 * photo, e.g. `image-pages.tsx`'s `ImageCoverPage` — its own `DarkScrim`
 * bands are all individually below `MIN_BG_OPACITY`, so none of them ever
 * become a `PaintedShape`, and `backgroundAt` falls through to the bare
 * image underneath). `left`/`right`/`baseline` are the same font-metric
 * estimate `svg-audit.ts`'s overflow walker uses (`measureTextUnits`,
 * `text-anchor`-aware), not a real glyph bbox — `pixel-audit.ts` samples a
 * grid inside this box against the *rasterized* page, so an estimate here
 * only needs to bound the run, not describe it exactly. `required` is the
 * real WCAG target (`CONTRAST_RATIO_LARGE`/`CONTRAST_RATIO_BODY`) —
 * precomputed here so `pixel-audit.ts` never needs to import this file's
 * size-tier constants just to reproduce the same cutoff.
 */
export interface ImageBackedTextRun {
  text: string
  left: number
  right: number
  baseline: number
  fontSize: number
  fill: string
  alpha: number
  required: number
}

/**
 * Only a direct child *text* node's content "belongs" to `el` for contrast
 * purposes — text inside a nested `<tspan>` (which may carry its own `fill`/
 * `fill-opacity` override) is that tspan's own responsibility when `visit`
 * recurses into it. Without this split, a `<text>` wrapping colour-varied
 * `<tspan>` children (e.g. `cover-left-anchor.tsx`'s author/date/version
 * meta line) would double-check that content once under the wrong
 * (inherited-only) colour and once under each tspan's real one.
 */
function directText(el: Element): string {
  let s = ""
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) s += node.textContent ?? ""
  }
  return s.trim()
}

/**
 * Walk `markup`'s text content, flag any leaf whose effective colour fails
 * its WCAG size tier's contrast ratio against the background actually
 * painted beneath it. Exported (like `svg-audit.ts`'s `auditSvgMarkup`) so
 * it's directly unit-testable against hand-crafted markup, not only through
 * a full IR render.
 *
 * Background is resolved from the rendered geometry itself, not from theme
 * tokens — a first design (theme `defaultBackgrounds`/`colors.bg`, see the
 * task report) turned out wrong the moment it hit `examples/basic.json`:
 * `cover-left-anchor.tsx` and `content-banner-heading.tsx` both paint an
 * opaque `colors.primary` block/banner with hardcoded white heading text —
 * real, intentional local backgrounds no theme-token lookup captures, since
 * `primary` isn't `bg`/`surface`/`panel` and isn't tonally related to them
 * (it's a brand accent, deliberately *not* close to the page background).
 * SVG has no z-index — paint order is exactly document order — so this walk
 * mirrors that directly: every opaque-enough `<rect>`/`<circle>`/`<ellipse>`/
 * `<path>`/`<polygon>` (plus `<image>`, floor-gated — see its own branch
 * below) gets recorded, in document order, as a `PaintedShape`; a text
 * element's effective background is whichever recorded shape (searched
 * most-recent-first, i.e. topmost in paint order) actually *contains* its
 * position — an exact ellipse test for `<circle>`/`<ellipse>`, a bounding-box
 * test for the other four (see
 * `rectShape`/`ellipseShape`/`pathBoundingBox`/`polygonBoundingBox`).
 * This one mechanism covers the page background (`background.tsx` always
 * paints first), a gradient's individual bands (each is its own shape — more
 * precise than any single midpoint), local panels/cards/banners (the
 * bento-card/kpi/icon-card/banner-heading shell `<rect>`s), a self-painted
 * badge/chip a text glyph sits directly on top of (`rail-numbered`'s "1.1"
 * badge, `steps`' numbered circle — see `MIN_BG_REGION_AREA`'s own doc
 * comment for the false-positive family this fixes), and an asset-background
 * scrim opaque enough to trust (`MIN_BG_OPACITY`) — while a bare photo
 * `<image>` with no (or too-faint) scrim correctly resolves to "unknown"
 * (`fill: null`) rather than a guess, and text over it is skipped.
 *
 * **Gradient fills route the same way (task R3):** a shape whose `fill` is a
 * gradient reference (`url(#...)`, e.g. `chart-svg.tsx`'s bar fills) used to
 * fail the registration gate outright — neither a resolvable solid color nor
 * `<image>`'s explicit `fill: null` path, so it simply never became a
 * `PaintedShape` at all, and a text element painted over it silently
 * resolved against whatever *solid* shape happened to sit underneath
 * instead: a real misattribution, not a skip — worse than the `<image>`
 * blind spot above, which at least degrades to a checkable "unknown".
 * `resolveCandidateFill` closes this: a `url(...)` fill now registers
 * exactly like a bare `<image>` does — `fill: null`, both in
 * `paintedShapes` and, area-floor permitting, in `regions` — reusing the
 * identical `__collectImageBackedTextRuns` -> `pixel-audit.ts`
 * worst-case-pixel-sample fallback rather than inventing a second,
 * gradient-specific color approximation (which stop, at which offset, would
 * even be the "representative" one?). The `<g data-decor>` exclusion below
 * applies identically regardless of fill kind — a decor-layer gradient (e.g.
 * the tech theme's `constellation-motif` background field) was already
 * excluded from candidacy before this fix and still is; this routing change
 * only ever affects a *content-layer* gradient shape, since decoration never
 * reaches the fill check at all (see the exclusion's own boolean guard).
 *
 * **`<polygon>` joins the same registration gate (sweep2 T4):** R3 above
 * widened `resolveCandidateFill`'s reach for `rect`/`path`/`circle`/
 * `ellipse`, but `<polygon>` never dispatched to any registration branch at
 * all — a live gap, not a hypothetical one: `renderLine`'s per-series
 * area-under-curve fill (`chart-svg.tsx`, a `<polygon>` filled with its own
 * `url(#...)` gradient) was silently invisible to this walk, so text placed
 * over that area misattributed to whatever solid shape happened to sit
 * underneath, exactly the R3 defect reopened for one more tag. `<polygon>`
 * now runs through the identical `resolveCandidateFill`/opaque-enough/
 * `data-decor` gating as `rect`/`path` — solid hex registers normally,
 * `url(...)` registers `fill: null` and defers to pixel-audit — with
 * `polygonBoundingBox` standing in for `pathBoundingBox`'s bbox.
 *
 * **Bench-driven fix round (defect A):** this `PaintedShape` walk is
 * *unrestricted* by `MIN_BG_REGION_AREA` — that constant now only filters
 * the separate, page-level `regions`/`BgRegion` table (unchanged, see its own
 * doc comment) `__collectBgRegions` exposes. The two used to be the same
 * table, which is exactly the bug: a badge/chip small enough to correctly
 * *not* count as a page background is still unambiguously the real, sole
 * background of whatever text is painted directly on top of it, and gating
 * attribution by page-level area silently fell through to whatever larger
 * shape happened to sit underneath instead (the page background, a card
 * shell) — checking real text against a color it was never actually
 * rendered on. `<image>` is deliberately not extended past its existing
 * area floor for attribution (see its own branch's comment) — this
 * renderer never emits a small inline `<image>`, only large photo
 * backgrounds, so there is no real small-image case to design against, and
 * an unfloored "unknown, skip" candidate would only ever shrink coverage,
 * never fix a misattribution.
 *
 * One more gate sits on top of the shape model above, for anything inside a
 * `<g data-decor>` subtree (`full-slide-svg.tsx`'s exact wrapper around
 * `themeDef.motif`'s output — verified there, not assumed). Decoration is
 * layered *over* the real background, not a stand-in for it, so it never
 * joins the page-level `regions` table at all. For *attribution* it used to
 * be excluded on the same blanket terms, which was half right and half a
 * lie — see the two paragraphs below. Implemented as a boolean threaded
 * through `visit`'s recursion (once a `data-decor` ancestor is entered it
 * stays true for the whole subtree) rather than a string/regex pre-pass on
 * `markup` — this function already fully parses to DOM, and regex-stripping
 * a `<g>...</g>` span is unsound the moment the subtree nests further `<g>`
 * elements of its own (every motif does), which would truncate at the first
 * nested `</g>` instead of the matching one. `findOverlapIssues` needs no
 * equivalent gate (decoration never carries `data-audit-box`), but this walk
 * sees every `<rect>`/`<circle>`/`<ellipse>`/`<image>`/`<path>`/`<polygon>`
 * regardless of what drew it, so it has to be explicit here.
 *
 * **Decoration participates by shape, not by layer
 * (`fix/decor-contrast-attribution`).** The blanket attribution exclusion
 * was written for a real problem: nothing in this renderer's motif
 * discipline stops a motif from drawing large, opaque-enough shapes, and
 * `motif-campaign-motif.tsx`'s crayon strokes are exactly that (each
 * stroke's core-density bucket alone renders at >=0.64 effective opacity
 * across every call site in that file, comfortably clear of
 * `MIN_BG_OPACITY`). Those are `<path>`s, registered by their
 * `pathBoundingBox` — a box far larger than the stroke — so letting them
 * attribute would convict text that is nowhere near the ink. But the same
 * blanket rule also hid shapes whose registered geometry *is* their
 * outline. The ink theme's motif signs off with a 32px vermilion seal
 * (`<rect fill="#C3272B">`); the tone-adaptive-header cover paints its date
 * line straight across it. Real contrast: 1.07:1. What this walk reported
 * before the fix: 5.44:1, measured against the page background the seal
 * completely covers — not a missing check but a wrong answer, which is
 * worse. Same shape in tech (1.70:1 on a corner-ornament square) and
 * consulting (3.26:1). So the gate is now
 * `registersExactOutline(tag) && !hasUnmodelledTransform(...)`:
 * `rect`/`circle`/`ellipse` under a transform this walk actually models
 * join attribution, `path`/`polygon` and anything rotated/skewed stay out.
 * See both helpers' own doc comments for the criterion and its evidence.
 *
 * **A run is graded over its ink box, not at its anchor point
 * (`fix/decor-contrast-attribution`, same defect, second half).** Admitting
 * the seal as a candidate is not enough on its own: this branch used to ask
 * `backgroundAt(tx, ty)` for the run's *anchor* position, which sits on the
 * baseline — the bottom edge of the glyph box — and, under
 * `text-anchor="end"`, at the far right of the run. The ink seal's bottom
 * edge is 10px above that baseline and its right edge 14px to the left of
 * that anchor, so a point test saw nothing while the glyphs sat squarely on
 * the seal. `backgroundsUnderRun` (own doc comment) replaces the single
 * point with a grid over the run's estimated ink box and keeps the
 * least-favorable background it resolves; a run that sits on one background
 * — the overwhelmingly common case — resolves exactly as it did before.
 */
export function findContrastIssues(markup: string): ContrastIssue[] {
  return runContrastWalk(markup).issues
}

/**
 * Test-only: the background regions `findContrastIssues` collects while
 * walking `markup`, exposed so the `data-decor` exclusion documented above
 * can be asserted directly against a real render (a campaign-theme cover's
 * motif, concretely) instead of only inferred through a contrast verdict.
 * Not part of any public barrel — `deck-audit.ts`'s own exports are already
 * SDK-internal/audit-package-only (see `findContrastIssues`'s and
 * `findOverlapIssues`'s own "exported so it's directly unit-testable" doc
 * notes) — the `__` prefix signals the narrower "test-only" intent at the
 * call site the same way `themes/definitions.ts`'s `__resetRegisteredThemes`
 * does.
 */
export function __collectBgRegions(markup: string): BgRegion[] {
  return runContrastWalk(markup).regions
}

/**
 * The image-backed text runs `pixel-audit.ts` needs (audit-v2 phase B) —
 * every run this walk could not resolve a solid SVG background for (see
 * `ImageBackedTextRun`'s own doc comment). `__`-prefixed for the same
 * "SDK-internal, sibling-module-only" reason `__collectBgRegions` already
 * is, not because it's test-only — `pixel-audit.ts` is a real, non-test
 * caller of this one.
 */
export function __collectImageBackedTextRuns(markup: string): ImageBackedTextRun[] {
  return runContrastWalk(markup).imageBackedRuns
}

/**
 * Resolves a raw `fill` attribute to the value `paintedShapes`/`regions`
 * should record a shape under, or `undefined` when it isn't a background
 * candidate at all — task R3's fix, see `findContrastIssues`'s own doc
 * comment ("Gradient fills route the same way" paragraph) for the routing
 * this enables.
 *
 * A solid hex color (`#...`) resolves to itself, unchanged from before this
 * fix — `backgroundAt` can trust it outright. A gradient reference
 * (`url(#...)`, e.g. `chart-svg.tsx`'s bar/area fills) resolves to `null`,
 * the exact same "resolvable no further" signal a bare `<image>` already
 * uses (see `ImageBackedTextRun`): reimplementing this walker's own gradient
 * math (stop colors, direction, offset) to guess one representative color
 * would be both unnecessary — the `null` -> `__collectImageBackedTextRuns` ->
 * pixel-audit.ts fallback already exists and samples the *real* rendered
 * pixels — and unsound, since no single color actually represents an
 * arbitrary point along a multi-stop blend. Anything else (`none`, a named
 * CSS color, absent) is not a candidate at all, same as pre-fix.
 */
function resolveCandidateFill(rawFill: string | null): string | null | undefined {
  if (rawFill?.startsWith("#")) return rawFill
  if (rawFill?.startsWith("url(")) return null
  return undefined
}

/**
 * Every transform form `parseTransform` (`svg-audit.ts`) actually models:
 * a two-argument `translate(dx, dy)` and a single-argument, therefore
 * uniform, `scale(s)`. Used by `hasUnmodelledTransform` below as a
 * subtract-and-check-empty parse, so anything *else* in the attribute —
 * `rotate`, `skewX`/`skewY`, `matrix`, a one-argument `translate(dx)`, a
 * non-uniform `scale(sx, sy)` — is detected rather than silently dropped.
 * Global flag: the attribute is a transform *list*, so every occurrence has
 * to be consumed, not just the first.
 */
const MODELLED_TRANSFORM_RE = /translate\(\s*-?[\d.]+[\s,]+-?[\d.]+\s*\)|scale\(\s*-?[\d.]+\s*\)/g

/**
 * Whether `el` carries a `transform` this walk does not model.
 * `parseTransform` reduces the whole attribute to `(dx, dy, uniform scale)`
 * and silently ignores everything it doesn't match — fine for the content
 * layer, which provably emits nothing else (grepped across `src/svg/layouts`
 * and `src/svg/components`; `parseTransform`'s own doc comment states the
 * same contract), but *not* fine for decoration, which really does rotate:
 * `motif-pulse-motif.tsx`'s `capsule()` emits a filled `<rect>` under
 * `rotate(angle cx cy)` and `motif-terra-motif.tsx`'s `leafVein()` wraps its
 * strokes in a rotated `<g>`. A rotated rect is registered by
 * `parseTransform` at its *un-rotated* position, and its axis-aligned box is
 * no longer its outline either — both reasons a shape under one of these is
 * excluded from decor attribution below, exactly like a `<path>` is.
 */
function hasUnmodelledTransform(el: Element): boolean {
  const t = el.getAttribute("transform")
  if (!t) return false
  return t.replace(MODELLED_TRANSFORM_RE, "").trim() !== ""
}

/**
 * Whether the `PaintedShape` this walk registers for `tag` is the painted
 * outline itself rather than an outer approximation of it — the single
 * criterion the decor-attribution gate turns on (see `findContrastIssues`'s
 * own doc comment, "**Decoration participates by shape, not by layer**").
 *
 * `<rect>` registers through `rectShape`, whose box *is* the rect (rounded
 * corners included, see that function's own doc comment). `<circle>`/
 * `<ellipse>` register through `ellipseShape`'s exact normalized-distance
 * test. `<path>`/`<polygon>` register through `pathBoundingBox`/
 * `polygonBoundingBox` — a *bounding box*, which for a curved stroke covers
 * far more area than the stroke does (`motif-campaign-motif.tsx`'s crayon
 * strokes are the live case the blanket exclusion was written for). `<image>`
 * is a bbox too, and decoration never emits one.
 *
 * The tag list is evidence for the criterion, not the criterion itself: a
 * `<path>` recognized as a donut/pie wedge does get an exact `sectorShape`,
 * but that idiom is `chart-svg.tsx`'s alone and never appears in a motif, so
 * admitting it here would widen the gate for a case that cannot occur while
 * making the rule harder to state. The transform half of the criterion lives
 * in `hasUnmodelledTransform` above.
 */
function registersExactOutline(tag: string): boolean {
  return tag === "rect" || tag === "circle" || tag === "ellipse" || tag === "polygon"
}

function runContrastWalk(markup: string): { issues: ContrastIssue[]; regions: BgRegion[]; imageBackedRuns: ImageBackedTextRun[] } {
  const root = parseSvg(markup)
  const issues: ContrastIssue[] = []
  const regions: BgRegion[] = []
  // Image-backed text runs (audit-v2 phase B) — see `ImageBackedTextRun`'s
  // own doc comment. Collected in the same walk as `issues`/`regions` so
  // background resolution stays one single source of truth: a run lands
  // here exactly when `backgroundAt` returns `null` for it, the identical
  // condition `issues` already skips (see the text/tspan branch below) —
  // additive only, never changes what `issues`/`regions` themselves collect.
  const imageBackedRuns: ImageBackedTextRun[] = []
  // Attribution's own table (defect A fix) — see `PaintedShape`'s and
  // `findContrastIssues`'s doc comments. A strict superset of `regions` in
  // everything but `<image>` (same floor, unchanged): every rect/path that
  // qualifies for `regions` also qualifies here, plus every rect/path below
  // the area floor and every circle/ellipse, so `backgroundAt` only ever
  // needs to search this one table.
  const paintedShapes: PaintedShape[] = []

  const backgroundAt = (px: number, py: number): string | null => {
    for (let i = paintedShapes.length - 1; i >= 0; i--) {
      if (paintedShapes[i].contains(px, py)) return paintedShapes[i].fill
    }
    return null
  }

  /**
   * Every solid background this walk can resolve anywhere under a text run's
   * own ink box, deduplicated — the second half of
   * `fix/decor-contrast-attribution` (see `findContrastIssues`'s own doc
   * comment, "**A run is graded over its ink box**").
   *
   * `backgroundAt` above answers for a *point*. The point the text branch
   * had always handed it is the run's anchor position, which sits on the
   * baseline — the bottom edge of the glyph box — and at one end of the run
   * (`text-anchor="end"`) or its middle. So a shape covering part of the
   * glyph bodies but not that one corner was invisible to attribution even
   * once it was a registered candidate: the ink theme's cover date renders
   * its last characters over the motif's vermilion seal (a 32px square whose
   * bottom edge is 10px *above* that baseline), and the tech/consulting
   * covers put the same date's tail on a 24px decor square whose bottom edge
   * clears the baseline by 2px. Point-sampling the baseline corner reports a
   * clean 5.44:1 against the page background for text that really renders at
   * 1.07:1 — which is the whole defect this branch exists to stop telling.
   *
   * Grid rather than a rectangle-intersection test, because `PaintedShape`'s
   * whole contract is a `contains(px, py)` predicate — `ellipseShape` and
   * `sectorShape` are exact precisely because they are *not* boxes, and
   * giving each shape kind a second, box-shaped overlap test would trade
   * that exactness away. Same reduction `pixel-audit.ts`'s `worstCaseSample`
   * already applies on the raster side: grid the run's estimated box, keep
   * the least favorable answer.
   *
   * Samples that resolve to `null` are skipped rather than collected. That
   * is not a new blind spot: a run whose *anchor* resolves `null` still
   * routes to `imageBackedRuns` exactly as before (see the caller), and a
   * run that merely overhangs an image at one end was already graded on a
   * single solid colour before this change.
   */
  const backgroundsUnderRun = (
    left: number,
    right: number,
    top: number,
    bottom: number,
    step: number,
  ): string[] => {
    const fills = new Set<string>()
    // `<= cols`/`<= rows` with an even split puts a sample exactly on each
    // edge and never more than `step` apart, whatever the box measures — no
    // dependence on where the box happens to start, which is the alignment
    // luck `pixel-audit.ts`'s own stride comment documents getting burned by.
    const cols = Math.max(1, Math.ceil((right - left) / step))
    const rows = Math.max(1, Math.ceil((bottom - top) / step))
    for (let i = 0; i <= cols; i++) {
      const px = left + ((right - left) * i) / cols
      for (let j = 0; j <= rows; j++) {
        const py = top + ((bottom - top) * j) / rows
        const found = backgroundAt(px, py)
        if (found !== null) fills.add(found)
      }
    }
    return Array.from(fills)
  }

  const visit = (
    el: Element,
    ox: number,
    oy: number,
    os: number,
    fill: string,
    fontSize: number,
    fillOpacity: number,
    opacityProduct: number,
    inDecor: boolean,
    underUnmodelledTransform: boolean,
    inheritedTx: number | null,
    inheritedTy: number | null,
    anchor: string,
    tier: string | null,
  ) => {
    const { dx, dy, scale } = parseTransform(el)
    const ax = ox + os * dx
    const ay = oy + os * dy
    const as = os * scale

    const ownFill = el.getAttribute("fill")
    const ownFontSize = el.getAttribute("font-size")
    const ownFillOpacity = el.getAttribute("fill-opacity")
    const ownOpacity = el.getAttribute("opacity")
    // `text-anchor` is a standard inheritable SVG presentation property —
    // threaded the same "own attribute overrides, else inherit" way as
    // `fill` (any element can set it, only a text/tspan usage point ever
    // reads it — see `ImageBackedTextRun`'s own doc comment for why this
    // walk needs it: an anchor-aware left/right span, the same estimate
    // `svg-audit.ts`'s overflow walker already uses).
    const ownAnchor = el.getAttribute("text-anchor")
    const currentFill = ownFill ?? fill
    const currentFontSize = ownFontSize ? Number(ownFontSize) : fontSize
    const currentFillOpacity = ownFillOpacity !== null ? Number(ownFillOpacity) : fillOpacity
    const currentAnchor = ownAnchor ?? anchor
    // `data-contrast-tier` — see `META_CONTRAST_TIER`'s own doc comment.
    // Plain inherit, not `data-decor`'s sticky subtree accumulation (own
    // attribute wins, else the value threaded down from the parent).
    const currentTier = el.getAttribute("data-contrast-tier") ?? tier
    // `opacity` (unlike `fill-opacity`) compounds down nested groups in real
    // SVG rendering (each ancestor's own opacity<1 further dims everything
    // inside it), so this accumulator multiplies rather than overrides.
    const currentOpacityProduct = opacityProduct * (ownOpacity !== null ? Number(ownOpacity) : 1)
    // `data-decor` is `full-slide-svg.tsx`'s exact wrapper around theme motif
    // output — once entered it marks this element *and* every descendant
    // (subtree exclusion, not just this node), same "sticky" accumulation
    // pattern as `currentOpacityProduct` above.
    const inDecorSubtree = inDecor || el.getAttribute("data-decor") !== null
    // Same sticky-subtree accumulation as `inDecorSubtree`: a rotated `<g>`
    // taints every descendant's geometry, not only its own (see
    // `hasUnmodelledTransform` — `motif-terra-motif.tsx`'s `leafVein()` is
    // exactly that shape, a rotated wrapper around the shapes that matter).
    const unmodelledTransformHere = underUnmodelledTransform || hasUnmodelledTransform(el)

    const tag = el.tagName.toLowerCase()
    // Decoration participates in text-background *attribution* by shape, not
    // by layer (see `findContrastIssues`'s own doc comment). Never in the
    // page-level `regions` table — decoration is painted *over* the real
    // background, not a stand-in for it, which is the half of the original
    // blanket exclusion's reasoning that still holds.
    const decorShapeIsExact = registersExactOutline(tag) && !unmodelledTransformHere
    const mayAttribute = !inDecorSubtree || decorShapeIsExact
    // Threaded down to children unchanged by every non-text tag (a plain
    // <g> wrapper, a background <rect>, ...) — only a text/tspan branch
    // below ever overwrites it, and only a <tspan> descendant of a
    // <text>/<tspan> can ever observe a non-null value (see that branch's
    // own doc comment).
    let currentTx = inheritedTx
    let currentTy = inheritedTy
    if (tag === "rect" || tag === "image" || tag === "path" || tag === "polygon") {
      let x = 0
      let y = 0
      let localW = 0
      let localH = 0
      // Attribution-only (fix/donut-annulus-attribution): a recognized
      // donut/pie wedge (`parseWedgePath`) gets an exact sector containment
      // test instead of `rectShape`'s AABB below — `regions`'/`pathBoundingBox`'s
      // own bbox (still used for both `w`/`h` here and the page-level table)
      // is untouched, only which `PaintedShape` this path becomes changes.
      // `<polygon>` never carries this idiom (`renderPie`/`renderDonut` both
      // emit `<path>`), so it stays `null` there — falls straight through to
      // `rectShape`'s AABB below, same as every other non-wedge shape.
      let localWedge: Sector | null = null
      let localPolyPts: [number, number][] | null = null
      if (tag === "path") {
        const dAttr = el.getAttribute("d") ?? ""
        const bbox = pathBoundingBox(dAttr)
        if (bbox) {
          x = bbox.x
          y = bbox.y
          localW = bbox.w
          localH = bbox.h
        }
        localWedge = parseWedgePath(dAttr)
      } else if (tag === "polygon") {
        localPolyPts = polygonPoints(el.getAttribute("points") ?? "")
        // sweep2 T4: `<polygon>` joins the registration gate here (it used
        // to dispatch to nothing at all — see `findContrastIssues`'s own
        // doc comment for the misattribution that left, `renderLine`'s
        // gradient area fill in `chart-svg.tsx` being the live case).
        // `polygonBoundingBox` (min/max over `points`, no curve/arc math
        // needed) stands in for `pathBoundingBox` the same way `<path>`
        // uses it above.
        const bbox = polygonBoundingBox(el.getAttribute("points") ?? "")
        if (bbox) {
          x = bbox.x
          y = bbox.y
          localW = bbox.w
          localH = bbox.h
        }
      } else {
        x = Number(el.getAttribute("x") ?? 0)
        y = Number(el.getAttribute("y") ?? 0)
        localW = Number(el.getAttribute("width") ?? 0)
        localH = Number(el.getAttribute("height") ?? 0)
      }
      // `<rect rx>`/`<rect ry>` — SVG's own "the missing one mirrors the one
      // that is set" rule (a `rx`-only rounded rect, which is what every
      // rounded card/badge/seal in this renderer emits). Zero for
      // `image`/`path`/`polygon`, whose registered geometry is a bounding box
      // with square corners by construction.
      const rawRx = tag === "rect" ? el.getAttribute("rx") : null
      const rawRy = tag === "rect" ? el.getAttribute("ry") : null
      const localRx = Number(rawRx ?? rawRy ?? 0)
      const localRy = Number(rawRy ?? rawRx ?? 0)
      const w = localW * as
      const h = localH * as
      const absX = ax + x * as
      const absY = ay + y * as
      // `mayAttribute` — see `findContrastIssues`'s own doc comment: a decor
      // shape is an attribution candidate only when the containment test
      // registered for it is its painted outline (`registersExactOutline` +
      // `hasUnmodelledTransform`). `image`/`path` never satisfy
      // that (`polygon` joined the exact set in fix/audit-polygon-attribution), so inside a decor subtree this whole block is unreachable for
      // them — identical to the blanket exclusion it replaces.
      if (mayAttribute) {
        if (tag === "image") {
          // Unchanged from before this fix, for both tables: a real photo's
          // pixels are genuinely unknown, and this renderer only ever emits
          // large, page-covering `<image>`s (never a small inline one) — see
          // `findContrastIssues`'s own doc comment for why an unfloored
          // image candidate has no real case to serve.
          if (w * h >= MIN_BG_REGION_AREA) {
            const shape = rectShape(absX, absY, w, h, null)
            regions.push({ x: absX, y: absY, w, h, fill: null })
            paintedShapes.push(shape)
          }
        } else {
          const shapeFill = el.getAttribute("fill")
          // Reuse the *inherited* fill-opacity/opacity accumulators (already
          // computed above for text), not a fresh read of just this
          // element's own `fill-opacity` attribute — a decorative shape can
          // just as easily dim through the generic `opacity` attribute
          // (`motif-campaign-motif.tsx`'s ink/sweep paths use `opacity`, not
          // `fill-opacity`) or through an *ancestor* `<g>`'s opacity, and
          // missing either would let a faint decoration masquerade as an
          // opaque background (found empirically: a campaign-theme motif
          // path at `opacity={0.1}` was being read as fully opaque white,
          // silently overriding the real dark-purple page background for
          // every subsequent text check).
          const opaqueEnough = currentFillOpacity * currentOpacityProduct >= MIN_BG_OPACITY
          // task R3: `resolveCandidateFill` accepts both a solid hex color
          // and a `url(#...)` gradient reference — the latter resolves to
          // `null` (own doc comment), not the raw `shapeFill` string used
          // pre-fix, so a gradient shape routes through the same `fill:
          // null` -> pixel-audit fallback a bare `<image>` already gets
          // instead of silently never registering at all.
          const resolvedFill = resolveCandidateFill(shapeFill)
          if (resolvedFill !== undefined && opaqueEnough) {
            // Attribution (defect A fix): no area floor — a badge/chip too
            // small to be a *page* background is still the real background
            // of whatever text sits directly on top of it. See
            // `MIN_BG_REGION_AREA`'s own doc comment.
            if (localWedge) {
              // fix/donut-annulus-attribution: a recognized wedge gets the
              // exact sector test — no rotation in `parseTransform`'s own
              // contract, so `startA`/`span` carry over unscaled, only the
              // center/radii translate+scale the same way `w`/`h` above do.
              paintedShapes.push(
                sectorShape(
                  {
                    cx: ax + localWedge.cx * as,
                    cy: ay + localWedge.cy * as,
                    ri: localWedge.ri * as,
                    ro: localWedge.ro * as,
                    startA: localWedge.startA,
                    span: localWedge.span,
                  },
                  resolvedFill,
                ),
              )
            } else if (tag === "polygon" && localPolyPts && resolvedFill !== null) {
              // 实色 polygon：精确轮廓注册（压字归因可用）。
              paintedShapes.push(
                polygonShape(localPolyPts.map(([px, py]) => [ax + px * as, ay + py * as] as [number, number]), resolvedFill),
              )
            } else if (tag === "polygon" && resolvedFill === null && inDecorSubtree) {
              // 渐变 polygon 在装饰子树里维持加宽前的整体排除——
              // deck-audit.test 的 decor-exclusion 契约。子树外走下方
              // bbox + fill:null 的像素审计路由（task R3 的既有行为）。
            } else {
              paintedShapes.push(
                rectShape(absX, absY, w, h, resolvedFill, localRx * as, localRy * as),
              )
            }
            // Page-level table: unchanged, still area-floored *and* still
            // decor-free — `__collectBgRegions`'s own contract (and its
            // dedicated regression test) is untouched by this fix. A decor
            // shape is layered over the real page background, never a
            // stand-in for it, so widening attribution above does not widen
            // this table.
            if (!inDecorSubtree && w * h >= MIN_BG_REGION_AREA) {
              regions.push({ x: absX, y: absY, w, h, fill: resolvedFill })
            }
          }
        }
      }
    } else if (tag === "circle" || tag === "ellipse") {
      // New shape kinds (defect A fix) — never joined `regions` even before
      // this task (a badge/dot circle was simply invisible to the audit
      // entirely, not merely area-excluded) and still don't: `BgRegion`'s own
      // page-level contract has no real circular-page-background case to
      // serve, and `__collectBgRegions`'s pinned region count must stay
      // exactly what it was. Attribution-only, via `paintedShapes`.
      const cx = Number(el.getAttribute("cx") ?? 0)
      const cy = Number(el.getAttribute("cy") ?? 0)
      // `<circle r>` vs `<ellipse rx,ry>` — SVG has no `r` on `<ellipse>` and
      // no `rx`/`ry` on `<circle>`, so reading the tag-appropriate pair and
      // falling back to 0 for the other keeps one branch instead of two
      // near-identical ones.
      const localRx = Number(el.getAttribute(tag === "circle" ? "r" : "rx") ?? 0)
      const localRy = Number(el.getAttribute(tag === "circle" ? "r" : "ry") ?? 0)
      const shapeFill = el.getAttribute("fill")
      const opaqueEnough = currentFillOpacity * currentOpacityProduct >= MIN_BG_OPACITY
      // task R3: same `resolveCandidateFill` widening as the rect/path
      // branch above — a gradient-filled badge/dot circle now registers as
      // `fill: null` instead of silently never becoming a candidate at all.
      const resolvedFill = resolveCandidateFill(shapeFill)
      // `mayAttribute` rather than `!inDecorSubtree` — a decor `<circle>`/
      // `<ellipse>` registers through `ellipseShape`'s exact containment
      // test, so it joins attribution on the same footing as a content one
      // (see `registersExactOutline`). `regions` still never sees it, for
      // the two independent reasons this branch's own comment above gives.
      if (mayAttribute && resolvedFill !== undefined && opaqueEnough) {
        paintedShapes.push(
          ellipseShape(ax + cx * as, ay + cy * as, localRx * as, localRy * as, resolvedFill),
        )
      }
    } else if (tag === "text" || tag === "tspan") {
      // A <tspan> commonly omits `x`/`y` entirely and continues in the same
      // *line* right after whatever textual content came before it — real
      // SVG text flow (most visibly cover-left-anchor.tsx's/
      // cover-banner-title.tsx's author/date/version meta line: three
      // <tspan>s, none carrying coordinates of their own). Falling back to
      // `ax`/`ay` (this element's own local origin from the transform chain
      // alone) for that case — the pre-fix behavior — silently drops the
      // owning <text>'s own `x`/`y` attribute, which is applied *locally*
      // below but was never threaded into what children receive: it
      // resolves to wherever the nearest ancestor <g transform> happens to
      // put (0,0), almost never where the run is actually painted (backlog
      // item 5b, `.issues/notes/engineering-history.md` #5).
      // `inheritedTx`/`inheritedTy` — the nearest ancestor <text>/<tspan>'s
      // own already-resolved absolute position, threaded down through the
      // recursion below — fixes that: not pixel-perfect for the horizontal
      // cursor advance mid-line (this walker does no real text shaping/
      // measurement), but exact for this function's actual purpose of
      // "which background region is this run painted over", since every
      // real same-line multi-tspan run this renderer emits stays within one
      // background region (see the doc comment above `findContrastIssues`).
      // A <text> element is never itself nested inside another
      // <text>/<tspan> in valid SVG, so it never actually receives a
      // non-null inherited position — it always falls back to `ax`/`ay`,
      // identical to the pre-fix formula for that tag.
      const ownX = el.getAttribute("x")
      const ownY = el.getAttribute("y")
      const tx = ownX !== null ? ax + Number(ownX) * as : (inheritedTx ?? ax)
      const ty = ownY !== null ? ay + Number(ownY) * as : (inheritedTy ?? ay)
      currentTx = tx
      currentTy = ty

      const content = directText(el)
      if (content) {
        const background = backgroundAt(tx, ty)
        // `alpha` moved out of the `background !== null` branch (bench-
        // driven-fix-round-style additive change, audit-v2 phase B): the
        // `background !== null` branch below is byte-for-byte the same
        // computation it always was, just now sharing this one hoisted
        // value with the new `else` branch rather than each recomputing it.
        const alpha = currentFillOpacity * currentOpacityProduct
        if (background !== null) {
          if (alpha >= DECORATIVE_ALPHA) {
            // `currentFontSize` is the *declared* size threaded down for
            // inheritance (deliberately never pre-scaled — see the
            // parameter's own accumulation above, scaling it there would
            // double-apply under nested scale transforms); the *rendered*
            // size the large-text tier actually cares about is that
            // declared size under the accumulated transform scale, applied
            // once, here, at the point of use — same split svg-audit.ts's
            // own overflow walker uses for its `fontSize * as`.
            const renderedFontSize = currentFontSize * as
            // The run's ink box, then the worst background under it
            // (fix/decor-contrast-attribution — see `backgroundsUnderRun`'s
            // own doc comment). Anchor-aware left/right is the identical
            // formula the `imageBackedRuns` branch below already used; the
            // vertical band is `TEXT_INK_ASCENT_RATIO`/
            // `TEXT_INK_DESCENT_RATIO`. A run whose whole box sits on one
            // background resolves to exactly what `backgroundAt(tx, ty)`
            // returned before this change — the single-background case is
            // every page's overwhelmingly common one, so this is a widening
            // of what the walk can see, not a rewrite of what it decides.
            const width = measureTextUnits(content) * renderedFontSize
            const left =
              currentAnchor === "end" ? tx - width : currentAnchor === "middle" ? tx - width / 2 : tx
            const candidates = backgroundsUnderRun(
              left,
              left + width,
              ty - renderedFontSize * TEXT_INK_ASCENT_RATIO,
              ty + renderedFontSize * TEXT_INK_DESCENT_RATIO,
              renderedFontSize * BG_SAMPLE_STRIDE_EM,
            )
            const required = requiredRatioFor(currentTier, renderedFontSize)
            // `background` (the anchor point's own answer) is always in the
            // running, even for a zero-width run the grid would otherwise
            // sample outside of — this can only ever lower the reported
            // ratio relative to the pre-change behavior, never raise it.
            let worstBg = background
            let worstRatio = contrastRatio(blendOver(currentFill, background, alpha), background)
            for (const candidate of candidates) {
              const ratio = contrastRatio(blendOver(currentFill, candidate, alpha), candidate)
              if (ratio < worstRatio) {
                worstRatio = ratio
                worstBg = candidate
              }
            }
            if (worstRatio < required) {
              issues.push({
                text: content.slice(0, 24),
                fill: currentFill,
                background: worstBg,
                ratio: worstRatio,
                required,
                fontSize: renderedFontSize,
              })
            }
          }
        } else if (alpha >= DECORATIVE_ALPHA) {
          // `background === null` — the pixel-audit blind spot
          // (`ImageBackedTextRun`'s own doc comment): a run painted over a
          // bare/faintly-scrimmed `<image>`, or (never observed in practice
          // — this renderer's `background.tsx` always paints a full-bleed
          // layer first) truly nothing at all. Same decorative-alpha
          // exclusion as the resolved-background branch above — a
          // near-invisible watermark shouldn't demand a pixel sample any
          // more than it demands an SVG-color check.
          const renderedFontSize = currentFontSize * as
          const width = measureTextUnits(content) * renderedFontSize
          const left = currentAnchor === "end" ? tx - width : currentAnchor === "middle" ? tx - width / 2 : tx
          const required = requiredRatioFor(currentTier, renderedFontSize)
          imageBackedRuns.push({
            text: content.slice(0, 24),
            left,
            right: left + width,
            baseline: ty,
            fontSize: renderedFontSize,
            fill: currentFill,
            alpha,
            required,
          })
        }
      }
    }

    for (const child of Array.from(el.children)) {
      visit(
        child,
        ax,
        ay,
        as,
        currentFill,
        currentFontSize,
        currentFillOpacity,
        currentOpacityProduct,
        inDecorSubtree,
        unmodelledTransformHere,
        currentTx,
        currentTy,
        currentAnchor,
        currentTier,
      )
    }
  }

  visit(root, 0, 0, 1, DEFAULT_FILL, DEFAULT_FONT_SIZE, 1, 1, false, false, null, null, "start", null)
  return { issues, regions, imageBackedRuns }
}

function contrastMessage(issue: ContrastIssue): string {
  return (
    `text "${issue.text}" has a contrast ratio of ${issue.ratio.toFixed(2)}:1 against its background ` +
    `${issue.background} (needs ${issue.required}:1) — choose a text or background color with more contrast`
  )
}

function contrastFindings(markup: string, page: number, slideId: string | undefined): AuditFinding[] {
  return findContrastIssues(markup).map((issue) => ({
    page,
    ...(slideId !== undefined ? { slideId } : {}),
    code: "low-contrast",
    message: contrastMessage(issue),
    detail: { ...issue },
  }))
}

// ────────────────────────────────────────────────────────────────────────
// Overlap — pairwise intersection of same-page `data-audit-box` regions.
// ────────────────────────────────────────────────────────────────────────

/**
 * Two boxes on the same page count as "overlapping" once their intersection
 * area exceeds this share of the *smaller* box's own area — a sliver of
 * shared edge (rounding, a hairline divider) is normal; a real layout
 * collision covers a substantial fraction of one of the two regions. Named
 * per the plan's own figure ("如任一盒面积的 20%").
 */
const OVERLAP_AREA_RATIO = 0.2

/** Estimated descent below a text baseline, as a fraction of font-size —
 * mirrors svg-audit.ts's own inline v-overflow constant (`ty + fontSize *
 * 0.25`) so the two auditors' text-extent estimates agree. */
const TEXT_DESCENT_RATIO = 0.25

interface DerivedBox {
  x: number
  y: number
  w: number
  h: number
  label: string
}

export interface OverlapIssue {
  a: DerivedBox
  b: DerivedBox
  ratio: number
}

/**
 * Collect every "leaf" `data-audit-box` region on the page — one with no
 * further `data-audit-box` nested inside it — together with a height
 * inferred from geometry directly owned by that box (not crossing into a
 * nested one).
 *
 * `data-audit-box` only ever carries `x,y,w` (verified across every emitter
 * in `src/svg`: `svg-content.tsx` and every card/list component) — never a
 * height, because the existing protocol only ever needed width, for the
 * h-overflow check it was built for. This walk reconstructs height the same
 * way the *overflow* auditor reconstructs a text's vertical extent: from
 * whatever geometry is actually drawn inside the box — a background/icon
 * shape's own explicit size when there is one, the rendered text's
 * font-metrics otherwise. In practice every card-shaped component
 * (kpi/icon_cards/steps/row_cards/verdict_banner) draws its own full-size
 * background `<rect>` as the first thing inside its box, so that rect's
 * `height` dominates and gives an exact answer; text-only components
 * (bullets/paragraph) have no such rect, so the union of their text spans is
 * what's found instead.
 *
 * Width also grows past that declared `w` floor (borrow-wave Task 4,
 * inventory-first): each `<text>` leaf widens its scope's `x`/`w` to the
 * union of the declared span and its own estimated ink extent —
 * `measureTextUnits`, or `measureMonoTextUnits` when `isMonoFontFamily`
 * reliably reads the mono role off the rendered `font-family`, `measureTextUnits`
 * itself reading the element's real `font-weight` via `isBold()` (the same
 * mono-role and bold-weight choices `svg-audit.ts`'s own h-overflow check
 * already makes — see `isMonoFontFamily`'s derivation comment in `fonts.ts`
 * and `isBold()`'s own doc comment) — anchored by the element's own
 * `text-anchor` (start/middle/end). Widening only ever grows a box, never
 * shrinks it. See docs/contrast-system.md's "Overlap detection boundary" for
 * what this does and doesn't close.
 *
 * A container box that only wraps further per-item boxes (e.g. `SvgContent`'s
 * own box around an `icon_cards` component, which itself subdivides into one
 * `data-audit-box` per card) is explicitly excluded via `hasNestedBox` —
 * *not* inferred from "collected no geometry of its own", because that proxy
 * is wrong whenever a container *also* draws something directly alongside
 * its nested boxes (`steps.tsx`'s vertical-mode connector `<line>`s are
 * siblings-before the per-row boxes, at the same outer-box scope) — without
 * the explicit flag, that container would end up with real derived geometry
 * *and* fully spatially contain its own children, which would then compare
 * as ~100% overlapping their own parent on every single steps-vertical page.
 */
function collectLeafBoxes(root: Element): DerivedBox[] {
  const boxes: DerivedBox[] = []
  interface Scope {
    x: number
    y: number
    w: number
    bottom: number
    label: string
    hasNestedBox: boolean
  }
  const stack: Scope[] = []

  const extend = (bottom: number, label?: string) => {
    const top = stack[stack.length - 1]
    if (!top) return
    if (bottom > top.bottom) top.bottom = bottom
    if (label && !top.label) top.label = label
  }

  // Widens the current scope's declared [x, x+w) span to also cover
  // [left, right) — a union, never a shrink, so a box only ever grows past
  // its declared width, exactly mirroring `extend`'s height-only-grows
  // discipline above. See `collectLeafBoxes`'s own doc comment for why a
  // `<text>` leaf calls this (borrow-wave Task 4).
  const extendX = (left: number, right: number) => {
    const top = stack[stack.length - 1]
    if (!top) return
    const newLeft = Math.min(top.x, left)
    const newRight = Math.max(top.x + top.w, right)
    top.x = newLeft
    top.w = newRight - newLeft
  }

  const visit = (el: Element, ox: number, oy: number, os: number) => {
    const { dx, dy, scale } = parseTransform(el)
    const ax = ox + os * dx
    const ay = oy + os * dy
    const as = os * scale

    const boxAttr = el.getAttribute("data-audit-box")
    let pushed = false
    if (boxAttr) {
      const parent = stack[stack.length - 1]
      if (parent) parent.hasNestedBox = true
      const [x, y, w] = parseNums(boxAttr)
      stack.push({ x, y, w, bottom: y, label: "", hasNestedBox: false })
      pushed = true
    }

    const tag = el.tagName.toLowerCase()
    if (tag === "rect" || tag === "image") {
      const y = Number(el.getAttribute("y") ?? 0)
      const h = Number(el.getAttribute("height") ?? 0)
      extend(ay + (y + h) * as)
    } else if (tag === "circle") {
      const cy = Number(el.getAttribute("cy") ?? 0)
      const r = Number(el.getAttribute("r") ?? 0)
      extend(ay + (cy + r) * as)
    } else if (tag === "line") {
      const y1 = Number(el.getAttribute("y1") ?? 0)
      const y2 = Number(el.getAttribute("y2") ?? 0)
      extend(ay + Math.max(y1, y2) * as)
    } else if (tag === "text") {
      const content = (el.textContent ?? "").trim()
      if (content) {
        const fontSize = Number(el.getAttribute("font-size") ?? DEFAULT_FONT_SIZE) * as
        const y = Number(el.getAttribute("y") ?? 0)
        extend(ay + y * as + fontSize * TEXT_DESCENT_RATIO, content.slice(0, 24))
        // Same estimator the renderer itself fits text with, weight-aware
        // parity with svg-audit.ts's h-overflow check restored (bold-metrics
        // fix, 2026-07-24 — see that file's own derivation comment on the
        // `isBold()`/mono-role split this mirrors), anchored by text-anchor
        // so a middle/end-anchored leaf's ink extends the correct direction
        // from its `x`.
        const tx = ax + Number(el.getAttribute("x") ?? 0) * as
        const fontFamily = el.getAttribute("font-family") ?? ""
        const bold = isBold(el.getAttribute("font-weight"))
        const units = isMonoFontFamily(fontFamily)
          ? measureMonoTextUnits(content)
          : measureTextUnits(content, { bold, fontFamily })
        const width = units * fontSize
        const anchor = el.getAttribute("text-anchor") ?? "start"
        const left = anchor === "end" ? tx - width : anchor === "middle" ? tx - width / 2 : tx
        extendX(left, left + width)
      }
    }

    for (const child of Array.from(el.children)) visit(child, ax, ay, as)

    if (pushed) {
      const done = stack.pop()!
      if (!done.hasNestedBox && done.bottom > done.y) {
        boxes.push({
          x: done.x,
          y: done.y,
          w: done.w,
          h: done.bottom - done.y,
          label: done.label || "(no text)",
        })
      }
    }
  }

  visit(root, 0, 0, 1)
  return boxes
}

/**
 * Pairwise-compare every leaf `data-audit-box` region on the page for
 * overlap past `OVERLAP_AREA_RATIO`. Exported (like `svg-audit.ts`'s
 * `auditSvgMarkup`) so it's directly unit-testable against hand-crafted
 * markup — see the task report for why a *real*, IR-driven overlap fixture
 * isn't reachable through this renderer's normal layout path (`layoutContentFit`
 * only ever shrinks gaps or drops components; it never lets two placed
 * components' boxes collide).
 *
 * Decoration/motif layers need no special exclusion here: every motif
 * (`motifs/motif-*.tsx`) and `slide-decor.tsx` render exclusively outside
 * the `data-audit-box`/`data-audit-rect` protocol (verified against every
 * motif file and empirically against real rendered markup across five
 * heavily-decorated themes while building this check) — `collectLeafBoxes`
 * simply never sees them, so the "exclude decoration" requirement is met by
 * construction rather than a filter.
 */
export function findOverlapIssues(markup: string): OverlapIssue[] {
  const boxes = collectLeafBoxes(parseSvg(markup))
  const issues: OverlapIssue[] = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
      const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
      const interArea = ix * iy
      const minArea = Math.min(a.w * a.h, b.w * b.h)
      if (minArea > 0 && interArea / minArea > OVERLAP_AREA_RATIO) {
        issues.push({ a, b, ratio: interArea / minArea })
      }
    }
  }
  return issues
}

function overlapMessage(issue: OverlapIssue): string {
  const pct = Math.round(issue.ratio * 100)
  return (
    `two regions overlap by ${pct}% of the smaller region's area — near "${issue.a.label}" ` +
    `and "${issue.b.label}" — adjust the layout or trim content so they no longer collide`
  )
}

function overlapFindings(markup: string, page: number, slideId: string | undefined): AuditFinding[] {
  return findOverlapIssues(markup).map((issue) => ({
    page,
    ...(slideId !== undefined ? { slideId } : {}),
    code: "overlap",
    message: overlapMessage(issue),
    detail: { a: issue.a, b: issue.b, ratio: issue.ratio },
  }))
}

// ────────────────────────────────────────────────────────────────────────
// Content-truncated / content-dropped — bench-driven fix round, defect E:
// two silent content-loss paths the benchmark found *invisible* to audit —
// `fitSvgLine`'s (and the emphasis-segment family's) ellipsis truncation,
// and `layoutContentFit`'s "+N more" drop marker — that models had to
// eyeball a rendered SVG to catch (row_cards silently dropping 2 of 5
// items, a two-column slide silently dropping its second component). The
// render chain already knows exactly when either happens; it just wasn't
// saying so anywhere machine-readable. Both checks below are thin readers
// of the marker attributes the render chain now stamps at the point of
// the cut — `data-truncated="1"` on a truncated `<text>` (`fitSvgLine`'s own
// doc comment, `../../lib/svg-text-layout.ts`), `data-dropped="N"` on a
// "+N …" marker (six render sites: `SvgContent`, `BigNumber`,
// `AssertionEvidence`×2, `ImagePages`, `row-cards.tsx`'s own item-level
// marker) — neither re-derives truncation/capacity logic here, so there is
// exactly one place (the render chain itself) that decides what got cut.
// ────────────────────────────────────────────────────────────────────────

/** First N characters of an element's own text content, trimmed — same
 *  "prefix, not full text" convention `overflowMessage`/`contrastMessage`
 *  already use for `issue.text`/`label`. */
const TEXT_PREFIX_LEN = 24

function truncatedMessage(prefix: string): string {
  return (
    `text "${prefix}" was truncated with an ellipsis — widen the layout, shorten the source ` +
    `content, or accept the cut if the tail wasn't essential`
  )
}

function truncatedFindings(markup: string, page: number, slideId: string | undefined): AuditFinding[] {
  const root = parseSvg(markup)
  const els = Array.from(root.querySelectorAll('[data-truncated="1"]'))
  return els.map((el) => {
    const text = (el.textContent ?? "").trim()
    const prefix = text.slice(0, TEXT_PREFIX_LEN)
    return {
      page,
      ...(slideId !== undefined ? { slideId } : {}),
      code: "content-truncated" as const,
      message: truncatedMessage(prefix),
      detail: { text },
    }
  })
}

function droppedMessage(count: number): string {
  const unit = count === 1 ? "item" : "items"
  const verb = count === 1 ? "is" : "are"
  // No "+N more" text on the slide any more (`svg-content.tsx`, visual
  // review 2026-08-15) — the drop is invisible to a reader, so the message
  // says so rather than pointing at a marker that is no longer painted.
  return (
    `${count} ${unit} of content ${verb} missing from the rendered slide, with nothing on it to say so — ` +
    `the content area is over capacity, split the slide or trim its content`
  )
}

function droppedFindings(markup: string, page: number, slideId: string | undefined): AuditFinding[] {
  const root = parseSvg(markup)
  const els = Array.from(root.querySelectorAll("[data-dropped]"))
  return els.map((el) => {
    const count = Number(el.getAttribute("data-dropped") ?? 0)
    return {
      page,
      ...(slideId !== undefined ? { slideId } : {}),
      code: "content-dropped" as const,
      message: droppedMessage(count),
      detail: { count },
    }
  })
}

// ────────────────────────────────────────────────────────────────────────
// auditDeck — the SDK entry point.
// ────────────────────────────────────────────────────────────────────────

/**
 * Deterministic geometry audit over an already-valid deck (v0.3 W6, spec §7
 * workflow ④): render every non-placeholder slide off-screen
 * (`renderSlideSvg`, the same single-source SVG the preview and exporter
 * both use) and run five check families against the rendered markup —
 * overflow/out-of-bounds (reusing `svg-audit.ts`'s existing walker
 * verbatim), low-contrast (WCAG relative luminance), overlap (pairwise
 * `data-audit-box` intersection), and content-truncated/content-dropped
 * (bench-driven fix round, defect E — reading the `data-truncated`/
 * `data-dropped` markers the render chain now stamps at its own silent
 * content-loss paths). Pure — no I/O, no Node dependency (see
 * `parseSvg`'s doc comment).
 *
 * Split out from `auditDeck` (audit-v2 phase B) so the optional pixel audit
 * (`pixels: true`, see `auditDeck`'s own doc comment) can run this exact
 * same deterministic pass first and layer pixel-contrast findings on top,
 * without duplicating the render-and-walk loop.
 */
function runDeterministicAudit(ir: PptxIR): { findings: AuditFinding[]; pagesAudited: number; pagesSkipped: number } {
  const findings: AuditFinding[] = []
  let pagesAudited = 0
  let pagesSkipped = 0

  ir.slides.forEach((slide, i) => {
    const page = i + 1
    if (slide.placeholder) {
      pagesSkipped++
      return
    }
    pagesAudited++

    const slideId = slide.id
    const markup = renderSlideSvg(ir, i)

    findings.push(...overflowFindings(markup, page, slideId))
    findings.push(...contrastFindings(markup, page, slideId))
    findings.push(...overlapFindings(markup, page, slideId))
    findings.push(...truncatedFindings(markup, page, slideId))
    findings.push(...droppedFindings(markup, page, slideId))
  })

  return { findings, pagesAudited, pagesSkipped }
}

/**
 * `auditDeck`'s own runtime guard against a caller passing raw/unvalidated
 * JSON straight through (borrow wave, Task 2 — A4). The type signature says
 * `PptxIR`, but nothing enforced that at runtime — a plain
 * `JSON.parse(...)` result missing `assets` (a perfectly ordinary shape for
 * a hand-authored document, or any document that simply hasn't been through
 * `validateIr` yet, which fills in `assets: { images: {} }` as a schema
 * default) reached `FullSlideSvg` and crashed with `TypeError: Cannot read
 * properties of undefined (reading 'images')` — verbatim, real-browser
 * reproduction (`dr/a-lightweight.md` §4). Node and browser hit the exact
 * same crash (the render chain this guards, `runDeterministicAudit` →
 * `renderSlideSvg` → `FullSlideSvg`, is shared — part of `src/index.ts`'s
 * browser-safe closure), so the fix lives once, here, rather than duplicated
 * per platform. Only checks the two fields the render chain actually
 * dereferences unguarded (`slides`, `assets.images`) — a cheap shape check,
 * not a re-run of `validateIr`'s full schema, which stays the caller's job.
 */
function assertValidatedIrShape(ir: unknown): asserts ir is PptxIR {
  const assets = (ir as { assets?: { images?: unknown } } | null)?.assets
  const looksValid =
    typeof ir === "object" &&
    ir !== null &&
    Array.isArray((ir as { slides?: unknown }).slides) &&
    typeof assets === "object" &&
    assets !== null &&
    typeof assets.images === "object" &&
    assets.images !== null
  if (!looksValid) {
    throw new PptfastError(
      "auditDeck received an IR object missing slides[] or assets.images — pass the .ir returned by validateIr(input), not raw/unvalidated JSON (run validateIr first)",
    )
  }
}

/**
 * The SDK entry point. Advisory, not a hard gate: `validateIr` already
 * rejects structurally invalid or over-dense decks before a caller ever
 * gets this far; this function looks for the visual problems that can still
 * slip through a valid deck at render time (an author-chosen near-background
 * text color, two components whose combined content happens to collide, a
 * card list that had to drop an item to fit). A non-empty `findings` array
 * is a prompt for a human/agent to look, not a rejection.
 *
 * Placeholder pages (`slide.placeholder === true`) are skipped — assemble's
 * stand-in for content nobody has written yet has nothing to audit, same
 * reasoning `checkIrQuality` already uses to skip them (`ir-quality.ts`).
 *
 * `auditDeck` itself never calls `installNodePlatform()`; that's the
 * caller's job (the CLI does it automatically).
 *
 * `opts.pixels` (audit-v2 phase B, spec §4.3/§11.7) opts into the optional
 * pixel-level contrast audit over image-backed text (`../svg/audit/pixel-audit.ts`)
 * — overloaded so the far more common omitted/`false` case keeps returning
 * a plain, synchronous `AuditReport` (spec §11.7's "语义层": the default
 * audit stays pure TS with zero added latency or Promise-wrapping), while
 * `pixels: true` returns a `Promise<AuditReport>` that resolves once the
 * rasterization pass completes. A caller holding a non-literal
 * `{ pixels: someBoolean }` won't match either overload directly (TypeScript
 * can't narrow it to one specific branch) — branch on the boolean first and
 * call this function with a literal in each arm, e.g. `opts.pixels ? await
 * auditDeck(ir, { pixels: true }) : auditDeck(ir)` (`cli/commands.ts`'s
 * `runAudit` does exactly this).
 */
export function auditDeck(ir: PptxIR, opts?: { pixels?: false }): AuditReport
export function auditDeck(ir: PptxIR, opts: { pixels: true }): Promise<AuditReport>
export function auditDeck(ir: PptxIR, opts: AuditDeckOptions = {}): AuditReport | Promise<AuditReport> {
  assertValidatedIrShape(ir)
  const { findings, pagesAudited, pagesSkipped } = runDeterministicAudit(ir)
  const report: AuditReport = { findings, pagesAudited, pagesSkipped, checks: { svg: "completed", pixels: "not-requested" } }
  if (!opts.pixels) return report
  return runPixelPass(ir, report)
}

/**
 * `auditDeck`'s `pixels: true` branch — factored out so the sync branch
 * above stays a plain, un-awaited return. Reaches `pixel-audit.ts` through a
 * *lazy* `import()` rather than a static top-level one deliberately:
 * `pixel-audit.ts` already statically imports several primitives from this
 * file (`__collectImageBackedTextRuns`, `blendOver`, `contrastRatio`, the
 * `AuditFinding`/`ImageBackedTextRun` types) — a static import the other way
 * here would close that into a module cycle. Both directions only ever
 * reference plain hoisted function declarations (never invoked at either
 * module's own top level), so a cycle would in fact resolve safely, but
 * this codebase's own layering discipline (see `pathBoundingBox`'s doc
 * comment on why `deck-audit.ts` keeps a second path tokenizer rather than
 * import one from `src/pptx`: "layering stays one-directional") argues for
 * avoiding one on principle rather than relying on that safety. The lazy
 * import also means `pixel-audit.ts` — and transitively `platform/browser.ts`
 * — is never even loaded for the far more common call that never passes
 * `pixels: true`.
 */
async function runPixelPass(ir: PptxIR, report: AuditReport): Promise<AuditReport> {
  const { runPixelContrastAudit } = await import("./pixel-audit")
  const pixelFindings = await runPixelContrastAudit(ir)
  return {
    ...report,
    findings: [...report.findings, ...pixelFindings],
    checks: { svg: "completed", pixels: "completed" },
  }
}
