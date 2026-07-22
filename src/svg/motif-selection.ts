/**
 * Motif candidate-set rotation (P1 variety wave, task 2 — spec/plan
 * `.issues/plans/2026-07-23-pptfast-p1-variety.md` 任务 2). Before this
 * task, `themeDef.motif` (`src/themes/definitions.ts`) was a single fixed id
 * per theme — every decor-bearing page in a deck's whole lifetime drew the
 * exact same sticker (C3 in the diversity deep-review: "全库唯二完全不吃
 * seed 的视觉元素" alongside chart palette, see `chart-palette.ts`). This
 * module replaces that single id with a per-theme *candidate set* (2-3
 * style-compatible motifs, one exception below) and a seed+pageKey weighted
 * pick — `weightedPickBySeed`, the exact mechanism `effective-layout.ts`
 * already uses for layout selection — so different decor pages in one deck
 * commonly land on different motifs while a single deck+seed stays fully
 * deterministic (double-render identical) and editing one page never
 * reshuffles another (pageKey-scoped, no cross-page fold — unlike layout
 * selection's adjacent anti-repetition, motif has no cross-page dependency
 * at all, so this is structurally simpler than `resolveArchetypeId`).
 *
 * ## Candidate-set design (the content decision, argued per theme below)
 *
 * `MOTIF_CANDIDATES` is keyed by `CanonicalThemeId` and deliberately a
 * `Partial` — `runway` has no entry at all (not an empty array): its own
 * `THEME_DEFINITIONS.runway.motif` is `undefined` by a settled,
 * user-adjudicated design decision ("排印至上", `definitions.ts`'s own
 * comment — typography-only was tried with a motif twice and reverted both
 * times). There is nothing to rotate for a theme with no motif to begin
 * with, and reopening that call is out of this task's scope (控制者裁决 §5:
 * "settled decisions 不重启辩论").
 *
 * Every other candidate set's **first element is always that theme's own
 * pre-existing anchor motif** (`THEME_DEFINITIONS[id].motif`, locked by
 * `motif-selection.test.ts`) and carries {@link MOTIF_ANCHOR_WEIGHT} against
 * every other member's {@link MOTIF_BASE_WEIGHT} — the same 3:1 ratio
 * `effective-layout.ts`'s `TENDENCY_WEIGHT`/`BASE_WEIGHT` and
 * `BEAT_TENDENCY_WEIGHT`/`BEAT_BASE_WEIGHT` already use, reused rather than
 * inventing a fourth magic ratio. This keeps the theme's identity anchor the
 * *plurality* pick always (3 vs. 1 beats any single rival) and the outright
 * *majority* pick whenever the set has only 2 members (3:1 = 75%) — a real
 * deck should still read as "the theme it was built in" most of the time,
 * with the sibling(s) as a recognizable but clearly secondary variation.
 *
 * Candidates are grouped by decorative *technique family* — the actual
 * drawing vocabulary each motif's own source header documents (grid/line
 * geometry vs. gradient-field glow vs. thin ornamental line vs. organic
 * blob/wash vs. bold color-brush) — not by superficial theme category, so a
 * sibling never reads as a random reshuffle:
 *
 * | theme | candidates (anchor first) | rationale |
 * |---|---|---|
 * | consulting | banner-motif, rail-motif, enterprise-motif | all three are quiet grid/line geometric marks with zero organic curve or saturated color — matches consulting's buttoned-up register; the wider organic/wash/bold-brush families are excluded outright, not merely under-weighted |
 * | insight | poster-motif, constellation-motif | both are atmosphere-generating gradient fields (a corner glow vs. a diagonal deep-space field) rather than literal line ornaments — insight's own "EditorialDarkDecor" lineage is about ambient depth, not iconography, so the sibling stays in the same glow family |
 * | academic | rail-motif, banner-motif, corner-ornament-motif | a restrained corner arc pairs with the other two quiet-line-geometry members (banner's grid) and one scholarly-print ornament (journal's corner ornament) — academic's register tolerates print tradition but not organic softness or brush color |
 * | tech | constellation-motif, poster-motif, enterprise-motif | tech's own gradient-field glow (constellation) pairs with insight's sibling glow family, plus enterprise's precise grid for the "engineered" register — never organic/hand-drawn, which would undercut the precision identity |
 * | runway | *(none — settled decision, see module doc above)* | typography-only is the adjudicated look; no candidate set |
 * | journal | corner-ornament-motif, heritage-motif, rail-motif | journal/heritage/luxe share a "thin ornamental line" family (see luxe's own entry below) — journal sits at the "print corner" end, heritage at "classic emblem", close enough to rotate as siblings; rail's restrained arc is the third, plain-geometry option |
 * | enterprise | enterprise-motif, banner-motif, rail-motif | enterprise's Swiss-grid IKB identity pairs only with the other minimal geometric-line motifs (banner's grid, rail's arc) — organic/wash/ornamental families would visibly clash with its industrial-design register |
 * | luxe | luxe-motif, heritage-motif, corner-ornament-motif | luxe/heritage/journal all draw from the same thin-ornamental-line family — luxe at the "gilt minimal" end, heritage at "classic emblem", journal at "print corner" |
 * | campaign | campaign-motif *(singleton)* | campaign's saturated multi-hue crayon/brush vocabulary has no sibling anywhere in the other 12 motifs — pairing it with grid lines, watercolor wash, or gold hairlines would break its "活力营销" identity rather than vary it, so it is deliberately left alone (candidate set of 1 — same-deck renders stay byte-identical to before this task, see `motif-selection.test.ts`'s byte-inertness block) |
 * | classroom | classroom-motif, bloom-motif | classroom's own header comment explicitly distinguishes its smooth organic blobs from bloom's watercolor texture, but both are still organic/soft-toned family members — the most-adjacent style match in the whole roster, close enough to rotate without breaking the "教学手账" register the way a grid or brush motif would |
 * | bloom | bloom-motif, classroom-motif | mirror of classroom's pairing above — both organic, soft-toned, most-adjacent match |
 * | ink | ink-motif *(singleton)* | ink's calligraphy/seal-stamp/vertical-inscription vocabulary is the most culturally-specific motif in the set with no sibling family — any other motif substituted in would read as a mismatched skin rather than a variation, so it stays a candidate set of 1 (byte-identical, same rationale pattern as campaign) |
 * | heritage | heritage-motif, luxe-motif, corner-ornament-motif | heritage anchors the thin-ornamental-line family (classic emblem end), luxe (gilt minimal) and journal's corner ornament (print corner) are its closest siblings |
 *
 * `tone-adaptive-motif` — the 13th registered motif archetype — is
 * deliberately absent from every candidate set above: its own source header
 * describes it as an almost-invisible full-page tint used as a
 * theme-agnostic *fallback* texture, not a themed decorative mark. Adding it
 * anywhere would reduce a page's visible motif to "nothing" some fraction of
 * the time, which is the opposite of this task's goal (make cross-page
 * decor variety a visible, positive signal, not a coin flip toward blank).
 *
 * ## Contrast safety
 *
 * Every non-anchor candidate above renders through each theme's *own*
 * `ctx.colors` (every motif's own "零 hex 纪律" — zero baked hex, colors
 * read off `ctx` — see each `motif-*.tsx` file's own header) except two
 * documented baked-white lines in `banner-motif`/`rail-motif` used only for
 * their own theme's dark chapter background (unaffected by this task — those
 * two motifs are candidates only for other themes' *own* cover/content/
 * ending renders in the sets above, where that branch never executes on a
 * background it wasn't tuned for; verified empirically, not just by
 * inspection — see `motif-candidate-contrast.test.ts`, this task's extension
 * of the existing full-matrix contrast sweep to every candidate in this
 * table, not just each theme's own anchor). No candidate was removed by that
 * sweep — recorded here per 控制者裁决 §4's re-pin discipline, so a future
 * reviewer doesn't have to re-derive "was this checked" from git blame.
 */
