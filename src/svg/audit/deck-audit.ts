import type { PptxIR } from "@/ir"
import { renderSlideSvg } from "../../api"
import { getPlatform } from "../../platform/registry"
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
  code: "overflow" | "out-of-bounds" | "low-contrast" | "overlap"
  message: string
  detail?: Record<string, unknown>
}

export interface AuditReport {
  findings: AuditFinding[]
  pagesAudited: number
  pagesSkipped: number
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
 * `SlideDecor.tsx`'s `big_number`/`quote_marks` watermark decorations render
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

/** WCAG 2.1 SC 1.4.3 contrast ratio between two opaque hex colours. */
function contrastRatio(hexA: string, hexB: string): number {
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
 * attribute, is what gets compared against the background.
 */
function blendOver(fg: string, bg: string, alpha: number): string {
  const [fr, fgc, fb] = parseHexColor(fg)
  const [br, bgc, bb] = parseHexColor(bg)
  const mix = (f: number, b: number) => Math.round(f * alpha + b * (1 - alpha))
  const toHex = (v: number) => v.toString(16).padStart(2, "0")
  return `#${toHex(mix(fr, br))}${toHex(mix(fgc, bgc))}${toHex(mix(fb, bb))}`
}

/**
 * Minimum absolute-page area (px²) a `<rect>`/`<image>` must cover to count
 * as a background-establishing region rather than a decorative accent.
 *
 * Calibrated against real geometry found while investigating this task: the
 * smallest legitimate background this renderer paints is a content page's
 * `colors.primary` assertion banner (`content-banner-heading.tsx`,
 * 1088×88 = 95,744px²) or a kpi card shell (`kpi.tsx`, ~262×120 =
 * 31,440px²) or one gradient band (`Background.tsx`, 24 bands over
 * 1280×720 ≈ 1280×31 = 39,680px² for a `tb` gradient); the largest
 * decorative accent found is `icon-cards.tsx`'s corner bar (32×3 = 96px²)
 * and the largest badge/dot circle is `steps.tsx`'s numbered badge
 * (r=19 → ~1,134px²). 8,000px² sits comfortably in the gap between the two
 * clusters.
 */
const MIN_BG_REGION_AREA = 8000

/**
 * A translucent overlay/scrim below this opacity doesn't visually dominate
 * enough to trust its own raw colour as a stand-in for "the background text
 * sits on" — the unknown layer beneath it (a photo) would still show through
 * too much. `Background.tsx`'s own auto-scrim (`AUTO_SCRIM_OPACITY = 0.66`)
 * and a typical author-authored `overlay.opacity` both clear this easily; a
 * faint decorative tint does not.
 */
const MIN_BG_OPACITY = 0.5

export interface BgRegion {
  x: number
  y: number
  w: number
  h: number
  /** `null` = a real `<image>` (photo) — pixel colours genuinely unknown. */
  fill: string | null
}

/**
 * Approximate a `<path>`'s bounding box by extracting every numeric
 * coordinate token from its `d` attribute and taking the min/max — not a
 * true path-geometry bbox (a concave polygon's bbox covers area outside the
 * shape; a curve's control points can extend past the curve itself), but a
 * simple, safe over-approximation.
 *
 * This over-approximation used to be assumed harmless renderer-wide ("every
 * filled path is either low-opacity decoration or the one exact case") —
 * wrong: `motif-campaign-motif.tsx`'s crayon-stroke paths are large,
 * `>=MIN_BG_OPACITY`-effective-opacity, `#`-prefixed-fill paths whose sparse
 * scattered-diamond geometry this function's min/max bbox wildly
 * over-covers, and were it walked, would have registered as spurious opaque
 * background regions (reviewer-measured 7-9 extra per campaign cover). The
 * actual fix is `findContrastIssues`'s `data-decor` exclusion (see its own
 * doc comment) — every motif/decor subtree (`FullSlideSvg.tsx`'s `<g
 * data-decor>` wrapper around `themeDef.motif`'s output) is skipped for
 * region-collection purposes entirely, so whatever this function returns for
 * a path inside one never reaches a region. Outside a decor subtree, the
 * only large, opaque `<path>` fill this renderer draws as a real background
 * block is `cover-split-diagonal.tsx`'s diagonal-cut colour panel, `"M 0,0 L
 * 560,0 L 460,720 L 0,720 Z"` — a straight-line polygon whose vertices *are*
 * its extremes, for which this bbox is exact, not an approximation.
 */
function pathBoundingBox(d: string): { x: number; y: number; w: number; h: number } | null {
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

export interface ContrastIssue {
  text: string
  fill: string
  background: string
  ratio: number
  required: number
  fontSize: number
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
 * mirrors that directly: every `<rect>`/`<image>` at or above
 * `MIN_BG_REGION_AREA` gets recorded, in document order, as a candidate
 * region; a text element's effective background is whichever recorded
 * region (searched most-recent-first) actually contains its position. This
 * one mechanism covers the page background (`Background.tsx` always paints
 * first), a gradient's individual bands (each is its own region — more
 * precise than any single midpoint), local panels/cards/banners (the
 * bento-card/kpi/icon-card/banner-heading shell `<rect>`s), and an
 * asset-background scrim opaque enough to trust (`MIN_BG_OPACITY`) — while
 * a bare photo `<image>` with no (or too-faint) scrim correctly resolves to
 * "unknown" (`fill: null`) rather than a guess, and text over it is skipped.
 *
 * One more exclusion sits on top of the region model above: anything inside
 * a `<g data-decor>` subtree (`FullSlideSvg.tsx`'s exact wrapper around
 * `themeDef.motif`'s output — verified there, not assumed) never becomes a
 * region, full stop, regardless of size/opacity/fill. Decoration is layered
 * *over* the real background, not a stand-in for it — but nothing in this
 * renderer's motif discipline stops a motif from drawing large, opaque-
 * enough shapes: `motif-campaign-motif.tsx`'s crayon-stroke paths are
 * exactly that (each stroke's core-density bucket alone renders at >=0.64
 * effective opacity across every call site in that file, comfortably clear
 * of `MIN_BG_OPACITY`), which would otherwise register as spurious
 * background regions and could shadow the real background for any text that
 * happens to sit inside their (`pathBoundingBox`-over-approximated)
 * bounding box — see that function's own doc comment. `findOverlapIssues`
 * needs no equivalent exclusion (decoration never carries
 * `data-audit-box`), but this region walk sees every
 * `<rect>`/`<image>`/`<path>` regardless of what drew it, so the exclusion
 * has to be explicit here. Implemented as a boolean threaded through
 * `visit`'s recursion (once a `data-decor` ancestor is entered it stays true
 * for the whole subtree) rather than a string/regex pre-pass on `markup` —
 * this function already fully parses to DOM, and regex-stripping a
 * `<g>...</g>` span is unsound the moment the subtree nests further `<g>`
 * elements of its own (every motif does), which would truncate at the first
 * nested `</g>` instead of the matching one.
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

function runContrastWalk(markup: string): { issues: ContrastIssue[]; regions: BgRegion[] } {
  const root = parseSvg(markup)
  const issues: ContrastIssue[] = []
  const regions: BgRegion[] = []

  const backgroundAt = (px: number, py: number): string | null => {
    for (let i = regions.length - 1; i >= 0; i--) {
      const r = regions[i]
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return r.fill
    }
    return null
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
  ) => {
    const { dx, dy, scale } = parseTransform(el)
    const ax = ox + os * dx
    const ay = oy + os * dy
    const as = os * scale

    const ownFill = el.getAttribute("fill")
    const ownFontSize = el.getAttribute("font-size")
    const ownFillOpacity = el.getAttribute("fill-opacity")
    const ownOpacity = el.getAttribute("opacity")
    const currentFill = ownFill ?? fill
    const currentFontSize = ownFontSize ? Number(ownFontSize) : fontSize
    const currentFillOpacity = ownFillOpacity !== null ? Number(ownFillOpacity) : fillOpacity
    // `opacity` (unlike `fill-opacity`) compounds down nested groups in real
    // SVG rendering (each ancestor's own opacity<1 further dims everything
    // inside it), so this accumulator multiplies rather than overrides.
    const currentOpacityProduct = opacityProduct * (ownOpacity !== null ? Number(ownOpacity) : 1)
    // `data-decor` is `FullSlideSvg.tsx`'s exact wrapper around theme motif
    // output — once entered it marks this element *and* every descendant
    // (subtree exclusion, not just this node), same "sticky" accumulation
    // pattern as `currentOpacityProduct` above.
    const inDecorSubtree = inDecor || el.getAttribute("data-decor") !== null

    const tag = el.tagName.toLowerCase()
    if (tag === "rect" || tag === "image" || tag === "path") {
      let x = 0
      let y = 0
      let localW = 0
      let localH = 0
      if (tag === "path") {
        const bbox = pathBoundingBox(el.getAttribute("d") ?? "")
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
      const w = localW * as
      const h = localH * as
      // `!inDecorSubtree` — see findContrastIssues's own doc comment: a
      // motif/decor shape never counts as a background region no matter how
      // large or opaque it renders.
      if (w * h >= MIN_BG_REGION_AREA && !inDecorSubtree) {
        if (tag === "image") {
          regions.push({ x: ax + x * as, y: ay + y * as, w, h, fill: null })
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
          if (shapeFill?.startsWith("#") && opaqueEnough) {
            regions.push({ x: ax + x * as, y: ay + y * as, w, h, fill: shapeFill })
          }
        }
      }
    } else if (tag === "text" || tag === "tspan") {
      const content = directText(el)
      if (content) {
        const tx = ax + Number(el.getAttribute("x") ?? 0) * as
        const ty = ay + Number(el.getAttribute("y") ?? 0) * as
        const background = backgroundAt(tx, ty)
        if (background !== null) {
          const alpha = currentFillOpacity * currentOpacityProduct
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
            const effective = blendOver(currentFill, background, alpha)
            const ratio = contrastRatio(effective, background)
            const required = renderedFontSize >= LARGE_TEXT_MIN_PX ? CONTRAST_RATIO_LARGE : CONTRAST_RATIO_BODY
            if (ratio < required) {
              issues.push({
                text: content.slice(0, 24),
                fill: currentFill,
                background,
                ratio,
                required,
                fontSize: renderedFontSize,
              })
            }
          }
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
      )
    }
  }

  visit(root, 0, 0, 1, DEFAULT_FILL, DEFAULT_FONT_SIZE, 1, 1, false)
  return { issues, regions }
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
 * in `src/svg`: `SvgContent.tsx` and every card/list component) — never a
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
 * (`archetypes/motif-*.tsx`) and `SlideDecor.tsx` render exclusively outside
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
// auditDeck — the SDK entry point.
// ────────────────────────────────────────────────────────────────────────

/**
 * Deterministic geometry audit over an already-valid deck (v0.3 W6, spec §7
 * workflow ④): render every non-placeholder slide off-screen
 * (`renderSlideSvg`, the same single-source SVG the preview and exporter
 * both use) and run three check families against the rendered markup —
 * overflow/out-of-bounds (reusing `svg-audit.ts`'s existing walker
 * verbatim), low-contrast (WCAG relative luminance), and overlap (pairwise
 * `data-audit-box` intersection). Pure — no I/O, no Node dependency (see
 * `parseSvg`'s doc comment) — `auditDeck` itself never calls
 * `installNodePlatform()`; that's the caller's job (the CLI does it
 * automatically).
 *
 * Advisory, not a hard gate: `validateIr` already rejects structurally
 * invalid or over-dense decks before a caller ever gets this far; this
 * function looks for the visual problems that can still slip through a
 * valid deck at render time (an author-chosen near-background text color,
 * two components whose combined content happens to collide). A non-empty
 * `findings` array is a prompt for a human/agent to look, not a rejection.
 *
 * Placeholder pages (`slide.placeholder === true`) are skipped — assemble's
 * stand-in for content nobody has written yet has nothing to audit, same
 * reasoning `checkIrQuality` already uses to skip them (`ir-quality.ts`).
 */
export function auditDeck(ir: PptxIR): AuditReport {
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
  })

  return { findings, pagesAudited, pagesSkipped }
}
