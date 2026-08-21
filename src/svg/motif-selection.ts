/**
 * Motif candidate-set rotation (P1 variety wave, task 2 — spec/plan
 * `.issues/plans/2026-07-23-pptfast-p1-variety.md` 任务 2). Before this
 * task, `themeDef.motif` (`src/themes/definitions.ts`) was a single fixed id
 * per theme — every decor-bearing page in a deck's whole lifetime drew the
 * exact same sticker (C3 in the diversity deep-review: "全库唯二完全不吃
 * seed 的视觉元素" alongside chart palette, see `chart-palette.ts`). This
 * module replaces that single id with a per-theme *candidate set* (2-3
 * style-compatible motifs, one exception below) and a seed+pageKey weighted
 * pick — `weightedPickBySeed`, the exact mechanism `layout-selection.ts`
 * already uses for layout selection — so different decor pages in one deck
 * commonly land on different motifs while a single deck+seed stays fully
 * deterministic (double-render identical) and editing one page never
 * reshuffles another (pageKey-scoped, no cross-page fold — unlike layout
 * selection's adjacent anti-repetition, motif has no cross-page dependency
 * at all, so this is structurally simpler than `resolveLayoutId`).
 *
 * ## Candidate-set design (the content decision, argued per theme below)
 *
 * `MOTIF_CANDIDATES` is keyed by `CanonicalThemeId` and deliberately a
 * `Partial` — `runway` and `stage` have no entry at all (not an empty
 * array): both themes' `THEME_DEFINITIONS[id].motif` is `undefined` by
 * settled design. runway is typography-only ("排印至上", tried with a motif
 * twice and reverted both times). stage is the undecorated black field
 * (2026-08-21, 无框黑场 — a frame of any weight would read as luxe /
 * museum's cousin). There is nothing to rotate for a theme with no motif
 * to begin with.
 *
 * Every other candidate set's **first element is always that theme's own
 * pre-existing anchor motif** (`THEME_DEFINITIONS[id].motif`, locked by
 * `motif-selection.test.ts`) and carries {@link MOTIF_ANCHOR_WEIGHT} against
 * every other member's {@link MOTIF_BASE_WEIGHT} — the same 3:1 ratio
 * `layout-selection.ts`'s `TENDENCY_WEIGHT`/`BASE_WEIGHT` and
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
 * | consulting | banner-motif, rail-motif, enterprise-motif | all three are quiet line/geometry marks with zero organic curve or saturated color — matches consulting's buttoned-up register; the wider organic/wash/bold-brush families are excluded outright, not merely under-weighted. Editorial-group reskin (2026-08-20): `banner-motif`'s own vocabulary changed from a faint line grid to three fixed annotation rules (a top hairline, a highlighter block, a page-number rule) — same quiet-line family, so this row's rationale still holds, but the *look* the two borrowers inherit is new. See `motifs/motif-banner-motif.tsx`. |
 * | insight | poster-motif, constellation-motif | both are atmosphere-generating gradient fields (a corner glow vs. a diagonal deep-space field) rather than literal line ornaments — insight's own "EditorialDarkDecor" lineage is about ambient depth, not iconography, so the sibling stays in the same glow family |
 * | academic | rail-motif, banner-motif, corner-ornament-motif | a progress track pairs with the other two quiet-line members (banner's annotation rules) and one scholarly-print mark (journal's masthead rules) — academic's register tolerates print tradition but not organic softness or brush color. Both siblings were redrawn by the editorial-group reskin (2026-08-20); the id `corner-ornament-motif` no longer draws corner ornaments at all — read that file, not its name. |
 * | tech | constellation-motif, poster-motif, enterprise-motif | tech's own gradient-field glow (constellation) pairs with insight's sibling glow family, plus enterprise's precise grid for the "engineered" register — never organic/hand-drawn, which would undercut the precision identity |
 * | runway | *(none — settled decision, see module doc above)* | typography-only is the adjudicated look; no candidate set |
 * | stage | *(none — undecorated black field, 2026-08-21)* | 无框 is the identity; no candidate set |
 * | journal | corner-ornament-motif, heritage-motif, rail-motif | journal/heritage/luxe share a "thin printed line" family (see luxe's own entry below) — after the editorial-group reskin (2026-08-20) journal sits at the "masthead rules" end and heritage at "classic emblem", the two split by line discipline rather than by corner vs. edge (journal runs its rules full width, heritage breaks its double rule around a seal); rail's progress track is the third, plain-geometry option |
 * | enterprise | enterprise-motif, banner-motif, rail-motif | enterprise's Swiss-grid IKB identity pairs only with the other minimal geometric-line motifs (banner's grid, rail's arc) — organic/wash/ornamental families would visibly clash with its industrial-design register |
 * | luxe | luxe-motif, heritage-motif, corner-ornament-motif | luxe/heritage/journal all draw from the same thin-printed-line family — luxe at the "gilt minimal" end, heritage at "classic emblem", journal at "masthead rules" (retitled by the editorial-group reskin, 2026-08-20) |
 * | campaign | campaign-motif *(singleton)* | campaign's saturated multi-hue crayon/brush vocabulary has no sibling anywhere in the other 12 motifs — pairing it with grid lines, watercolor wash, or gold hairlines would break its "活力营销" identity rather than vary it, so it is deliberately left alone (candidate set of 1 — same-deck renders stay byte-identical to before this task, see `motif-selection.test.ts`'s byte-inertness block) |
 * | classroom | classroom-motif *(singleton)* | soft-group reskin (2026-08-20): the pair this row used to name (`classroom-motif`, `bloom-motif`) no longer exists — `bloom-motif`'s watercolor vocabulary retired with bloom's own palette, and its file was deleted outright, because bloom became a declared palette preset of classroom (`themes/bloom.ts`) and no third theme ever borrowed it. What is left is one legal-pad vocabulary (top punch holes, a pencil dashed line, a paperclip arc) shared by the two themes that are now the same design in two palettes, so there is nothing left to rotate *between*. Chapter still draws nothing (`return null`) — classroom/bloom's chapter background is a full-bleed `primary` band and this motif's muted/accent inks measure 1.04-1.55:1 against it, which is invisible, not restrained. |
 * | bloom | classroom-motif *(singleton)* | mirror of classroom's row above, and now literally the same motif: bloom is classroom's palette preset, so it draws classroom's geometry in bloom's own five colors. `MOTIF_CANDIDATES`'s anchor-first invariant still holds — `THEME_DEFINITIONS.bloom.motif` is `"classroom-motif"` too. |
 * | ink | ink-motif *(singleton)* | ink's calligraphy/seal-stamp/vertical-inscription vocabulary is the most culturally-specific motif in the set with no sibling family — any other motif substituted in would read as a mismatched skin rather than a variation, so it stays a candidate set of 1 (byte-identical, same rationale pattern as campaign) |
 * | heritage | heritage-motif, luxe-motif, corner-ornament-motif | heritage anchors the thin-printed-line family (classic emblem end), luxe (gilt minimal) and journal's masthead rules are its closest siblings. The editorial-group reskin (2026-08-20) handed the corner-ornament vocabulary itself to heritage — journal stopped drawing corner brackets, so the two no longer share a mark, only a register. |
 * | pulse | pulse-motif *(singleton)* | themes-16 wave, task T1 (2026-07-28): pulse's thin ECG pulse-line + capsule/cell-dot vocabulary is its own new technique family with no sibling among the other 13 motifs (not organic-blob like classroom/bloom, not thin-ornamental-line like journal/heritage/luxe, not grid-geometry like consulting/enterprise) — pairing it with any existing motif would read as a mismatched skin rather than a variation, so it stays a candidate set of 1 (same rationale pattern as campaign/ink) |
 * | terra | terra-motif *(singleton)* | themes-16 wave, task T2 (2026-07-28): terra's topographic contour-line + leaf-vein/seed-dot vocabulary is its own new technique family — closer to classroom/bloom's organic register than to any grid or ornamental-line family, but its lines are irregular *closed terrain rings* (a land/growth reading), not smooth color blobs or watercolor wash, so pairing it with classroom/bloom would still read as a mismatched skin. Stays a candidate set of 1 (same rationale pattern as pulse/campaign/ink) |
 * | ember | ember-motif *(singleton)* | themes-16 wave, task T3 (2026-07-28): ember's rising-spark-particle vocabulary (dots fading along an ascending bezier arc) is its own new technique family — a directional motion mark, not a static blob/ornament/grid/glow like any of the other 15 motifs, so no existing motif reads as a compatible sibling. Stays a candidate set of 1 (same rationale pattern as pulse/terra/campaign/ink) |
 * | vermilion | vermilion-motif *(singleton)* | gov-theme wave (2026-08-06): vermilion's flag-ribbon-arc + gold-ray-fan vocabulary is its own new technique family — a filled tapering ribbon along an ascending bezier plus a radiating thin-line ray fan, reading as ceremonial "提气/庄重" official-report identity. Not a static blob/ornament, not a grid/glow, not ember's fading particle trail — no existing motif reads as a compatible sibling, and its deliberately-restrained CJK-official register would clash with any of the other 16. Stays a candidate set of 1 (same rationale pattern as pulse/terra/ember/campaign/ink) |
 * | crayon | crayon-motif *(singleton)* | kids-education theme (2026-08-21): crayon's crayon-smear edge + sun doodle + rainbow dashes + star-sticker vocabulary is its own new technique family — a heavy page-edge crayon stroke, not campaign's confetti field, not classroom's legal-pad punch holes. Pairing it with either would read as a mismatched skin rather than a variation, so it stays a candidate set of 1 (same rationale pattern as campaign/classroom/ink). |
 * | arena | arena-motif *(singleton)* | 2026-08-21: arena's HUD-bracket + speed-line vocabulary is its own new technique family — corner brackets, 45° edge streaks, a segmented energy bar. Campaign's confetti and tech's constellation chain are the nearest neighbours by scene, not by mark, so pairing either in would read as a mismatched skin rather than a variation. Stays a candidate set of 1 (same rationale pattern as campaign/ink/pulse/terra/ember/vermilion) |
 * | swiss | swiss-motif *(singleton)* | 2026-08-21 wave7: swiss's 12px top edge bar + three right-margin ticks is its own new technique family — a page-edge stamp, not vermilion's gold-rule file header, not enterprise's IKB square steps, not tech's constellation chain. Pairing any of those in would read as a mismatched skin rather than a variation. Stays a candidate set of 1 (same rationale pattern as campaign/ink/pulse/terra/ember/vermilion/crayon/arena) |
 *
 * `tone-adaptive-motif` — the 13th registered motif — is
 * deliberately absent from every candidate set above: its own source header
 * describes it as an almost-invisible full-page tint used as a
 * theme-agnostic *fallback* texture, not a themed decorative mark. Adding it
 * anywhere would reduce a page's visible motif to "nothing" some fraction of
 * the time, which is the opposite of this task's goal (make cross-page
 * decor variety a visible, positive signal, not a coin flip toward blank).
 *
 * ## Contrast safety
 *
 * Two independent nets, checking two different things — neither one alone
 * is the whole story, and conflating them was this task's own review-round
 * Major/Moderate mistake (below):
 *
 * 1. **Does a candidate motif make *other* page text unreadable?**
 *    `motif-candidate-contrast.test.ts`'s first sweep runs the existing
 *    `findContrastIssues`/`auditDeck` machinery against every candidate —
 *    but that machinery only ever grades *text*, and a motif's arc/grid/
 *    stroke is not text. So this sweep can prove decor never breaks *other*
 *    text — it structurally cannot prove decor is itself visible against its
 *    own background. (Which decor *shapes* count as a background for other
 *    text is a separate question, and no longer a blanket exclusion:
 *    `fix/decor-contrast-attribution` admits a decor `rect`/`circle`/
 *    `ellipse` whose registered geometry is its painted outline, and keeps
 *    `path`/`polygon` out — see `findContrastIssues`'s own doc comment.)
 * 2. **Does a candidate motif's own decor render invisibly against its own
 *    background?** A distinct question, added by `motif-candidate-contrast
 *    .test.ts`'s second sweep (review fix round, Moderate finding). The
 *    worked example below is now history rather than live code — the
 *    editorial-group reskin (2026-08-20) retired `banner-motif`'s chapter
 *    branch outright (it draws nothing on chapter now, because two of its
 *    three consumer themes paint their chapter ground in the very token the
 *    rules are drawn with, measuring 1.00:1) — but the defect class it
 *    describes is exactly why that measurement gets taken. Every
 *    motif's own "零 hex 纪律" (zero baked hex, colors read off `ctx`) means
 *    a shared token like `ctx.colors.primary`/`border` naturally adapts to
 *    whichever theme is rendering — but `banner-motif`/`rail-motif`'s
 *    chapter branches used to be a **documented exception** to that
 *    discipline: a literal `"#FFFFFF"`, tuned only for their own anchor
 *    theme's dark chapter background (`consulting`/`academic`). Once this
 *    task made those two motifs *candidates* for other themes too
 *    (`enterprise`, chapter bg `#FFFFFF`; `journal`, chapter bg `#FAF7F2`),
 *    the literal became invisible white-on-(near-)white — a real defect
 *    sweep 1 above could never have caught (its own `<g data-decor>`
 *    exclusion), caught instead by a human reviewer and now fixed:
 *    both branches derive their ink from `readableOn(ctx.defaultBg ??
 *    ctx.colors.bg)` (`../ink.ts`) instead of a hard-coded literal — see
 *    each source file's own doc comment for the byte-identity proof that
 *    their own anchor theme's render is unchanged. Chart-palette rotation's
 *    own separate leak into this same "shared `ctx` token" hazard (`ctx
 *    .colors.chartPalette` briefly rotated in place, silently repainting
 *    `campaign-motif`/`classroom-motif`'s *unrelated*
 *    decorative reads of that token) is `../chart-palette.ts`'s own
 *    "Consumption seam" section, not repeated here.
 *
 * `motif-candidate-contrast.test.ts`'s second sweep is the durable
 * regression net for defect class 2 — every candidate's own decor must clear
 * a small but nonzero visibility floor against its real background,
 * wherever it renders anything at all (`classroom-motif` `return null`s on
 * `chapter` entirely, pre-dating this task — see the `classroom`/`bloom`
 * table rows' own disclosure — correctly not flagged by either sweep:
 * nothing rendered is not the same failure as something rendered
 * invisibly). No candidate needed removal from this table — every
 * fix landed at the motif's own consumption seam instead. Recorded here per
 * 控制者裁决 §4's re-pin discipline, so a future reviewer doesn't have to
 * re-derive "was this checked, and for which defect class" from git blame.
 */
