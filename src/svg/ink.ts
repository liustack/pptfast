/**
 * Contrast-aware ink selection, shared by every layout that either paints
 * its own background panel (a `colors.primary`/`colors.accent`-filled block)
 * or relies on the page-level default background `FullSlideSvg` paints
 * behind it (`ctx.defaultBg` — see `full-slide-svg.tsx`'s `buildCtx`).
 *
 * Extracted (W4 fix round) from `cover-split-diagonal.tsx`'s `readableOn` —
 * that function already had cross-file consumers before this extraction
 * (`chapter-fashion-chapter.tsx`, `ending-fashion-ending.tsx`,
 * `cover-fashion-masthead.tsx` all imported it from a sibling layout
 * file), so this module formalizes an already-shared helper into its own
 * home rather than inventing a new color policy.
 *
 * WCAG 2.1 SC 1.4.3 relative-luminance/contrast-ratio math mirrors
 * `src/svg/audit/deck-audit.ts`'s own — independently duplicated on purpose
 * (render code must never import from the audit package; dependency
 * direction is render→util, not the reverse) rather than sharing a single
 * implementation across the two packages. Keep the two in sync if the
 * formula itself ever needs a fix.
 */

import type { StyleColors } from "../themes/tokens"

/**
 * `readableOn`'s tie-break-only fallback threshold (backlog item 2,
 * `.issues/notes/engineering-history.md` #2 — post-v0.3 W8 fix
 * round: the fixed 0.4 cutover this constant used to *drive* every
 * `readableOn` decision is gone, replaced by a real two-ink contrast
 * comparison below). Kept only for the near-zero-probability exact-tie case
 * where `contrastRatio(darkInk, bg) === contrastRatio(lightInk, bg)` to the
 * bit — an exact IEEE-754 tie requires `bg`'s luminance to land on one
 * precise value (`sqrt((L_dark+0.05)*(L_light+0.05)) - 0.05`, not 0.4), so in
 * practice this branch is unreachable by any of this renderer's real theme
 * tokens; it exists so the tie case still resolves deterministically to the
 * same answer this constant always gave, rather than an arbitrary `>`
 * comparison direction. */
const LUMINANCE_INK_THRESHOLD = 0.4

/** font-size (px) at/above which text qualifies for the relaxed 3:1 ratio
 * instead of 4.5:1 — mirrors `deck-audit.ts`'s `LARGE_TEXT_MIN_PX` (WCAG's
 * 18pt cutoff at the 96/72 css-px-per-pt ratio). */
const LARGE_TEXT_MIN_PX = 24
const CONTRAST_RATIO_LARGE = 3
const CONTRAST_RATIO_BODY = 4.5

/**
 * sRGB relative luminance (WCAG 2.1): 0 (black) – 1 (white). Handles the
 * IR's full `HexColor` range (3–8 digits, see the `pptx-ir` schema's `Hex`
 * pattern): 3/4-digit shorthand is doubled per channel, an 8-digit value's
 * trailing alpha pair is dropped. Ported verbatim from
 * `cover-split-diagonal.tsx`'s hardened version (2026-07-10 fix: the
 * original 6-digit-only parser mis-scored short hex overrides like `#FFC`
 * as zero luminance and picked the wrong ink).
 */
function relativeLuminance(hex: string): number {
  let h = hex.trim().replace(/^#/, "")
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("")
  if (h.length === 8) h = h.slice(0, 6)
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return 0
  const n = parseInt(h, 16)
  const chan = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2]
}

/** WCAG 2.1 SC 1.4.3 contrast ratio between two opaque hex colors. */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA)
  const lb = relativeLuminance(hexB)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * The WCAG contrast ratio text at `fontSizePx` must clear — 3:1 for "large"
 * text (>=24px), 4.5:1 otherwise. Mirrors `deck-audit.ts`'s
 * `CONTRAST_RATIO_LARGE`/`CONTRAST_RATIO_BODY`/`LARGE_TEXT_MIN_PX` exactly,
 * so a fill this module accepts is never one `auditDeck` would still flag.
 */
export function requiredContrastRatio(fontSizePx: number): number {
  return fontSizePx >= LARGE_TEXT_MIN_PX ? CONTRAST_RATIO_LARGE : CONTRAST_RATIO_BODY
}

/** The two neutral inks `readableOn` ever returns — never a theme color, see
 * that function's own doc comment. */
const DARK_INK = "#0A0E14"
const LIGHT_INK = "#FFFFFF"

