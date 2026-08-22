// @vitest-environment node
//
// The equivalence-proof hard gate (vocabulary-v4 rename, task 1, spec §10/
// §12): a v3 deck migrated through `migrateIrV3ToV4` must render byte-for-
// byte identical SVG and PPTX output to what the *same* deck rendered on
// the pre-rename codebase (base commit 0511b8c, before any vocabulary-v4
// change landed).
//
// Durable form: `../ir/__fixtures__/equivalence-golden/*.json` is a one-time
// capture of that base-commit render (see the task-1 report for the capture
// method — a temporary script, deleted before this commit, that ran
// `V3_EQUIVALENCE_DECKS` through the pre-rename `PptxIRSchema` +
// `renderSlideSvg` + `generatePptxBlob` and wrote the output here). This
// test replays the exact same fixtures through the post-rename pipeline —
// `PptxIRV3Schema.parse` → `migrateIrV3ToV4` → the (now v4-only) render
// chain — and asserts the output is unchanged from that golden capture. A
// regression here means either the migration function or a render consumer
// silently changed behavior, not just vocabulary — the spec §10 violation
// this whole task's discipline exists to catch.
//
// PPTX comparison excludes `docProps/core.xml` (pptxgenjs bakes
// `new Date().toISOString()` into it on every export — the one genuinely
// nondeterministic zip part, unrelated to this task) — the same normalized-
// zip-map method `src/pptx/generate-notes-export.test.ts` already
// established for this repo's byte-comparison tests.
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import JSZip from "jszip"
import { PptxIRV3Schema } from "./legacy-v3"
import { migrateIrV3ToV4 } from "./migrate"
import { V3_EQUIVALENCE_DECKS } from "./__fixtures__/v3-equivalence-decks"
import { renderSlideSvg } from "@/api"
import { generatePptxBlob } from "@/pptx/generate"
import { auditDeck } from "@/svg/audit/deck-audit"
import { installNodePlatform } from "@/platform/node"

const GOLDEN_DIR = new URL("./__fixtures__/equivalence-golden/", import.meta.url)

function readGoldenJson<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`${name}.json`, GOLDEN_DIR), "utf-8")) as T
}

async function normalizedZipMap(blob: Blob): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const entries = Object.keys(zip.files)
    .filter((p) => !zip.files[p]!.dir && p !== "docProps/core.xml")
    .sort()
  const out: Record<string, string> = {}
  for (const p of entries) out[p] = await zip.files[p]!.async("string")
  return out
}