import type { PptxIR, Slide } from "@/ir"
import type { CanonicalThemeId } from "../themes"
import { getThemeDefinition } from "../themes/definitions"
import type { MotifArchetypeId } from "./archetypes/types"
import { cachedDeckSeed, weightedPickBySeed } from "./variety"

/**
 * Same 3:1 ratio as `effective-layout.ts`'s `TENDENCY_WEIGHT`/`BASE_WEIGHT`
 * and `BEAT_TENDENCY_WEIGHT`/`BEAT_BASE_WEIGHT` — reused, not reinvented (see
 * this module's own header for why 3:1 in particular). Kept as its own named
 * pair rather than importing those directly: this axis (motif) is
 * independently tunable from strategy/beat's own layout-weighting axis, the
 * same "separately named, same initial magnitude" posture
 * `BEAT_TENDENCY_WEIGHT`'s own doc comment already established for beat vs.
 * strategy.
 */
export const MOTIF_ANCHOR_WEIGHT = 3
export const MOTIF_BASE_WEIGHT = 1

/**
 * Theme → 2-3 style-compatible motif candidates, anchor (the theme's own
 * pre-existing `THEME_DEFINITIONS[id].motif`) always first. See this
 * module's own header comment for the full rationale table. `Partial`:
 * `runway` has no entry (its own motif is `undefined` by settled design
 * decision, nothing to rotate).
 */