import type { PptxIR, Slide } from "@/ir"
import type { CanonicalThemeId } from "../themes"
import { getThemeDefinition } from "../themes/definitions"
import type { MotifId } from "./motifs/types"
import { cachedDeckSeed, weightedPickBySeed } from "./variety"

/**
 * Same 3:1 ratio as `layout-selection.ts`'s `TENDENCY_WEIGHT`/`BASE_WEIGHT`
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
 * `runway` and `stage` have no entry (their own motif is `undefined` by
 * settled design, nothing to rotate).
 */
export const MOTIF_CANDIDATES: Partial<Record<CanonicalThemeId, readonly MotifId[]>> = {
  consulting: ["banner-motif", "rail-motif", "enterprise-motif"],
  insight: ["poster-motif", "constellation-motif"],
  academic: ["rail-motif", "banner-motif", "corner-ornament-motif"],
  tech: ["constellation-motif", "poster-motif", "enterprise-motif"],
  // runway, stage: intentionally absent — see module header.
  journal: ["corner-ornament-motif", "heritage-motif", "rail-motif"],
  enterprise: ["enterprise-motif", "banner-motif", "rail-motif"],
  luxe: ["luxe-motif", "heritage-motif", "corner-ornament-motif"],
  campaign: ["campaign-motif"],
  classroom: ["classroom-motif"],
  bloom: ["classroom-motif"],
  ink: ["ink-motif"],
  heritage: ["heritage-motif", "luxe-motif", "corner-ornament-motif"],
  pulse: ["pulse-motif"],
  terra: ["terra-motif"],
  ember: ["ember-motif"],
  vermilion: ["vermilion-motif"],
  crayon: ["crayon-motif"],
  arena: ["arena-motif"],
  swiss: ["swiss-motif"],
}