describe("v3 → v4 migration equivalence (task 1 hard gate, spec §10/§12)", () => {
  installNodePlatform()

  for (const [name, rawV3] of Object.entries(V3_EQUIVALENCE_DECKS)) {
    describe(name, () => {
      const v3 = PptxIRV3Schema.parse(rawV3)
      const v4 = migrateIrV3ToV4(v3)

      // Recaptured (P1 variety wave, task 3 — cover/chapter/ending strategy
      // soft-weighting + the pyramid/briefing content layoutTendencies
      // re-derivation). None of these three decks pin every identity page's
      // `layout`, so weighting the previously-uniform cover/chapter/ending
      // auto-pick can legitimately flip which layout a given seed lands
      // on — a real, intended selection-behavior change, not a migration
      // regression. Verified via a targeted diff against the pre-recapture
      // goldens (`.svg.json`/`.pptx-zip.json` only — `.audit.json` needed no
      // recapture, the newly-picked layouts introduce no new findings on
      // any of these three fixtures). Only these specific slides change,
      // every other slide (including every explicitly `layout`-pinned
      // ending) stays byte-identical to the pre-task-3 golden:
      //   - `basic`: slide index 3 (content page "At a glance", auto-picked
      //     — briefing's re-derived content set swapped `bento-panel` for
      //     `rail-numbered`, shifting this seed's pick to
      //     `tone-adaptive-content`).
      //   - `scenarioBearing`: slide indices 0 and 4 (cover + ending, both
      //     auto-picked — storytelling's new identityTendencies pulling
      //     this seed onto `editorial-masthead`/`poster-ending`).
      //   - `annualReviewPreset`: slide index 1 (chapter, auto-picked —
      //     storytelling's new identityTendencies pulling this seed onto
      //     `banner-chapter`).
      //
      // Re-recaptured (P1 variety wave, task 4 — content-pool expansion, 7
      // -> 10 new layouts side-highlight/asymmetric-triptych/quiet-frame,
      // plus their strategy `layoutTendencies`/beat `BEAT_TENDENCIES`
      // placement). None of these three decks pin every content page's
      // `layout` either, so a pool-wide reweighting can legitimately flip
      // which layout a given seed's auto-pick lands on — the same
      // "real, intended selection-behavior change, not a migration
      // regression" posture as the task-3 recapture above. Verified via the
      // identical targeted-diff discipline: `.audit.json` needed no
      // recapture for any of the three (findings stayed the empty array on
      // both sides — the newly-picked layouts introduce no new
      // findings). Exactly the same two slide indices changed in all three
      // fixtures, nothing else:
      //   - `basic`: slide indices 2 and 3 (content pages, both auto-picked
      //     — `bento-panel` -> `stacked-poster`, `tone-adaptive-content` ->
      //     `two-column`).
      //   - `scenarioBearing`: slide indices 2 and 3 (content, auto-picked
      //     — `tone-adaptive-content` -> `rail-numbered`, `stacked-poster`
      //     -> `quiet-frame`).
      //   - `annualReviewPreset`: slide indices 2 and 3 (content,
      //     auto-picked — `banner-heading` -> `narrow-column`, `two-column`
      //     -> `stacked-poster`).
      //
      // Re-recaptured again (P1 variety wave, task 4 fix round — reviewer
      // Minor-1, quiet-frame's single-component symmetry fix): `content-
      // quiet-frame.tsx` now narrows+re-centers its content rect for
      // exactly 1 non-full-body component (640px, was the full 880px
      // symmetric rect) — a real, intended geometry fix, not a migration
      // regression. `scenarioBearing`'s own slide index 3 (the
      // `quiet-frame` content page landed above, exactly 1 paragraph
      // component) is the only slide in any of the three fixtures affected
      // — verified via the same targeted-diff discipline: `basic`/
      // `annualReviewPreset` are untouched by this recapture (neither has a
      // 1-component quiet-frame page), and `.audit.json` needed no
      // recapture (findings stayed the empty array).
      //
      // Re-recaptured again (bold-metrics fix, 2026-07-24 — svg-text-
      // layout.ts's weight/face-aware `measureTextUnits`): a heading's
      // rendered `<text>` carrying `font-weight >= 600` under a real Bold-
      // exporting font now sizes against that font's real Bold advance
      // width, not the pre-fix Regular-only calibration (root-cause.md,
      // this fix's own investigation — the fix this whole task exists
      // for). `annualReviewPreset`'s slide index 3 (`stacked-poster`
      // chapter, `journal` theme -> SimSun heading) is the only slide in
      // any of the three fixtures affected: its bold SimSun heading "A
      // quarter of steady wins" (`fontWeight="800"`) was fitting on one
      // line at fontSize 64 under the old unweighted estimate; the new
      // SimSun/KaiTi-aware estimate (this fix's item 2 -- the face's own
      // Regular-weight space/other gap, folded in regardless of bold --
      // plus its conservative-proxy Bold `lowerDigit` factor) now wraps it
      // to two ("A quarter of" / "steady wins") at the same fontSize 64 --
      // a real, intended shrink-safety change, not a migration regression.
      // Verified via the same targeted-diff discipline as every prior
      // recapture above: `basic`/`scenarioBearing` are untouched (neither
      // lands a bold Georgia/YaHei/SimSun/KaiTi heading close enough to its
      // budget for this fix to move), the only difference anywhere in
      // `annualReviewPreset`'s SVG/PPTX goldens is this one heading's line
      // count and font-family-local geometry it displaces (the quote
      // block's `data-audit-box`/`data-audit-rect` y-coordinates shift down
      // to make room), and `.audit.json` needed no recapture (findings
      // stayed the empty array both sides).
      //
      // Re-recaptured a third time (bold-metrics fix round 2, same date --
      // controller-ordered upgrade from a class-average-plus-margin model
      // to an exact per-character advance model for Georgia/YaHei, after a
      // review found real headings that clipped straight through the
      // margin; see svg-text-layout.ts's EPITAPH comment). SimSun/KaiTi
      // were not upgraded to an exact model (that face's Latin glyphs have
      // zero measured per-character variance -- no class-average gap to
      // close the way Georgia/YaHei had one -- see `SIMSUN_KAITI`'s own
      // comment for the full argument), but did lose the same round-1
      // margin on `lowerDigit` that Georgia/YaHei's classes lost --
      // reverting it to the verbatim conservative-proxy factor undoes
      // exactly the previous recapture above: "A quarter of steady wins"
      // fits back onto one line at fontSize 64, matching what the
      // *original*, pre-round-1 golden had (round 1 wrapped it to two,
      // round 2 un-wraps it back to one -- not a coincidence: `SIMSUN_
      // KAITI`'s `lowerDigit` factor is 1.048 verbatim both before round 1
      // and again now, only round 1's brief middle state multiplied it by
      // the now-retired 1.2 margin). Same targeted-diff discipline: slide
      // index 3 is the only change anywhere in any of the three fixtures'
      // SVG/PPTX goldens, and `.audit.json` needed no recapture -- verified
      // by directly computing `auditDeck` fresh and JSON-comparing it
      // against both the old and new goldens (`true` both times), not just
      // "this file wasn't touched by the diff."
      //
      // Re-recaptured again (theme-structure wave, task T2 --
      // `.issues/2026-07-26-theme-structure/plan.md`): `consulting` and
      // `journal` (the two themes these three fixtures use) both picked up
      // a `layoutTendencies` declaration on cover/chapter/ending
      // (`../themes/definitions.ts`'s `LAYOUTS` table) -- a real, intended
      // selection-behavior change (design decision 2's whole point: the
      // theme layer is now a live weighting input to auto-picked
      // cover/chapter/ending layouts), not a migration regression. None
      // of these three decks pins every identity page's `layout`, so
      // reweighting the pool can legitimately flip a given seed's pick --
      // same posture as every recapture above. Exactly one slide changed
      // in each fixture (verified via a targeted-diff script, not just
      // "this file wasn't touched"):
      //   - `basic` (`consulting`): slide index 1 (chapter, auto-picked) --
      //     `masthead-chapter` -> `banner-chapter`, consulting's own
      //     declared chapter tendency landing directly.
      //   - `scenarioBearing` (`journal`): slide index 4 (ending, auto-
      //     picked) -- `poster-ending` -> `constellation-ending`. Not
      //     journal's own declared id (`masthead-ending`) -- a mechanical
      //     side effect of the same declaration: bumping `masthead-ending`'s
      //     weight 1 -> 3 grows the ending pool's total weight from 11 to
      //     13 (the pool already carries two weight-3 members from the
      //     strategy layer's own `identityTendencies`, so the base is 11,
      //     not the 7 an earlier draft of this comment stated),
      //     which shifts where this fixed seed's `target = hash % total`
      //     lands among the *other* candidates' boundaries too (the same
      //     modulo-reshuffle every weight-sum change in this pipeline can
      //     cause -- not an independent defect).
      //   - `annualReviewPreset` (`journal`): slide index 1 (chapter,
      //     auto-picked) -- `banner-chapter` -> `rail-chapter`, the same
      //     total-weight-shift mechanism as above (journal's declared
      //     `masthead-chapter` weight bump moves the chapter pool's total
      //     from 12 to 14 -- same correction as above, the strategy layer's
      //     own weight-3 members are part of the base).
      // `.audit.json` needed no recapture for any of the three (findings
      // stayed the empty array both sides, confirmed by computing
      // `auditDeck` fresh against both the old and new goldens) -- the
      // newly-picked layouts introduce no new geometry/contrast defect
      // on any of these three fixtures.
      //
      // Re-recaptured again (content-layout expansion wave, task T1 --
      // `.issues/2026-07-26-content-archetypes/plan.md`): registering an
      // 11th content layout (`image-lead-split`) grows the content
      // pool's weighted-sampling denominator on every theme that curates
      // the full set (`consulting`/`journal`, the two themes these three
      // fixtures use, both do) -- the same "real, intended selection-
      // behavior change, not a migration regression" posture as every pool-
      // growth recapture above (P1 variety wave task 4's own 7 -> 10
      // recapture is the direct precedent). None of these three decks pins
      // every content page's `layout`, so a pool-wide reweighting can
      // legitimately flip which layout a given seed's auto-pick lands
      // on. Verified via the same targeted-diff discipline: `.audit.json`
      // needed no recapture for any of the three (findings stayed the
      // empty array both sides) -- `image-lead-split` itself was never the
      // layout any of these three fixtures' seeds actually landed on;
      // the shift is purely the denominator changing which of the
      // *existing* 10 layouts each seed's hash lands on:
      //   - `basic`: slide index 2 (content, auto-picked) --
      //     `stacked-poster` -> `tone-adaptive-content`; slide index 3
      //     (content, auto-picked) -- `two-column` -> `stacked-poster`.
      //   - `scenarioBearing`: slide index 1 (content, auto-picked) --
      //     `stacked-poster` -> `bento-panel`; slide index 2 (content,
      //     auto-picked) -- `rail-numbered` -> `narrow-column`.
      //   - `annualReviewPreset`: slide index 2 (content, auto-picked) --
      //     `narrow-column` -> `quiet-frame`.
      //
      // Re-recaptured again (content-layout expansion wave, task T2 --
      // `.issues/2026-07-26-content-archetypes/plan.md`): registering a
      // 12th content layout (`split-band`) grows the content pool's
      // weighted-sampling denominator again, on the same two full-set
      // themes (`consulting`/`journal`) as every prior pool-growth
      // recapture -- same "real, intended selection-behavior change"
      // posture, not a migration regression. All three fixtures moved this
      // time (a first -- every prior pool-growth recapture above spared at
      // least one of the three):
      //   - `basic`: slide index 2 (content, auto-picked) --
      //     `tone-adaptive-content` -> `rail-numbered`; slide index 3
      //     (content, auto-picked) -- `stacked-poster` -> `split-band`.
      //     `split-band` itself *is* the actual landed pick here, the
      //     first of these three fixtures where the newly-registered
      //     layout is the seed's real choice, not just a denominator
      //     reshuffle onto an existing one.
      //   - `scenarioBearing`: slide index 1 (content, auto-picked) --
      //     `bento-panel` -> `narrow-column`; slide index 2 (content,
      //     auto-picked) -- `narrow-column` -> `side-highlight`.
      //     `split-band` was never this fixture's landed pick -- pure
      //     denominator reshuffle onto existing layouts, same
      //     mechanism as every prior pool-growth recapture.
      //   - `annualReviewPreset`: slide indices 2 and 3 (content,
      //     auto-picked) -- `quiet-frame` -> `image-lead-split`,
      //     `stacked-poster` -> `asymmetric-triptych`. `split-band` was
      //     never this fixture's landed pick either.
      //
      // Unlike every prior pool-growth recapture, `.audit.json` *did* need
      // recapturing for one of the three: `annualReviewPreset`'s
      // re-landed `image-lead-split` page has 3 `kpi_cards` items sharing
      // its 435px text column (a pre-existing, review-approved T1
      // behavior, not something this task touches), and one card's
      // "average order value" label now truncates to "average …" at that
      // column's narrower per-card width -- a real `content-truncated`
      // finding, not a migration artifact. `basic`/`scenarioBearing`'s own
      // `.audit.json` needed no *content* recapture (`findings: []` both
      // sides, before and after -- only JSON pretty-printing whitespace
      // differs, an artifact of the recapture script's own
      // `JSON.stringify(..., null, 2)` versus whatever formatting produced
      // the pre-existing golden, not a behavior change). Verified via the
      // same targeted-diff discipline as every recapture above: the one
      // `content-truncated` finding is the *only* change anywhere in
      // `annualReviewPreset.audit.json` (`findings: []` -> one
      // `content-truncated` entry, `pagesAudited`/`pagesSkipped`/`checks`
      // all unchanged), and `content-truncated` is the pool's own
      // established "graceful degradation, not a rendering bug" signal
      // (`ir-quality`/`deck-audit.ts`'s documented distinction from
      // `overflow`/`out-of-bounds`/`overlap` -- the same three codes
      // `content-split-band.test.tsx`'s own pathological-content sweep
      // asserts zero of, deliberately excluding this one) -- there is
      // nothing to fix in the renderer here, this is the labeling
      // convention working as designed on a slide shape T1's own review
      // already accepted.
      //
      // Re-recaptured again (controller-probed follow-up fix round —
      // `content-image-lead-split.tsx`'s "starved" branch): the
      // `content-truncated` finding pinned directly above turned out to be
      // a real structural defect after all, not just an accepted labeling
      // convention — `image-lead-split`'s unconditional 435px text column
      // squeezed this exact kpi_cards-only page for no reason, since it has
      // no scalable (image/chart) lead component to justify narrowing
      // beside a real visual column. The layout now widens the text
      // column to 788px (and shrinks the decorative visual column to a
      // 260px accent panel) whenever there is no scalable lead — see that
      // file's own header for the full rationale and the skeleton-diversity
      // check that the widened width doesn't collide with an existing
      // layout's own region class. Only `annualReviewPreset`'s slide
      // index 2 is affected across all three fixtures (the only slide, in
      // any of them, that actually lands on `image-lead-split` with no
      // scalable lead — confirmed by diffing all 5 slides of each fixture's
      // recaptured SVG golden against its pre-recapture version, only this
      // one changed anywhere). `.audit.json`'s one `content-truncated`
      // finding goes back to `findings: []` (the label no longer truncates
      // at the widened per-card width); `.pptx-zip.json`'s file-name set is
      // unchanged, only that same slide's XML differs.
      //
      // Re-recaptured again (declaration-rebalance wave —
      // `.issues/2026-08-03-declaration-rebalance/plan.md`): consulting's
      // cover/ending and journal's chapter/ending each gained a second
      // `layoutTendencies` id (`../themes/definitions.ts`'s `LAYOUTS`
      // table) to fix the two axes each theme had silently dead under the
      // default `briefing` strategy — a real, intended selection-behavior
      // change (the whole point of the wave), not a migration regression.
      // Same "reweighting a pool a fixed seed's hash lands in can flip an
      // auto-pick" posture as every weight-table recapture above. Exactly
      // one slide changed in two of the three fixtures, the third
      // untouched (confirmed by diffing all 5 slides of each fixture's
      // recaptured SVG golden against its pre-recapture version):
      //   - `basic` (`consulting`): slide index 0 (cover, auto-picked) —
      //     `constellation` -> `banner-title`. Not `left-anchor` itself
      //     (the newly-appended id) — a mechanical side effect of the same
      //     append: bumping `left-anchor`'s weight 1 -> 3 grows the cover
      //     pool's total weight from 12 to 14, which shifts where this
      //     fixed seed's `target = hash % total` lands among the *other*
      //     candidates' boundaries too (the same modulo-reshuffle
      //     mechanism the theme-structure wave's own T2 recapture comment
      //     above already documents for `scenarioBearing`/
      //     `annualReviewPreset`).
      //   - `scenarioBearing` (`journal`): no change — this fixture's own
      //     cover/chapter/ending seeds don't happen to cross any of the
      //     three axes' new weight boundaries.
      //   - `annualReviewPreset` (`journal`): slide index 1 (chapter,
      //     auto-picked) — `rail-chapter` -> `tone-adaptive-chapter`. This
      //     *is* one of the two ids appended to journal's own `chapter`
      //     tendency (`["masthead-chapter", "roman-chapter",
      //     "tone-adaptive-chapter"]`) landing directly, not a reshuffle
      //     onto an unrelated existing layout.
      // `.audit.json` needed no recapture for any of the three (findings
      // stayed byte-identical, confirmed by computing `auditDeck` fresh
      // against both the old and new goldens) — neither newly-landed
      // layout introduces a new geometry/contrast finding on either
      // fixture. `.pptx-zip.json`'s file-name set is unchanged for all
      // three; only `basic`'s `ppt/slides/slide1.xml` and
      // `annualReviewPreset`'s `ppt/slides/slide2.xml` (1-indexed,
      // matching SVG slide 0 / slide 1 above) differ.
      // Recaptured (visual review round 1, 2026-08-15): `quote.tsx`'s
      // decorative open-quote mark used to reserve its own *baseline* plus a
      // gap above the first body line (`QUOTE_ZONE` 60 against a mark
      // baseline of 44), but a quotation glyph carries its ink high in the
      // em box, so the mark floated far above the text it opens — flagged on
      // every quote page the review saw. `QUOTE_ZONE` is now sized off the
      // mark's ink (34, baseline 40).
      // `scenarioBearing` and `annualReviewPreset` each carry one quote
      // slide, so each has exactly one changed slide (SVG slide 1 / slide 3;
      // PPTX `slide2.xml` / `slide4.xml`, 1-indexed). Targeted diff against
      // the pre-recapture goldens, same discipline as every recapture above:
      // the *only* changes anywhere in either fixture are that mark's
      // `y` 44 → 40, the body/attribution baselines moving up 26px with
      // `QUOTE_ZONE`, and the enclosing block's own `y` shifting by the
      // ~9.9px `distributeSurplus` redistributes once the block measures
      // shorter — plus the matching `<a:off>` y values in the PPTX. No other
      // element, attribute, or file changed; `.audit.json` needed no
      // recapture for any of the three (findings byte-identical, the shift
      // introduces no new geometry or contrast finding), and `basic` needed
      // no recapture at all (it has no quote component).
      //
      // Re-recaptured again (theme-redesign wave, ink v3 —
      // `.issues/2026-08-18-theme-redesign/ink/decisions.md`): registering a
      // 9th cover layout (`colophon`, `@/svg/layouts/cover-colophon.tsx`)
      // grows the cover pool's weighted-sampling denominator on every theme
      // that curates the full set — which is all 17 — so a fixed seed's
      // `target = hash % total` lands on a different candidate. Exactly the
      // same "real, intended selection-behavior change, not a migration
      // regression" mechanism as the content-pool growths above
      // (image-lead-split / split-band), just on the cover axis, and the
      // first time it has hit that axis. **This is a wide change, not a
      // narrow one** — measured across all 17 themes × 40 seeds, 505 of 640
      // non-ink cover picks move (see the wave's own report); the three
      // fixtures here are simply three of them. Neither fixture theme is
      // `ink`, so none of the ink v3 token/motif work is visible in these
      // goldens at all.
      //
      // Exactly one slide changed in each of the three (index 0, the cover;
      // PPTX `ppt/slides/slide1.xml`), verified by diffing all 5 slides of
      // each fixture's recaptured SVG golden against its pre-recapture
      // version:
      //   - `basic` (`consulting`): `banner-title` -> `left-anchor`.
      //   - `scenarioBearing` (`journal`): `editorial-masthead` ->
      //     `tone-adaptive-header`.
      //   - `annualReviewPreset` (`journal`): `banner-title` ->
      //     `tone-adaptive-header`.
      // `colophon` itself is never any of the three seeds' landed pick —
      // pure denominator reshuffle onto existing layouts, same as most
      // prior pool-growth recaptures. `.audit.json` needed no recapture for
      // any of the three (findings stayed the empty array, confirmed by
      // computing `auditDeck` fresh against both the old and new goldens).
      //
      // Re-recaptured again (theme-redesign wave, warm group —
      // `.issues/2026-08-18-theme-redesign/skins/group2-notes.md`):
      // `heritage-motif` was redrawn from three seed variants (corner
      // diamond studs / a centered emblem / page-edge vertical rules) into
      // one fixed bookplate border. `journal` carries `heritage-motif` in
      // its own rotation set (`@/svg/motif-selection`'s `MOTIF_CANDIDATES`
      // — `["corner-ornament-motif", "heritage-motif", "rail-motif"]`), so
      // the two `journal` fixtures here draw the new mark on whichever
      // pages their seed picks it for. A real, intended decor change on a
      // *borrowing* theme, not a migration regression — and the first
      // recapture in this file caused by a motif rather than by layout
      // selection.
      //
      // Targeted diff (`equiv-diff.mts`, the wave's own tool): the only
      // difference anywhere is inside `<g data-decor="true">` — stripping
      // that one group makes old and new byte-identical on every changed
      // slide, so no text, geometry or frame moved.
      //   - `basic` (`consulting`): untouched. consulting does not carry
      //     `heritage-motif` in its candidate set.
      //   - `scenarioBearing` (`journal`): slides 0, 3, 4
      //     (`ppt/slides/slide{1,4,5}.xml`).
      //   - `annualReviewPreset` (`journal`): slide 0
      //     (`ppt/slides/slide1.xml`).
      // `.audit.json` needed no recapture for any of the three (findings
      // stayed the empty array, confirmed by computing `auditDeck` fresh
      // against both the old and new goldens) — decor is not text, and the
      // new mark introduces no contrast or overflow defect.
      //
      // Re-recaptured again (theme-redesign wave, cool group —
      // `.issues/2026-08-18-theme-redesign/skins/group3-notes.md`):
      // `enterprise-motif` was redrawn from three seed variants (a 3x3
      // square grid / a left edge bar plus a corner square / two diagonal
      // squares) into one fixed mark — a top ruler with ticks, a stepped
      // run of three squares top-right, and a single accent square at the
      // lower left. `consulting` carries `enterprise-motif` in its own
      // rotation set (`@/svg/motif-selection`'s `MOTIF_CANDIDATES` —
      // `["banner-motif", "rail-motif", "enterprise-motif"]`), so the
      // `basic` fixture draws the new mark on whichever pages its seed
      // picks it for. Same posture as the warm group's `journal` recapture
      // above: a real, intended decor change on a *borrowing* theme, not a
      // migration regression.
      //
      // Targeted diff (`equiv-diff.mts`, the wave's own tool): the only
      // difference anywhere is inside `<g data-decor="true">` — stripping
      // that one group (nesting-aware, since a motif's own colour groups
      // now live inside it) makes old and new byte-identical on every
      // changed slide, so no text, geometry or frame moved.
      //   - `basic` (`consulting`): slides 0 and 4
      //     (`ppt/slides/slide{1,5}.xml`).
      //   - `scenarioBearing` / `annualReviewPreset` (`journal`):
      //     untouched. journal does carry `rail-motif` — also redrawn this
      //     wave — but neither fixture's seed picks it on any page.
      // `.audit.json` needed no recapture for any of the three (findings
      // stayed the empty array, recomputed fresh against both goldens).
      //
      // Re-recaptured again (theme-redesign wave, editorial group —
      // `.issues/2026-08-18-theme-redesign/skins/group5-notes.md`): all
      // three fixtures move this time, because all three are painted by a
      // theme this group reskins — `basic` runs on `consulting`,
      // `scenarioBearing` and `annualReviewPreset` on `journal`. Two things
      // changed and nothing else: every colour token in those two themes,
      // and the two motifs they anchor (`banner-motif` became three fixed
      // annotation rules, `corner-ornament-motif` became masthead rules and
      // stopped drawing corner brackets entirely).
      //
      // Targeted attribution (`.issues/2026-08-18-theme-redesign/skins/
      // tools/equiv-recapture.mts`, this group's own tool): cut two things
      // out of both the old and the new capture — the whole `<g data-decor>`
      // subtree (nesting-aware), and the *value* of every `fill=`/`stroke=`
      // attribute — and the two become byte-identical on all 15 slides of
      // all three fixtures. So no text moved, no geometry deformed, and no
      // element was added or dropped: the diff is paint and decor, which is
      // exactly what a reskin is allowed to be. `.audit.json` needed no
      // recapture for any of the three (findings stayed the empty array,
      // recomputed fresh against both goldens).
      //
      // Re-recaptured again (visual review round 3, C6 — the quote mark's
      // baseline, `.issues/2026-08-19-review-round-3/diagnosis.md`): the
      // decorative open-quote mark's baseline was a hand-tuned 40 justified
      // by a comment that guessed where the glyph's ink stops (0.42em above
      // its own baseline). The guess was wrong — rasterizing U+201C at 64px
      // on every theme's resolved body stack reads 0.48 to 0.55 — so the
      // mark's ink ended a full body line (30.5px measured) above the text
      // it opens. `MARK_BASELINE` is now derived from the measured ratio and
      // lands on 56, and the review's own page measures 15px of air instead
      // of 31px.
      //
      // Only the mark's own `<text>` moves: `measure()` never reads that
      // baseline, so the block's height, its position in the layout, and
      // every body/attribution baseline are untouched. Targeted attribution
      // (`.issues/2026-08-20-quote-mark-baseline/tools/equiv-quote-diff.mts`,
      // this wave's own tool — token-by-token over both the SVG and the
      // PPTX parts): token counts are identical everywhere, the PPTX part-
      // name set is identical, and the *only* differing token anywhere is
      //   - `scenarioBearing`: SVG slide 1 (`y="40"` -> `y="56"`) and
      //     `ppt/slides/slide2.xml` (one `<a:off>` y, 3119247 -> 3271647);
      //   - `annualReviewPreset`: SVG slide 3 (same attribute) and
      //     `ppt/slides/slide4.xml` (one `<a:off>` y, 2703767 -> 2856167).
      // Both EMU deltas are 152400 = exactly the 16px the baseline moved
      // (9525 EMU per px at this canvas). `basic` has no quote component and
      // was not recaptured at all, and `.audit.json` needed no recapture for
      // any of the three (recomputed fresh against both goldens — a mark
      // that moves 16px down inside its own block introduces no geometry or
      // contrast finding).
      //
      // Only `basic` recaptured (visual review round 4, C — the chapter
      // banner's accent rule, `../svg/layouts/chapter-banner-chapter.tsx`):
      // that rule was a fixed 160px dash sitting under the block, near
      // enough the text's width to read as an underline and too far below
      // it to be one. It is now an underline in fact — as wide as the line
      // it belongs to, offset from that line's baseline in units of its own
      // font size. `basic`'s slide index 1 is the only `banner-chapter` page
      // in any of the three fixtures, and it carries no subheading, so the
      // rule underlines its heading "Why an IR" instead. Targeted
      // attribution (token-by-token over both the SVG and every PPTX part,
      // `.issues/2026-08-20-review-round-4/tools/equiv-underline-diff.mts`):
      // token counts are identical everywhere, the PPTX part-name set is
      // identical, and the *only* differing tokens anywhere are
      //   - `basic`: SVG slide 1, that one `<line>` element (`x1` 560 -> 413,
      //     `x2` 720 -> 867, `y` 452 -> 432 — stroke, width and accent token
      //     all unchanged);
      //   - `basic`: `ppt/slides/slide2.xml`, that same line's `<a:off>`
      //     (5334000,4305300 -> 3933825,4114800) and `<a:ext>` (cx 1524000 ->
      //     4324350).
      // Every EMU value is exactly 9525 × the px it mirrors, so the export
      // moved by precisely what the SVG moved by and nothing else drifted.
      // `scenarioBearing`/`annualReviewPreset` are byte-identical and were
      // not recaptured (neither lands on `banner-chapter`), and
      // `.audit.json` needed no recapture for any of the three (recomputed
      // fresh against the goldens — a decorative rule that changes span and
      // offset introduces no geometry or contrast finding).
      //
      // Re-recaptured again (visual review round 4, the semantic-color wave
      // — "无论主题什么配色，这个总是红色"): all 17 themes now name their own
      // `danger`/`warning`/`success` instead of inheriting the built-in
      // `#DC2626`/`#16A34A`. Only `annualReviewPreset` moves, and only where
      // the *old* default was already being thrown away: `#16A34A` measured
      // 3.30:1 on journal's own card surface, so `kpi.tsx`'s `accessibleInk`
      // had been demoting both up-delta arrows to neutral `#0A0E14`.
      // Journal's own moss green (`#48664A`, 5.88:1 on that surface) clears
      // the bar, so the arrows keep the theme color instead. Targeted
      // attribution, same discipline as every recapture above (token-by-token
      // over both the SVG and the PPTX parts): token counts identical
      // everywhere, PPTX part-name set identical, and the *only* differing
      // tokens anywhere are the two arrow glyphs — SVG slide index 2's two
      // `fill="#0A0E14"` -> `fill="#48664A"` and the matching two
      // `<a:srgbClr val>` in `ppt/slides/slide3.xml`. `basic` (consulting)
      // and `scenarioBearing` (journal) stayed byte-identical and were not
      // recaptured: neither carries a `delta` on any kpi card, and no fixture
      // here has a `callout` at all. `.audit.json` needed no recapture for
      // any of the three — a *higher*-contrast fill can only remove
      // low-contrast findings, and this one had none to begin with (verified
      // by recomputing `auditDeck` fresh against both goldens).
      //
      // Re-recaptured again (visual review round 4, the motif-geometry wave
      // — banner and corner-ornament are the two motifs the fixtures'
      // themes consume). All three fixtures move, every diff attributed
      // token-by-token (`.issues/2026-08-20-review-round-4/tools/
      // equiv-motif-diff.mts`, part-name sets identical, audit goldens
      // byte-identical for all three):
      //   - `basic` (consulting, banner motif) slides 2/3: the floating
      //     64px bottom dash is deleted and the yellow block becomes the
      //     top rule's own accent head — three elements out (full-width
      //     rule, 68×12 block, bottom dash), two in (accent 48→116 +
      //     primary 116→1232 at the same y/width). Token delta -2 per
      //     slide is exactly one net element's open+close pair; PPTX
      //     `slide3/4.xml` lose one net shape (-24 tokens) and the rule's
      //     `<a:off>` x moves 457200 → 1104900 EMU = 48px → 116px.
      //   - `scenarioBearing`/`annualReviewPreset` (journal,
      //     corner-ornament): the footer rule stretches to match the
      //     masthead's double rule — x 96→48, x2 1184→1232, one `<line>`
      //     per affected slide, and the matching single `<a:off>`/`<a:ext>`
      //     pair per PPTX slide (457200 = 48px, cx 11277600 = 1184px).
      //
      // Re-recaptured again (visual review round 4, the vertical-gravity
      // wave — 用户裁定「页面的下方可以空，但不要上方空」). A slide whose
      // content area holds exactly one component used to have that
      // component pushed 38% of the leftover height down the rect
      // (`../svg/svg-content.tsx`, a 2026-07-10 answer to the same
      // complaint at 50%). On the review's own pages that put 105-122px of
      // nothing between the heading band and the only thing on the slide.
      // The block now starts at the content rect's top and the leftover
      // sits under it.
      //
      // Every changed slide in these three fixtures is such a page, so the
      // diff is one number per slide. Targeted attribution, same discipline
      // as every recapture above (token-by-token over both the SVG and
      // every PPTX part, `.issues/2026-08-20-review-round-4/tools/
      // equiv-gravity-diff.mts`): token counts identical everywhere, PPTX
      // part-name sets identical, audit goldens byte-identical for all
      // three, and the *only* differing tokens anywhere are one
      // `data-audit-box` y plus the `translate` that renders it, with the
      // matching `<a:off>` y values in the PPTX:
      //   - `basic` (consulting): SVG slides 2 (288.3 -> 161) and 3
      //     (314.48 -> 240); `ppt/slides/slide{3,4}.xml`.
      //   - `scenarioBearing` (journal): SVG slides 1 (338.68 -> 230), 2
      //     (286.14 -> 190) and 3 (330.6 -> 228);
      //     `ppt/slides/slide{2,3,4}.xml`.
      //   - `annualReviewPreset` (journal): SVG slides 2 (305.86 -> 231)
      //     and 3 (295.06 -> 186); `ppt/slides/slide{3,4}.xml`.
      // Each PPTX delta is exactly 9525 EMU × the px its SVG counterpart
      // moved (basic slide 2: -1212533 EMU = -127.3px), and a slide's
      // several `<a:off>`s all move by that same amount because they are
      // the parts of one block travelling together. No golden slide reaches
      // this wave's other two changes (the degraded-split top-pack and the
      // tightened gap ceiling) — those need a two-column page that degrades
      // or a multi-component stack with leftover, and none of the 15 slides
      // here is either.
      //
      // Re-recaptured again (visual review round 4, the floating-decor
      // sweep -- bars that underline nothing are deleted library-wide).
      // Only `scenarioBearing` moved, and the drift was exactly two deleted
      // decorative rects, attributed token-by-token with the same tool as
      // the motif-geometry recapture above (part-name sets identical,
      // audit goldens byte-identical, `basic`/`annualReviewPreset`
      // untouched):
      //   - slide 2: poster-ending's 28x3 white bar (1032,564);
      //   - slide 3: quote-stage's 48x3 bar (616,200).
      // One shape block left each affected PPTX slide; no text or other
      // element moved a single EMU.
      //
      // **Rolled back** (2026-08-21): the review that ordered the sweep also
      // ruled the sweep went too far -- those bars are part of the design
      // board's own vocabulary, and decoration that competes with text is to
      // be faded into the background, never deleted or moved. Both rects are
      // back, so these two goldens are byte-identical to their pre-sweep
      // capture again (restored from that commit, not re-captured: the same
      // tool reports the two rects returning and nothing else, and
      // `git diff` against the pre-sweep blobs is empty). The fade wave that
      // follows only lowers opacity on motifs none of these three fixture
      // decks draws, so it moves no golden byte at all.
      //
      // Re-recaptured again (decor restoration, 2026-08-21 -- the
      // floating-decor sweep's deletions were overturned on review; the
      // boards' ornaments return to their designed places and fade only
      // where they overlap ink). Drift is the exact mirror of the sweep's
      // recapture above: `scenarioBearing` slides 2/3 regain the two
      // decorative rects, one shape block per affected PPTX slide, and
      // nothing else moves an EMU. `basic`/`annualReviewPreset` and all
      // three audit goldens are byte-identical.
      // Re-recaptured (golden-air cap, 2026-08-21 — `layout.ts` caps the
      // gathered block's golden top offset at two block-gaps so heading and
      // body stay one block; see fix/banner-heading-rhythm). Drift is
      // vertical-only: content slides of all three decks move their body
      // block up (y/height/translate-y and the audit-rect rows that mirror
      // them), verified by normalizing every vertical attribute and
      // confirming old and new captures are byte-identical otherwise. All
      // three `.audit.json` goldens stayed byte-identical (no finding
      // appeared or vanished); cover/chapter/ending slides did not move.
      //
      // Re-recaptured (golden-air cap tightened, 2026-08-21 — `layout.ts`
      // drops the gathered-block top offset from two block-gaps to one, so
      // a banner-heading single-table page lands in the 40-60px ink band).
      // Drift is vertical-only again: content slides of all three decks
      // move their body block up by the cap delta. Verified by normalizing
      // every vertical attribute (`y`/`y1`/`y2`/`cy`/`height`/`translate`
      // y, `data-audit-box`/`data-audit-rect` y/h, PPTX `a:off y`/`a:ext
      // cy`) and confirming old and new captures are byte-identical
      // otherwise. PPTX part-name sets stayed identical. All three
      // `.audit.json` goldens stayed byte-identical. Cover/chapter/ending
      // slides did not move (`basic` 0/1/4, `scenarioBearing` 0/4,
      // `annualReviewPreset` 0/1/4). Content slides that moved:
      //   - `basic`: SVG slides 2/3. PPTX two slide parts, vertical-only.
      //   - `scenarioBearing`: SVG slides 1/2/3. PPTX three slide parts.
      //   - `annualReviewPreset`: SVG slides 2/3. PPTX two slide parts.
      //
      // Re-recaptured (branding default flip, 2026-08-21 — omitted deck branding
      // now equals cover-only, so content pages drop the Branding footer
      // rule, meta, and logo). Drift is the footer trio leaving, nothing
      // else. Verified with a temporary recapture script: stripping the
      // footer rule (`<line x1="56" y1="664" x2="1224">`), the meta row
      // (`<text y="700">`), and the logo box from the old capture makes old
      // and new byte-identical on every changed slide. Cover, chapter, and
      // ending slides did not move (none of these fixtures carry a brand
      // logo, so ending's cover-only skip is a no-op). All three
      // `.audit.json` goldens stayed byte-identical. PPTX part-name sets
      // stayed identical. Shape-count delta matches the SVG trio 1:1:
      //   - `basic`: SVG slides 2/3 (content) lose the rule plus two meta
      //     texts (`2026-07-17` / `pptfast`). PPTX `slide{3,4}.xml` lose
      //     three shapes each (14->11, 18->15).
      //   - `scenarioBearing`: SVG slides 1/2/3 (content) lose the rule
      //     only (this fixture has no meta). PPTX `slide{2,3,4}.xml` lose
      //     one shape each.
      //   - `annualReviewPreset`: SVG slides 2/3 (content) lose the rule
      //     only. PPTX `slide{3,4}.xml` lose one shape each.
      //
      // Re-recaptured (meta default hide, 2026-08-21 — confidentiality and
      // date on cover/ending meta rows paint only under branding:"full").
      // Drift is the date leaving the cover, nothing else. Only `basic`
      // moved: it is the one fixture that carries `meta.date`, and its
      // cover (`left-anchor`) had a divider plus a date tspan as the whole
      // meta row. Stripping that line (`<line x1="576" y1="328">`) and the
      // date text (`<text x="576" y="372">` / `2026-07-17`) from the old
      // capture makes old and new byte-identical. `scenarioBearing` and
      // `annualReviewPreset` carry no date or confidentiality, so they
      // stayed byte-identical and were not recaptured. All three
      // `.audit.json` goldens stayed byte-identical. PPTX part-name sets
      // stayed identical. Shape-count delta matches the SVG pair 1:1:
      //   - `basic`: SVG slide 0 (cover) loses the divider and the date
      //     tspan. PPTX `slide1.xml` loses two shapes.
      //
      // Re-recaptured once more in the same change (empty-meta-cell guard —
      // `tone-adaptive-header`'s bottom-right cell now goes unrendered when
      // it has nothing to say, instead of emitting an empty `<text>`). Drift
      // is that one element, nothing else. `scenarioBearing` and
      // `annualReviewPreset` moved this time: both pick
      // `tone-adaptive-header` for their cover and carry no `meta.version`,
      // so with the date gone their cell was empty. `basic` (left-anchor
      // cover) did not move. All three `.audit.json` goldens stayed
      // byte-identical. PPTX part-name sets stayed identical. The
      // shape-count delta is the point of the guard — an empty `<text>` is
      // not free, `svg2pptx`'s `textToOp` exports it as a real shape:
      //   - `scenarioBearing`: SVG slide 0 (cover) loses the empty `<text
      //     x="1216" y="650">`. PPTX `slide1.xml` goes 11 -> 10 shapes.
      //   - `annualReviewPreset`: identical drift, same 11 -> 10.
      // Re-recaptured (board-cover-fidelity wave, 2026-08-22 — cover pool
      // 9 -> 13). Same sampler-denominator mechanism as the colophon recapture
      // above. Exactly one slide changed in two of the three (index 0, the
      // cover). `annualReviewPreset` did not move. `.audit.json` needed no
      // recapture (findings stayed the empty array):
      //   - `basic` (`consulting`): `left-anchor` -> `editorial-masthead`.
      //   - `scenarioBearing` (`journal`): `tone-adaptive-header` ->
      //     `left-anchor`.
      //
      // Re-recaptured (board-cover-fidelity × second-front merge, 2026-08-22).
      // Union of the two recapture rings above: cover pool 9→13 plus the five
      // cover locks, and second-front's chapter / content / ending fills.
      // Targeted diff against both parents. No unrelated geometry drift:
      //   - `basic` (`consulting`): cover stays this branch's
      //     `editorial-masthead` (HEAD, pool growth). Chapter / content take
      //     main's `masthead-chapter` / `split-band` / `bento-panel`
      //     (second-front). Pinned `banner-ending` unchanged. Cover change
      //     did not trigger adjacent anti-repetition on the chapter slot.
      //   - `scenarioBearing` / `annualReviewPreset`: live pipeline matched
      //     the auto-merged goldens byte-for-byte. Not recaptured.
      // `.audit.json` needed no recapture (findings stayed the empty array).
      //
      // Re-recaptured (board-cover-restore wave 1, 2026-08-22). Cover pool
      // 13→19 plus nine board-face locks. Exactly one slide changed in each
      // of the three (index 0, the cover). `.audit.json` needed no recapture
      // (findings stayed the empty array):
      //   - `basic` (`consulting`): `editorial-masthead` -> `verdict-index`
      //     (cover lock).
      //   - `scenarioBearing` (`journal`): `left-anchor` ->
      //     `institutional-block` (pool denominator).
      //   - `annualReviewPreset` (`journal`): `tone-adaptive-header` ->
      //     `memo-head` (pool denominator).
      // No non-cover slide moved. Cover change did not trigger adjacent
      // anti-repetition on the chapter slot.
      //
      // Re-recaptured (board-cover-restore wave 2, 2026-08-22). Ten cover
      // locks plus cover knobs / motif singletons. `.audit.json` needed no
      // recapture (findings stayed the empty array):
      //   - `basic` (`consulting`): untouched. consulting was locked in
      //     wave 1, and this wave does not change shared layout defaults
      //     or consulting's motif set.
      //   - `scenarioBearing` (`journal`): slides 0, 3, 4. Cover
      //     `institutional-block` -> `editorial-masthead` (cover lock).
      //     Slides 3 and 4 keep their layout ids (`side-highlight`,
      //     `constellation-ending`) but always draw `corner-ornament-motif`
      //     now that journal's candidate set is a singleton (they previously
      //     could rotate onto heritage-motif or rail-motif). Journal cover
      //     also grows the kicker row from `shape.cover.showKicker`.
      //   - `annualReviewPreset` (`journal`): slide 0. Cover `memo-head` ->
      //     `editorial-masthead` (cover lock) plus the same kicker / motif
      //     singleton. Non-cover pages unchanged.
      // Recaptured (component-forms-w1, 2026-08-22). journal is assigned
      // the bubble-row kpi face. Only annualReviewPreset slide 2 (content
      // kpi_cards, 1-indexed slide 3) changes. Cover, chapter, quote, and
      // ending stay byte-identical. `.audit.json` needed no recapture
      // (findings stayed the empty array). PPTX only `ppt/slides/slide3.xml`.
      //
      // Recaptured (forms-legibility, 2026-08-22). bubble_row keeps value
      // and label type at 15px (R_MIN so r*0.42 clears that floor) and
      // sits labels on one baseline under the cluster so they do not
      // paint across a neighbor bubble. Only annualReviewPreset slide 2
      // (journal kpi_cards) moves. Cover, chapter, quote, and ending stay
      // byte-identical. `.audit.json` findings stay []. PPTX only
      // `ppt/slides/slide3.xml`.
      //
      // Recaptured (gallery review r1, 2026-08-22). Intended visual
      // geometry, not a migration regression. `.audit.json` needed no
      // recapture (findings stayed the empty array). Targeted diff:
      //   - `basic` (`consulting`): slide 3 `bento-panel` content rect
      //     454→434 (bottom 640→620) and card `rx` 6→2 (`shape.radius`).
      //     PPTX `ppt/slides/slide4.xml`.
      //   - `scenarioBearing` (`journal`): slide 1 quote mark baseline
      //     56→64, slide 2 `banner-heading` banner y 80→92, slide 3
      //     `side-highlight` panel `rx` 12→6. PPTX slides 2/3/4.xml.
      //   - `annualReviewPreset` (`journal`): slide 3 quote mark baseline
      //     56→64. PPTX `ppt/slides/slide4.xml`.
      //
      // Recaptured (gallery-review-r1 × main merge, 2026-08-22).
      // Union of forms-legibility (bubble_row shared label baseline y=246
      // on annualReviewPreset slide 2, smallest label/value at the 15px
      // floor) and gallery review r1 (quote mark baseline 56→64 on
      // slide 3). Targeted diff against both parents.
      // No unrelated geometry drift:
      //   - vs r1: only slide 2 / ppt/slides/slide3.xml (forms-legibility).
      //     Labels were y=244/208.56/162 at font-size 14/14/12, now one
      //     baseline y=246 at 16/16/15. Cover, chapter, quote, ending
      //     stay byte-identical.
      //   - vs main: only slide 3 / ppt/slides/slide4.xml (r1 quote).
      //     Quote mark y="56"→y="64" (same string length). Matching PPTX
      //     `<a:off>` y 1988820→2065020 (exactly +8px at 9525 EMU per px).
      //     Cover, chapter, kpi, ending stay byte-identical.
      // Zip file-name set unchanged (43 parts). Other pptx parts did not
      // drift. `.audit.json` needed no recapture (findings stayed the
      // empty array, pagesAudited 5).
      // basic / scenarioBearing live pipeline matched the r1 goldens
      // byte-for-byte. Not recaptured.
      //
      // Recaptured (heading-treatments, 2026-08-22). Content-page heading
      // chrome is a render-side assignment table. IR is unchanged. Cover,
      // chapter, and ending do not pick a content treatment, so those
      // slides of `basic` stay byte-identical (index 0 cover, 1 chapter,
      // 4 ending pinned banner-ending). Content slides of assigned themes
      // move. Targeted SVG diff:
      //   - `basic` (`consulting`, has a chapter so GhostIndex lands):
      //     slides 2 and 3 (content) move. Cover, chapter, ending same.
      //   - `scenarioBearing` (`journal`, no chapter in the fixture).
      //     Baseline does not require a chapter, so content pages still
      //     pick Baseline. Slides 1, 2, 3 (content) move. Cover and
      //     ending same.
      //   - `annualReviewPreset` (`journal`, has a chapter): slides 2
      //     and 3 (content) move. Cover, chapter, ending same.
      //
      // Recaptured (gallery-review-r2 × heading-treatments merge, 2026-08-22).
      // Live pipeline on the merge tree. Two parent waves only. Cover,
      // chapter, and ending do not pick a content treatment. `.audit.json`
      // needed no recapture (findings stayed the empty array, pagesAudited 5).
      // Targeted SVG diff against both parents:
      //   - `basic` (`consulting`, GhostIndex, has a chapter):
      //     vs r2: slides 2 and 3 (content) move. Same layout ids
      //     (`rail-numbered`, `split-band`). GhostIndex bleed numeral
      //     (x=1300 y=212 fs=230) plus title y=128. Cover, chapter,
      //     ending stay byte-identical.
      //     vs main: slides 2 and 3 also change layout (`split-band` to
      //     `rail-numbered`, `bento-panel` to `split-band`) from r2's
      //     image-lead-split retirement and consulting pool narrow.
      //     Cover and ending SVG gain named `data-decor-piece` tags
      //     (ruler, ikb-steps, spark) from r2 motif cap. Chapter same.
      //   - `scenarioBearing` (`journal`, Baseline, no chapter in the
      //     fixture, Baseline still lands):
      //     vs r2: slides 1, 2, 3 (content) move. Same layout ids
      //     (`two-column`, `stacked-poster`, `narrow-column`). Native
      //     heading y=150/184/190 becomes Baseline title y=132 fs=40.
      //     Cover and ending stay byte-identical.
      //     vs main: slides 1, 2, 3 also change layout (`narrow-column`
      //     to `two-column`, `banner-heading` to `stacked-poster`,
      //     `side-highlight` to `narrow-column`) from r2 selection.
      //     Cover and ending SVG gain named motif pieces (masthead, foot).
      //   - `annualReviewPreset` (`journal`, Baseline, has a chapter):
      //     vs r2: slides 2 and 3 (content) move. Same layout ids
      //     (`narrow-column`, `bento-panel`). Baseline title y=132 plus
      //     journal right slot. Cover, chapter, ending stay byte-identical.
      //     vs main: slides 2 and 3 also change layout (`stacked-poster`
      //     to `narrow-column`, `asymmetric-triptych` to `bento-panel`)
      //     from r2 selection. Cover and ending SVG gain named motif
      //     pieces. Chapter same.
      //
      // Recaptured (heading-marker-collision, 2026-08-22). Assigned-theme
      // heading treatments now take rail-numbered's {chapter}.{n} badge as a
      // reserved rect and start the title at the native 180px origin. IR is
      // unchanged. Intended geometry, not a migration regression. Targeted
      // SVG diff:
      //   - `basic` (`consulting`, GhostIndex, rail-numbered content): only
      //     slide 2. Title "Design goals" x 96→180. Bleed numeral, badge,
      //     rail, and content audit-rect stay put. Cover, chapter,
      //     split-band, ending stay byte-identical.
      //   - `scenarioBearing` / `annualReviewPreset`: live pipeline matched
      //     the goldens byte-for-byte. Not recaptured (neither lands
      //     rail-numbered).
      // `.audit.json` needed no recapture (findings stayed the empty array).
      it("renders SVG byte-identical to the base-commit (pre-rename) capture, slide for slide", () => {
        const goldenSvgs = readGoldenJson<string[]>(`${name}.svg`)
        const migratedSvgs = v4.slides.map((_, i) => renderSlideSvg(v4, i))
        expect(migratedSvgs).toEqual(goldenSvgs)
      })

      // `basic.pptx-zip.json` recaptured (a:ea follow-up task): consulting's
      // Georgia heading/body has zero CJK glyphs, so the new `applyEaFontFaces`
      // patch (`src/pptx/pptx-ea-fonts.ts`) genuinely changes its exported
      // `<a:ea>` from the old self-mirroring `"Georgia"` to the corrected
      // `"Microsoft YaHei"` — a real, intended behavior change, not a
      // regression. `scenarioBearing`/`annualReviewPreset` both use the
      // `journal` theme (SimSun heading, Microsoft YaHei body — both already
      // CJK-capable, so `eaFontFaceFor` self-references and the patch is a
      // byte-identical no-op there), which is why only `basic`'s golden
      // needed recapturing. Verified via the same targeted-diff discipline as
      // the defect-B recapture below: after normalizing away every
      // `<a:ea typeface="...">` attribute value, old and new
      // `ppt/slides/slide{1..5}.xml` are byte-identical — the *only* change
      // anywhere in the capture is that one attribute, on exactly the
      // Georgia-declared runs, exactly to `"Microsoft YaHei"`.
      //
      // All three `.pptx-zip.json` recaptured (cycle export fix, 2026-08-17
      // — `svg2pptx/text.ts`'s `anchorTextBox`): a text box's width is
      // measured against the canvas, but it used to be computed from the
      // `<text>` element's *local* x, before `dispatch.ts` flattened the
      // ancestor `<g transform>`s onto it — so every text inside a
      // translated group got a box sized against the wrong origin, and a
      // group centered on its own content produced a negative one. The box
      // is now derived after the flattening. A text box's *anchor* (the
      // edge or center `align` pins the line to) was already correct before
      // this fix and is bit-for-bit unchanged by it — verified directly:
      // across all 72 text shapes in these three fixtures the anchor moves
      // by 0 EMU, so nothing renders anywhere different. What changed is
      // only the box those anchors hang in: `a:off x` and `a:ext cx` on 39
      // text shapes across 9 slides (`basic` slides 1/3/4/5,
      // `scenarioBearing` 2/3/4, `annualReviewPreset` 3/4). Targeted diff,
      // same discipline as every recapture above: normalizing away every
      // `<a:off>`/`<a:ext>` attribute value makes old and new byte-
      // identical everywhere, no non-text shape's geometry moved, and no
      // text shape's `y`/`cy` moved either. `.svg.json`/`.audit.json`
      // needed no recapture for any of the three — this fix lives entirely
      // downstream of the SVG.
      //
      // Only `basic.pptx-zip.json` recaptured (SVG group paint inheritance,
      // 2026-08-20 — `svg2pptx/dispatch.ts`'s `walk`): the walk composed a
      // `<g>`'s `transform` onto its descendants but not its paint, so a
      // motif that painted its group and left its shapes bare exported
      // colorless. `basic` runs the `consulting` theme, whose motif draws six
      // ticks under `<g stroke={colors.muted} stroke-width="1.5">` and three
      // steps under `<g fill={colors.primary}>`; those nine shapes are the
      // whole diff, on the cover and the ending (the only two slides carrying
      // the decoration). Targeted diff, same discipline as every recapture
      // above — tag-by-tag over both slide parts, the *only* differences are
      // six `<a:ln w="9525">`+`<a:srgbClr val="000000"/>` (the fabricated
      // black `line.ts` fell back to) becoming `w="14288"`+`val="6B6B6B"`,
      // and three `<a:noFill/>` becoming
      // `<a:solidFill><a:srgbClr val="051C2C"/></a:solidFill>`. No shape
      // moved, no text changed, no shape was added or dropped.
      // `scenarioBearing`/`annualReviewPreset` (both `journal`, whose motif
      // paints its leaves directly) stayed byte-identical and were not
      // recaptured, and `.svg.json`/`.audit.json` needed no recapture for any
      // of the three: the preview already drew these painted — that
      // disagreement between preview and export is the defect this fixes.
      //
      // Re-recaptured (second-front wave, 2026-08-22 —
      // `.issues/2026-08-21-content-allocation/`): every structural identity
      // gained chapter / content / ending tendencies. Unpinned non-cover
      // pages on these three fixtures therefore auto-pick differently — a
      // real, intended selection-behavior change, not a migration
      // regression. Same "reweighting a pool a fixed seed's hash lands in
      // can flip an auto-pick" posture as the declaration-rebalance and
      // content-pool recaptures above. Cover is the slot this wave promises
      // not to touch, and every pinned ending stays put. Targeted diff
      // against the pre-recapture goldens:
      //   - `basic` (`consulting`): slide 1 chapter `banner-chapter` ->
      //     `masthead-chapter`, slides 2-3 content `rail-numbered` ->
      //     `split-band` and `split-band` -> `bento-panel`. Cover and the
      //     pinned `banner-ending` unchanged.
      //   - `scenarioBearing` (`journal`): slides 2-3 content
      //     `side-highlight` -> `banner-heading` and `quiet-frame` ->
      //     `side-highlight`. Cover, the first content page, and ending
      //     unchanged (journal's chapter/ending tendencies were already
      //     live).
      //   - `annualReviewPreset` (`journal`): slide 2 content
      //     `image-lead-split` -> `stacked-poster`. Cover, chapter, quote
      //     content, and the pinned ending unchanged.
      // `.audit.json` needed no recapture for any of the three (findings
      // stayed the empty array). `.pptx-zip.json` file-name sets unchanged.
      // PPTX parts that differ are exactly the matching 1-indexed slides
      // (`basic` slide2/3/4.xml, `scenarioBearing` slide3/4.xml,
      // `annualReviewPreset` slide3.xml).
      //
      // Same merge recapture as the SVG ring above. `basic` PPTX parts that
      // differ vs each parent are exactly the matching 1-indexed slides:
      // slide1.xml equals HEAD (cover `editorial-masthead`), slide2/3/4.xml
      // equal main (chapter / content). File-name set unchanged.
      // `scenarioBearing` / `annualReviewPreset` auto-merged files matched
      // the live pipeline and were not recaptured.
      //
      // Recaptured (gallery-review-r2 × heading-treatments merge, 2026-08-22).
      // PPTX parts that move are the 1-indexed matches of the SVG content
      // slides. File-name set unchanged (43 parts). Cover and ending PPTX
      // stay byte-identical to both parents (the r2 motif SVG diff on those
      // pages is `data-decor-piece` naming, not exported geometry).
      //   - `basic`: `ppt/slides/slide3.xml` and `slide4.xml`.
      //   - `scenarioBearing`: `ppt/slides/slide2.xml`, `slide3.xml`,
      //     `slide4.xml`.
      //   - `annualReviewPreset`: `ppt/slides/slide3.xml` and `slide4.xml`.
      //
      // Recaptured (heading-marker-collision, 2026-08-22). File-name set
      // unchanged (43 parts). Only `basic` `ppt/slides/slide3.xml` (1-indexed
      // match of SVG slide 2). Title box `a:off x` 914400→1714500 and `a:ext
      // cx` 11277600→10477500, each exactly 84px × 9525 EMU, so the right
      // edge stays put. `scenarioBearing` / `annualReviewPreset` live
      // pipeline matched the goldens byte-for-byte. Not recaptured.
      it("exports a PPTX byte-identical (docProps/core.xml timestamp excluded) to the base-commit capture", async () => {
        const goldenZipMap = readGoldenJson<Record<string, string>>(`${name}.pptx-zip`)
        const blob = await generatePptxBlob(v4)
        const migratedZipMap = await normalizedZipMap(blob)
        expect(migratedZipMap).toEqual(goldenZipMap)
      })

      // spec §12 output row "迁移前后审计结果等价" (task 4): auditDeck's
      // findings/pagesAudited/pagesSkipped must match what the pre-rename
      // codebase produced on the same deck, same capture method as the SVG/
      // PPTX goldens above (base commit 0511b8c, PptxIRSchema.parse +
      // auditDeck, no migration involved on that side — it's the pre-rename
      // deck audited by pre-rename code) — asserted here precisely so a
      // future regression in either direction gets caught.
      //
      // Recaptured (bench-driven fix round, defect B, Task 3):
      // annualReviewPreset used to carry two low-contrast findings (a
      // kpi_cards up-delta arrow, `#16A34A` against `#FFFFFF` at 3.30:1,
      // duplicated across two cards) — a real defect this fixture happened
      // to bake in from before the fix, not a migration artifact. All three
      // golden files (`.svg`/`.audit`/`.pptx-zip`) were regenerated through
      // this exact test's own code path post-fix; a targeted diff against
      // the pre-recapture goldens confirmed the *only* change anywhere in
      // any of the three is `#16A34A` → `#0A0E14` at the two arrow glyphs
      // (`fill`/`srgbClr val` respectively) plus the now-empty `findings`
      // array — nothing else drifted. See `kpi.tsx`'s own `deltaColor`
      // comment and `full-matrix-contrast.test.ts`'s "defect B real
      // contrast fixes" sweep for the fix itself.
      it("audits byte-identical findings to the base-commit (pre-rename) capture", () => {
        const goldenAudit = readGoldenJson<ReturnType<typeof auditDeck>>(`${name}.audit`)
        const migratedAudit = auditDeck(v4)
        expect(migratedAudit).toEqual(goldenAudit)
      })
    })
  }

  // The annual-review preset's own worked example (spec §5): "旧：narrative ×
  // balanced × public / 新：storytelling × balanced × public" — the preset id
  // string carries across unchanged, but its *internal* axes resolution
  // (`NARRATIVE_PRESETS["annual-review"]`) must still resolve to the exact
  // same strategy/pacing/audience triple the old `SCENARIO_PRESETS` entry
  // did, just spelled with the new vocabulary — proven here by rendering
  // through the real chain rather than re-asserting the preset table (that
  // table has its own dedicated pins in `narrative/index.test.ts`).
  it("the annual-review preset migrates by id alone (no per-axis remap needed) and still renders byte-identical", () => {
    const v3 = PptxIRV3Schema.parse(V3_EQUIVALENCE_DECKS.annualReviewPreset)
    expect(v3.scenario).toBe("annual-review")
    const v4 = migrateIrV3ToV4(v3)
    expect(v4.narrative).toBe("annual-review")
  })
})