export const MOTIF_CANDIDATES: Partial<Record<CanonicalThemeId, readonly MotifArchetypeId[]>> = {
  consulting: ["banner-motif", "rail-motif", "enterprise-motif"],
  insight: ["poster-motif", "constellation-motif"],
  academic: ["rail-motif", "banner-motif", "corner-ornament-motif"],
  tech: ["constellation-motif", "poster-motif", "enterprise-motif"],
  // runway: intentionally absent — see module header.
  journal: ["corner-ornament-motif", "heritage-motif", "rail-motif"],
  enterprise: ["enterprise-motif", "banner-motif", "rail-motif"],
  luxe: ["luxe-motif", "heritage-motif", "corner-ornament-motif"],
  campaign: ["campaign-motif"],
  classroom: ["classroom-motif", "bloom-motif"],
  bloom: ["bloom-motif", "classroom-motif"],
  ink: ["ink-motif"],
  heritage: ["heritage-motif", "luxe-motif", "corner-ornament-motif"],
}

/**
 * Resolve which motif archetype id `slide` (the `index`-th page of `ir`)
 * should draw its decor with. Mirrors `effective-layout.ts`'s
 * `resolveEffectiveLayoutId` signature/posture for the same reason: a single
 * authoritative function callable from both the render path
 * (`FullSlideSvg.tsx`) and tests/tooling (`motif-candidate-contrast.test.ts`)
 * that want to know a page's pick without re-deriving the salt logic.
 *
 * - `ir.theme.id` has no entry in {@link MOTIF_CANDIDATES} (a registered/
 *   custom theme, an unrecognized id, or `runway`): falls back to
 *   `getThemeDefinition(ir.theme.id).motif` directly — the exact
 *   pre-this-task behavior, so every theme outside the 13 builtins (and
 *   runway within them) renders byte-identically to before this module
 *   existed.
 * - A 1-member candidate set (`campaign`, `ink`): `weightedPickBySeed`
 *   always returns that single member regardless of seed/pageKey — also
 *   byte-identical to before this task (see `motif-selection.test.ts`'s
 *   byte-inertness block).
 * - A 2-3 member set: `weightedPickBySeed` salted on
 *   `` `motif:${pageKey}` `` (`pageKey` = `slide.id ?? String(index)`, the
 *   exact same stable-id-preferred convention `effective-layout.ts` uses),
 *   weighted `MOTIF_ANCHOR_WEIGHT` for the anchor and `MOTIF_BASE_WEIGHT`
 *   for every other member. No cross-page state is read or written — unlike
 *   layout selection's adjacent anti-repetition, a motif pick depends only
 *   on this one page's own `(theme, seed, pageKey)` triple, so a deck's
 *   motif picks are trivially revision-stable without needing a deck-wide
 *   fold or cache the way `resolveDeckEffectiveLayoutIds` needs one.
 */
export function resolveMotifId(ir: PptxIR, slide: Slide, index: number): MotifArchetypeId | undefined {
  const themeDef = getThemeDefinition(ir.theme.id)
  const candidates = MOTIF_CANDIDATES[ir.theme.id as CanonicalThemeId]
  if (!candidates || candidates.length === 0) return themeDef.motif
  const pageKey = slide.id ?? String(index)
  return weightedPickBySeed(cachedDeckSeed(ir), `motif:${pageKey}`, candidates, (id) =>
    id === candidates[0] ? MOTIF_ANCHOR_WEIGHT : MOTIF_BASE_WEIGHT,
  )
}