/**
 * A readable, theme-neutral ink for text painted directly on `bgHex` —
 * picks whichever of near-black/white actually measures the higher WCAG
 * contrast ratio against `bgHex`, ties (see `LUMINANCE_INK_THRESHOLD`'s own
 * doc comment) resolved by that constant's fixed 0.4 luminance cutover.
 *
 * Post-v0.3 W8 fix round (backlog item 2): the fixed-0.4-threshold
 * predecessor of this function "deliberately leaned toward white ink on a
 * large color block" (this function's own pre-fix doc comment) — an
 * aesthetic call, not a WCAG-derived one, that in practice meant every
 * background with luminance in (~0.19, 0.4] got white ink even though dark
 * ink measures a *higher* contrast ratio there (near-black's own luminance
 * is ~0.004, far closer to 0 than white's is to 1, so dark ink's contrast
 * headroom against a mid-luminance background is larger — the two-ink
 * comparison's break-even point is ~0.19, not 0.4). Real-contrast comparison
 * replaces the fixed cutover entirely; every consumer already goes through
 * this one function, so no call site needed updating.
 *
 * Returns a neutral black/white pair, never a theme color — see
 * `accessibleInk` below for "keep the theme's own color when it already
 * works, only fall back to neutral ink when it doesn't."
 */
export function readableOn(bgHex: string): "#FFFFFF" | "#0A0E14" {
  const darkContrast = contrastRatio(DARK_INK, bgHex)
  const lightContrast = contrastRatio(LIGHT_INK, bgHex)
  if (darkContrast === lightContrast) {
    return relativeLuminance(bgHex) > LUMINANCE_INK_THRESHOLD ? DARK_INK : LIGHT_INK
  }
  return darkContrast > lightContrast ? DARK_INK : LIGHT_INK
}

/**
 * Keep `preferredFill` — a color already chosen for this text (a theme
 * token, or a hardcoded "works on every *curated* pairing so far" white) —
 * when it clears the size-appropriate WCAG ratio against `bgHex`;
 * otherwise fall back to `readableOn`'s neutral ink.
 *
 * This is the one call every layout in the W4 contrast fix round makes
 * at each flagged text element: it is a no-op (byte-identical output) for
 * every theme+layout pairing that already passed contrast, and only
 * changes the ones `auditDeck` actually flagged — the invariant the fix
 * round's report verifies against existing pinned renders.
 */
export function accessibleInk(preferredFill: string, bgHex: string, fontSizePx: number): string {
  return contrastRatio(preferredFill, bgHex) >= requiredContrastRatio(fontSizePx)
    ? preferredFill
    : readableOn(bgHex)
}

/**
 * The meanings a shared component renderer can ask a theme to color: an
 * error state (`danger`), a caution state (`warning`), a good result
 * (`success`).
 */
export type SemanticRole = "danger" | "warning" | "success"

/** The slice of a theme's palette `resolveSemanticColor` reads. */
export type SemanticColorTokens = Pick<StyleColors, "danger" | "warning" | "success">

/**
 * The hexes every shared renderer hardcoded before `StyleColors` had
 * semantic-role tokens (`callout.tsx`'s warn rule, `kpi.tsx`'s delta arrow).
 *
 * All 17 built-in themes now name their own three (visual review round 4:
 * "无论主题什么配色，这个总是红色"), so these two are reachable only from a
 * theme that declares none — a `--theme-file` brand theme or a
 * `brand extract` result, neither of which has a semantic channel yet. They
 * stay exactly as they were so such a theme keeps rendering byte-for-byte as
 * it did.
 */
const SEMANTIC_DEFAULT_DANGER = "#DC2626"
const SEMANTIC_DEFAULT_SUCCESS = "#16A34A"

/**
 * Which color this theme paints `role` in: its own token when it declares
 * one, the built-in default hex otherwise.
 *
 * `warning` has no default of its own. Today's renderers paint the caution
 * tier in the same red as the error tier (`callout`'s warn variant is a red
 * alert), so an undeclared `warning` follows `danger` — a theme that names
 * only `danger` recolors its whole alert family in one line, and a theme that
 * wants a distinct caution color (an amber, say) names `warning` too.
 *
 * Returns the theme's raw color, with no contrast calibration: this function
 * has no idea what surface the caller will paint it on. A caller rendering
 * *text* in a semantic color wraps the result in `accessibleInk` against the
 * background it actually paints (see `kpi.tsx`'s delta arrow). A caller
 * painting a shape — `callout.tsx`'s 3px top rule and its icon stroke — uses
 * the raw color, the same way it used the raw hardcoded hex.
 */
export function resolveSemanticColor(role: SemanticRole, colors: SemanticColorTokens): string {
  switch (role) {
    case "danger":
      return colors.danger ?? SEMANTIC_DEFAULT_DANGER
    case "success":
      return colors.success ?? SEMANTIC_DEFAULT_SUCCESS
    case "warning":
      return colors.warning ?? colors.danger ?? SEMANTIC_DEFAULT_DANGER
  }
}

/** Alpha-blend `fg` over `bg` (both opaque hex) — the "over" compositing a
 * translucent fill actually renders as. Independently duplicated from
 * `deck-audit.ts`'s own `blendOver` for the same render→util dependency-
 * direction reason the rest of this file's math is (see the file header).
 * Exported (fashion-masthead metaInk migration) for the one layout call
 * site that composes a `fillOpacity`-dimmed ink itself before handing the
 * result to `metaInk` — see `cover-fashion-masthead.tsx`'s own header
 * comment for why that layout needs the raw composite, not just the two
 * higher-level helpers below. */
