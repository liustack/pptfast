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
 * as a *page-level* background region — `regions`/`BgRegion`/
 * `__collectBgRegions`'s own contract below, e.g. "how many real background
 * layers does this campaign cover paint" (see that test's own doc comment).
 *
 * Calibrated against real geometry found while investigating the original
 * (W6) version of this task: the smallest legitimate background this
 * renderer paints is a content page's `colors.primary` assertion banner
 * (`content-banner-heading.tsx`, 1088×88 = 95,744px²) or a kpi card shell
 * (`kpi.tsx`, ~262×120 = 31,440px²) or one gradient band (`Background.tsx`,
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
 * floor-free walk of every rect/circle/ellipse/path (image excluded, see its
 * own branch's comment), used only for text-background attribution — this
 * constant keeps its original, narrower job of filtering `regions` for
 * `__collectBgRegions`'s own page-level callers/tests, unchanged.
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

/**
 * A page-level background candidate — `regions`' own element shape, filtered
 * by `MIN_BG_REGION_AREA`/`MIN_BG_OPACITY` (rect/image/path only; see that
 * constant's own doc comment for why circle/ellipse never join this
 * particular table). Kept exactly as it was before the bench-driven fix
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
 * (bench-driven fix round, defect A) — every opaque-enough rect/circle/
 * ellipse/path this walk sees, with **no** `MIN_BG_REGION_AREA` floor,
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

/** Axis-aligned rect containment — shared by `<rect>`/`<image>`/`<path>`
 * (the last via `pathBoundingBox`'s own bbox, see its doc comment) — every
 * one of those three is checked against its bounding box, never an exact
 * outline, even where the bbox itself is now tight/exact (line and arc
 * geometry) rather than an over-approximation. */
function rectShape(x: number, y: number, w: number, h: number, fill: string | null): PaintedShape {
  return { fill, contains: (px, py) => px >= x && px <= x + w && py >= y && py <= y + h }
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

/** Tokenize a `d` string into command letters and numeric operands — same
 * pattern `svg2pptx/path.ts`'s own tokenizer uses (kept as a separate copy
 * here rather than a shared import: `src/svg/audit` doesn't otherwise
 * depend on `src/pptx`, and this file's own layering stays one-directional,
 * IR/SVG -> PPTX, never the reverse). Doesn't distinguish a run of
 * concatenated arc flags (`"01"`) from a single two-digit number — neither
 * does the sibling tokenizer this pattern is copied from — but this
 * renderer's own `A` commands always space-separate every operand
 * (`roundedTopBarPath`'s template literal), so that SVG-grammar corner case
 * never actually occurs in `d` strings this function sees. */
function tokenizePathD(d: string): string[] {
  return d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []
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
 * A `<path>`'s bounding box, for `PaintedShape`/`BgRegion` purposes —
 * grammar-aware (`pathBoundingBoxByGrammar`): walks `d` command-by-command
 * so an arc's own `rx`/`ry`/`x-axis-rotation`/flag numbers never get
 * mistaken for more `(x, y)` coordinates, the defect that used to inflate
 * `insight_panel.tsx`/`roadmap.tsx`'s shared `roundedTopBarPath` accent bar
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
 * mirrors that directly: every opaque-enough `<rect>`/`<circle>`/`<ellipse>`/
 * `<path>` (plus `<image>`, floor-gated — see its own branch below) gets
 * recorded, in document order, as a `PaintedShape`; a text element's
 * effective background is whichever recorded shape (searched
 * most-recent-first, i.e. topmost in paint order) actually *contains* its
 * position — an exact ellipse test for `<circle>`/`<ellipse>`, a bounding-box
 * test for the other three (see `rectShape`/`ellipseShape`/`pathBoundingBox`).
 * This one mechanism covers the page background (`Background.tsx` always
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
 * One more exclusion sits on top of the shape model above: anything inside
 * a `<g data-decor>` subtree (`FullSlideSvg.tsx`'s exact wrapper around
 * `themeDef.motif`'s output — verified there, not assumed) never becomes a
 * candidate, full stop, regardless of size/opacity/fill. Decoration is
 * layered *over* the real background, not a stand-in for it — but nothing in
 * this renderer's motif discipline stops a motif from drawing large, opaque-
 * enough shapes: `motif-campaign-motif.tsx`'s crayon-stroke paths are
 * exactly that (each stroke's core-density bucket alone renders at >=0.64
 * effective opacity across every call site in that file, comfortably clear
 * of `MIN_BG_OPACITY`), which would otherwise register as spurious
 * background candidates and could shadow the real background for any text
 * that happens to sit inside their (`pathBoundingBox`-over-approximated)
 * bounding box — see that function's own doc comment. `findOverlapIssues`
 * needs no equivalent exclusion (decoration never carries
 * `data-audit-box`), but this walk sees every
 * `<rect>`/`<circle>`/`<ellipse>`/`<image>`/`<path>` regardless of what drew
 * it, so the exclusion has to be explicit here. Implemented as a boolean
 * threaded through `visit`'s recursion (once a `data-decor` ancestor is
 * entered it stays true for the whole subtree) rather than a string/regex
 * pre-pass on `markup` — this function already fully parses to DOM, and
 * regex-stripping a `<g>...</g>` span is unsound the moment the subtree
 * nests further `<g>` elements of its own (every motif does), which would
 * truncate at the first nested `</g>` instead of the matching one.
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
    inheritedTx: number | null,
    inheritedTy: number | null,
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
    // Threaded down to children unchanged by every non-text tag (a plain
    // <g> wrapper, a background <rect>, ...) — only a text/tspan branch
    // below ever overwrites it, and only a <tspan> descendant of a
    // <text>/<tspan> can ever observe a non-null value (see that branch's
    // own doc comment).
    let currentTx = inheritedTx
    let currentTy = inheritedTy
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
      const absX = ax + x * as
      const absY = ay + y * as
      // `!inDecorSubtree` — see findContrastIssues's own doc comment: a
      // motif/decor shape never counts as a background candidate no matter
      // how large or opaque it renders.
      if (!inDecorSubtree) {
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
          if (shapeFill?.startsWith("#") && opaqueEnough) {
            // Attribution (defect A fix): no area floor — a badge/chip too
            // small to be a *page* background is still the real background
            // of whatever text sits directly on top of it. See
            // `MIN_BG_REGION_AREA`'s own doc comment.
            paintedShapes.push(rectShape(absX, absY, w, h, shapeFill))
            // Page-level table: unchanged, still area-floored —
            // `__collectBgRegions`'s own contract (and its dedicated
            // regression test) is untouched by this fix.
            if (w * h >= MIN_BG_REGION_AREA) {
              regions.push({ x: absX, y: absY, w, h, fill: shapeFill })
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
      if (!inDecorSubtree && shapeFill?.startsWith("#") && opaqueEnough) {
        paintedShapes.push(
          ellipseShape(ax + cx * as, ay + cy * as, localRx * as, localRy * as, shapeFill),
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
      // item 5b, `.issues/notes/2026-07-18-post-v03-backlog.md` #5).
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
        currentTx,
        currentTy,
      )
    }
  }

  visit(root, 0, 0, 1, DEFAULT_FILL, DEFAULT_FONT_SIZE, 1, 1, false, null, null)
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
// "+N more" marker (six render sites: `SvgContent`, `BigNumber`,
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
  return (
    `${count} more ${unit} of content ${verb} hidden behind a "+${count} more" marker — the content ` +
    `area is over capacity, split the slide or trim its content`
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
 * `parseSvg`'s doc comment) — `auditDeck` itself never calls
 * `installNodePlatform()`; that's the caller's job (the CLI does it
 * automatically).
 *
 * Advisory, not a hard gate: `validateIr` already rejects structurally
 * invalid or over-dense decks before a caller ever gets this far; this
 * function looks for the visual problems that can still slip through a
 * valid deck at render time (an author-chosen near-background text color,
 * two components whose combined content happens to collide, a card list
 * that had to drop an item to fit). A non-empty `findings` array is a
 * prompt for a human/agent to look, not a rejection.
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
    findings.push(...truncatedFindings(markup, page, slideId))
    findings.push(...droppedFindings(markup, page, slideId))
  })

  return { findings, pagesAudited, pagesSkipped }
}
