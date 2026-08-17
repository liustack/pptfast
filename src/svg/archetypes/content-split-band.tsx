import type { PptxIR } from "@/ir"
import type { SvgTemplateProps } from "./types"
import type { LayoutDefinition } from "../layouts/registry"
import { SvgContent } from "../svg-content"
import { sectionNameFor } from "../../lib/derive"
import { fitHeadingLines } from "../heading-fit"
import { fitSvgLine } from "../../lib/svg-text-layout"
import { fitEmphasisLine, renderEmphasisTspans } from "../emphasis"
import { accessibleInk, readableOn } from "../ink"
import { FOOTNOTE_BASELINE_Y } from "../chrome-geometry"

/**
 * split-band content archetype (content-archetype expansion wave, task T2 —
 * `.issues/2026-07-26-content-archetypes/plan.md`): the pool's first
 * *horizontal* full-bleed split — a filled, full-width `header` band (kicker
 * + heading + optional subheading, x=0 w=1280, bleeding past the page's
 * usual x=96..1184 content margins) stacked directly on top of a `body`
 * band (an ordinary x=96 w=1088 `SvgContent` single-stack, the pool's usual
 * body geometry). Every one of the pool's other 11 archetypes splits the
 * page *vertically* (columns) or not at all (single column) — research
 * note §3.3 confirmed zero prior art for a page cut horizontally into two
 * full-width bands, the single largest visual-distance candidate among the
 * ones plan.md judged buildable without inventing a new audit mechanism
 * (unlike the rejected `diagonal-content` candidate).
 *
 * **Capacity-first discipline (plan.md's own 控制器裁定 for this task):
 * the ratio below was *measured*, not picked first and rationalized after.**
 * Instrumentation script (throwaway, not part of this commit — pinned as a
 * permanent regression in `content-split-band.test.tsx`'s own "lower-band
 * capacity" and "candidate-ratio comparison" describe blocks instead):
 * `SvgContent` rendered directly at three candidate lower-band heights
 * (390/340/310px, the 70/30, 60/40, and 55/45 upper/lower splits research
 * note §4③ names, over the page's usual ~592px header-to-floor span) with
 * a `min(pacing budget, 4)`-sized component mix (dense/balanced/spacious →
 * 4/4/3 components, since this archetype's own `body` capacity is 4 like
 * the pool's other single-stack archetypes — dense's raw budget of 5 never
 * actually reaches this layout, `min(5,4)=4`, the same clamp every flat-
 * capacity-4 archetype already gets from `ir-quality.ts`'s quality gate),
 * at each tier's own real `bodyFontPx` (20/24/32 — an early measurement
 * pass silently pinned every tier to 24 via a `buildCtx` argument-order
 * slip, caught and corrected before this geometry shipped, not after).
 *
 * Result, with *moderate* (non-adversarial) per-tier content — 3-item
 * bullets + a one-sentence paragraph, dense/balanced; a sparser 2-item/
 * short-sentence mix for spacious, matching that tier's own smallest
 * `PACING_BUDGETS.spacious.bullets.maxUnitsPerItem` (30, the pool's
 * sparsest) rather than reusing dense/balanced's heavier mix uniformly:
 * only the 390px candidate (70/30) held **both** dense and balanced at
 * zero `data-dropped` — 340px (60/40) already drops `balanced` (the actual
 * binding constraint that separates the candidates, one ratio step before
 * dense also fails), and 310px (55/45) drops both. Spacious holds at zero
 * across every candidate height with its own proportionate content — its
 * pacing tier's real risk is the larger 32px font meeting *heavier*
 * content, not this archetype's geometry specifically: re-testing the
 * *same* heavier (dense/balanced-shaped) content at spacious's real font
 * drops 1 item at every one of this archetype's candidate heights *and*
 * at `narrow-column`'s own best-case 880x410 body rect (confirmed by a
 * direct side-by-side render) — a pool-wide characteristic of spacious
 * pacing meeting that specific content shape, not a gap this archetype's
 * ratio introduces or could fix by being looser.
 * **The measurement chose 70/30** — it is the only ratio in the tested
 * family that matches the pool's own existing zero-drop floor for ordinary
 * content instead of falling meaningfully below it.
 *
 * Final geometry (derived from the chosen ratio, not re-guessed): `header`
 * is a *fixed* 224px band (independent of heading line count — unlike
 * every vertical-stack archetype's `bodyY`, which grows/shrinks with
 * `headingLastY`, this archetype holds the band height constant and lets
 * `fitHeadingLines`' own shrink/wrap safety net keep a 2-line nominal-size
 * heading + subheading inside it with margin to spare — verified: worst-
 * case `headingLastY` at fontSize=44/minPt=26/maxWidth=1088 is 168px
 * (CJK_LONG *and* an artificial forced-2-line phrase both land there — the
 * nominal, unshrunk-font case is the true worst case, not the shrunk-to-
 * floor one, `audit/capacity.ts`'s own "按最大字号算" precedent), + a 40px
 * subheading slot = 208px, comfortably inside the 224px band). `body`
 * starts at y=240 (a flat 16px gap below the header band — no divider
 * line; the color-fill-to-plain-body transition is itself the seam, same
 * "solid fill, no hairline" idiom `banner-heading`'s own banner-to-content
 * transition uses) and floors at y=640 (620 with a footnote — the same
 * `CONTENT_RECT_BOTTOM`/footnote-shrink convention `banner-heading` already
 * established, reused verbatim rather than re-derived), giving a 400px
 * (380px with footnote) `body` height — both re-verified zero-drop for
 * ordinary content at every pacing tier, and identical (not worse) to the
 * no-footnote case under the pathological control above.
 *
 * Composition sketch:
 * ┌─────────────────────────────────────────────┐ y=0
 * │ kicker                                       │ (full-bleed `header`
 * │ HEADING (readableOn(colors.primary))         │  band, filled)
 * │ subheading                                   │
 * ├─────────────────────────────────────────────┤ y=224
 * │           (16px gap, no divider)              │
 * │ body: SvgContent, arrangement passed through  │ y=240..640/620
 * └─────────────────────────────────────────────┘
 *
 * Region set (T3's own corrected diversity judgment — count *every*
 * `data-audit-box`, not just the first, and its (x, w) tuple): `header`'s
 * own box is `(0, 1280)` — genuinely full-bleed, unlike every other
 * archetype's chrome (even `banner-heading`'s own filled assertion banner
 * stops at x=96 w=1088, inset from the page edge — this archetype's own
 * differentiator per research note §3.3's own contrast with that file) —
 * paired with `body`'s ordinary `(96, 1088)` from `SvgContent`. No other
 * archetype in the pool has an x=0/w=1280 region at all, and the 2-region
 * *vertically stacked, both full-width* shape itself (vs. every existing
 * multi-region archetype's vertical column split) is what research note
 * §3.3 names as the pool's one missing composition direction.
 *
 * `readableOn`/`accessibleInk` (mechanism reused verbatim, not invented —
 * 控制器裁定 3 forbids a new contrast mechanism): `header`'s fill is
 * `colors.primary` (the same bleed-fill-needs-contrast-safety case
 * `banner-heading`/`side-highlight` already established), so heading text
 * uses `readableOn(colors.primary)` (banner-heading's own exact call
 * shape) and kicker/subheading use `accessibleInk(preferredFill,
 * colors.primary, fontSize)` (keeps the theme's own muted/accent token
 * when it already clears contrast, falls back to `readableOn`'s neutral
 * ink otherwise — the same fallback shape every other archetype's
 * subheading treatment already uses, just with `colors.primary` as the
 * background argument since that is `header`'s own real, immediate paint,
 * not `ctx.defaultBg`).
 *
 * Bold-width discipline (an earlier wave shipped a bug by omitting this —
 * root-cause.md S5): `fitHeadingLines` is called with the real
 * `fontFamily: fonts.heading` threaded through; `bold` is left at its
 * default `true` (matches this file's own `fontWeight="700"` heading
 * render, the same "no explicit override needed, 700 already is the
 * bold-metrics default" case `content-image-lead-split.tsx` already
 * established).
 *
 * Beat/strategy tendency assignment (T3 integration task): this archetype is
 * an `anchor` `BEAT_TENDENCIES` member (`layout-selection.ts`) — its
 * full-bleed `header` band *is* the heading treatment, the same "banner rect
 * is the heading" identity `banner-heading` already earns anchor membership
 * for, escalated to genuinely full-bleed (see that table's own doc comment).
 * It stays out of every strategy's `layoutTendencies` (`@/narrative`)
 * deliberately, the same "万金油" neutral treatment `tone-adaptive-content`
 * gets: the full-bleed color treatment is a chrome/visual-weight choice
 * layered on top of an otherwise ordinary single-stack body, not an argument-
 * style signal any one strategy's rhetorical register (MECE evidence,
 * editorial restraint, step-by-step procedure, glossy visual punch, plain
 * scannability) especially owns.
 *
 * Discipline: no theme id, no hex literal — every color is a token or an
 * `../ink` call.
 */