export function blendOver(fg: string, bg: string, alpha: number): string {
  const toRgb = (hex: string): [number, number, number] => {
    const n = parseInt(hex.replace("#", ""), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const [fr, fgc, fb] = toRgb(fg)
  const [br, bgc, bb] = toRgb(bg)
  const mix = (f: number, b: number) => Math.round(f * alpha + b * (1 - alpha))
  const toHex = (v: number) => v.toString(16).padStart(2, "0")
  return `#${toHex(mix(fr, br))}${toHex(mix(fgc, bgc))}${toHex(mix(fb, bb))}`
}

/**
 * A dimmed/secondary text tier (subheading under a heading, say) often
 * renders its ink at a reduced `opacity` for visual hierarchy — but that
 * reduction blends the ink *toward the background*, which can pull an
 * already-marginal `preferredOpacity`'s ratio below the floor even when the
 * same `inkHex` at full opacity clears it comfortably. Returns
 * `preferredOpacity` when the blended result still clears the size-
 * appropriate ratio, `1` (full opacity — `inkHex` is assumed to already be
 * `readableOn`/`accessibleInk`'s output, which by construction passes at
 * full opacity) otherwise.
 */
export function accessibleOpacity(
  inkHex: string,
  bgHex: string,
  fontSizePx: number,
  preferredOpacity: number,
): number {
  const blended = blendOver(inkHex, bgHex, preferredOpacity)
  return contrastRatio(blended, bgHex) >= requiredContrastRatio(fontSizePx) ? preferredOpacity : 1
}

/** `metaInk`'s own floor — the three-tier contrast policy's B tier
 * (`docs/contrast-system.md`: meta-information text — copyright lines, page
 * numbers, org names, dates) — happens to equal `CONTRAST_RATIO_LARGE`
 * numerically, but is a distinct policy line, not a font-size-driven relief:
 * it applies at every size, never 4.5:1, because a meta line is deliberately
 * low-priority text, not because it happens to render large. Named
 * separately so a future change to either tier's number doesn't silently
 * move the other. */
const META_CONTRAST_RATIO = CONTRAST_RATIO_LARGE

/** How many discrete steps `metaInk` blends `preferredFill` toward
 * `readableOn(bgHex)` before giving up and returning that neutral ink
 * outright. 20 steps (5% increments) — finer than this buys no visible
 * precision (a <5% ink shift is imperceptible), coarser risks overshooting
 * past the 3:1 floor by a visually-larger jump than necessary. */
const META_INK_STEPS = 20

/**
 * B-tier ("meta-information text": copyright lines, page numbers, org
 * names, dates — `docs/contrast-system.md`'s three-tier contrast policy)
 * ink pick. Same shape as `accessibleInk` — keep `preferredFill` when it
 * already clears the tier's own floor, `META_CONTRAST_RATIO` (3:1, hard,
 * not size-relieved), against `bgHex`.
 *
 * Where the two diverge: `accessibleInk`'s fallback is a single jump straight
 * to `readableOn`'s neutral black/white. A meta line is deliberately the
 * *faintest* legible tier on the page (see `ending-banner-ending.tsx`'s and
 * `ending-rail-ending.tsx`'s own header comments for the layered-fade
 * composition this feeds) — jumping straight to full-strength ink the
 * instant `preferredFill` falls even 0.01 short of 3:1 would read as a
 * different text tier entirely, not a minimal fix. So this walks
 * `preferredFill` toward `readableOn(bgHex)` in `META_INK_STEPS` discrete
 * steps (`blendOver`, the same "over" compositing `accessibleOpacity` already
 * blends with — no new contrast algorithm, per the plan this function ships
 * under), returning the first step that clears the floor — the smallest
 * nudge toward full-strength ink that actually works, not the full jump.
 *
 * Termination is guaranteed, not just probable: `readableOn(bgHex)` (the
 * `alpha = 1` end of the walk) always measures >= ~4.398:1 against any real
 * background — its own two-ink max-contrast comparison bottoms out at that
 * value at the dark/light break-even luminance (~0.1888), see `readableOn`'s
 * own doc comment — comfortably above this function's 3:1 floor, so the loop
 * below always finds a passing step by `alpha = 1` at the latest.
 */
export function metaInk(preferredFill: string, bgHex: string): string {
  if (contrastRatio(preferredFill, bgHex) >= META_CONTRAST_RATIO) return preferredFill
  const target = readableOn(bgHex)
  for (let step = 1; step <= META_INK_STEPS; step++) {
    const candidate = blendOver(target, preferredFill, step / META_INK_STEPS)
    if (contrastRatio(candidate, bgHex) >= META_CONTRAST_RATIO) return candidate
  }
  return target
}