/**
 * Resolve which motif id `slide` (the `index`-th page of `ir`)
 * should draw its decor with. Mirrors `layout-selection.ts`'s
 * `resolveEffectiveLayoutId` signature/posture for the same reason: a single
 * authoritative function callable from both the render path
 * (`full-slide-svg.tsx`) and tests/tooling (`motif-candidate-contrast.test.ts`)
 * that want to know a page's pick without re-deriving the salt logic.
 *
 * - `ir.theme.id` has no entry in {@link MOTIF_CANDIDATES} (a registered/
 *   custom theme, an unrecognized id, or `runway` / `stage`): falls back to
 *   `getThemeDefinition(ir.theme.id).motif` directly — the exact
 *   pre-this-task behavior, so every theme outside the builtins (and the
 *   two none identities within them) renders byte-identically to before
 *   this module existed.
 * - A 1-member candidate set (`campaign`, `ink`, `classroom`, `bloom`,
 *   crayon, arena, and every themes-16/gov-theme singleton): `weightedPickBySeed`
 *   always returns that single member regardless of seed/pageKey — also
 *   byte-identical to before this task (see `motif-selection.test.ts`'s
 *   byte-inertness block).
 * - A 2-3 member set: `weightedPickBySeed` salted on
 *   `` `motif:${pageKey}` `` (`pageKey` = `slide.id ?? String(index)`, the
 *   exact same stable-id-preferred convention `layout-selection.ts` uses),
 *   weighted `MOTIF_ANCHOR_WEIGHT` for the anchor and `MOTIF_BASE_WEIGHT`
 *   for every other member. No cross-page state is read or written — unlike
 *   layout selection's adjacent anti-repetition, a motif pick depends only
 *   on this one page's own `(theme, seed, pageKey)` triple, so a deck's
 *   motif picks are trivially revision-stable without needing a deck-wide
 *   fold or cache the way `resolveDeckEffectiveLayoutIds` needs one.
 */
export function resolveMotifId(ir: PptxIR, slide: Slide, index: number): MotifId | undefined {
  const themeDef = getThemeDefinition(ir.theme.id)
  const candidates = MOTIF_CANDIDATES[ir.theme.id as CanonicalThemeId]
  if (!candidates || candidates.length === 0) return themeDef.motif
  const pageKey = slide.id ?? String(index)
  return weightedPickBySeed(cachedDeckSeed(ir), `motif:${pageKey}`, candidates, (id) =>
    id === candidates[0] ? MOTIF_ANCHOR_WEIGHT : MOTIF_BASE_WEIGHT,
  )
}