const HEADER_X = 0
const HEADER_W = 1280
const HEADER_Y = 0
const HEADER_H = 224

const TEXT_X = 96
const TEXT_MAX_W = 1088

// KICKER_Y/hasTlLogo dodge: same treatment `content-banner-heading.tsx`
// already established for a kicker sharing a filled band with BrandChrome's
// tl-positioned logo band (y 48-88) — sidesteps into the same x=176 dodge
// only when a real tl logo resolves, aligns with the band's own left edge
// otherwise.
const KICKER_Y = 56
const HEADING_BASELINE = 120
const SUBHEADING_GAP = 40
const SUBHEADING_FONT_SIZE = 22
const SUBHEADING_MIN_FONT_SIZE = 16

const BODY_GAP = 16
const BODY_Y = HEADER_H + BODY_GAP // 240
const BODY_BOTTOM_BASE = 640
const BODY_BOTTOM_FOOTNOTE_SHRINK = 20 // -> 620 with a footnote
const FOOTNOTE_Y = FOOTNOTE_BASELINE_Y

function hasTlLogo(ir: PptxIR): boolean {
  const { brand, assets } = ir
  if (brand?.position !== "tl" || !brand.logo_asset_id) return false
  const asset = assets.images[brand.logo_asset_id]
  return !!asset?.src && !asset.error
}

export function SplitBandContent({ ir, slide, index, ctx }: SvgTemplateProps) {
  const { colors, fonts } = ctx
  const section = sectionNameFor(ir.slides, index)

  const kickerX = hasTlLogo(ir) ? 176 : TEXT_X
  const kickerMaxW = HEADER_W - 16 - kickerX
  const kicker = section
    ? fitSvgLine(section, { maxWidth: kickerMaxW, fontSize: 14, minFontSize: 11, letterSpacing: 3 })
    : null
  const kickerFill = accessibleInk(colors.muted, colors.primary, 14)

  const heading = fitHeadingLines(slide.heading, {
    maxWidth: TEXT_MAX_W,
    fontSize: 44,
    maxLines: 2,
    minPt: 26,
    fontFamily: fonts.heading,
  })
  const headingLastY = HEADING_BASELINE + Math.max(0, heading.lines.length - 1) * heading.lineHeight

  const subheading = slide.subheading
    ? fitEmphasisLine(slide.subheading, {
        maxWidth: TEXT_MAX_W,
        fontSize: SUBHEADING_FONT_SIZE,
        minFontSize: SUBHEADING_MIN_FONT_SIZE,
      })
    : null
  const subheadingY = headingLastY + SUBHEADING_GAP
  const subheadingFill = subheading
    ? accessibleInk(colors.accent, colors.primary, subheading.fontSize)
    : colors.accent

  const bodyBottom = slide.footnote ? BODY_BOTTOM_BASE - BODY_BOTTOM_FOOTNOTE_SHRINK : BODY_BOTTOM_BASE
  const bodyRect = { x: TEXT_X, y: BODY_Y, w: TEXT_MAX_W, h: Math.max(120, bodyBottom - BODY_Y) }

  const footnote = slide.footnote
    ? fitSvgLine(slide.footnote, { maxWidth: TEXT_MAX_W, fontSize: 14, minFontSize: 11 })
    : null

  return (
    <>
      {/* header band: full-bleed fill, x=0 w=1280 — the pool's one region
          past the usual x=96..1184 content margins (see file header). */}
      <g data-audit-rect={`${HEADER_X},${HEADER_Y},${HEADER_W},${HEADER_H}`}>
        <rect x={HEADER_X} y={HEADER_Y} width={HEADER_W} height={HEADER_H} fill={colors.primary} />
        <g data-audit-box={`${HEADER_X},${HEADER_Y},${HEADER_W},${HEADER_H}`}>
          {kicker && (
            <text
              data-truncated={kicker.truncated ? "1" : undefined}
              x={kickerX}
              y={KICKER_Y}
              fontFamily={fonts.body}
              fontSize={kicker.fontSize}
              fill={kickerFill}
              letterSpacing={3}
              dominantBaseline="alphabetic"
            >
              {kicker.text}
            </text>
          )}

          {heading.lines.map((line, i) => (
            <text
              key={i}
              data-truncated={heading.truncated && i === heading.lines.length - 1 ? "1" : undefined}
              x={TEXT_X}
              y={HEADING_BASELINE + i * heading.lineHeight}
              fontFamily={fonts.heading}
              fontSize={heading.fontSize}
              fontWeight="700"
              fill={readableOn(colors.primary)}
              dominantBaseline="alphabetic"
            >
              {line}
            </text>
          ))}

          {subheading && (
            <text
              x={TEXT_X}
              y={subheadingY}
              fontFamily={fonts.body}
              fontSize={subheading.fontSize}
              fill={subheadingFill}
              dominantBaseline="alphabetic"
            >
              {renderEmphasisTspans(subheading.segments, { accent: readableOn(colors.primary), baseFill: subheadingFill, fontWeight: "700" })}
            </text>
          )}
        </g>
      </g>

      {/* body band: ordinary single-stack body, arrangement passed through —
          the pool's usual (96, 1088) geometry, no bespoke internal split. */}
      <SvgContent arrangement={slide.arrangement} components={slide.components} rect={bodyRect} ctx={ctx} />

      {footnote && (
        <text
          data-truncated={footnote.truncated ? "1" : undefined}
          x={TEXT_X}
          y={FOOTNOTE_Y}
          fontFamily={fonts.body}
          fontSize={footnote.fontSize}
          fill={colors.muted}
          fontStyle="italic"
          dominantBaseline="alphabetic"
        >
          {footnote.text}
        </text>
      )}
    </>
  )
}

export const layoutDef: LayoutDefinition = {
  // content-split-band.tsx: a fixed-height (224px) full-bleed `header` band
  // (kicker/heading/subheading) stacked on an ordinary 400px (380px with
  // footnote) `body` band — the pool's first horizontal split, see the
  // file's own composition-sketch header for the capacity measurement that
  // chose the 70/30 ratio. `body` capacity is 4, the pool's flat
  // single-stack default (registry.ts's CONTENT_LAYOUTS header derivation)
  // — this archetype's 400/380px body height is narrower than the pool's
  // existing widest single-stack floor but was independently re-verified
  // (not assumed) against the same zero-drop bar via the capacity
  // measurement above, so no `audit/capacity.ts` floor needs tightening.
  id: "split-band",
  kind: "archetype",
  slideTypes: ["content"],
  slots: [
    { name: "kicker", accepts: [] },
    { name: "heading", accepts: [] },
    { name: "subheading", accepts: [] },
    { name: "body", accepts: "any", capacity: 4 },
    { name: "meta", accepts: [] },
  ],
  // The body band is a lone ordinary rect (like narrow-column/side-
  // highlight/quiet-frame/image-lead-split) and honors every arrangement.
  arrangements: "all",
}
